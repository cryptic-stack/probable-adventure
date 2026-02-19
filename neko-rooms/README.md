# Rooms Service

<p align="center">
  <img src="https://img.shields.io/github/v/release/cryptic-stack/probable-adventure" alt="release">
  <img src="https://img.shields.io/github/license/cryptic-stack/probable-adventure" alt="license">
  <img src="https://img.shields.io/docker/pulls/crypticstack/neko-rooms" alt="pulls">
  <img src="https://img.shields.io/github/issues/cryptic-stack/probable-adventure" alt="issues">
  <a href="https://discord.gg/3U6hWpC" ><img src="https://discordapp.com/api/guilds/665851821906067466/widget.png" alt="Chat on discord"></a>
</p>

Simple room management system for desktop streaming. Self-hosted rabb.it alternative.

<div align="center">
  <img src="https://raw.githubusercontent.com/cryptic-stack/probable-adventure/main/neko-rooms/docs/rooms.png" alt="rooms">
  <img src="https://raw.githubusercontent.com/cryptic-stack/probable-adventure/main/neko-rooms/docs/new_room.png" alt="new room">
  <img src="https://raw.githubusercontent.com/cryptic-stack/probable-adventure/main/neko-rooms/docs/neko.gif" alt="preview">
</div>

## Zero-knowledge installation (with HTTPS)

No experience with Docker and reverse proxy? No problem. Follow these steps to set up the Rooms Service quickly and securely:

- Rent a VPS with public IP and OS Ubuntu.
- Get a domain name pointing to your IP (you can even get some for free).
- Run install script and follow instructions.
- Secure using HTTPs thanks to Let's Encrypt and Traefik or NGINX.

```bash
wget -O neko-rooms-traefik.sh https://raw.githubusercontent.com/cryptic-stack/probable-adventure/main/neko-rooms/traefik/install
sudo bash neko-rooms-traefik.sh
```

### Community Installation Scripts

We have community-contributed installation scripts available. Check out our [community installation guides](./community/README.md) for instructions on installing neko-rooms on various Linux distributions. These scripts are maintained by the community and support different Linux distributions like Arch Linux, Fedora, and more.

## How to start

If you want to use Traefik as reverse proxy, visit [installation guide for traefik as reverse proxy](./traefik/).

Otherwise modify variables in `docker-compose.yml` and just run `docker-compose up -d`.

### Download images / update

You need to pull all your images, that you want to use with neko-room. Otherwise, you might get this error: `Error response from daemon: No such image:` (see issue #1).

```sh
docker pull crypticstack/neko:xfce
docker pull crypticstack/neko:kde
docker pull crypticstack/neko:ubuntu
# etc...
```

If you want to update desktop images, pull new images and recreate the rooms using old tags. To update Rooms Service, run:

```sh
docker-compose pull
docker-compose up -d
```

### Enable storage

You might have encountered this error:

> Mounts cannot be specified because storage is disabled or unavailable.

If you didn't specify storage yet, you can do it using [this tutorial](./docs/storage.md).

### Use nvidia GPU

If you want to use nvidia GPU, you need to install [nvidia-docker](https://github.com/NVIDIA/nvidia-docker).

Change neko images to nvidia images in `docker-compose.yml` using envorinment variable `NEKO_ROOMS_NEKO_IMAGES`:

```bash
NEKO_ROOMS_NEKO_IMAGES="
  crypticstack/neko:xfce
  crypticstack/neko:kde
  crypticstack/neko:ubuntu
"
```

When creating new room, you need to specify to use GPU in expext settings.

### Docs

For more information visit [docs](./docs).

### Roadmap:
 - [x] add GUI
 - [x] add HTTPS support
 - [x] add authentication provider for traefik
 - [x] allow specifying custom ENV variables
 - [x] allow mounting directories for persistent data
 - [x] optionally remove Traefik as dependency
 - [ ] add upgrade button
 - [ ] auto pull images, that do not exist
 - [ ] add bearer token to for API
 - [ ] add docker SSH / TCP support
 - [ ] add docker swarm support
 - [ ] add k8s support
