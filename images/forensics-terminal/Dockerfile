FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      bash \
      ca-certificates \
      coreutils \
      curl \
      file \
      iproute2 \
      iputils-ping \
      jq \
      nano \
      procps \
      python3 \
      python3-pip \
      sleuthkit \
      tshark \
      ttyd \
      wget \
      yara && \
    python3 -m pip install --no-cache-dir --break-system-packages volatility3 && \
    rm -rf /var/lib/apt/lists/*

RUN useradd -m -s /bin/bash ctf && \
    mkdir -p /workspace /opt/ctf && \
    chown -R ctf:ctf /workspace /opt/ctf

WORKDIR /workspace

USER ctf

CMD ["bash", "-li"]
