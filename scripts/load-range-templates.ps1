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
    [string]$Network
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

Write-Host "Loading range scenario templates (Neko-style room access)..."

Publish-Template (New-RoomTemplateBody -Name "neko-attack-box" -DisplayName "Neko Attack Box" -Description "Red team attacker room." -ServiceName "attacker" -Image "crypticstack/probable-adventure-attack-box:bookworm" -Network "redteam")
Publish-Template (New-RoomTemplateBody -Name "neko-web-lab" -DisplayName "Neko Web Lab" -Description "Corporate web application room." -ServiceName "web" -Image "crypticstack/probable-adventure-web-lab:bookworm" -Network "corporate")
Publish-Template (New-RoomTemplateBody -Name "neko-blue-analyst" -DisplayName "Neko Blue Analyst" -Description "Blue team analysis room." -ServiceName "analyst" -Image "crypticstack/probable-adventure-base-server:bookworm" -Network "blueteam")

Write-Host "Done."
