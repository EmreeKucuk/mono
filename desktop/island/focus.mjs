import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

/**
 * Start a background PowerShell worker that monitors foreground window and fullscreen state.
 * Emits { process: string, fullscreen: boolean } on change with minimal CPU usage.
 */
export function startFocusWatcher({ onFocusChange, test = false }) {
  if (test || process.platform !== 'win32') {
    return { stop() {} };
  }

  const psScript = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinUtil {
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO { public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags; }
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern IntPtr GetShellWindow();
    [DllImport("user32.dll")] public static extern IntPtr GetDesktopWindow();
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr hwnd, uint dwFlags);
    [DllImport("user32.dll")] public static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFO lpmi);
}
"@
$last = ""
while ($true) {
    try {
        $hwnd = [WinUtil]::GetForegroundWindow()
        if ($hwnd -ne [IntPtr]::Zero -and $hwnd -ne [WinUtil]::GetShellWindow() -and $hwnd -ne [WinUtil]::GetDesktopWindow()) {
            $procId = [uint32]0
            [WinUtil]::GetWindowThreadProcessId($hwnd, [ref]$procId)
            if ($procId -gt 0) {
                $p = Get-Process -Id $procId -ErrorAction SilentlyContinue
                if ($p) {
                    $pname = $p.ProcessName.ToLower()
                    if ($pname -and $pname -ne "mono" -and $pname -ne "electron") {
                        $r = New-Object WinUtil+RECT
                        if ([WinUtil]::GetWindowRect($hwnd, [ref]$r)) {
                            $hMon = [WinUtil]::MonitorFromWindow($hwnd, 2)
                            $mi = New-Object WinUtil+MONITORINFO
                            $mi.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf($mi)
                            if ([WinUtil]::GetMonitorInfo($hMon, [ref]$mi)) {
                                $isFs = ($r.Left -le $mi.rcMonitor.Left) -and ($r.Top -le $mi.rcMonitor.Top) -and ($r.Right -ge $mi.rcMonitor.Right) -and ($r.Bottom -ge $mi.rcMonitor.Bottom)
                                $line = "$pname,$isFs"
                                if ($line -ne $last) {
                                    $last = $line
                                    Write-Output $line
                                }
                            }
                        }
                    }
                }
            }
        }
    } catch {}
    Start-Sleep -Milliseconds 600
}
`;

  let child = null;
  try {
    child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore']
    });

    const lines = createInterface({ input: child.stdout });
    lines.on('line', line => {
      const parts = line.trim().split(',');
      if (parts.length === 2) {
        const process = parts[0].trim();
        const fullscreen = parts[1].trim().toLowerCase() === 'true';
        onFocusChange({ process, fullscreen });
      }
    });

    child.on('error', () => {});
  } catch {}

  return {
    stop() {
      try {
        child?.kill();
      } catch {}
    }
  };
}
