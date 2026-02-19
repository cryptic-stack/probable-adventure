param(
  [string]$ApiBase = "http://localhost:8080"
)

function New-RoomTemplateBody {
  param(
    [string]$Name,
    [string]$DisplayName,
    [string]$Description,
    [string]$ServiceName,
    [string]$Image,
    [string]$Network = "guest"
  )

  return @{
    name = $Name
    display_name = $DisplayName
    description = $Description
    quota = 10
    definition_json = @{
      name = $Name
      room = @{
        user_pass = "neko"
        admin_pass = "admin"
        max_connections = 8
        control_protection = $true
      }
      services = @(
        @{
          name = $ServiceName
          image = $Image
          network = $Network
          ports = @(
            @{ container = 8080; host = 0; protocol = "tcp" },
            @{ container = 52000; host = 0; protocol = "udp" }
          )
        }
      )
    }
  } | ConvertTo-Json -Depth 8
}

function Publish-Template {
  param([string]$Body)

  try {
    $null = Invoke-RestMethod -Uri "$ApiBase/api/templates" -Method POST -ContentType "application/json" -Body $Body
    Write-Host "template loaded"
  }
  catch {
    Write-Host "template create failed (already exists or API unavailable): $($_.Exception.Message)"
  }
}

Write-Host "Loading base Neko-style templates..."

Publish-Template (New-RoomTemplateBody -Name "neko-desktop" -DisplayName "Neko Desktop Room" -Description "Single desktop room with browser access." -ServiceName "desktop" -Image "crypticstack/probable-adventure-desktop-web:bookworm-novnc" -Network "guest")
Publish-Template (New-RoomTemplateBody -Name "neko-user-lab" -DisplayName "Neko User Lab" -Description "General user workstation room." -ServiceName "workstation" -Image "crypticstack/probable-adventure-base-user:bookworm-xfce" -Network "guest")
Publish-Template (New-RoomTemplateBody -Name "neko-server-lab" -DisplayName "Neko Server Lab" -Description "Server-side lab room with browser entrypoint." -ServiceName "server" -Image "crypticstack/probable-adventure-base-server:bookworm" -Network "corporate")

Write-Host "Done."
