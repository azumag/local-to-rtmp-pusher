const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

class SimpleStreamController {
  constructor() {
    this.rtmpUrl = process.env.RTMP_URL || 'rtmp://rtmp-server:1935/live/stream';
    this.videosDir = '/app/videos';
    this.ffmpegProcess = null;
  }

  async init() {
    console.log('Simple Stream Controller starting...');
    
    // Wait for services
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Generate test videos
    await this.generateTestVideos();
    
    // Start with standby video
    await this.streamVideo('standby.mp4', 10);
    
    // Switch to main content
    await this.streamVideo('main-content.mp4', 10);
    
    // Back to standby
    await this.streamVideo('standby.mp4', 10);
    
    console.log('Stream sequence completed');
    process.exit(0);
  }

  async generateTestVideos() {
    try {
      const standbyPath = path.join(this.videosDir, 'standby.mp4');
      await fs.access(standbyPath);
      console.log('Test videos already exist');
    } catch {
      console.log('Generating test videos...');
      const generateScript = spawn('/bin/bash', ['/app/scripts/generate-test-videos.sh']);
      await new Promise((resolve) => {
        generateScript.on('close', resolve);
      });
    }
  }

  async streamVideo(filename, duration) {
    console.log(`Streaming ${filename} for ${duration} seconds...`);
    
    const ffmpegArgs = [
      '-re',
      '-i', path.join(this.videosDir, filename),
      '-c:v', 'libx264',
      '-preset', 'veryfast',  // Changed from ultrafast for better compatibility
      '-tune', 'zerolatency',
      '-profile:v', 'baseline',  // More compatible profile
      '-level', '3.1',
      '-g', '60',  // Larger GOP for stability
      '-keyint_min', '60',
      '-sc_threshold', '0',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '44100',
      '-ac', '2',  // Explicit stereo
      '-pix_fmt', 'yuv420p',
      '-r', '30',  // Explicit frame rate
      '-maxrate', '2500k',
      '-bufsize', '5000k',
      '-f', 'flv',
      '-t', duration.toString(),
      this.rtmpUrl
    ];

    this.ffmpegProcess = spawn('ffmpeg', ffmpegArgs);

    return new Promise((resolve) => {
      this.ffmpegProcess.on('close', (code) => {
        console.log(`FFmpeg process for ${filename} exited with code ${code}`);
        resolve();
      });

      this.ffmpegProcess.stderr.on('data', (data) => {
        const stderr = data.toString();
        if (stderr.includes('frame=')) {
          // Progress indicator
          process.stdout.write('.');
        }
      });
    });
  }
}

// Start controller
const controller = new SimpleStreamController();
controller.init().catch(console.error);