<#
  Quiz del Pozzo - Modalita' Bosco
  Accende l'hotspot Wi-Fi di Windows (anche SENZA internet), avvia il gioco e apre lo schermo principale.
  Alla chiusura (Ctrl+C) spegne l'hotspot.

  Uso:
    npm run bosco              avvia hotspot + gioco
    npm run bosco -- -Check    verifica soltanto (non cambia nulla)

  Nome e password della rete stanno in bosco.json (creato al primo avvio): restano sempre gli stessi,
  cosi' i telefoni degli amici si ricollegano da soli le volte successive.
#>
param([switch]$Check, [int]$Port = 3000, [switch]$HotspotOnly, [ValidateSet('start', 'stop')][string]$Action = 'start', [string]$ConfigFile = '')

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
if (-not $ConfigFile) { $ConfigFile = Join-Path $Root 'bosco.json' }

function Say([string]$Text, [string]$Color = 'Gray') { Write-Host "  $Text" -ForegroundColor $Color }

# ------------------------------------------------------------------ API di Windows (WinRT)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskOp = [System.WindowsRuntimeSystemExtensions].GetMethods() |
  Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } |
  Select-Object -First 1
$asTaskAction = [System.WindowsRuntimeSystemExtensions].GetMethods() |
  Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction' } |
  Select-Object -First 1
function Await($Operation, [Type]$ResultType) {
  $task = $asTaskOp.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
  $task.Wait(-1) | Out-Null
  $task.Result
}
function AwaitAction($Action) {
  $task = $asTaskAction.Invoke($null, @($Action))
  $task.Wait(-1) | Out-Null
}
[Windows.Networking.Connectivity.NetworkInformation, Windows.Networking.Connectivity, ContentType = WindowsRuntime] | Out-Null
[Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager, Windows.Networking.NetworkOperators, ContentType = WindowsRuntime] | Out-Null
[Windows.Networking.NetworkOperators.NetworkOperatorTetheringOperationResult, Windows.Networking.NetworkOperators, ContentType = WindowsRuntime] | Out-Null
$ResultType = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringOperationResult]

function Get-WifiAdapter {
  Get-NetAdapter -Physical -ErrorAction SilentlyContinue |
    Where-Object { $_.PhysicalMediaType -match '802\.11' -or $_.InterfaceDescription -match 'Wi-?Fi|Wireless|WLAN|802\.11' } |
    Select-Object -First 1
}

function Get-TetheringManager {
  # Con internet si usa la connessione attiva; senza internet (nel bosco) si prova ogni profilo di rete noto.
  $profiles = @()
  $inet = [Windows.Networking.Connectivity.NetworkInformation]::GetInternetConnectionProfile()
  if ($inet) { $profiles += $inet }
  $profiles += @([Windows.Networking.Connectivity.NetworkInformation]::GetConnectionProfiles())
  foreach ($p in $profiles) {
    try {
      $cap = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager]::GetTetheringCapabilityFromConnectionProfile($p)
      if ("$cap" -ne 'Enabled') { continue }
      $m = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager]::CreateFromConnectionProfile($p)
      if ($m) { return [pscustomobject]@{ Manager = $m; Profile = $p.ProfileName } }
    } catch { }
  }
  return $null
}

function Get-BoscoConfig {
  if (Test-Path $ConfigFile) {
    $cfg = Get-Content $ConfigFile -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($cfg.ssid -and $cfg.password -and $cfg.password.Length -ge 8) { return $cfg }
  }
  # Password leggibile (niente 0/O, 1/l) da dettare facilmente agli amici.
  $chars = 'abcdefghjkmnpqrstuvwxyz23456789'.ToCharArray()
  $pass = -join (1..10 | ForEach-Object { $chars | Get-Random })
  $cfg = [pscustomobject]@{ ssid = 'QuizDelPozzo'; password = $pass }
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $ConfigFile) | Out-Null
  $cfg | ConvertTo-Json | Set-Content -Path $ConfigFile -Encoding UTF8
  return $cfg
}

Write-Host ''
Say 'QUIZ DEL POZZO - Modalita Bosco (gioco senza internet)' 'Yellow'
Write-Host ''

$wifi = Get-WifiAdapter
$tether = Get-TetheringManager
$cfg = Get-BoscoConfig

if ($Check) {
  if ($wifi) { Say "Scheda Wi-Fi: $($wifi.InterfaceDescription) [$($wifi.Status)]" 'Green' } else { Say 'Scheda Wi-Fi: NESSUNA' 'Red' }
  if ($tether) {
    Say "Hotspot di Windows: disponibile (profilo '$($tether.Profile)'), stato attuale: $($tether.Manager.TetheringOperationalState)" 'Green'
    Say "Rete configurata ora in Windows: '$($tether.Manager.GetCurrentAccessPointConfiguration().Ssid)'"
  } else {
    Say 'Hotspot di Windows: non disponibile con le reti attuali' 'Red'
  }
  Say "Rete che usera' il gioco: '$($cfg.ssid)'  password: $($cfg.password)  (da bosco.json)"
  if (-not $wifi) {
    Write-Host ''
    Say 'Questo PC non ha una scheda Wi-Fi: non puo creare un hotspot.' 'Yellow'
    Say "Usa un portatile, una chiavetta Wi-Fi USB, oppure l'hotspot di un telefono (vedi README)." 'Yellow'
  }
  exit 0
}

# ------------------------------------------------------------------ modalita' per l'app desktop: solo hotspot
# Stampa una riga RESULT:{json} oppure ERROR:messaggio (lette dal menu dell'app).
if ($HotspotOnly) {
  if (-not $wifi) { Write-Output 'ERROR:Questo PC non ha una scheda Wi-Fi.'; exit 1 }
  if (-not $tether) { Write-Output "ERROR:Windows non permette di accendere l'hotspot con le reti attuali."; exit 1 }
  $manager = $tether.Manager
  $isOn = "$($manager.TetheringOperationalState)" -eq 'On'
  if ($Action -eq 'stop') {
    if ($isOn) { Await ($manager.StopTetheringAsync()) $ResultType | Out-Null }
    Write-Output 'RESULT:{}'
    exit 0
  }
  $ap = $manager.GetCurrentAccessPointConfiguration()
  if ($ap.Ssid -ne $cfg.ssid -or $ap.Passphrase -ne $cfg.password) {
    $ap.Ssid = $cfg.ssid
    $ap.Passphrase = $cfg.password
    if ($isOn) { Await ($manager.StopTetheringAsync()) $ResultType | Out-Null; $isOn = $false }
    AwaitAction ($manager.ConfigureAccessPointAsync($ap))
  }
  if (-not $isOn) {
    $r = Await ($manager.StartTetheringAsync()) $ResultType
    if ("$($r.Status)" -ne 'Success') { Write-Output "ERROR:Impossibile accendere l'hotspot ($($r.Status)). Controlla che il Wi-Fi sia acceso."; exit 1 }
  }
  Write-Output ('RESULT:' + (@{ ssid = $cfg.ssid; password = $cfg.password } | ConvertTo-Json -Compress))
  exit 0
}

if (-not $wifi) {
  Say 'Questo PC non ha una scheda Wi-Fi, quindi non puo creare un hotspot.' 'Red'
  Say "Soluzioni: usa un portatile o una chiavetta Wi-Fi USB, oppure accendi l'hotspot di un telefono," 'Yellow'
  Say "collega il PC a quella rete e avvia il gioco con 'npm start'." 'Yellow'
  exit 1
}
if (-not $tether) {
  Say "Windows non permette di accendere l'hotspot con le reti attuali." 'Red'
  Say 'Prova una di queste soluzioni:' 'Yellow'
  Say "  1) collegati una volta a una qualsiasi rete Wi-Fi (anche a casa) e rilancia 'npm run bosco';" 'Yellow'
  Say "  2) usa l'hotspot di un telefono e avvia il gioco con 'npm start'." 'Yellow'
  exit 1
}

# ------------------------------------------------------------------ hotspot
$manager = $tether.Manager
$wasOn = "$($manager.TetheringOperationalState)" -eq 'On'
$ap = $manager.GetCurrentAccessPointConfiguration()
if ($ap.Ssid -ne $cfg.ssid -or $ap.Passphrase -ne $cfg.password) {
  $ap.Ssid = $cfg.ssid
  $ap.Passphrase = $cfg.password
  if ($wasOn) { Await ($manager.StopTetheringAsync()) $ResultType | Out-Null; $wasOn = $false }
  AwaitAction ($manager.ConfigureAccessPointAsync($ap))
}
if (-not $wasOn) {
  Say "Accendo l'hotspot..."
  $r = Await ($manager.StartTetheringAsync()) $ResultType
  if ("$($r.Status)" -ne 'Success') {
    Say "Impossibile accendere l'hotspot: $($r.Status) $($r.AdditionalErrorMessage)" 'Red'
    Say "Controlla che il Wi-Fi sia acceso (non in modalita aereo) e riprova, oppure usa l'hotspot di un telefono." 'Yellow'
    exit 1
  }
}
Say "Hotspot acceso: rete '$($cfg.ssid)'  password: $($cfg.password)" 'Green'
Say "Suggerimento: in Impostazioni > Rete > Hotspot mobile disattiva lo spegnimento automatico per risparmio energetico."

# ------------------------------------------------------------------ gioco
try {
  if (-not (Test-Path (Join-Path $Root 'dist\host.html'))) {
    Say 'Prima esecuzione: compilo il gioco...'
    & npm.cmd run build --prefix $Root | Out-Host
  }
  $env:HOTSPOT_SSID = $cfg.ssid
  $env:HOTSPOT_PASS = $cfg.password
  $env:PORT = "$Port"
  $server = Start-Process -FilePath 'npx.cmd' -ArgumentList @('tsx', 'server/index.ts', '--prod') -WorkingDirectory $Root -NoNewWindow -PassThru
  for ($i = 0; $i -lt 60; $i++) {
    try { Invoke-WebRequest "http://localhost:$Port/api/info" -UseBasicParsing -TimeoutSec 1 | Out-Null; break } catch { Start-Sleep -Milliseconds 500 }
  }
  Start-Process "http://localhost:$Port/host.html"
  Say 'Gioco avviato. Premi Ctrl+C per chiudere tutto (anche l''hotspot).' 'Yellow'
  while (-not $server.HasExited) { Start-Sleep -Milliseconds 500 }
} finally {
  if (-not $wasOn) {
    Say "Spengo l'hotspot..."
    try { Await ($manager.StopTetheringAsync()) $ResultType | Out-Null } catch { }
  }
}
