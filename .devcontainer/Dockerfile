FROM node:18-bullseye

RUN apt-get update && apt-get install -y \
    git \
    ffmpeg \
    curl \
    wget \
    vim \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g nodemon

ARG USERNAME=node
ARG USER_UID=1000
ARG USER_GID=$USER_UID

RUN groupmod --gid $USER_GID $USERNAME \
    && usermod --uid $USER_UID --gid $USER_GID $USERNAME \
    && chown -R $USER_UID:$USER_GID /home/$USERNAME

USER $USERNAME

WORKDIR /workspace