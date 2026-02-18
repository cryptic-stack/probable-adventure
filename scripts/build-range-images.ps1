param(
  [string]$DockerHubUser = "crypticstack",
  [string]$TagBaseServer = "bookworm",
  [string]$TagBaseUser = "bookworm-xfce",
  [string]$TagAttack = "bookworm",
  [string]$TagWeb = "bookworm",
  [string]$TagDesktop = "bookworm-novnc"
)

$baseServerImage = "$DockerHubUser/probable-adventure-base-server:$TagBaseServer"
$baseUserImage = "$DockerHubUser/probable-adventure-base-user:$TagBaseUser"
$attackImage = "$DockerHubUser/probable-adventure-attack-box:$TagAttack"
$webImage = "$DockerHubUser/probable-adventure-web-lab:$TagWeb"
$desktopImage = "$DockerHubUser/probable-adventure-desktop-web:$TagDesktop"

Write-Host "Building $baseServerImage"
docker build -f Dockerfile.base-user -t $baseUserImage .
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Building $baseServerImage"
docker build -f Dockerfile.base-server --build-arg BASE_USER_IMAGE=$baseUserImage -t $baseServerImage .
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Building $attackImage"
docker build -f Dockerfile.range-attack-box --build-arg BASE_SERVER_IMAGE=$baseServerImage -t $attackImage .
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Building $webImage"
docker build -f Dockerfile.range-web-lab --build-arg BASE_SERVER_IMAGE=$baseServerImage -t $webImage .
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Building $desktopImage"
docker build -f Dockerfile.range-desktop-web --build-arg BASE_USER_IMAGE=$baseUserImage -t $desktopImage .
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Built images:"
Write-Host "  $baseServerImage"
Write-Host "  $baseUserImage"
Write-Host "  $attackImage"
Write-Host "  $webImage"
Write-Host "  $desktopImage"
Write-Host "Push with:"
Write-Host "  docker push $baseServerImage"
Write-Host "  docker push $baseUserImage"
Write-Host "  docker push $attackImage"
Write-Host "  docker push $webImage"
Write-Host "  docker push $desktopImage"
