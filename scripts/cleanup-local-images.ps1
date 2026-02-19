param(
  [switch]$Force
)

$prefixes = @(
  "crypticstack/probable-adventure-",
  "m1k1o/neko"
)

Write-Host "Finding local images to remove..."
$all = docker image ls --format "{{.Repository}}:{{.Tag}}"
if ($LASTEXITCODE -ne 0) {
  Write-Host "Docker unavailable. Start Docker Desktop and run this script again."
  exit 1
}

$targets = @()
foreach ($img in $all) {
  foreach ($p in $prefixes) {
    if ($img.StartsWith($p)) {
      $targets += $img
      break
    }
  }
}

$targets = $targets | Sort-Object -Unique
if (-not $targets.Count) {
  Write-Host "No matching images found."
  exit 0
}

Write-Host "Will remove:"
$targets | ForEach-Object { Write-Host "  $_" }

if (-not $Force) {
  $answer = Read-Host "Continue? (y/N)"
  if ($answer -notin @("y", "Y", "yes", "YES")) {
    Write-Host "Cancelled."
    exit 0
  }
}

foreach ($img in $targets) {
  docker image rm -f $img | Out-Null
}

Write-Host "Image cleanup complete."
