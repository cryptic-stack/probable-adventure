param(
  [string]$ApiBase = "http://localhost:8080",
  [string]$ServerImage = "crypticstack/probable-adventure-base-server:bookworm",
  [string]$UserImage = "crypticstack/probable-adventure-base-user:bookworm-xfce"
)

$serverTemplate = @{
  name = "base-server"
  display_name = "Base Server (Bookworm)"
  description = "Debian Bookworm base server with git, curl, nano."
  quota = 10
  definition_json = @{
    name = "base-server"
    services = @(
      @{
        name = "server"
        image = $ServerImage
        command = @("bash", "-lc", "sleep infinity")
        ports = @()
      }
    )
  }
} | ConvertTo-Json -Depth 8

$userTemplate = @{
  name = "base-user-xfce"
  display_name = "Base User XFCE (Bookworm)"
  description = "Debian Bookworm user image with XFCE + git, curl, nano."
  quota = 10
  definition_json = @{
    name = "base-user-xfce"
    services = @(
      @{
        name = "desktop"
        image = $UserImage
        command = @("bash", "-lc", "sleep infinity")
        ports = @()
      }
    )
  }
} | ConvertTo-Json -Depth 8

Write-Host "Loading base-server template..."
Invoke-RestMethod -Uri "$ApiBase/api/templates" -Method POST -ContentType "application/json" -Body $serverTemplate | Out-Null

Write-Host "Loading base-user-xfce template..."
Invoke-RestMethod -Uri "$ApiBase/api/templates" -Method POST -ContentType "application/json" -Body $userTemplate | Out-Null

Write-Host "Done."
