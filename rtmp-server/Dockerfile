FROM alpine:3.17

# Install dependencies
RUN apk add --no-cache \
    nginx \
    nginx-mod-rtmp \
    ffmpeg \
    gettext && \
    # Load the RTMP module
    echo "load_module modules/ngx_rtmp_module.so;" > /etc/nginx/modules/rtmp.conf

# Copy nginx configuration and entrypoint script
COPY config/nginx.conf /etc/nginx/nginx.conf
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Create directories for RTMP
RUN mkdir -p /opt/rtmp/data

# Create a simple health check file
RUN echo '<html><body>RTMP Server Running</body></html>' > /opt/rtmp/data/index.html

# Expose RTMP port
EXPOSE 1935

# Expose HTTP port for HLS/DASH
EXPOSE 8000

# Start Nginx via entrypoint
CMD ["/entrypoint.sh"]