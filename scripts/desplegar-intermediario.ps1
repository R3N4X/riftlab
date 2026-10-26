# Despliega el intermediario de RiftLab (carpeta intermediario/) en Cloudflare Workers y le carga
# los secretos desde el .env.local: RIOT_API_KEY y el código del grupo (RIFTLAB_PROXY_CODE).
# Al final anota la dirección en el .env.local (RIFTLAB_PROXY_URL) para que `npm run dist` la
# incluya en el instalador. Correrlo de nuevo si cambia la clave de Riot.
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\desplegar-intermediario.ps1

# Sin "Stop": en Windows PowerShell 5.1 el texto que wrangler escribe en stderr cortaba el script.
$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root ".env.local"
Set-Location (Join-Path $root "intermediario")

function Read-Env([string]$name) {
  $line = Get-Content $envFile | Where-Object { $_ -match "^\s*$name\s*=" } | Select-Object -First 1
  if ($line) { return ($line -replace "^\s*$name\s*=\s*", "").Trim().Trim('"') }
}

function Write-Env([string]$name, [string]$value) {
  $lines = @(Get-Content $envFile | Where-Object { $_ -notmatch "^\s*$name\s*=" })
  Set-Content -Path $envFile -Value ($lines + "$name=$value") -Encoding UTF8
}

$key = Read-Env "RIOT_API_KEY"
if (-not $key) { throw "Falta RIOT_API_KEY en .env.local." }
$code = Read-Env "RIFTLAB_PROXY_CODE"
if (-not $code) {
  $bytes = New-Object byte[] 24
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $code = [Convert]::ToBase64String($bytes).Replace("+", "-").Replace("/", "_").TrimEnd("=")
  Write-Env "RIFTLAB_PROXY_CODE" $code
}

if (-not (Test-Path "node_modules")) { & npm install --no-audit --no-fund }

$who = (cmd.exe /c "npx wrangler whoami 2>&1") -join "`n"
if ($who -match "not authenticated") {
  Write-Host "Inicia sesión en Cloudflare en la ventana del navegador que se abre."
  & npx wrangler login
}

Write-Host "Desplegando el intermediario..."
$out = (cmd.exe /c "npx wrangler deploy 2>&1") -join "`n"
$url = [regex]::Match($out, "https://[a-z0-9.-]+\.workers\.dev").Value
if (-not $url) {
  Write-Host $out
  throw "No se pudo desplegar. Si el mensaje habla del subdominio workers.dev, entra a https://dash.cloudflare.com, abre 'Workers y Pages' una vez para crearlo y vuelve a ejecutar este script."
}

# Los secretos se pasan por la entrada estándar: no quedan en la pantalla ni en el historial.
$key | npx wrangler secret put RIOT_API_KEY | Out-Null
$code | npx wrangler secret put GROUP_CODE | Out-Null

# Prueba: el intermediario tiene que llegar a Riot con la clave y el código.
Start-Sleep -Seconds 5
try {
  $res = Invoke-WebRequest -UseBasicParsing -Uri "$url/la2/lol/status/v4/platform-data" -Headers @{ "X-RiftLab-Code" = $code }
  $status = $res.StatusCode
} catch {
  $status = [int]$_.Exception.Response.StatusCode
}
if ($status -ne 200) { throw "El intermediario respondió $status en la prueba. Revisa la clave de Riot del .env.local." }

Write-Env "RIFTLAB_PROXY_URL" $url
Write-Host "Intermediario listo: $url"
Write-Host "La próxima versión (npm run release) lo incluye: quien la instale no necesita clave propia."
