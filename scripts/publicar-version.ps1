# Publica en GitHub (R3N4X/riftlab) el instalador ya compilado con `npm run dist`, como un Release.
# La app instalada busca ahí las versiones nuevas y se actualiza sola.
# Uso: subir "version" en package.json y correr `npm run release` (compila y publica).
# Necesita la cuenta R3N4X conectada en gh; si la activa es otra, cambia a R3N4X y al final vuelve.

# Sin "Stop": en Windows PowerShell 5.1 cualquier texto que gh escriba en stderr cortaba el script.
# Los errores se revisan a mano con $LASTEXITCODE.
$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
$tag = "v$version"
$files = @(
  "dist-installer\RiftLab-Setup-$version.exe",
  "dist-installer\RiftLab-Setup-$version.exe.blockmap",
  "dist-installer\latest.yml"
)
foreach ($f in $files) {
  if (-not (Test-Path $f)) { throw "Falta $f. Ejecuta primero: npm run dist" }
}

$previous = (& gh api user --jq .login).Trim()
if ($previous -ne "R3N4X") { & gh auth switch --hostname github.com --user R3N4X | Out-Null }
try {
  # Primero el código, para que el Release quede sobre el commit de esta versión.
  & git push origin main
  if ($LASTEXITCODE -ne 0) { throw "No se pudo subir el código a GitHub." }
  cmd.exe /c "gh release view $tag --repo R3N4X/riftlab >nul 2>&1"
  if ($LASTEXITCODE -eq 0) { throw "La versión $tag ya está publicada. Sube el número de version en package.json." }
  & gh release create $tag @files --repo R3N4X/riftlab --title "RiftLab $version" --notes "Instalador de RiftLab $version para Windows. Si ya tienes la app instalada, se actualiza sola."
  if ($LASTEXITCODE -ne 0) { throw "No se pudo publicar la versión $tag." }
  Write-Host "Publicada: https://github.com/R3N4X/riftlab/releases/tag/$tag"
} finally {
  if ($previous -ne "R3N4X") { & gh auth switch --hostname github.com --user $previous | Out-Null }
}
