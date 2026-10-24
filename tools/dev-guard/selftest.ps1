<#
.SYNOPSIS
  Lightweight self-test for mogzy-guard.ps1. Uses an isolated mutex, state dir and relaxed policy and runs only
  trivial commands (cmd /c, ping). It never starts vitest/pytest/builds and never touches processes it did not start.

  powershell -NoProfile -ExecutionPolicy Bypass -File tools\dev-guard\selftest.ps1
  Exit code 0 = all checks passed.
#>
Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$here  = Split-Path -Parent $MyInvocation.MyCommand.Path
$guard = Join-Path $here 'mogzy-guard.ps1'
$work  = Join-Path ([IO.Path]::GetTempPath()) ("mogzy-guard-selftest-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $work | Out-Null

function New-TestPolicy([string]$name, [scriptblock]$tweak) {
  $p = Get-Content -LiteralPath (Join-Path $here 'policy.json') -Raw | ConvertFrom-Json
  $p.lock.mutexName = "Local\mogzy-guard-selftest-$([guid]::NewGuid().ToString('N'))"
  $p.resources.advisoryFreeRamMB = 0; $p.resources.advisoryCpuPercent = 101
  $p.league.inGameProcesses = @('__none__'); $p.league.clientProcesses = @('__none__')
  $p.heavyProcessPatterns = @('__never_matches__')
  foreach ($c in $p.classes.PSObject.Properties) { $c.Value.estimateMB = 1 }
  if ($tweak) { & $tweak $p }
  $path = Join-Path $work "$name.json"
  $p | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $path -Encoding UTF8
  return $path
}

function Start-Guard([string]$policyPath, [string[]]$guardArgs) {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = 'powershell.exe'
  $psi.Arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $guard + '" ' + ($guardArgs -join ' ')
  $psi.UseShellExecute = $false; $psi.RedirectStandardError = $true; $psi.RedirectStandardOutput = $true
  $psi.EnvironmentVariables['MOGZY_GUARD_POLICY'] = $policyPath
  $psi.EnvironmentVariables['MOGZY_GUARD_STATE_DIR'] = (Join-Path $work 'state')
  $psi.EnvironmentVariables.Remove('MOGZY_GUARD_TOKEN')
  return [Diagnostics.Process]::Start($psi)
}

function Invoke-Guard([string]$policyPath, [string[]]$guardArgs) {
  $p = Start-Guard $policyPath $guardArgs
  $errTask = $p.StandardError.ReadToEndAsync(); $outTask = $p.StandardOutput.ReadToEndAsync()
  if (-not $p.WaitForExit(120000)) { try { $p.Kill() } catch { }; throw "guard hung: $guardArgs" }
  return [pscustomobject]@{ Code = $p.ExitCode; Err = $errTask.Result; Out = $outTask.Result }
}

$script:failed = 0
function Check([string]$name, [bool]$ok, [string]$detail) {
  if ($ok) { Write-Host "PASS  $name" } else { Write-Host "FAIL  $name :: $detail"; $script:failed++ }
}

try {
  $pol = New-TestPolicy 'relaxed' $null

  $r = Invoke-Guard $pol @('run', '--', 'cmd', '/c', 'exit', '7')
  Check 'child exit code is passed through' ($r.Code -eq 7) "code=$($r.Code) $($r.Err)"
  Check 'run message printed' ($r.Err -match 'RUNNING') $r.Err

  $r = Invoke-Guard $pol @('run', '--', 'cmd', '/c', 'echo', '"a b"')
  Check 'arguments with spaces survive quoting' ($r.Out -match 'a b') "out=$($r.Out)"

  $r = Invoke-Guard $pol @('run', '--dry-run', '--', 'cmd', '/c', 'exit', '9')
  Check 'dry-run starts nothing and exits 0' ($r.Code -eq 0 -and $r.Err -match 'WOULD RUN') "code=$($r.Code) $($r.Err)"

  $r = Invoke-Guard $pol @('run')
  Check 'missing command is a usage error (2)' ($r.Code -eq 2) "code=$($r.Code)"

  # Machine conditions never refuse a job (2026-10-24 redesign); they only shrink it.
  $polLow = New-TestPolicy 'lowram' { param($p) $p.resources.advisoryFreeRamMB = 9999999 }
  $r = Invoke-Guard $polLow @('run', '--', 'cmd', '/c', 'exit', '0')
  Check 'low RAM does not block: runs with 1 worker and says why' ($r.Code -eq 0 -and $r.Err -match 'workers=1' -and $r.Err -match 'available RAM') "code=$($r.Code) $($r.Err)"

  $polLeague = New-TestPolicy 'league' { param($p) $p.league.inGameProcesses = @('powershell') }
  $r = Invoke-Guard $polLeague @('run', '--', 'cmd', '/c', 'exit', '0')
  Check 'League in a match does not block: Idle priority, 1 worker (simulated with the powershell process name)' ($r.Code -eq 0 -and $r.Err -match 'priority=Idle' -and $r.Err -match 'workers=1') "code=$($r.Code) $($r.Err)"

  $marker = Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile', '-Command', 'Start-Sleep 20 # mogzy-selftest-marker' -PassThru -WindowStyle Hidden
  try {
    $polHeavy2 = New-TestPolicy 'heavy2' { param($p) $p.heavyProcessNames = @('powershell.exe'); $p.heavyProcessPatterns = @('mogzy-selftest-marker') }
    $r = Invoke-Guard $polHeavy2 @('run', '--', 'cmd', '/c', 'exit', '0')
    Check 'other unguarded test processes do not block (note only)' ($r.Code -eq 0 -and $r.Err -match 'outside the guard') "code=$($r.Code) $($r.Err)"
  } finally { if (-not $marker.HasExited) { $marker.Kill() } }   # the process this test started itself

  $r = Invoke-Guard $pol @('run', '--timeout', '2', '--', 'ping', '-n', '30', '127.0.0.1')
  Check 'wall-clock timeout terminates the job (124)' ($r.Code -eq 124) "code=$($r.Code) $($r.Err)"

  # nested call inside a guarded job must not deadlock (inner guard is a child of the outer job)
  $r = Invoke-Guard $pol @('run', '--wait', '5', '--', 'powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $guard, 'run', '--', 'cmd', '/c', 'exit', '0')
  Check 'nested guard call passes through without a second lock' ($r.Code -eq 0 -and $r.Err -match 'nested call') "code=$($r.Code) $($r.Err)"

  # contention, bounded wait, kill-on-close and lock recovery
  $holder = Start-Guard $pol @('run', '--', 'ping', '-n', '60', '127.0.0.1')
  $holderState = Join-Path $work 'state\holder.json'
  for ($i = 0; $i -lt 40 -and -not (Test-Path $holderState); $i++) { Start-Sleep -Milliseconds 250 }
  Check 'holder.json written while a job runs' (Test-Path $holderState) 'no holder.json'
  Start-Sleep -Milliseconds 800
  $child = Get-CimInstance Win32_Process -Filter "ParentProcessId=$($holder.Id) and Name='PING.EXE'" | Select-Object -First 1

  $t0 = Get-Date
  $r = Invoke-Guard $pol @('run', '--wait', '2', '--', 'cmd', '/c', 'exit', '0')
  $secs = ((Get-Date) - $t0).TotalSeconds
  Check 'second broad job gives up after a bounded wait (exit 4)' ($r.Code -eq 4 -and $secs -lt 30) "code=$($r.Code) secs=$secs $($r.Err)"

  $holder.Kill()      # simulate a crashed terminal / killed guard; this process was started by this test
  $holder.WaitForExit(10000) | Out-Null
  Start-Sleep -Seconds 1
  if ($child) {
    $alive = Get-Process -Id $child.ProcessId -ErrorAction SilentlyContinue
    Check 'killing the guard also kills ONLY its job (kill-on-close)' ($null -eq $alive) "child pid $($child.ProcessId) survived"
    if ($alive) { $alive.Kill() }
  } else { Check 'locate holder child process' $false 'ping child not found' }

  $r = Invoke-Guard $pol @('run', '--wait', '5', '--', 'cmd', '/c', 'exit', '0')
  Check 'lock is recoverable after the holder died (exit 0)' ($r.Code -eq 0) "code=$($r.Code) $($r.Err)"
  # Whether the kernel destroys the dead holder's mutex (no other handles) or reports it abandoned, the next job proceeds; both are covered.
}
finally {
  Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
}

if ($script:failed -gt 0) { Write-Host "$script:failed check(s) failed"; exit 1 }
Write-Host 'all guard self-tests passed'
exit 0
