const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs-extra');

// Constants for configuration values
const CONSTANTS = {
    PROCESS_CHECK_INTERVAL: 1000, // milliseconds
    PROCESS_KILL_TIMEOUT: 5000,   // milliseconds
    STANDBY_LOOP_COUNT: 1000      // number of standby video repeats
};

class ProcessManager {
    constructor() {
        this.udpSenderProcess = null;  // 動画→UDP送信プロセス
        this.currentTempFile = null;   // 現在使用中の一時ファイル
        this.currentPlaylist = null;   // 現在使用中のプレイリストファイル
        this.audioQuality = 'standard'; // 'standard' or 'high'
        this.isSwitching = false;      // プロセス切り替え中フラグ
        this.log = {
            info: (msg) => console.log(`[${new Date().toISOString()}] [ProcessManager] [INFO] ${msg}`),
            error: (msg) => console.error(`[${new Date().toISOString()}] [ProcessManager] [ERROR] ${msg}`),
            warning: (msg) => console.warn(`[${new Date().toISOString()}] [ProcessManager] [WARNING] ${msg}`)
        };
        
    }

    // 音声品質設定
    setAudioQuality(quality = 'standard') {
        this.audioQuality = quality;
        this.log.info(`音声品質設定: ${quality}`);
    }

    // 動画の解像度を取得
    getVideoResolution(videoPath) {
        try {
            const cmd = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${videoPath}"`;
            const output = execSync(cmd, { encoding: 'utf8' }).trim();
            
            if (output && output.includes('x')) {
                const [width, height] = output.split('x').map(Number);
                return { width, height };
            }
            
            return null;
        } catch (error) {
            this.log.warning(`動画解像度取得エラー: ${error.message}`);
            return null;
        }
    }

    // 音声フィルターとエンコード設定を取得
    getAudioSettings() {
        if (this.audioQuality === 'high') {
            return {
                codec: ['-c:a', 'aac'],
                sampleRate: ['-ar', '48000'],
                channels: ['-ac', '2'],
                bitrate: ['-b:a', '256k'],
                filter: ['-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:linear=true,volume=1.25'] // 高品質正規化
            };
        } else {
            return {
                codec: ['-c:a', 'aac'],
                sampleRate: ['-ar', '48000'],
                channels: ['-ac', '2'],
                bitrate: ['-b:a', '192k'],
                filter: ['-af', 'volume=1.3,compand=0.3|0.3:1|1:-90/-60|-60/-40|-40/-30|-20/-20:6:0:-90:0.2'] // 軽量版
            };
        }
    }

    // 映像設定を取得（すべてコピーモード）
    getVideoSettings() {
        return {
            codec: ['-c:v', 'copy']
        };
    }

    // UDPストリーミング開始 (動画→UDP送信)
    async startUdpStreaming(videoFile) {
        try {
            // 切り替え中チェック
            if (this.isSwitching) {
                return { success: false, error: 'Process is currently switching. Please wait.' };
            }

            this.isSwitching = true;
            this.log.info(`UDPストリーミング切り替え開始: ${videoFile}`);
            
            if (this.udpSenderProcess) {
                // 既存のプロセスを停止
                await this.stopUdpStreaming();
            }

            this.log.info(`UDPストリーミング開始: ${videoFile}`);
            
            // 動画ファイルのパスを構築
            const videoPath = path.join(__dirname, 'videos', videoFile);
            const standbyVideoPath = path.join(__dirname, './videos', 'standby.mp4');
            
            // standby.mp4の存在を確認
            if (!(await fs.pathExists(standbyVideoPath))) {
                throw new Error(`standby.mp4が見つかりません: ${standbyVideoPath}`);
            }
            
            // 音声・映像設定を取得
            const audioSettings = this.getAudioSettings();
            const videoSettings = this.getVideoSettings();
            
            this.log.info('すべての動画をコピーモードで処理');
            
            // メイン動画のみを再生するコマンド
            const args = [
                '-re',
                '-i', videoPath,
                '-avoid_negative_ts', 'make_zero', '-fflags', '+genpts',
                // 映像設定（FullHD出力、アスペクト比維持）
                ...videoSettings.codec,
                ...(videoSettings.preset || []),
                ...(videoSettings.crf || []),
                ...(videoSettings.maxrate || []),
                ...(videoSettings.bufsize || []),
                ...(videoSettings.filter || []),
                ...(videoSettings.pixelFormat || []),
                // 音声設定（動的に選択）
                ...audioSettings.codec,
                ...audioSettings.sampleRate,
                ...audioSettings.channels,
                ...audioSettings.bitrate,
                ...audioSettings.filter,
                '-f', 'mpegts',
                '-async', '1',
                '-copyts',
                '-vsync', 'passthrough',
                '-buffer_size', '6291456',
                'udp://receiver:1234'
            ];

            this.log.info(`FFmpegコマンド: ffmpeg ${args.join(' ')}`);

            this.udpSenderProcess = spawn('ffmpeg', args);

            this.udpSenderProcess.stdout.on('data', (data) => {
                this.log.info(`UDP Sender stdout: ${data}`);
            });

            this.udpSenderProcess.stderr.on('data', (data) => {
                this.log.info(`UDP Sender stderr: ${data}`);
            });

            this.udpSenderProcess.on('close', (code) => {
                this.log.info(`UDPSenderプロセス終了: code ${code}`);
                this.udpSenderProcess = null;
                
                // メイン動画が終了したらstandby動画を開始
                if (code === 0) {
                    this.startStandbyLoop(standbyVideoPath);
                }
                
                // プレイリストファイルをクリーンアップ
                this.cleanupPlaylistFiles();
            });

            this.udpSenderProcess.on('error', (error) => {
                this.log.error(`UDPSenderプロセスエラー: ${error.message}`);
                this.udpSenderProcess = null;
                
                // エラー時もプレイリストファイルをクリーンアップ
                this.cleanupPlaylistFiles();
            });

            this.isSwitching = false;
            return { success: true, message: `UDP streaming started: ${videoFile}` };

        } catch (error) {
            this.isSwitching = false;
            this.log.error(`UDPストリーミング開始エラー: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    // UDPストリーミング開始（フルパス指定版）
    async startUdpStreamingFromPath(videoPath, displayName = null, tempFile = null) {
        try {
            // 切り替え中チェック
            if (this.isSwitching) {
                return { success: false, error: 'Process is currently switching. Please wait.' };
            }

            this.isSwitching = true;
            const videoName = displayName || path.basename(videoPath);
            this.log.info(`UDPストリーミング切り替え開始（フルパス）: ${videoName}`);
            
            if (this.udpSenderProcess) {
                // 既存のプロセスを停止
                await this.stopUdpStreaming();
            }

            this.log.info(`UDPストリーミング開始（フルパス）: ${videoName}`);
            
            // 一時ファイル情報を保存
            this.currentTempFile = tempFile;
            
            const standbyVideoPath = path.join(__dirname, './videos', 'standby.mp4');
            
            // standby.mp4の存在を確認
            if (!(await fs.pathExists(standbyVideoPath))) {
                throw new Error(`standby.mp4が見つかりません: ${standbyVideoPath}`);
            }
            
            // 音声・映像設定を取得
            const audioSettings = this.getAudioSettings();
            const videoSettings = this.getVideoSettings();
            
            this.log.info('すべての動画をコピーモードで処理');
            
            // メイン動画のみを再生するコマンド
            const args = [
                '-re',
                '-i', videoPath,
                '-avoid_negative_ts', 'make_zero', '-fflags', '+genpts',
                // 映像設定（FullHD出力、アスペクト比維持）
                ...videoSettings.codec,
                ...(videoSettings.preset || []),
                ...(videoSettings.crf || []),
                ...(videoSettings.maxrate || []),
                ...(videoSettings.bufsize || []),
                ...(videoSettings.filter || []),
                ...(videoSettings.pixelFormat || []),
                // 音声設定（動的に選択）
                ...audioSettings.codec,
                ...audioSettings.sampleRate,
                ...audioSettings.channels,
                ...audioSettings.bitrate,
                ...audioSettings.filter,
                '-f', 'mpegts',
                '-buffer_size', '6291456',
                'udp://receiver:1234'
            ];

            this.log.info(`FFmpegコマンド: ffmpeg ${args.join(' ')}`);

            this.udpSenderProcess = spawn('ffmpeg', args);

            this.udpSenderProcess.stdout.on('data', (data) => {
                this.log.info(`UDP Sender stdout: ${data}`);
            });

            this.udpSenderProcess.stderr.on('data', (data) => {
                this.log.info(`UDP Sender stderr: ${data}`);
            });

            this.udpSenderProcess.on('close', (code) => {
                this.log.info(`UDPSenderプロセス終了: code ${code}`);
                this.udpSenderProcess = null;
                
                // メイン動画が終了したらstandby動画を開始
                if (code === 0) {
                    this.startStandbyLoop(standbyVideoPath);
                }
                
                // 一時ファイルをクリーンアップ
                if (this.currentTempFile && tempFile === this.currentTempFile) {
                    this.cleanupTempFile();
                }
                
                // プレイリストファイルをクリーンアップ
                this.cleanupPlaylistFiles();
            });

            this.udpSenderProcess.on('error', (error) => {
                this.log.error(`UDPSenderプロセスエラー: ${error.message}`);
                this.udpSenderProcess = null;
                
                // エラー時も一時ファイルをクリーンアップ
                if (this.currentTempFile && tempFile === this.currentTempFile) {
                    this.cleanupTempFile();
                }
                
                // エラー時もプレイリストファイルをクリーンアップ
                this.cleanupPlaylistFiles();
            });

            this.isSwitching = false;
            return { success: true, message: `UDP streaming started: ${videoName}` };

        } catch (error) {
            this.isSwitching = false;
            this.log.error(`UDPストリーミング開始エラー: ${error.message}`);
            
            // エラー時も一時ファイルをクリーンアップ
            if (tempFile) {
                this.cleanupTempFile(tempFile);
            }
            
            return { success: false, error: error.message };
        }
    }

    // プレイリストファイルを作成
    async createConcatPlaylist(mainVideoPath) {
        try {
            const playlistPath = path.join(__dirname, 'temp_downloads', 'playlist.txt');
            const standbyVideoPath = path.join(__dirname, './videos', 'standby.mp4');
            
            // temp_downloadsディレクトリを確保
            await fs.ensureDir(path.dirname(playlistPath));
            
            // standby.mp4の存在を確認
            if (!(await fs.pathExists(standbyVideoPath))) {
                throw new Error(`standby.mp4が見つかりません: ${standbyVideoPath}`);
            }
            
            // プレイリストの内容を作成
            // メイン動画を1回、その後スタンバイ動画を無限ループ用に複数回追加
            const playlistContent = [
                `file '${mainVideoPath.replace(/'/g, '\'\\\'\'')}' # main video`,
                // スタンバイ動画を多数回追加（実質無限ループ効果）
                ...Array(CONSTANTS.STANDBY_LOOP_COUNT).fill().map(() => `file '${standbyVideoPath.replace(/'/g, '\'\\\'\'')}' # standby`)
            ].join('\n');
            
            await fs.writeFile(playlistPath, playlistContent, 'utf8');
            this.log.info(`プレイリスト作成完了: ${playlistPath}`);
            
            return playlistPath;
            
        } catch (error) {
            this.log.error(`プレイリスト作成エラー: ${error.message}`);
            throw error;
        }
    }

    // 一時ファイルのクリーンアップ
    async cleanupTempFile(filePath = null) {
        try {
            const targetFile = filePath || this.currentTempFile;
            if (targetFile) {
                await fs.remove(targetFile);
                this.log.info(`一時ファイル削除: ${path.basename(targetFile)}`);
                
                if (targetFile === this.currentTempFile) {
                    this.currentTempFile = null;
                }
            }
        } catch (error) {
            this.log.warning(`一時ファイル削除警告: ${error.message}`);
        }
    }

    // standby動画の無限ループを開始
    async startStandbyLoop(standbyVideoPath) {
        try {
            this.log.info('standby動画のループを開始します...');
            
            // 音声・映像設定を取得
            const audioSettings = this.getAudioSettings();
            const videoSettings = this.getVideoSettings();
            
            const args = [
                '-re',
                '-stream_loop', '-1',
                '-i', standbyVideoPath,
                '-avoid_negative_ts', 'make_zero', '-fflags', '+genpts',
                // 映像設定（FullHD出力、アスペクト比維持）
                ...videoSettings.codec,
                ...(videoSettings.preset || []),
                ...(videoSettings.crf || []),
                ...(videoSettings.maxrate || []),
                ...(videoSettings.bufsize || []),
                ...(videoSettings.filter || []),
                ...(videoSettings.pixelFormat || []),
                // 音声設定（動的に選択）
                ...audioSettings.codec,
                ...audioSettings.sampleRate,
                ...audioSettings.channels,
                ...audioSettings.bitrate,
                ...audioSettings.filter,
                '-f', 'mpegts',
                '-buffer_size', '6291456',
                'udp://receiver:1234'
            ];

            this.log.info(`Standby FFmpegコマンド: ffmpeg ${args.join(' ')}`);

            this.udpSenderProcess = spawn('ffmpeg', args);

            this.udpSenderProcess.stdout.on('data', (data) => {
                this.log.info(`Standby UDP Sender stdout: ${data}`);
            });

            this.udpSenderProcess.stderr.on('data', (data) => {
                this.log.info(`Standby UDP Sender stderr: ${data}`);
            });

            this.udpSenderProcess.on('close', (code) => {
                this.log.info(`Standby UDPSenderプロセス終了: code ${code}`);
                this.udpSenderProcess = null;
            });

            this.udpSenderProcess.on('error', (error) => {
                this.log.error(`Standby UDPSenderプロセスエラー: ${error.message}`);
                this.udpSenderProcess = null;
            });
            
        } catch (error) {
            this.log.error(`Standbyループ開始エラー: ${error.message}`);
        }
    }

    // プレイリストファイルのクリーンアップ
    async cleanupPlaylistFiles() {
        try {
            if (this.currentPlaylist) {
                await fs.remove(this.currentPlaylist);
                this.log.info(`プレイリストファイル削除: ${path.basename(this.currentPlaylist)}`);
                this.currentPlaylist = null;
            }
        } catch (error) {
            this.log.warning(`プレイリストファイル削除警告: ${error.message}`);
        }
    }

    // UDPストリーミング停止
    async stopUdpStreaming() {
        try {
            if (!this.udpSenderProcess) {
                return { success: true, message: 'UDP streaming not running' };
            }

            this.log.info('UDPストリーミング停止中...');
            this.udpSenderProcess.kill('SIGTERM');
            
            // プロセス終了を待つ
            await new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    if (this.udpSenderProcess) {
                        this.udpSenderProcess.kill('SIGKILL');
                    }
                    resolve();
                }, CONSTANTS.PROCESS_KILL_TIMEOUT);

                if (this.udpSenderProcess) {
                    this.udpSenderProcess.on('close', () => {
                        clearTimeout(timeout);
                        resolve();
                    });
                } else {
                    clearTimeout(timeout);
                    resolve();
                }
            });

            this.udpSenderProcess = null;
            
            // 一時ファイルをクリーンアップ
            if (this.currentTempFile) {
                await this.cleanupTempFile();
            }
            
            // プレイリストファイルをクリーンアップ
            await this.cleanupPlaylistFiles();
            
            this.log.info('UDPストリーミング停止完了');
            return { success: true, message: 'UDP streaming stopped' };

        } catch (error) {
            this.log.error(`UDPストリーミング停止エラー: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    // 状態取得
    getStatus() {
        return {
            udp_streaming_running: !!this.udpSenderProcess,
            udp_sender_pid: this.udpSenderProcess ? this.udpSenderProcess.pid : null,
            is_switching: this.isSwitching
        };
    }

    // 全プロセス停止（UDP streamingのみ）
    async stopAll() {
        return this.stopUdpStreaming();
    }
}

module.exports = ProcessManager;