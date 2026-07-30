FROM node:20-slim

RUN apt-get update && apt-get install -y \
    git \
    openssh-client \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN adduser --disabled-password --gecos '' sandbox && \
    mkdir -p /workspace && \
    chown sandbox:sandbox /workspace

ENV HOME=/home/sandbox
USER sandbox
WORKDIR /workspace

CMD ["/bin/bash", "-i"]
