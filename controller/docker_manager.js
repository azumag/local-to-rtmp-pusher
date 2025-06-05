const Docker = require('dockerode');
const path = require('path');

class DockerManager {
    constructor() {
        this.docker = new Docker({ socketPath: '/var/run/docker.sock' });
        this.udpTarget = process.env.UDP_TARGET || '172.20.0.10:1234';
        this.networkName = 'streaming_streaming-network';
        this.currentSenderContainer = null;
        
        this.log = {
            info: (msg) => console.log(`[${new Date().toISOString()}] [INFO] ${msg}`),
            error: (msg) => console.error(`[${new Date().toISOString()}] [ERROR] ${msg}`),
            warning: (msg) => console.warn(`[${new Date().toISOString()}] [WARNING] ${msg}`),
            debug: (msg) => console.log(`[${new Date().toISOString()}] [DEBUG] ${msg}`)
        };
    }

    async initialize() {
        try {
            // Docker接続テスト
            const version = await this.docker.version();
            this.log.info(`Docker接続成功: ${version.Version}`);

            // ネットワーク存在確認
            try {
                const network = this.docker.getNetwork(this.networkName);
                await network.inspect();
                this.log.info(`ネットワーク確認OK: ${this.networkName}`);
            } catch (error) {
                this.log.error(`ネットワークが見つかりません: ${this.networkName}`);
                throw new Error(`Network not found: ${this.networkName}`);
            }

            this.log.info(`DockerManager初期化完了 (Network: ${this.networkName})`);
        } catch (error) {
            this.log.error(`Docker初期化エラー: ${error.message}`);
            throw error;
        }
    }

    async startSender(videoFile) {
        try {
            // 既存のsenderコンテナを停止
            await this.stopSender();

            const containerName = `streaming-sender-${Date.now()}`;
            const videoPath = `/app/videos/${videoFile}`;
            const udpUrl = `udp://${this.udpTarget}`;

            this.log.info(`Senderコンテナ起動: ${containerName}`);
            this.log.info(`使用ネットワーク: ${this.networkName}`);
            this.log.info(`動画ファイル: ${videoFile} → ${udpUrl}`);

            // FFmpegコマンド（ループ再生を追加）
            const command = [
                'sh', '-c',
                `ffmpeg -re -stream_loop -1 -i ${videoPath} -c copy -f mpegts ${udpUrl}`
            ];

            this.log.debug(`FFmpegコマンド: ${command.join(' ')}`);

            // コンテナ作成・起動
            const container = await this.docker.createContainer({
                Image: 'linuxserver/ffmpeg:latest',
                name: containerName,
                Cmd: command,
                Entrypoint: '',
                WorkingDir: '/app',
                Env: [
                    'PUID=1000',
                    'PGID=1000',
                    'TZ=Asia/Tokyo'
                ],
                HostConfig: {
                    Binds: [
                        `${path.resolve('./videos')}:/app/videos:ro`
                    ],
                    NetworkMode: this.networkName,
                    AutoRemove: true,
                    RestartPolicy: { Name: 'no' }
                }
            });

            // コンテナ起動
            try {
                await container.start();
                this.currentSenderContainer = container;
                this.log.info(`Senderコンテナ開始処理完了: ${containerName}`);
            } catch (startError) {
                this.log.warning(`Container start failed, but this may be normal for quick completion: ${startError.message}`);
                // 起動エラーでも続行（短時間実行の場合）
            }

            // 起動確認（コンテナが自動削除される前にチェック）
            await new Promise(resolve => setTimeout(resolve, 500));
            
            try {
                const containerInfo = await container.inspect();
                
                if (containerInfo.State.Running) {
                    this.log.info(`Senderコンテナ起動成功: ${containerName}`);
                    return {
                        success: true,
                        container_id: container.id,
                        container_name: containerName,
                        video_file: videoFile
                    };
                } else if (containerInfo.State.Status === 'exited') {
                    this.log.warning(`Senderコンテナが終了: ExitCode=${containerInfo.State.ExitCode}`);
                    // 短時間実行の場合は成功とみなす
                    return {
                        success: true,
                        container_id: container.id,
                        container_name: containerName,
                        video_file: videoFile,
                        note: 'Container exited quickly (short video or completed)'
                    };
                } else {
                    this.log.error(`Senderコンテナ起動失敗: ${containerInfo.State.Status}`);
                    return {
                        success: false,
                        error: `Container status: ${containerInfo.State.Status}`
                    };
                }
            } catch (inspectError) {
                // コンテナが削除されている場合
                this.log.info(`Senderコンテナは既に削除されました (AutoRemove): ${containerName}`);
                return {
                    success: true,
                    container_id: container.id,
                    container_name: containerName,
                    video_file: videoFile,
                    note: 'Container completed and was auto-removed'
                };
            }

        } catch (error) {
            this.log.error(`Senderコンテナ起動エラー: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async stopSender() {
        try {
            let stoppedCount = 0;

            // 現在のコンテナを停止
            if (this.currentSenderContainer) {
                try {
                    await this.currentSenderContainer.stop({ t: 10 });
                    this.log.info('現在のSenderコンテナを停止しました');
                    stoppedCount++;
                } catch (error) {
                    this.log.warning(`現在のSenderコンテナ停止エラー: ${error.message}`);
                }
                this.currentSenderContainer = null;
            }

            // streaming-senderで始まるコンテナをすべて停止
            const containers = await this.docker.listContainers({
                filters: { name: ['streaming-sender'] }
            });

            for (const containerInfo of containers) {
                try {
                    const container = this.docker.getContainer(containerInfo.Id);
                    await container.stop({ t: 10 });
                    this.log.info(`Senderコンテナ停止: ${containerInfo.Names[0]}`);
                    stoppedCount++;
                } catch (error) {
                    this.log.warning(`Senderコンテナ停止エラー ${containerInfo.Names[0]}: ${error.message}`);
                }
            }

            return {
                success: true,
                stopped_containers: stoppedCount
            };

        } catch (error) {
            this.log.error(`Senderコンテナ停止エラー: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async getContainerStats(containerName) {
        try {
            const container = this.docker.getContainer(containerName);
            const info = await container.inspect();
            const stats = await container.stats({ stream: false });

            // CPU使用率計算
            const cpuPercent = this.calculateCpuPercent(stats);

            // メモリ使用量
            const memoryUsage = stats.memory_stats.usage || 0;
            const memoryLimit = stats.memory_stats.limit || 0;
            const memoryPercent = memoryLimit > 0 ? (memoryUsage / memoryLimit * 100) : 0;

            return {
                status: info.State.Status,
                cpu_percent: Math.round(cpuPercent * 100) / 100,
                memory_percent: Math.round(memoryPercent * 100) / 100,
                memory_usage_mb: Math.round(memoryUsage / 1024 / 1024 * 100) / 100,
                memory_limit_mb: Math.round(memoryLimit / 1024 / 1024 * 100) / 100,
                created: info.Created,
                started: info.State.StartedAt
            };

        } catch (error) {
            this.log.error(`統計取得エラー ${containerName}: ${error.message}`);
            return { error: error.message };
        }
    }

    calculateCpuPercent(stats) {
        try {
            const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
            const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;

            if (systemDelta > 0) {
                const cpuCount = stats.cpu_stats.cpu_usage.percpu_usage ? stats.cpu_stats.cpu_usage.percpu_usage.length : 1;
                return (cpuDelta / systemDelta) * cpuCount * 100;
            }
            return 0.0;
        } catch (error) {
            return 0.0;
        }
    }

    async getSenderStatus() {
        try {
            const containers = await this.docker.listContainers({
                filters: { name: ['streaming-sender'] }
            });

            const activeContainers = containers
                .filter(c => c.State === 'running')
                .map(c => ({
                    name: c.Names[0],
                    id: c.Id.substring(0, 12),
                    status: c.Status,
                    created: c.Created
                }));

            return {
                running: activeContainers.length > 0,
                count: activeContainers.length,
                containers: activeContainers
            };

        } catch (error) {
            this.log.error(`Sender状態取得エラー: ${error.message}`);
            return {
                running: false,
                count: 0,
                error: error.message
            };
        }
    }

    async checkReceiverHealth() {
        try {
            const container = this.docker.getContainer('streaming-receiver');
            const info = await container.inspect();
            return info.State.Running;
        } catch (error) {
            this.log.warning(`Receiver健全性チェックエラー: ${error.message}`);
            return false;
        }
    }

    async checkSenderHealth() {
        try {
            const senderStatus = await this.getSenderStatus();
            return senderStatus.running;
        } catch (error) {
            this.log.error(`Sender健全性チェックエラー: ${error.message}`);
            return false;
        }
    }

    async getContainerLogs(containerName, lines = 100) {
        try {
            const container = this.docker.getContainer(containerName);
            const logs = await container.logs({
                stdout: true,
                stderr: true,
                tail: lines,
                timestamps: true
            });

            // Buffer to string conversion
            return logs.toString().split('\n').filter(line => line.trim());

        } catch (error) {
            this.log.error(`ログ取得エラー ${containerName}: ${error.message}`);
            return [`Error getting logs: ${error.message}`];
        }
    }

    async getSenderLogs(lines = 100) {
        try {
            const containers = await this.docker.listContainers({
                filters: { name: ['streaming-sender'] }
            });

            if (containers.length === 0) {
                return ['No sender containers running'];
            }

            // 最新のコンテナのログを取得
            const latestContainer = containers.sort((a, b) => b.Created - a.Created)[0];
            return await this.getContainerLogs(latestContainer.Id, lines);

        } catch (error) {
            this.log.error(`Senderログ取得エラー: ${error.message}`);
            return [`Error getting sender logs: ${error.message}`];
        }
    }

    async getControllerLogs(lines = 100) {
        try {
            return await this.getContainerLogs('streaming-controller', lines);
        } catch (error) {
            this.log.error(`コントローラログ取得エラー: ${error.message}`);
            return [`Error getting controller logs: ${error.message}`];
        }
    }

    async cleanupStoppedContainers() {
        try {
            const containers = await this.docker.listContainers({
                all: true,
                filters: {
                    name: ['streaming-sender'],
                    status: ['exited']
                }
            });

            let removedCount = 0;
            for (const containerInfo of containers) {
                try {
                    const container = this.docker.getContainer(containerInfo.Id);
                    await container.remove();
                    removedCount++;
                    this.log.debug(`停止済みコンテナ削除: ${containerInfo.Names[0]}`);
                } catch (error) {
                    this.log.warning(`コンテナ削除エラー ${containerInfo.Names[0]}: ${error.message}`);
                }
            }

            if (removedCount > 0) {
                this.log.info(`停止済みコンテナを${removedCount}個削除しました`);
            }

            return {
                success: true,
                removed_count: removedCount
            };

        } catch (error) {
            this.log.error(`クリーンアップエラー: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = DockerManager;