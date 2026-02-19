ARG BASE_IMAGE=ghcr.io/m1k1o/neko/base:latest
FROM $BASE_IMAGE

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
    # add user to sudoers
    usermod -aG sudo neko; \
    echo "neko:neko" | chpasswd; \
    echo "%sudo ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers; \
    # clean up
    apt remove xserver-xorg-legacy -y; \
    apt-get clean -y; \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/*

#
# disable autolock
RUN kwriteconfig5 --file /home/neko/.config/kscreenlockerrc --group Daemon --key Autolock false; \
    chown neko:neko /home/neko/.config/kscreenlockerrc

#
# copy configuation files
COPY supervisord.conf /etc/neko/supervisord/kde.conf

