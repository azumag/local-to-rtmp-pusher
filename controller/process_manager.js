const { spawn } = require('child_process');
const path = require('path');

class ProcessManager {
    constructor() {
        this.rtmpProcess = null;  // UDP受信→RTMP配信プロセス
        this.udpSenderProcess = null;  // 動画→UDP送信プロセス
        this.log = {
            info: (msg) => console.log(`[${new Date().toISOString()}] [ProcessManager] [INFO] ${msg}`),
            error: (msg) => console.error(`[${new Date().toISOString()}] [ProcessManager] [ERROR] ${msg}`),
            warning: (msg) => console.warn(`[${new Date().toISOString()}] [ProcessManager] [WARNING] ${msg}`)
        };
    }

    // RTMPストリーム開始 (UDP受信→RTMP配信)
    async startRtmpStream() {
        try {
            if (this.rtmpProcess) {
                this.log.warning("RTMPストリームは既に開始されています");
                return { success: false, error: "RTMP stream already running" };
            }

            this.log.info("RTMPストリーム開始: UDP受信→RTMP配信");
            
            // ffmpeg -i "udp://127.0.0.1:1234?timeout=0" -c copy -f flv rtmp://localhost:1936/live/stream
            const args = [
                '-i', 'udp://127.0.0.1:1234?timeout=0',
                '-c', 'copy',
                '-f', 'flv',
                'rtmp://localhost:1936/live/stream'
            ];

            this.rtmpProcess = spawn('ffmpeg', args);

            this.rtmpProcess.stdout.on('data', (data) => {
                this.log.info(`RTMP stdout: ${data}`);
            });

            this.rtmpProcess.stderr.on('data', (data) => {
                this.log.info(`RTMP stderr: ${data}`);
            });

            this.rtmpProcess.on('close', (code) => {
                this.log.info(`RTMPプロセス終了: code ${code}`);
                this.rtmpProcess = null;
            });

            this.rtmpProcess.on('error', (error) => {
                this.log.error(`RTMPプロセスエラー: ${error.message}`);
                this.rtmpProcess = null;
            });

            return { success: true, message: "RTMP stream started" };

        } catch (error) {
            this.log.error(`RTMPストリーム開始エラー: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    // RTMPストリーム停止
    async stopRtmpStream() {
        try {
            if (!this.rtmpProcess) {
                return { success: true, message: "RTMP stream not running" };
            }

            this.log.info("RTMPストリーム停止中...");
            this.rtmpProcess.kill('SIGTERM');
            
            // プロセス終了を待つ
            await new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    if (this.rtmpProcess) {
                        this.rtmpProcess.kill('SIGKILL');
                    }
                    resolve();
                }, 5000);

                if (this.rtmpProcess) {
                    this.rtmpProcess.on('close', () => {
                        clearTimeout(timeout);
                        resolve();
                    });
                } else {
                    clearTimeout(timeout);
                    resolve();
                }
            });

            this.rtmpProcess = null;
            this.log.info("RTMPストリーム停止完了");
            return { success: true, message: "RTMP stream stopped" };

        } catch (error) {
            this.log.error(`RTMPストリーム停止エラー: ${error.message}`);
            return { success: false, error: error.message };
        }
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
            const videoPath = path.join(__dirname, '../videos', videoFile);
            
            // ffmpeg -re -i videoA.mp4 -c copy -f mpegts udp://127.0.0.1:1234
            const args = [
                '-re',
                '-i', videoPath,
                '-c', 'copy',
                '-f', 'mpegts',
                'udp://127.0.0.1:1234'
            ];

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

    // UDPストリーミング停止
    async stopUdpStreaming() {
        try {
            if (!this.udpSenderProcess) {
                return { success: true, message: "UDP streaming not running" };
            }

            this.log.info("UDPストリーミング停止中...");
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
            this.log.info("UDPストリーミング停止完了");
            return { success: true, message: "UDP streaming stopped" };

        } catch (error) {
            this.log.error(`UDPストリーミング停止エラー: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    // 状態取得
    getStatus() {
        return {
            rtmp_stream_running: !!this.rtmpProcess,
            udp_streaming_running: !!this.udpSenderProcess,
            rtmp_pid: this.rtmpProcess ? this.rtmpProcess.pid : null,
            udp_sender_pid: this.udpSenderProcess ? this.udpSenderProcess.pid : null
        };
    }

    // 全プロセス停止
    async stopAll() {
        const results = await Promise.all([
            this.stopRtmpStream(),
            this.stopUdpStreaming()
        ]);

        return {
            success: results.every(r => r.success),
            results: results
        };
    }
}

module.exports = ProcessManager;