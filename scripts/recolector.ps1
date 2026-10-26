# Recolector de RiftLab en ciclo: junta partidas de LoL sin parar y, cada 4 vueltas, comps de TFT.
# Lo arranca el Programador de tareas de Windows un minuto después de iniciar sesión (tarea
# "RiftLab recolector") y corre oculto, sin depender de la app ni de ninguna terminal.
# Avance: %LOCALAPPDATA%\riftlab\recolector.log
# Para detenerlo: finalizar la tarea en el Programador de tareas; para que no arranque más, deshabilitarla.

$root = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $env:LOCALAPPDATA "riftlab"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir "recolector.log"

Add-Content -Path $log -Value "Recolector iniciado (proceso $PID), $(Get-Date -Format 'yyyy-MM-dd HH:mm')" -Encoding UTF8

# Una sola copia a la vez (por si se abre dos veces).
$mutex = New-Object System.Threading.Mutex($false, "Local\RiftLabRecolector")
if (-not $mutex.WaitOne(0)) {
  Add-Content -Path $log -Value "Ya hay otra copia corriendo: esta se cierra." -Encoding UTF8
  exit
}

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
