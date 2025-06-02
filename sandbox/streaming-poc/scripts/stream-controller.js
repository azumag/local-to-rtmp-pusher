const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

class StreamController {
  constructor() {
    this.rtmpUrl = process.env.RTMP_URL || 'rtmp://rtmp-server:1935/live/stream';
    this.playlistPath = '/app/playlists/current.txt';
    this.videosDir = '/app/videos';
    this.ffmpegProcess = null;
    this.isStreaming = false;
  }

  async init() {
    console.log('Initializing stream controller...');
    
    // Wait a bit for RTMP server to fully initialize
    console.log('Waiting for services to initialize...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Generate test videos if they don't exist
    await this.generateTestVideos();
    
    // Create initial playlist with standby video
    await this.createPlaylist(['standby.mp4']);
    
    // Start streaming
    await this.startStream();
    
    // Schedule content changes
    setTimeout(() => this.switchToMainContent(), 10000); // Switch to main after 10s
    setTimeout(() => this.switchToStandby(), 40000); // Back to standby after 40s
    setTimeout(() => this.stopStream(), 50000); // Stop after 50s
  }

  async generateTestVideos() {
    const standbyExists = await this.fileExists(path.join(this.videosDir, 'standby.mp4'));
    const mainExists = await this.fileExists(path.join(this.videosDir, 'main-content.mp4'));
    
    if (!standbyExists || !mainExists) {
      console.log('Generating test videos...');
      const generateScript = spawn('/bin/bash', ['/app/scripts/generate-test-videos.sh']);
      
      return new Promise((resolve, reject) => {
        generateScript.on('close', (code) => {
          if (code === 0) {
            console.log('Test videos generated successfully');
            resolve();
          } else {
            reject(new Error(`Video generation failed with code ${code}`));
          }
        });
      });
    }
  }

  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async createPlaylist(videoFiles) {
    const playlistContent = videoFiles
      .map(file => `file '${this.videosDir}/${file}'`)
      .join('\n');
    
    await fs.writeFile(this.playlistPath, playlistContent);
    console.log(`Playlist created with: ${videoFiles.join(', ')}`);
  }

  async updatePlaylist(videoFiles) {
    console.log(`Updating playlist with: ${videoFiles.join(', ')}`);
    
    // Create new playlist
    const newPlaylistPath = '/app/playlists/new.txt';
    const playlistContent = videoFiles
      .map(file => `file '${this.videosDir}/${file}'`)
      .join('\n');
    
    await fs.writeFile(newPlaylistPath, playlistContent);
    
    // Atomic rename to update playlist
    await fs.rename(newPlaylistPath, this.playlistPath);
    console.log('Playlist updated successfully');
  }

  async waitForRTMPServer() {
    const maxRetries = 30;
    let retries = 0;
    
    console.log('Waiting for RTMP server to be ready...');
    
    while (retries < maxRetries) {
      try {
        // Try to connect to RTMP server
        const testProcess = spawn('ffmpeg', [
          '-f', 'lavfi',
          '-i', 'nullsrc=s=320x240:r=30',
          '-t', '0.1',
          '-f', 'flv',
          this.rtmpUrl
        ]);
        
        await new Promise((resolve) => {
          testProcess.on('close', resolve);
        });
        
        console.log('RTMP server is ready');
        return;
      } catch (error) {
        retries++;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    throw new Error('RTMP server not ready after 30 seconds');
  }

  async startStream() {
    if (this.isStreaming) {
      console.log('Stream already running');
      return;
    }

    console.log('Starting stream...');
    
    // Wait for RTMP server to be ready
    await this.waitForRTMPServer();
    
    const ffmpegArgs = [
      '-re', // Read input at native frame rate
      '-f', 'concat',
      '-safe', '0',
      '-stream_loop', '-1', // Infinite loop
      '-i', this.playlistPath,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-tune', 'zerolatency',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '44100',
      '-f', 'flv',
      '-reconnect', '1',
      '-reconnect_at_eof', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5',
      this.rtmpUrl
    ];

    this.ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
    this.isStreaming = true;

    this.ffmpegProcess.stdout.on('data', (data) => {
      console.log(`FFmpeg stdout: ${data}`);
    });

    this.ffmpegProcess.stderr.on('data', (data) => {
      const stderr = data.toString();
      console.log(`FFmpeg stderr: ${stderr}`);
      
      // Check for specific errors
      if (stderr.includes('Broken pipe') || stderr.includes('Connection refused')) {
        console.error('⚠️  RTMP connection error detected');
      }
    });

    this.ffmpegProcess.on('close', (code) => {
      console.log(`FFmpeg process exited with code ${code}`);
      this.isStreaming = false;
    });

    this.ffmpegProcess.on('error', (err) => {
      console.error('FFmpeg error:', err);
      this.isStreaming = false;
    });

    console.log('Stream started successfully');
  }

  async switchToMainContent() {
    console.log('Switching to main content...');
    await this.updatePlaylist(['main-content.mp4']);
  }

  async switchToStandby() {
    console.log('Switching back to standby...');
    await this.updatePlaylist(['standby.mp4']);
  }

  async stopStream() {
    if (!this.isStreaming || !this.ffmpegProcess) {
      console.log('Stream not running');
      return;
    }

    console.log('Stopping stream...');
    this.ffmpegProcess.kill('SIGTERM');
    this.isStreaming = false;
    
    // Give it time to gracefully shutdown
    setTimeout(() => {
      if (this.ffmpegProcess) {
        this.ffmpegProcess.kill('SIGKILL');
      }
    }, 5000);
  }
}

// Start the controller
const controller = new StreamController();
controller.init().catch(console.error);

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down...');
  await controller.stopStream();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down...');
  await controller.stopStream();
  process.exit(0);
});