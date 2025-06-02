# RTMP Streaming Issue Analysis

## Problem

When switching from static image to video file streaming, the RTMP stream is not actually being delivered to the RTMP server, even though FFmpeg is running and generating frames.

## Root Causes

1. **Concat Demuxer Limitations**:

   - FFmpeg's concat demuxer doesn't handle dynamic playlist updates well
   - When using `-stream_loop -1`, it loops the entire playlist, not individual files
   - Static images need special handling (duration specification or conversion to video)

2. **Current Implementation Issues**:
   - Static images are converted to 5-second loop videos
   - Playlist contains multiple entries of the same loop video
   - When switching to a video file, FFmpeg may not properly transition between files
   - FFmpeg process terminates after playing the video file

## Attempted Solutions

1. **Remove `-stream_loop -1`**: This prevents infinite looping of the playlist
2. **Convert static images to loop videos**: Adds audio track for compatibility
3. **Multiple playlist entries**: Adds multiple entries of static image loop video
4. **Dynamic playlist updates**: Attempted to update playlist on-the-fly

## Alternative Approaches

### Option 1: Single Long Loop Video

Instead of multiple 5-second videos, create a single long (e.g., 1-hour) loop video from the static image. This would:

- Reduce playlist complexity
- Ensure smooth transitions
- Allow time for playlist updates

### Option 2: Separate FFmpeg Processes

Use separate FFmpeg processes for:

- Static image streaming (with `-loop 1` directly on image)
- Video file streaming
- Switch between processes instead of updating playlist

### Option 3: FIFO Pipes

Use named pipes (FIFOs) to feed data to FFmpeg dynamically:

- Create a FIFO pipe
- FFmpeg reads from the pipe
- Application writes video data to the pipe
- Allows seamless switching without playlist updates

### Option 4: HLS/DASH Approach

Instead of direct RTMP streaming:

- Generate HLS/DASH segments
- Use a playlist that can be dynamically updated
- Serve segments via HTTP
- Use FFmpeg to convert HLS to RTMP if needed

## Recommended Solution

The most reliable approach would be **Option 2**: Separate FFmpeg processes

- Maintain one FFmpeg process for static image streaming
- Start a new process for video file streaming
- Gracefully stop the old process and start the new one
- This avoids the complexity of dynamic playlists

## Implementation Notes

The current playlist-based approach has fundamental limitations due to how FFmpeg's concat demuxer works. A more robust solution requires either:

1. Rethinking the streaming architecture
2. Using FFmpeg's capabilities differently
3. Implementing a custom streaming solution
