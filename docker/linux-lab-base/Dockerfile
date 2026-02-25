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
        python3 \
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
        ttyd \
        passwd \
        acl \
        nano \
        vim-tiny \
        jq \
        openssh-client \
        openssh-server \
        tcpdump \
        netplan.io \
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
    && touch /home/ctf/.bash_history /home/ctf/.ctfd_commands \
    && chown ctf:ctf /home/ctf/.bash_history /home/ctf/.ctfd_commands \
    && chmod 0600 /home/ctf/.bash_history /home/ctf/.ctfd_commands \
    && updatedb || true

RUN printf '%s\n' \
    'export SHELL=/bin/bash' \
    'export TERM=${TERM:-xterm-256color}' \
    'export HISTFILE=/home/ctf/.bash_history' \
    'export CTFD_CMDLOG=/home/ctf/.ctfd_commands' \
    'export HISTSIZE=5000' \
    'export HISTFILESIZE=10000' \
    'PS1="[\u@\h \w]\\$ "' > /etc/profile.d/ctf-shell.sh \
    && chmod 0644 /etc/profile.d/ctf-shell.sh \
    && printf '%s\n' \
    '' \
    '# CTFd terminal command logging (bash only)' \
    'if [ -n "${BASH_VERSION:-}" ]; then' \
    '  shopt -s histappend' \
    '  __ctfd_log_last_command() {' \
    '    local last prev' \
    '    last="$(HISTTIMEFORMAT= history 1 2>/dev/null | sed -E "s/^[[:space:]]*[0-9]+[[:space:]]*//")"' \
    '    [ -n "${last}" ] || return 0' \
    '    case "${last}" in __ctfd_log_last_command*|history\ -a*|history\ -n*) return 0;; esac' \
    '    prev="$(tail -n 1 "${CTFD_CMDLOG}" 2>/dev/null || true)"' \
    '    [ "${prev}" = "${last}" ] || printf "%s\n" "${last}" >> "${CTFD_CMDLOG}"' \
    '  }' \
    '  case ":${PROMPT_COMMAND:-}:" in *":history -a; history -n:"*) ;; *) PROMPT_COMMAND="history -a; history -n${PROMPT_COMMAND:+; ${PROMPT_COMMAND}}";; esac' \
    '  case ":${PROMPT_COMMAND:-}:" in *":__ctfd_log_last_command:"*) ;; *) PROMPT_COMMAND="__ctfd_log_last_command${PROMPT_COMMAND:+; ${PROMPT_COMMAND}}";; esac' \
    'fi' >> /home/ctf/.bashrc

COPY entrypoint.sh /usr/local/bin/ctf-entrypoint
RUN chmod +x /usr/local/bin/ctf-entrypoint

WORKDIR /home/ctf
ENTRYPOINT ["/usr/local/bin/ctf-entrypoint"]
CMD ["bash", "-lc", "while true; do sleep 3600; done"]
