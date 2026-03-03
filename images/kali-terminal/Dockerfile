FROM kalilinux/kali-rolling:latest

ENV DEBIAN_FRONTEND=noninteractive
ARG TTYD_VERSION=1.7.7

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      bash \
      ca-certificates \
      coreutils \
      curl \
      iproute2 \
      iputils-ping \
      nano \
      procps \
      python3 \
      python3-pip \
      tshark \
      wget && \
    arch="$(dpkg --print-architecture)" && \
    if [ "$arch" = "amd64" ]; then ttyd_arch="x86_64"; \
    elif [ "$arch" = "arm64" ]; then ttyd_arch="aarch64"; \
    else echo "Unsupported architecture for ttyd binary: $arch" && exit 1; fi && \
    curl -fsSL "https://github.com/tsl0922/ttyd/releases/download/${TTYD_VERSION}/ttyd.${ttyd_arch}" -o /usr/local/bin/ttyd && \
    chmod +x /usr/local/bin/ttyd && \
    rm -rf /var/lib/apt/lists/*

RUN useradd -m -s /bin/bash ctf && \
    mkdir -p /workspace /opt/ctf && \
    chown -R ctf:ctf /workspace /opt/ctf

WORKDIR /workspace

USER ctf

CMD ["bash", "-li"]
