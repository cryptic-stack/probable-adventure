ARG BASE_IMAGE=ghcr.io/m1k1o/neko/base:latest
FROM $BASE_IMAGE

ARG PRIMARY_USER=cryptic
ARG PRIMARY_PASS=cryptic

#
# install kde
RUN set -eux; apt-get update; \
    export DEBIAN_FRONTEND=noninteractive; \
    apt-get install -y --no-install-recommends ca-certificates curl gpg; \
    mkdir -p /etc/apt/keyrings; \
    curl -fsSL https://download.opensuse.org/repositories/security:/zeek/Debian_11/Release.key | gpg --dearmor -o /etc/apt/keyrings/zeek.gpg; \
    echo "deb [signed-by=/etc/apt/keyrings/zeek.gpg] https://download.opensuse.org/repositories/security:/zeek/Debian_11/ /" > /etc/apt/sources.list.d/zeek.list; \
    apt-get update; \
    apt-get install -y --no-install-recommends kde-full kwin-x11 sudo wireshark tshark zeek; \
    #
    # add corporate-friendly primary user while preserving legacy user compatibility
    if ! id -u "$PRIMARY_USER" >/dev/null 2>&1; then useradd -m -s /bin/bash "$PRIMARY_USER"; fi; \
    usermod -aG sudo "$PRIMARY_USER"; \
    echo "$PRIMARY_USER:$PRIMARY_PASS" | chpasswd; \
    if id -u neko >/dev/null 2>&1; then usermod -aG sudo neko; fi; \
    echo "%sudo ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers; \
    # clean up
    apt remove xserver-xorg-legacy -y; \
    apt-get clean -y; \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/*

#
# disable autolock
RUN set -eux; \
    mkdir -p "/home/${PRIMARY_USER}/.config"; \
    kwriteconfig5 --file "/home/${PRIMARY_USER}/.config/kscreenlockerrc" --group Daemon --key Autolock false; \
    chown "${PRIMARY_USER}:${PRIMARY_USER}" "/home/${PRIMARY_USER}/.config/kscreenlockerrc"

#
# copy configuation files
COPY supervisord.conf /etc/neko/supervisord/kde.conf

