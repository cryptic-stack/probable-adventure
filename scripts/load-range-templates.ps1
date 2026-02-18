param(
  [string]$ApiBase = "http://localhost:8080",
  [string]$AttackImage = "crypticstack/probable-adventure-attack-box:bookworm",
  [string]$WebLabImage = "crypticstack/probable-adventure-web-lab:bookworm"
)

$attackTemplate = @{
  name = "attack-box"
  display_name = "Attack Box (Bookworm)"
  description = "CLI attacker workstation with nmap, tcpdump, dnsutils, netcat."
  quota = 10
  definition_json = @{
    name = "attack-box"
    services = @(
      @{
        name = "attacker"
        image = $AttackImage
        command = @("bash", "-lc", "sleep infinity")
        ports = @()
      }
    )
  }
} | ConvertTo-Json -Depth 8

$webTemplate = @{
  name = "web-lab"
  display_name = "Web Lab (Bookworm)"
  description = "Simple HTTP training target on port 8080."
  quota = 10
  definition_json = @{
    name = "web-lab"
    services = @(
      @{
        name = "web"
        image = $WebLabImage
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

Write-Host "Loading attack-box template..."
Invoke-RestMethod -Uri "$ApiBase/api/templates" -Method POST -ContentType "application/json" -Body $attackTemplate | Out-Null

Write-Host "Loading web-lab template..."
Invoke-RestMethod -Uri "$ApiBase/api/templates" -Method POST -ContentType "application/json" -Body $webTemplate | Out-Null

Write-Host "Done."
