const { spawn } = require('child_process');
const path = require('path');

class ProcessManager {
    constructor() {
        this.udpSenderProcess = null;  // 動画→UDP送信プロセス
        this.rtmpStreamerProcess = null;  // 動画→RTMP直接配信プロセス
        this.currentTempFile = null;   // 現在使用中の一時ファイル
        this.streamingMode = 'udp';    // 'udp' または 'rtmp'
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

    // RTMP直接配信開始 (動画→RTMP)
    async startRtmpStreaming(videoFile) {
        try {
            if (this.rtmpStreamerProcess) {
                // 既存のプロセスを停止
                await this.stopRtmpStreaming();
            }

            this.log.info(`RTMP直接配信開始: ${videoFile}`);
            this.streamingMode = 'rtmp';
            
            // 動画ファイルのパスを構築
            const videoPath = path.join(__dirname, 'videos', videoFile);
            
            const args = [
                '-re',
                '-stream_loop', '-1',
                '-i', videoPath,
                '-avoid_negative_ts', 'make_zero',
                '-fflags', '+genpts',
                '-c', 'copy',
                '-f', 'flv',
                '-rtmp_buffer', '2097152',  // 2MB RTMP buffer
                '-rtmp_live', '1',
                'rtmp://rtmp-server:1935/live/stream'
            ];

            this.log.info(`FFmpegコマンド: ffmpeg ${args.join(' ')}`);

            this.rtmpStreamerProcess = spawn('ffmpeg', args);

            this.rtmpStreamerProcess.stdout.on('data', (data) => {
                this.log.info(`RTMP Streamer stdout: ${data}`);
            });

            this.rtmpStreamerProcess.stderr.on('data', (data) => {
                this.log.info(`RTMP Streamer stderr: ${data}`);
            });

            this.rtmpStreamerProcess.on('close', (code) => {
                this.log.info(`RTMPStreamerプロセス終了: code ${code}`);
                this.rtmpStreamerProcess = null;
            });

            this.rtmpStreamerProcess.on('error', (error) => {
                this.log.error(`RTMPStreamerプロセスエラー: ${error.message}`);
                this.rtmpStreamerProcess = null;
            });

            return { success: true, message: `RTMP streaming started: ${videoFile}` };

        } catch (error) {
            this.log.error(`RTMP配信開始エラー: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    // RTMP直接配信開始（フルパス指定版）
    async startRtmpStreamingFromPath(videoPath, displayName = null, tempFile = null) {
        try {
            if (this.rtmpStreamerProcess) {
                // 既存のプロセスを停止
                await this.stopRtmpStreaming();
            }

            const videoName = displayName || path.basename(videoPath);
            this.log.info(`RTMP直接配信開始（フルパス）: ${videoName}`);
            this.streamingMode = 'rtmp';
            
            // 一時ファイル情報を保存
            this.currentTempFile = tempFile;
            
            const args = [
                '-re',
                '-stream_loop', '-1',
                '-i', videoPath,
                '-avoid_negative_ts', 'make_zero',
                '-fflags', '+genpts',
                '-c', 'copy',
                '-f', 'flv',
                '-rtmp_buffer', '2097152',  // 2MB RTMP buffer
                '-rtmp_live', '1',
                'rtmp://rtmp-server:1935/live/stream'
            ];

            this.log.info(`FFmpegコマンド: ffmpeg ${args.join(' ')}`);

            this.rtmpStreamerProcess = spawn('ffmpeg', args);

            this.rtmpStreamerProcess.stdout.on('data', (data) => {
                this.log.info(`RTMP Streamer stdout: ${data}`);
            });

            this.rtmpStreamerProcess.stderr.on('data', (data) => {
                this.log.info(`RTMP Streamer stderr: ${data}`);
            });

            this.rtmpStreamerProcess.on('close', (code) => {
                this.log.info(`RTMPStreamerプロセス終了: code ${code}`);
                this.rtmpStreamerProcess = null;
                
                // 一時ファイルをクリーンアップ
                if (this.currentTempFile && tempFile === this.currentTempFile) {
                    this.cleanupTempFile();
                }
            });

            this.rtmpStreamerProcess.on('error', (error) => {
                this.log.error(`RTMPStreamerプロセスエラー: ${error.message}`);
                this.rtmpStreamerProcess = null;
                
                // エラー時も一時ファイルをクリーンアップ
                if (this.currentTempFile && tempFile === this.currentTempFile) {
                    this.cleanupTempFile();
                }
            });

            return { success: true, message: `RTMP streaming started: ${videoName}` };

        } catch (error) {
            this.log.error(`RTMP配信開始エラー: ${error.message}`);
            
            // エラー時も一時ファイルをクリーンアップ
            if (tempFile) {
                this.cleanupTempFile(tempFile);
            }
            
            return { success: false, error: error.message };
        }
    }

    // RTMP配信停止
    async stopRtmpStreaming() {
        try {
            if (!this.rtmpStreamerProcess) {
                return { success: true, message: 'RTMP streaming not running' };
            }

            this.log.info('RTMP配信停止中...');
            this.rtmpStreamerProcess.kill('SIGTERM');

            // 強制終了タイムアウト
            const timeout = setTimeout(() => {
                if (this.rtmpStreamerProcess) {
                    this.log.warning('RTMP配信強制終了');
                    this.rtmpStreamerProcess.kill('SIGKILL');
                }
            }, 5000);

            await new Promise(resolve => {
                if (this.rtmpStreamerProcess) {
                    this.rtmpStreamerProcess.on('close', () => {
                        clearTimeout(timeout);
                        resolve();
                    });
                } else {
                    clearTimeout(timeout);
                    resolve();
                }
            });

            this.rtmpStreamerProcess = null;
            
            // 一時ファイルをクリーンアップ
            if (this.currentTempFile) {
                await this.cleanupTempFile();
            }
            
            this.log.info('RTMP配信停止完了');
            return { success: true, message: 'RTMP streaming stopped' };

        } catch (error) {
            this.log.error(`RTMP配信停止エラー: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    // 状態取得
    getStatus() {
        return {
            udp_streaming_running: !!this.udpSenderProcess,
            udp_sender_pid: this.udpSenderProcess ? this.udpSenderProcess.pid : null,
            rtmp_streaming_running: !!this.rtmpStreamerProcess,
            rtmp_streamer_pid: this.rtmpStreamerProcess ? this.rtmpStreamerProcess.pid : null,
            streaming_mode: this.streamingMode
        };
    }

    // 全プロセス停止（UDP + RTMP streaming）
    async stopAll() {
        const results = [];
        
        if (this.udpSenderProcess) {
            results.push(await this.stopUdpStreaming());
        }
        
        if (this.rtmpStreamerProcess) {
            results.push(await this.stopRtmpStreaming());
        }
        
        if (results.length === 0) {
            return { success: true, message: 'No streams running' };
        }
        
        const allSuccess = results.every(result => result.success);
        return { 
            success: allSuccess, 
            message: allSuccess ? 'All streams stopped' : 'Some streams failed to stop',
            details: results
        };
    }
}

module.exports = ProcessManager;