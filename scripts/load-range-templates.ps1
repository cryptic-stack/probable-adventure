param(
  [string]$ApiBase = "http://localhost:8080",
  [string]$AttackImage = "crypticstack/probable-adventure-attack-box:bookworm",
  [string]$WebLabImage = "crypticstack/probable-adventure-web-lab:bookworm",
  [string]$BaseServerImage = "crypticstack/probable-adventure-base-server:bookworm",
  [string]$DesktopImage = "crypticstack/probable-adventure-desktop-web:bookworm-novnc"
)

$attackTemplate = @{
  name = "redteam-attack-box"
  display_name = "Red Team Attack Box"
  description = "CLI attacker workstation on redteam segment."
  quota = 10
  definition_json = @{
    name = "redteam-attack-box"
    services = @(
      @{
        name = "attacker"
        image = $AttackImage
        network = "redteam"
        ports = @(
          @{
            container = 8080
            host = 0
          }
        )
      }
    )
  }
} | ConvertTo-Json -Depth 8

$webTemplate = @{
  name = "corporate-web-lab"
  display_name = "Corporate Web Lab"
  description = "Simple HTTP training target on corporate segment."
  quota = 10
  definition_json = @{
    name = "corporate-web-lab"
    services = @(
      @{
        name = "web"
        image = $WebLabImage
        network = "corporate"
        ports = @(
          @{
            container = 8080
            host = 0
          }
        )
      }
    )
  }
} | ConvertTo-Json -Depth 8

 $blueTemplate = @{
  name = "blueteam-analyst"
  display_name = "Blue Team Analyst"
  description = "Blue team workstation on blueteam segment."
  quota = 10
  definition_json = @{
    name = "blueteam-analyst"
    services = @(
      @{
        name = "analyst"
        image = $BaseServerImage
        network = "blueteam"
        ports = @(
          @{
            container = 8080
            host = 0
          }
        )
      }
    )
  }
} | ConvertTo-Json -Depth 8

$netbirdTemplate = @{
  name = "netbird-relay"
  display_name = "Netbird Relay"
  description = "Netbird segment node placeholder."
  quota = 10
  definition_json = @{
    name = "netbird-relay"
    services = @(
      @{
        name = "relay"
        image = $BaseServerImage
        network = "netbird"
        ports = @(
          @{
            container = 8080
            host = 0
          }
        )
      }
    )
  }
} | ConvertTo-Json -Depth 8

$guestTemplate = @{
  name = "guest-web-kiosk"
  display_name = "Guest Web Kiosk"
  description = "Guest segment web kiosk on port 8080."
  quota = 10
  definition_json = @{
    name = "guest-web-kiosk"
    services = @(
      @{
        name = "kiosk"
        image = $WebLabImage
        network = "guest"
        ports = @(
          @{
            container = 8080
            host = 0
          }
        )
      }
    )
  }
} | ConvertTo-Json -Depth 8

$desktopTemplate = @{
  name = "guest-desktop-browser"
  display_name = "Guest Browser Desktop (WebRTC)"
  description = "XFCE desktop accessible from browser via WebRTC on port 8080."
  quota = 10
  definition_json = @{
    name = "guest-desktop-browser"
    services = @(
      @{
        name = "desktop"
        image = $DesktopImage
        network = "guest"
        ports = @(
          @{
            container = 8080
            host = 0
          }
        )
      }
    )
  }
} | ConvertTo-Json -Depth 8

Write-Host "Loading redteam-attack-box template..."
Invoke-RestMethod -Uri "$ApiBase/api/templates" -Method POST -ContentType "application/json" -Body $attackTemplate | Out-Null

Write-Host "Loading corporate-web-lab template..."
Invoke-RestMethod -Uri "$ApiBase/api/templates" -Method POST -ContentType "application/json" -Body $webTemplate | Out-Null

Write-Host "Loading blueteam-analyst template..."
Invoke-RestMethod -Uri "$ApiBase/api/templates" -Method POST -ContentType "application/json" -Body $blueTemplate | Out-Null

Write-Host "Loading netbird-relay template..."
Invoke-RestMethod -Uri "$ApiBase/api/templates" -Method POST -ContentType "application/json" -Body $netbirdTemplate | Out-Null

Write-Host "Loading guest-web-kiosk template..."
Invoke-RestMethod -Uri "$ApiBase/api/templates" -Method POST -ContentType "application/json" -Body $guestTemplate | Out-Null

Write-Host "Loading guest-desktop-browser template..."
Invoke-RestMethod -Uri "$ApiBase/api/templates" -Method POST -ContentType "application/json" -Body $desktopTemplate | Out-Null

Write-Host "Done."
