FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl wget ca-certificates gnupg \
    && rm -rf /var/lib/apt/lists/*

# Node.js 20
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Python 3
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Java 21 (OpenJDK)
RUN apt-get update && apt-get install -y --no-install-recommends \
    default-jdk \
    && rm -rf /var/lib/apt/lists/*

# C/C++ (GCC + G++)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ \
    && rm -rf /var/lib/apt/lists/*

# Ruby
RUN apt-get update && apt-get install -y --no-install-recommends \
    ruby \
    && rm -rf /var/lib/apt/lists/*

# Go
RUN wget -q https://go.dev/dl/go1.22.5.linux-amd64.tar.gz -O /tmp/go.tar.gz \
    && tar -C /usr/local -xzf /tmp/go.tar.gz \
    && rm /tmp/go.tar.gz
ENV PATH=$PATH:/usr/local/go/bin

RUN useradd -m -s /bin/bash sandbox
WORKDIR /home/sandbox

COPY run.sh /home/sandbox/run.sh
RUN chmod +x /home/sandbox/run.sh

USER sandbox

ENTRYPOINT ["/home/sandbox/run.sh"]
