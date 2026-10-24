<#
.SYNOPSIS
  Machine-wide admission control for heavyweight local MOGZY test/build jobs (Windows PowerShell 5.1+).

.DESCRIPTION
  Guarantees at most ONE heavyweight job (vitest, pytest, vite build, tsc, Playwright, *_validate.py ...)
  runs at a time across ALL Claude sessions and worktrees, and refuses to start one while the PC is
  short of memory, CPU or disk, or while League of Legends is in a match.

  Usage (guard options come first, the job comes after a literal --):
    mogzy-guard.cmd run   [--class vitest|pytest|build|e2e|generic] [--wait SEC] [--timeout SEC] [--dry-run] -- <command> [args...]
    mogzy-guard.cmd check [--class ...]     resource verdict only, nothing is started
    mogzy-guard.cmd status                  read-only snapshot: lock holder, League, memory, unguarded heavy jobs, dev servers
    mogzy-guard.cmd help

  Exit codes:  0 ok | 2 usage | 3 blocked by resources | 4 lock wait timed out | 5 cannot confine job | 124 job timed out
               (any other code is the wrapped command's own exit code)

  Design notes (details in README.md):
    * Cross-process lock = a named OS mutex. The kernel releases it if the holder dies, so a crashed
      guard or a killed terminal can never leave a stale lock. holder.json is diagnostics only.
    * The wrapped command runs inside a Job Object with KILL_ON_JOB_CLOSE: when the guard exits or is killed,
      only the processes it started (and their descendants) are terminated. Nothing else is ever killed.
    * Every wait is bounded (lock wait, resource re-checks, job wall-clock timeout). No infinite loops.
    * Nested use (a guarded job that itself calls the guard) is allowed through MOGZY_GUARD_TOKEN, which is
      verified against holder.json, so wrappers/npm scripts inside a guarded job cannot deadlock.
#>

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$PolicyPath = if ($env:MOGZY_GUARD_POLICY) { $env:MOGZY_GUARD_POLICY } else { Join-Path $ScriptDir 'policy.json' }
$StateDir   = if ($env:MOGZY_GUARD_STATE_DIR) { $env:MOGZY_GUARD_STATE_DIR } else { Join-Path $env:LOCALAPPDATA 'mogzy-dev-guard' }
$HolderPath = Join-Path $StateDir 'holder.json'

function Say([string]$m) { [Console]::Error.WriteLine("[mogzy-guard] $m") }
function Die([int]$code, [string]$m) { Say $m; exit $code }

function Get-Policy {
  if (-not (Test-Path -LiteralPath $PolicyPath)) { Die 2 "policy file not found: $PolicyPath" }
  try { return (Get-Content -LiteralPath $PolicyPath -Raw | ConvertFrom-Json) }
  catch { Die 2 "policy file is not valid JSON ($PolicyPath): $($_.Exception.Message)" }
}

# ---------------------------------------------------------------- snapshot of the machine

function Get-Avg($values) {
  $a = @($values)
  if ($a.Count -eq 0) { return $null }
  return [math]::Round((($a | Measure-Object -Average).Average), 1)
}

function Get-Snapshot($pol) {
  $availMB = $null; $totalMB = $null
  try {
    $m = Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory -ErrorAction Stop
    $availMB = [double]$m.AvailableMBytes
  } catch { }
  try {
    $os = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
    $totalMB = [math]::Round($os.TotalVisibleMemorySize / 1024)
    if ($null -eq $availMB) { $availMB = [math]::Round($os.FreePhysicalMemory / 1024) }
  } catch { }

  $cpu = @(); $disk = @()
  for ($i = 0; $i -lt 3; $i++) {
    try { $cpu  += [double](Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'" -ErrorAction Stop).PercentProcessorTime } catch { }
    try { $disk += [double](Get-CimInstance Win32_PerfFormattedData_PerfDisk_PhysicalDisk -Filter "Name='_Total'" -ErrorAction Stop).PercentDiskTime } catch { }
    if ($i -lt 2) { Start-Sleep -Milliseconds 400 }
  }

  $procs = @()
  try { $procs = @(Get-CimInstance Win32_Process -ErrorAction Stop | Select-Object ProcessId, ParentProcessId, Name, CommandLine) } catch { }

  # own ancestry: never report ourselves or our callers
  $self = New-Object 'System.Collections.Generic.HashSet[int]'
  $cur = $PID
  for ($d = 0; $d -lt 12 -and $cur; $d++) {
    [void]$self.Add([int]$cur)
    $p = $procs | Where-Object { $_.ProcessId -eq $cur } | Select-Object -First 1
    if ($null -eq $p) { break }
    $cur = $p.ParentProcessId
  }

  $inGameNames = @($pol.league.inGameProcesses | ForEach-Object { "$_.exe".ToLowerInvariant() })
  $clientNames = @($pol.league.clientProcesses | ForEach-Object { "$_.exe".ToLowerInvariant() })
  $inGame = @($procs | Where-Object { $inGameNames -contains $_.Name.ToLowerInvariant() } | ForEach-Object { "$($_.Name) (pid $($_.ProcessId))" })
  $client = @($procs | Where-Object { $clientNames -contains $_.Name.ToLowerInvariant() } | Select-Object -ExpandProperty Name -Unique)

  $heavyNames = @($pol.heavyProcessNames | ForEach-Object { $_.ToLowerInvariant() })
  $patterns = @($pol.heavyProcessPatterns)
  $heavy = @()
  foreach ($p in $procs) {
    if (-not $p.CommandLine) { continue }
    if ($self.Contains([int]$p.ProcessId)) { continue }
    if ($heavyNames -notcontains $p.Name.ToLowerInvariant()) { continue }
    foreach ($re in $patterns) {
      if ($p.CommandLine -match $re) {
        $c = $p.CommandLine; if ($c.Length -gt 140) { $c = $c.Substring(0, 140) + '...' }
        $heavy += [pscustomobject]@{ Pid = $p.ProcessId; Parent = $p.ParentProcessId; Name = $p.Name; Cmd = $c }
        break
      }
    }
  }

  # report only root jobs: workers and the Windows-Store python stub's child share a matching ancestor
  $heavyPids = @($heavy | ForEach-Object { [int]$_.Pid })
  $heavy = @($heavy | Where-Object { $heavyPids -notcontains [int]$_.Parent })

  $dev = @()
  foreach ($p in $procs) {
    if (-not $p.CommandLine) { continue }
    if ($p.Name -ieq 'node.exe' -and $p.CommandLine -match 'vite' -and $p.CommandLine -match '--port' -and $p.CommandLine -notmatch '\bbuild\b') {
      $dev += [pscustomobject]@{ Pid = $p.ProcessId; What = ($p.CommandLine -replace '^.*(vite\S*)\s*', 'vite ') }
    }
  }

  return [pscustomobject]@{
    AvailMB = $availMB; TotalMB = $totalMB
    Cpu = (Get-Avg $cpu); Disk = (Get-Avg (@($disk) | ForEach-Object { [math]::Min(100, $_) }))
    LeagueInGame = $inGame; LeagueClient = $client
    Heavy = $heavy; DevServers = $dev
  }
}

function Get-ClassPolicy($pol, [string]$cls) {
  $c = $pol.classes.PSObject.Properties[$cls]
  if ($null -eq $c) { $c = $pol.classes.PSObject.Properties['generic'] }
  return $c.Value
}

function Test-Admission($pol, [string]$cls, $snap) {
  $cp = Get-ClassPolicy $pol $cls
  $r  = $pol.resources
  $clientUp = @($snap.LeagueClient).Count -gt 0
  $reserve  = if ($clientUp) { [double]$r.reserveFreeRamMBLeagueClient } else { [double]$r.reserveFreeRamMB }
  $maxCpu   = if ($clientUp) { [double]$r.maxCpuPercentLeagueClient } else { [double]$r.maxCpuPercent }
  $need     = [double]$cp.estimateMB + $reserve
  $workers  = if ($clientUp) { [int]$cp.workersLeagueClient } else { [int]$cp.workers }

  $reasons = @()
  if (@($snap.LeagueInGame).Count -gt 0) { $reasons += "League of Legends is in a match ($(@($snap.LeagueInGame) -join ', ')); heavy jobs are never started during a game" }
  if ($null -eq $snap.AvailMB) { $reasons += 'available memory could not be measured (failing safe)' }
  elseif ($snap.AvailMB -lt $need) { $reasons += ("available RAM {0:N0} MB < required {1:N0} MB (class '{2}' estimate {3} MB + reserve {4:N0} MB)" -f $snap.AvailMB, $need, $cls, $cp.estimateMB, $reserve) }
  if ($null -ne $snap.Cpu -and $snap.Cpu -gt $maxCpu) { $reasons += ("CPU {0}% > limit {1}%" -f $snap.Cpu, $maxCpu) }
  if ($null -ne $snap.Disk -and $snap.Disk -ge [double]$r.maxDiskBusyPercent) { $reasons += ("disk busy {0}% >= limit {1}%" -f $snap.Disk, $r.maxDiskBusyPercent) }
  $hv = @($snap.Heavy)
  foreach ($h in ($hv | Select-Object -First 4)) { $reasons += "another heavy job is already running outside the guard: pid $($h.Pid) $($h.Name) :: $($h.Cmd)" }
  if ($hv.Count -gt 4) { $reasons += "... and $($hv.Count - 4) more unguarded heavy job(s); run 'mogzy-guard status' for the full list" }

  return [pscustomobject]@{ Ok = ($reasons.Count -eq 0); Reasons = $reasons; Workers = $workers; NeedMB = $need; Class = $cp; ClientUp = $clientUp }
}

function Write-SnapshotLine($snap) {
  $lg = if (@($snap.LeagueInGame).Count) { 'IN-GAME' } elseif (@($snap.LeagueClient).Count) { 'client-open' } else { 'not-running' }
  $cpu = if ($null -eq $snap.Cpu) { 'n/a' } else { "$($snap.Cpu)%" }
  $dsk = if ($null -eq $snap.Disk) { 'n/a' } else { "$($snap.Disk)%" }
  Say ("machine: availRAM={0} MB of {1} MB, cpu={2}, disk={3}, league={4}, unguardedHeavyJobs={5}" -f $snap.AvailMB, $snap.TotalMB, $cpu, $dsk, $lg, @($snap.Heavy).Count)
}

# ---------------------------------------------------------------- holder.json (diagnostics only)

function Read-Holder {
  if (-not (Test-Path -LiteralPath $HolderPath)) { return $null }
  try { return (Get-Content -LiteralPath $HolderPath -Raw | ConvertFrom-Json) } catch { return $null }
}

function Test-HolderAlive($h) {
  if ($null -eq $h) { return $false }
  try {
    $p = Get-Process -Id ([int]$h.pid) -ErrorAction Stop
    return ([int64]$h.guardStartTicks -eq $p.StartTime.ToUniversalTime().Ticks)
  } catch { return $false }
}

function Format-Holder($h) {
  if ($null -eq $h) { return 'unknown (no holder.json)' }
  $alive = if (Test-HolderAlive $h) { 'alive' } else { 'NOT alive (stale file; the OS lock is authoritative)' }
  return "guard pid $($h.pid) [$alive], class=$($h.class), since $($h.startedUtc), cwd=$($h.cwd), cmd=$($h.command)"
}

# ---------------------------------------------------------------- job runner (Job Object, owned processes only)

function Ensure-JobType {
if ('MogzyJob' -as [type]) { return }
Add-Type -TypeDefinition @"
using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;

public static class MogzyJob {
  [StructLayout(LayoutKind.Sequential)]
  struct BASIC { public long PerProcessUserTimeLimit; public long PerJobUserTimeLimit; public uint LimitFlags; public UIntPtr MinimumWorkingSetSize; public UIntPtr MaximumWorkingSetSize; public uint ActiveProcessLimit; public UIntPtr Affinity; public uint PriorityClass; public uint SchedulingClass; }
  [StructLayout(LayoutKind.Sequential)]
  struct IOC { public ulong a, b, c, d, e, f; }
  [StructLayout(LayoutKind.Sequential)]
  struct EXT { public BASIC Basic; public IOC Io; public UIntPtr ProcessMemoryLimit; public UIntPtr JobMemoryLimit; public UIntPtr PeakProcessMemoryUsed; public UIntPtr PeakJobMemoryUsed; }

  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr CreateJobObject(IntPtr attrs, string name);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetInformationJobObject(IntPtr job, int cls, IntPtr info, uint len);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr proc);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool TerminateJobObject(IntPtr job, uint code);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool CloseHandle(IntPtr h);

  // Runs file+args inside a kill-on-close job. Returns the exit code; 124 when the wall-clock timeout fired.
  public static int Run(string file, string args, string[] env, int timeoutMs, long memLimitBytes, out bool timedOut) {
    timedOut = false;
    IntPtr job = CreateJobObject(IntPtr.Zero, null);
    if (job == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
    EXT ext = new EXT();
    ext.Basic.LimitFlags = 0x2000;                                   // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
    if (memLimitBytes > 0) { ext.Basic.LimitFlags |= 0x200; ext.JobMemoryLimit = new UIntPtr((ulong)memLimitBytes); }  // JOB_OBJECT_LIMIT_JOB_MEMORY
    int len = Marshal.SizeOf(typeof(EXT));
    IntPtr buf = Marshal.AllocHGlobal(len);
    try {
      Marshal.StructureToPtr(ext, buf, false);
      if (!SetInformationJobObject(job, 9, buf, (uint)len)) throw new Win32Exception(Marshal.GetLastWin32Error());
    } finally { Marshal.FreeHGlobal(buf); }

    ProcessStartInfo psi = new ProcessStartInfo(file, args);
    psi.UseShellExecute = false;                                     // inherit stdin/stdout/stderr
    foreach (string kv in env) {
      int i = kv.IndexOf('=');
      if (i > 0) psi.EnvironmentVariables[kv.Substring(0, i)] = kv.Substring(i + 1);
    }
    using (Process proc = Process.Start(psi)) {
      if (!AssignProcessToJobObject(job, proc.Handle)) {
        int err = Marshal.GetLastWin32Error();
        if (!proc.HasExited) {                                       // exited-before-assign is harmless; anything else is not
          try { proc.Kill(); } catch { }
          CloseHandle(job);
          throw new Win32Exception(err);
        }
      }
      if (!proc.WaitForExit(timeoutMs)) {
        timedOut = true;
        TerminateJobObject(job, 124);
        proc.WaitForExit(10000);
      }
      int code = timedOut ? 124 : proc.ExitCode;
      CloseHandle(job);                                              // KILL_ON_JOB_CLOSE reaps stragglers owned by this job
      return code;
    }
  }
}
"@
}

function Quote-Arg([string]$a) {
  if ($a.Length -eq 0) { return '""' }
  if ($a -notmatch '[\s"]') { return $a }
  $s = $a -replace '(\\*)"', '$1$1\"'
  $s = $s -replace '(\\+)$', '$1$1'
  return '"' + $s + '"'
}

# ---------------------------------------------------------------- argument parsing

function Parse-Args($a) {
  $o = [ordered]@{ Sub = 'help'; Class = 'auto'; Wait = -1; Timeout = -1; DryRun = $false; Cmd = @() }
  $a = @($a)
  if ($a.Count -gt 0) { $o.Sub = "$($a[0])".ToLowerInvariant() }
  $i = 1
  while ($i -lt $a.Count) {
    $t = "$($a[$i])"
    if ($t -eq '--') {
      if ($i + 1 -lt $a.Count) { $o.Cmd = @($a[($i + 1)..($a.Count - 1)]) } else { $o.Cmd = @() }
      break
    }
    switch ($t.ToLowerInvariant()) {
      '--class'   { $i++; if ($i -ge $a.Count) { Die 2 '--class needs a value' }; $o.Class = "$($a[$i])".ToLowerInvariant() }
      '--wait'    { $i++; if ($i -ge $a.Count) { Die 2 '--wait needs seconds' };  $o.Wait = [int]$a[$i] }
      '--timeout' { $i++; if ($i -ge $a.Count) { Die 2 '--timeout needs seconds' }; $o.Timeout = [int]$a[$i] }
      '--dry-run' { $o.DryRun = $true }
      default     { Die 2 "unknown option '$t' (guard options go before '--', the job goes after it)" }
    }
    $i++
  }
  if ($o.Class -notin @('auto', 'vitest', 'pytest', 'build', 'e2e', 'generic')) { Die 2 "unknown class '$($o.Class)'" }
  return $o
}

function Resolve-Class([string]$cls, $cmd) {
  if ($cls -ne 'auto') { return $cls }
  $t = (@($cmd) -join ' ').ToLowerInvariant()
  if ($t -match 'vitest') { return 'vitest' }
  if ($t -match 'pytest|unittest') { return 'pytest' }
  if ($t -match 'playwright') { return 'e2e' }
  if ($t -match '\bbuild\b|tsc|prerender|remotion') { return 'build' }
  return 'generic'
}

function Resolve-Exe([string]$name) {
  $c = Get-Command $name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($null -eq $c) { return $null }
  return $c.Source
}

# ---------------------------------------------------------------- environment caps given to the wrapped job

function Build-ChildEnv($pol, $adm, [string]$cls, [string]$token) {
  $w = [string]$adm.Workers
  $nodeOpts = $env:NODE_OPTIONS
  if (-not $nodeOpts) { $nodeOpts = '' }
  if ($nodeOpts -notmatch 'max-old-space-size') { $nodeOpts = ($nodeOpts + " --max-old-space-size=$($pol.childNodeMaxOldSpaceMB)").Trim() }
  return @(
    "MOGZY_GUARD_TOKEN=$token", 'MOGZY_GUARD_ACTIVE=1', "MOGZY_GUARD_CLASS=$cls",
    "MOGZY_VITEST_WORKERS=$w", "UV_THREADPOOL_SIZE=$w",
    "OMP_NUM_THREADS=$w", "OPENBLAS_NUM_THREADS=$w", "MKL_NUM_THREADS=$w", "NUMEXPR_NUM_THREADS=$w",
    "NODE_OPTIONS=$nodeOpts"
  )
}

# ---------------------------------------------------------------- subcommands

function Invoke-Status($pol) {
  $snap = Get-Snapshot $pol
  Write-SnapshotLine $snap
  $h = Read-Holder
  $created = $false
  $mx = $null
  try {
    $mx = New-Object System.Threading.Mutex($false, [string]$pol.lock.mutexName, [ref]$created)
    $got = $false
    try { $got = $mx.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $got = $true }
    if ($got) { $mx.ReleaseMutex(); Say 'lock: FREE' } else { Say "lock: HELD by $(Format-Holder $h)" }
  } catch { Say "lock: could not inspect ($($_.Exception.Message))" }
  finally { if ($mx) { $mx.Dispose() } }
  foreach ($x in @($snap.Heavy)) { Say "unguarded heavy job: pid $($x.Pid) $($x.Name) :: $($x.Cmd)" }
  foreach ($x in @($snap.DevServers)) { Say "dev server running: pid $($x.Pid) $($x.What)  (stop only if YOUR session started it)" }
  if (@($snap.Heavy).Count -eq 0 -and @($snap.DevServers).Count -eq 0) { Say 'no unguarded heavy jobs or dev servers detected' }
  exit 0
}

function Invoke-Check($pol, $o) {
  $cls = Resolve-Class $o.Class $o.Cmd
  $snap = Get-Snapshot $pol
  Write-SnapshotLine $snap
  $adm = Test-Admission $pol $cls $snap
  if ($adm.Ok) { Say ("WOULD ADMIT class '{0}' with {1} worker(s) (needs {2:N0} MB free)." -f $cls, $adm.Workers, $adm.NeedMB); exit 0 }
  Say "WOULD BLOCK class '$cls':"
  foreach ($r in $adm.Reasons) { Say "  - $r" }
  exit 3
}

function Invoke-Run($pol, $o) {
  if (@($o.Cmd).Count -eq 0) { Die 2 "nothing to run: put the command after '--'" }
  $cls = Resolve-Class $o.Class $o.Cmd
  $cp = Get-ClassPolicy $pol $cls
  if (-not $o.DryRun) { Ensure-JobType }
  $exe = Resolve-Exe ([string]$o.Cmd[0])
  if (-not $exe) { Die 2 "cannot resolve executable '$($o.Cmd[0])' on PATH" }
  $argStr = (@($o.Cmd | Select-Object -Skip 1) | ForEach-Object { Quote-Arg ([string]$_) }) -join ' '

  $wait = if ($o.Wait -ge 0) { $o.Wait } else { [int]$pol.lock.defaultWaitSec }
  $wait = [math]::Min($wait, [int]$pol.lock.maxWaitSec)
  $timeout = if ($o.Timeout -gt 0) { $o.Timeout } else { [int]$cp.timeoutSec }
  $timeout = [math]::Min($timeout, 3600)
  $memBytes = [int64]$cp.jobMemoryLimitMB * 1MB

  # ---- nested call from inside an already-guarded job: no second lock, same caps
  $holder = Read-Holder
  $nested = $false
  if ($env:MOGZY_GUARD_TOKEN -and $null -ne $holder -and $holder.token -eq $env:MOGZY_GUARD_TOKEN -and (Test-HolderAlive $holder)) { $nested = $true }
  elseif ($env:MOGZY_GUARD_TOKEN) { Say 'MOGZY_GUARD_TOKEN is set but does not match a live holder; ignoring it and acquiring the lock normally.' }

  if ($nested) {
    Say "nested call inside guarded job (class '$($env:MOGZY_GUARD_CLASS)'); running without a second lock."
    if ($o.DryRun) { Say "dry-run: would run $exe $argStr"; exit 0 }
    $adm0 = [pscustomobject]@{ Workers = [int]$(if ($env:MOGZY_VITEST_WORKERS) { $env:MOGZY_VITEST_WORKERS } else { 1 }) }
    $b = $false
    try { $code = [MogzyJob]::Run($exe, $argStr, (Build-ChildEnv $pol $adm0 $cls $env:MOGZY_GUARD_TOKEN), $timeout * 1000, $memBytes, [ref]$b) }
    catch { Die 5 "could not start nested job: $($_.Exception.Message)" }
    if ($b) { Die 124 "nested job exceeded ${timeout}s and was terminated." }
    exit $code
  }

  # ---- dry-run: evaluate everything, change nothing
  if ($o.DryRun) {
    $snap = Get-Snapshot $pol
    Write-SnapshotLine $snap
    $adm = Test-Admission $pol $cls $snap
    $created = $false; $mx = $null; $lockFree = $false
    try {
      $mx = New-Object System.Threading.Mutex($false, [string]$pol.lock.mutexName, [ref]$created)
      try { $lockFree = $mx.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $lockFree = $true }
      if ($lockFree) { $mx.ReleaseMutex() }
    } finally { if ($mx) { $mx.Dispose() } }
    Say "dry-run plan: class=$cls exe=$exe args=[$argStr] timeout=${timeout}s lockWait<=${wait}s workers=$($adm.Workers) jobMemCap=$($cp.jobMemoryLimitMB)MB"
    Say ("dry-run lock: " + $(if ($lockFree) { 'free' } else { "HELD by $(Format-Holder (Read-Holder))" }))
    if ($adm.Ok -and $lockFree) { Say 'dry-run verdict: WOULD RUN'; exit 0 }
    foreach ($r in $adm.Reasons) { Say "  - $r" }
    if (-not $lockFree) { Say '  - another guarded heavy job holds the lock'; exit 4 }
    Say 'dry-run verdict: WOULD BLOCK'; exit 3
  }

  New-Item -ItemType Directory -Force -Path $StateDir | Out-Null

  # ---- acquire the machine-wide lock (bounded wait, abandoned = recovered)
  $created = $false
  $mutexName = [string]$pol.lock.mutexName
  try { $mx = New-Object System.Threading.Mutex($false, $mutexName, [ref]$created) }
  catch [System.UnauthorizedAccessException] {
    $mutexName = $mutexName -replace '^Global\\', 'Local\'
    Say "cannot open Global mutex; falling back to $mutexName (still correct for one interactive Windows session)."
    $mx = New-Object System.Threading.Mutex($false, $mutexName, [ref]$created)
  }
  $owned = $false
  $token = [guid]::NewGuid().ToString()
  try {
    $deadline = [DateTime]::UtcNow.AddSeconds($wait)
    while ($true) {
      $remainMs = [int][math]::Max(0, ($deadline - [DateTime]::UtcNow).TotalMilliseconds)
      $slice = [math]::Min($remainMs, 10000)
      try { $owned = $mx.WaitOne($slice) }
      catch [System.Threading.AbandonedMutexException] { $owned = $true; Say 'recovered an abandoned lock (previous holder died without releasing it).' }
      if ($owned) { break }
      if ($remainMs -le 10000) { break }
      Say "waiting for the heavy-job lock (<= $([int]($remainMs/1000))s left); held by $(Format-Holder (Read-Holder))"
    }
    if (-not $owned) { Die 4 "gave up after ${wait}s: another heavy job holds the lock: $(Format-Holder (Read-Holder)). Re-run when it finishes; do not start a second heavy job." }

    # ---- admission control, bounded re-checks
    $attempts = [math]::Max(1, [int]$pol.resources.recheckAttempts)
    $adm = $null
    for ($n = 1; $n -le $attempts; $n++) {
      $snap = Get-Snapshot $pol
      Write-SnapshotLine $snap
      $adm = Test-Admission $pol $cls $snap
      if ($adm.Ok) { break }
      if ($n -lt $attempts) { Say "resources insufficient (attempt $n of $attempts); re-checking in $($pol.resources.recheckIntervalSec)s"; Start-Sleep -Seconds ([int]$pol.resources.recheckIntervalSec) }
    }
    if (-not $adm.Ok) {
      Say "BLOCKED: not starting class '$cls'. Reasons:"
      foreach ($r in $adm.Reasons) { Say "  - $r" }
      Say 'Nothing was killed or started. Close other workloads or wait, then retry; ask the owner before overriding policy.'
      exit 3
    }

    # ---- record holder (diagnostics) and run
    $me = Get-Process -Id $PID
    $hold = [ordered]@{
      token = $token; pid = $PID; guardStartTicks = $me.StartTime.ToUniversalTime().Ticks
      startedUtc = [DateTime]::UtcNow.ToString('o'); class = $cls; cwd = (Get-Location).Path
      command = ((@($o.Cmd) -join ' ') -replace '\s+', ' ')
    }
    $hold | ConvertTo-Json | Set-Content -LiteralPath $HolderPath -Encoding UTF8
    try { $me.PriorityClass = 'BelowNormal' } catch { }   # children inherit; keeps the game/UI responsive

    Say "ADMITTED class '$cls': workers=$($adm.Workers), timeout=${timeout}s, memcap=$($cp.jobMemoryLimitMB)MB, priority=BelowNormal."
    $timedOut = $false
    try { $code = [MogzyJob]::Run($exe, $argStr, (Build-ChildEnv $pol $adm $cls $token), $timeout * 1000, $memBytes, [ref]$timedOut) }
    catch { Die 5 "could not start/confine the job: $($_.Exception.Message)" }
    if ($timedOut) { Die 124 "job exceeded ${timeout}s wall-clock limit; its process tree (and only that) was terminated." }
    exit $code
  }
  finally {
    try {
      $h = Read-Holder
      if ($null -ne $h -and $h.token -eq $token) { Remove-Item -LiteralPath $HolderPath -Force -ErrorAction SilentlyContinue }
    } catch { }
    if ($owned) { try { $mx.ReleaseMutex() } catch { } }
    $mx.Dispose()
  }
}

# ---------------------------------------------------------------- main

$opts = Parse-Args $args
switch ($opts.Sub) {
  'run'    { Invoke-Run    (Get-Policy) $opts }
  'check'  { Invoke-Check  (Get-Policy) $opts }
  'status' { Invoke-Status (Get-Policy) }
  default  {
    Get-Help $MyInvocation.MyCommand.Path -Full | Out-String | ForEach-Object { [Console]::Error.WriteLine($_) }
    exit $(if ($opts.Sub -eq 'help') { 0 } else { 2 })
  }
}
