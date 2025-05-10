FROM alpine:3.17

# Install dependencies
RUN apk add --no-cache \
    nginx \
    nginx-mod-rtmp \
    ffmpeg \
    gettext

# Copy nginx configuration
COPY config/nginx.conf /etc/nginx/nginx.conf

# Create directories for RTMP
RUN mkdir -p /opt/rtmp/data

# Expose RTMP port
EXPOSE 1935

# Expose HTTP port for HLS/DASH
EXPOSE 8000

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]