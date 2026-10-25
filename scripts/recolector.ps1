# Recolector de RiftLab en ciclo: junta partidas de LoL sin parar y, cada 4 vueltas, comps de TFT.
# Lo arranca Windows al iniciar sesión (acceso directo "RiftLab recolector" en la carpeta Inicio)
# y corre oculto, sin depender de la app ni de ninguna terminal.
# Avance: %LOCALAPPDATA%\riftlab\recolector.log
# Para detenerlo: cerrar los procesos "node" del recolector o borrar el acceso directo y reiniciar.

$root = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $env:LOCALAPPDATA "riftlab"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir "recolector.log"

# Una sola copia a la vez (por si se abre dos veces).
$mutex = New-Object System.Threading.Mutex($false, "Local\RiftLabRecolector")
if (-not $mutex.WaitOne(0)) { exit }

Set-Location $root
$tsx = Join-Path $root "node_modules\.bin\tsx.cmd"

function Write-Log([string]$text) {
  Add-Content -Path $log -Value $text -Encoding UTF8
}

function Run-Collector([string]$arguments) {
  # Por cmd para que la salida de node quede tal cual en el registro.
  cmd.exe /c "`"$tsx`" $arguments >> `"$log`" 2>&1"
}

$cycle = 0
while ($true) {
  $cycle++
  # El registro se rota al pasar 5 MB para que no crezca sin límite.
  if ((Test-Path $log) -and (Get-Item $log).Length -gt 5MB) { Move-Item -Force $log "$log.anterior" }

  Write-Log "=== Vuelta $cycle, $(Get-Date -Format 'yyyy-MM-dd HH:mm'): partidas de LoL ==="
  Run-Collector "scripts\aggregate.ts --platform all --players 30 --matches 15"

  if ($cycle % 4 -eq 1) {
    Write-Log "=== Vuelta $cycle, $(Get-Date -Format 'yyyy-MM-dd HH:mm'): comps de TFT ==="
    Run-Collector "scripts\aggregate-tft.ts"
  }

  Write-Log "Vuelta $cycle terminada. La siguiente empieza en 5 minutos."
  Start-Sleep -Seconds 300
}
