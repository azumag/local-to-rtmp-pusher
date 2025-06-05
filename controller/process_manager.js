const { spawn } = require('child_process');
const path = require('path');

class ProcessManager {
    constructor() {
        this.udpSenderProcess = null;  // 動画→UDP送信プロセス
        this.currentTempFile = null;   // 現在使用中の一時ファイル
        this.log = {
            info: (msg) => console.log(`[${new Date().toISOString()}] [ProcessManager] [INFO] ${msg}`),
            error: (msg) => console.error(`[${new Date().toISOString()}] [ProcessManager] [ERROR] ${msg}`),
            warning: (msg) => console.warn(`[${new Date().toISOString()}] [ProcessManager] [WARNING] ${msg}`)
        };
        
    }

    // UDPストリーミング開始 (動画→UDP送信)
    async startUdpStreaming(videoFile) {
        try {
            if (this.udpSenderProcess) {
                // 既存のプロセスを停止
                await this.stopUdpStreaming();
            }

            this.log.info(`UDPストリーミング開始: ${videoFile}`);
            
            // 動画ファイルのパスを構築
            const videoPath = path.join(__dirname, 'videos', videoFile);
            
            const args = [
                '-re',
                '-stream_loop', '-1',
                '-i', videoPath,
                '-avoid_negative_ts', 'make_zero', '-fflags', '+genpts',
                '-c', 'copy',
                '-f', 'mpegts',
                '-buffer_size', '65536',
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
            });

            this.udpSenderProcess.on('error', (error) => {
                this.log.error(`UDPSenderプロセスエラー: ${error.message}`);
                this.udpSenderProcess = null;
            });

            return { success: true, message: `UDP streaming started: ${videoFile}` };

        } catch (error) {
            this.log.error(`UDPストリーミング開始エラー: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    // UDPストリーミング開始（フルパス指定版）
    async startUdpStreamingFromPath(videoPath, displayName = null, tempFile = null) {
        try {
            if (this.udpSenderProcess) {
                // 既存のプロセスを停止
                await this.stopUdpStreaming();
            }

            const videoName = displayName || path.basename(videoPath);
            this.log.info(`UDPストリーミング開始（フルパス）: ${videoName}`);
            
            // 一時ファイル情報を保存
            this.currentTempFile = tempFile;
            
            const args = [
                '-re',
                '-stream_loop', '-1',
                '-i', videoPath,
                '-avoid_negative_ts', 'make_zero', '-fflags', '+genpts',
                '-c', 'copy',
                '-f', 'mpegts',
                '-buffer_size', '65536',
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
                
                // 一時ファイルをクリーンアップ
                if (this.currentTempFile && tempFile === this.currentTempFile) {
                    this.cleanupTempFile();
                }
            });

            this.udpSenderProcess.on('error', (error) => {
                this.log.error(`UDPSenderプロセスエラー: ${error.message}`);
                this.udpSenderProcess = null;
                
                // エラー時も一時ファイルをクリーンアップ
                if (this.currentTempFile && tempFile === this.currentTempFile) {
                    this.cleanupTempFile();
                }
            });

            return { success: true, message: `UDP streaming started: ${videoName}` };

        } catch (error) {
            this.log.error(`UDPストリーミング開始エラー: ${error.message}`);
            
            // エラー時も一時ファイルをクリーンアップ
            if (tempFile) {
                this.cleanupTempFile(tempFile);
            }
            
            return { success: false, error: error.message };
        }
    }

    // 一時ファイルのクリーンアップ
    async cleanupTempFile(filePath = null) {
        try {
            const targetFile = filePath || this.currentTempFile;
            if (targetFile) {
                const fs = require('fs-extra');
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
                }, 5000);

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
            udp_sender_pid: this.udpSenderProcess ? this.udpSenderProcess.pid : null
        };
    }

    // 全プロセス停止（UDP streamingのみ）
    async stopAll() {
        return this.stopUdpStreaming();
    }
}

module.exports = ProcessManager;