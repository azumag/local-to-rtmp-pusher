# FFmpeg Installation Guide

FFmpeg is required for the streaming functionality to work properly. The application uses FFmpeg to handle video/audio encoding and streaming to RTMP endpoints.

## macOS Installation

### Using Homebrew (Recommended)

```bash
# Install Homebrew if you don't have it
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install FFmpeg
brew install ffmpeg
```

### Using MacPorts

```bash
# Install MacPorts from https://www.macports.org/install.php
# Then install FFmpeg
sudo port install ffmpeg
```

### Manual Installation

1. Download FFmpeg from https://evermeet.cx/ffmpeg/
2. Extract the archive
3. Move the `ffmpeg` binary to `/usr/local/bin/`
4. Make it executable: `chmod +x /usr/local/bin/ffmpeg`

## Linux Installation

### Ubuntu/Debian

```bash
sudo apt update
sudo apt install ffmpeg
```

### CentOS/RHEL/Fedora

```bash
# Enable EPEL repository
sudo yum install epel-release

# Install FFmpeg
sudo yum install ffmpeg
```

### Arch Linux

```bash
sudo pacman -S ffmpeg
```

## Windows Installation

### Using Chocolatey

```powershell
# Install Chocolatey from https://chocolatey.org/
# Then install FFmpeg
choco install ffmpeg
```

### Manual Installation

1. Download FFmpeg from https://www.gyan.dev/ffmpeg/builds/
2. Extract the archive
3. Add the `bin` folder to your system PATH
4. Verify installation: `ffmpeg -version`

## Docker Installation

If you're using Docker, FFmpeg is already included in the backend container. No additional installation is needed.

## Verification

After installation, verify FFmpeg is working:

```bash
ffmpeg -version
```

You should see output showing the FFmpeg version and configuration.

## Troubleshooting

### "FFmpeg not found" error

- Make sure FFmpeg is in your system PATH
- Restart your terminal after installation
- Try running `which ffmpeg` (macOS/Linux) or `where ffmpeg` (Windows)

### Permission errors

- On macOS/Linux, you may need to use `sudo` for installation
- Make sure the FFmpeg binary has execute permissions

### Backend still can't find FFmpeg

- Restart the backend server after installing FFmpeg
- Check that the Node.js process has access to the system PATH
