FROM node:20-slim

RUN apt-get update && apt-get install -y \
    git \
    openssh-client \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Align the sandbox user's uid/gid with the host user (1000) so the bind
# mount works in both directions: the backend writes the project files as the
# host user and the container user writes them as the same uid.
RUN userdel node && \
    groupadd -g 1000 sandbox && \
    useradd -u 1000 -g 1000 -m -d /home/sandbox -s /bin/bash sandbox && \
    mkdir -p /workspace && \
    chown sandbox:sandbox /workspace

ENV HOME=/home/sandbox
USER sandbox
WORKDIR /workspace

CMD ["/bin/bash", "-i"]
