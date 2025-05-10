FROM node:18-alpine

# Install FFmpeg and dependencies
RUN apk add --no-cache ffmpeg python3 make g++ curl

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy app source
COPY . .

# Create cache directory for media files
RUN mkdir -p /app/cache

# Expose port
EXPOSE 3000

# Start app
CMD ["npm", "start"]