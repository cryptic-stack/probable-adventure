param(
  [string]$DockerHubUser = "crypticstack",
  [string]$TagAttack = "bookworm",
  [string]$TagWeb = "bookworm",
  [string]$TagDesktop = "bookworm-novnc"
)

$attackImage = "$DockerHubUser/probable-adventure-attack-box:$TagAttack"
$webImage = "$DockerHubUser/probable-adventure-web-lab:$TagWeb"
$desktopImage = "$DockerHubUser/probable-adventure-desktop-web:$TagDesktop"

Write-Host "Building $attackImage"
docker build -f Dockerfile.range-attack-box -t $attackImage .
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Building $webImage"
docker build -f Dockerfile.range-web-lab -t $webImage .
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Building $desktopImage"
docker build -f Dockerfile.range-desktop-web -t $desktopImage .
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Built images:"
Write-Host "  $attackImage"
Write-Host "  $webImage"
Write-Host "  $desktopImage"
Write-Host "Push with:"
Write-Host "  docker push $attackImage"
Write-Host "  docker push $webImage"
Write-Host "  docker push $desktopImage"
