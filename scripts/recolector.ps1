# Recolector de RiftLab en ciclo: junta partidas de LoL sin parar y comps de TFT cuando tienen más de
# 3 horas. Lo arranca el Programador de tareas de Windows (tarea "RiftLab recolector") al iniciar sesión
# y cada hora por si se detuvo; corre oculto, sin depender de la app ni de ninguna terminal.
# Avance: logs\recolector.log en la carpeta del proyecto (fuera de AppData, para que también se pueda
# leer desde la app de Claude, que ve una copia propia de AppData).
# Para detenerlo: finalizar la tarea en el Programador de tareas; para que no arranque más, deshabilitarla.

$root = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $root "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir "recolector.log"
$tftMeta = Join-Path $root "data\tft-meta.json"

function Write-Log([string]$text) {
  Add-Content -Path $log -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $text" -Encoding UTF8
}

Write-Log "Recolector iniciado (proceso $PID)."

# Una sola copia a la vez: el disparador de cada hora choca con la copia que ya corre.
$mutex = New-Object System.Threading.Mutex($false, "Local\RiftLabRecolector")
if (-not $mutex.WaitOne(0)) {
  Write-Log "Ya hay otra copia corriendo: esta se cierra."
  exit
}

# Un Ctrl+C enviado a la consola oculta cortaba el ciclo entero (código 0xC000013A).
try { [Console]::TreatControlCAsInput = $true } catch { }
Register-EngineEvent PowerShell.Exiting -MessageData $log -Action {
  Add-Content -Path $Event.MessageData -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') Recolector detenido." -Encoding UTF8
} | Out-Null

Set-Location $root
$tsx = Join-Path $root "node_modules\.bin\tsx.cmd"

function Invoke-Step([string]$name, [string]$arguments) {
  $start = Get-Date
  Write-Log "=== $name ==="
  # Cada paso corre en su propia consola oculta: si algo le manda una señal de cierre, se corta ese
  # paso y no el ciclo. La salida de node queda tal cual en el registro.
  $cmd = "`"$tsx`" $arguments >> `"$log`" 2>&1"
  $p = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "`"$cmd`"" -WindowStyle Hidden -PassThru -Wait
  $minutes = [Math]::Round(((Get-Date) - $start).TotalMinutes, 1)
  Write-Log "$name terminado con código $($p.ExitCode) en $minutes min."
  return $p.ExitCode
}

function Test-TftStale {
  if (-not (Test-Path $tftMeta)) { return $true }
  return ((Get-Date) - (Get-Item $tftMeta).LastWriteTime).TotalHours -ge 3
}

$cycle = 0
$tftBlocked = $false
while ($true) {
  $cycle++
  # El registro se rota al pasar 5 MB para que no crezca sin límite.
  if ((Test-Path $log) -and (Get-Item $log).Length -gt 5MB) { Move-Item -Force $log "$log.anterior" }

  # TFT va primero si está atrasado: antes dependía de la cuenta de vueltas y con cada reinicio
  # se quedaba sin actualizar.
  # Si la clave no sirve para TFT, el paso sale con código 2 y no se reintenta hasta reiniciar el
  # recolector, para no llenar el registro con el mismo aviso cada 5 minutos.
  if ((Test-TftStale) -and -not $tftBlocked) {
    if ((Invoke-Step "Vuelta $cycle - comps de TFT" "scripts\aggregate-tft.ts") -eq 2) { $tftBlocked = $true }
  }
  Invoke-Step "Vuelta $cycle - partidas de LoL" "scripts\aggregate.ts --platform all --players 30 --matches 15" | Out-Null

  Write-Log "Vuelta $cycle terminada. La siguiente empieza en 5 minutos."
  Start-Sleep -Seconds 300
}
