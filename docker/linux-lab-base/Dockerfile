FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
ENV SHELL=/bin/bash

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        bash \
        bash-completion \
        coreutils \
        findutils \
        grep \
        sed \
        gawk \
        file \
        psmisc \
        procps \
        lsof \
        strace \
        iproute2 \
        iputils-ping \
        net-tools \
        iptables \
        nftables \
        dnsutils \
        netcat-openbsd \
        telnet \
        nmap \
        curl \
        wget \
        rsync \
        zip \
        unzip \
        tar \
        gzip \
        bzip2 \
        xz-utils \
        tree \
        less \
        man-db \
        manpages \
        plocate \
        passwd \
        acl \
        nano \
        vim-tiny \
        jq \
        openssh-client \
        openssh-server \
        gnupg \
        screen \
        tmux \
        cron \
        rsyslog \
        sudo \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -s /bin/bash ctf \
    && useradd -m -s /bin/bash student \
    && useradd -m -s /bin/bash student2 \
    && useradd -m -s /bin/bash student3 \
    && echo "student:student" | chpasswd \
    && echo "student2:student" | chpasswd \
    && echo "student3:student" | chpasswd \
    && echo "ctf ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/ctf \
    && echo "student ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/student \
    && chmod 0440 /etc/sudoers.d/ctf \
    && chmod 0440 /etc/sudoers.d/student \
    && mkdir -p /home/student/labs /home/student2/labs /home/student3/labs /var/run/sshd \
    && touch /home/student/doc /home/student/secret \
    && echo "lab workspace" > /home/student/doc \
    && echo "restricted lab note" > /home/student/secret \
    && chown -R student:student /home/student \
    && chown -R student2:student2 /home/student2 \
    && chown -R student3:student3 /home/student3 \
    && chmod 0640 /home/student/doc /home/student/secret \
    && updatedb || true

RUN printf '%s\n' \
    'export SHELL=/bin/bash' \
    'export TERM=${TERM:-xterm-256color}' \
    'PS1="[\u@\h \w]\\$ "' > /etc/profile.d/ctf-shell.sh \
    && chmod 0644 /etc/profile.d/ctf-shell.sh

COPY entrypoint.sh /usr/local/bin/ctf-entrypoint
RUN chmod +x /usr/local/bin/ctf-entrypoint

WORKDIR /home/ctf
ENTRYPOINT ["/usr/local/bin/ctf-entrypoint"]
CMD ["bash", "-lc", "while true; do sleep 3600; done"]
