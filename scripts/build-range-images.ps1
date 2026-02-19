param(
  [ValidateSet("pull", "build")]
  [string]$Mode = "pull",
  [string]$DockerHubUser = "crypticstack",
  [string]$TagBaseServer = "bookworm",
  [string]$TagBaseUser = "bookworm-xfce",
  [string]$TagAttack = "bookworm",
  [string]$TagWeb = "bookworm",
  [string]$TagDesktop = "bookworm-novnc",
  [string]$NekoImage = "m1k1o/neko:latest"
)

$images = @(
  $NekoImage,
  "$DockerHubUser/probable-adventure-base-server:$TagBaseServer",
  "$DockerHubUser/probable-adventure-base-user:$TagBaseUser",
  "$DockerHubUser/probable-adventure-attack-box:$TagAttack",
  "$DockerHubUser/probable-adventure-web-lab:$TagWeb",
  "$DockerHubUser/probable-adventure-desktop-web:$TagDesktop"
)

if ($Mode -eq "pull") {
  Write-Host "Syncing Neko room images..."
  foreach ($img in $images) {
    Write-Host "Pull $img"
    docker pull $img
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  }
  Write-Host "Image sync complete."
  exit 0
}

Write-Host "Build mode selected (Neko-compatible range images)."
$baseUserImage = "$DockerHubUser/probable-adventure-base-user:$TagBaseUser"
$baseServerImage = "$DockerHubUser/probable-adventure-base-server:$TagBaseServer"
$attackImage = "$DockerHubUser/probable-adventure-attack-box:$TagAttack"
$webImage = "$DockerHubUser/probable-adventure-web-lab:$TagWeb"
$desktopImage = "$DockerHubUser/probable-adventure-desktop-web:$TagDesktop"

docker build -f Dockerfile.base-user -t $baseUserImage .
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

docker build -f Dockerfile.base-server --build-arg BASE_USER_IMAGE=$baseUserImage -t $baseServerImage .
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

docker build -f Dockerfile.range-attack-box --build-arg BASE_SERVER_IMAGE=$baseServerImage -t $attackImage .
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

docker build -f Dockerfile.range-web-lab --build-arg BASE_SERVER_IMAGE=$baseServerImage -t $webImage .
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

docker build -f Dockerfile.range-desktop-web --build-arg BASE_USER_IMAGE=$baseUserImage -t $desktopImage .
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Build complete."
foreach ($img in @($baseUserImage, $baseServerImage, $attackImage, $webImage, $desktopImage)) {
  Write-Host "  $img"
}
