FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
ENV FILE_SHARE_PORT=8080

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      bash \
      ca-certificates \
      curl \
      nano \
      python3 && \
    rm -rf /var/lib/apt/lists/*

RUN mkdir -p /srv/challenge-files

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

WORKDIR /srv/challenge-files

EXPOSE 8080

ENTRYPOINT ["/entrypoint.sh"]
