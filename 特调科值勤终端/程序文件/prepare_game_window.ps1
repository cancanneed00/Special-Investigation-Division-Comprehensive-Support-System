param([ValidateSet('strict','compatible')][string]$InputMode='compatible', [switch]$CheckApiOnly)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Write-Output '窗口准备：正在加载 Windows 接口。'

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class EchoPortableWindow {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr FindWindow(string cls, string title);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hwnd, int cmd);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hwnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr hwnd, int index);
  [DllImport("user32.dll")] public static extern bool AdjustWindowRectEx(ref RECT rect, int style, bool menu, int exStyle);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hwnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
}
'@

Write-Output '窗口准备：Windows 接口加载完成。'
if ($CheckApiOnly) { return }

# Use physical pixels rather than DPI-virtualized coordinates for sizing.
[void][EchoPortableWindow]::SetProcessDPIAware()
Write-Output '窗口准备：正在查找游戏窗口。'
$hwnd = [EchoPortableWindow]::FindWindow('UnityWndClass', '异象回声')
if ($hwnd -eq [IntPtr]::Zero) { throw '没有找到已打开的《异象回声》PC 客户端。请先启动游戏并停在主页。' }
if ([EchoPortableWindow]::IsIconic($hwnd)) {
  [void][EchoPortableWindow]::ShowWindowAsync($hwnd, 4)
  Start-Sleep -Milliseconds 700
}

$client = New-Object EchoPortableWindow+RECT
if (-not [EchoPortableWindow]::GetClientRect($hwnd, [ref]$client)) { throw '无法读取游戏窗口客户区。' }
$width = $client.Right - $client.Left
$height = $client.Bottom - $client.Top
Write-Output ("窗口准备：当前客户区 {0}x{1}。" -f $width, $height)
$withinTolerance = ([Math]::Abs($width - 1280) -le 4 -and [Math]::Abs($height - 720) -le 4)
if (-not $withinTolerance) {
  $window = New-Object EchoPortableWindow+RECT
  if (-not [EchoPortableWindow]::GetWindowRect($hwnd, [ref]$window)) { throw '无法读取游戏窗口尺寸。' }
  $desired = New-Object EchoPortableWindow+RECT
  $desired.Left = 0; $desired.Top = 0; $desired.Right = 1280; $desired.Bottom = 720
  $style = [EchoPortableWindow]::GetWindowLong($hwnd, -16)
  $exStyle = [EchoPortableWindow]::GetWindowLong($hwnd, -20)
  if (-not [EchoPortableWindow]::AdjustWindowRectEx([ref]$desired, $style, $false, $exStyle)) { throw '无法计算游戏窗口尺寸。' }
  $outerWidth = $desired.Right - $desired.Left
  $outerHeight = $desired.Bottom - $desired.Top
  if (-not [EchoPortableWindow]::SetWindowPos($hwnd, [IntPtr]::Zero, $window.Left, $window.Top, $outerWidth, $outerHeight, 0x4014)) {
    throw '无法自动调整游戏窗口。请确认 MAA 与游戏使用相同的管理员权限。'
  }
  Write-Output '窗口准备：已提交调整请求，等待游戏响应。'
  $adjustTimer = [Diagnostics.Stopwatch]::StartNew()
  do {
    Start-Sleep -Milliseconds 250
    if (-not [EchoPortableWindow]::GetClientRect($hwnd, [ref]$client)) { throw '调整期间无法读取游戏窗口客户区。' }
    $width = $client.Right - $client.Left; $height = $client.Bottom - $client.Top
    if ([Math]::Abs($width - 1280) -le 4 -and [Math]::Abs($height - 720) -le 4) { break }
  } while ($adjustTimer.ElapsedMilliseconds -lt 15000)
}

$client = New-Object EchoPortableWindow+RECT
if (-not [EchoPortableWindow]::GetClientRect($hwnd, [ref]$client)) { throw '最终检查无法读取游戏窗口客户区。' }
$width = $client.Right - $client.Left
$height = $client.Bottom - $client.Top
if ([Math]::Abs($width - 1280) -gt 4 -or [Math]::Abs($height - 720) -gt 4) {
  throw ("游戏窗口无法自动调整为 1280x720（当前 {0}x{1}）。请退出游戏全屏模式后重试。" -f $width, $height)
}

if ($InputMode -eq 'strict') {
  [void][EchoPortableWindow]::ShowWindowAsync($hwnd, 7)
  Write-Output '独立鼠标模式：请求后台最小化。'
} else {
  # Keep a real, rendering window. HWND_BOTTOM and SWP_NOACTIVATE do not seize focus.
  if (-not [EchoPortableWindow]::SetWindowPos($hwnd, [IntPtr]1, 0, 0, 0, 0, 0x4013)) {
    throw '无法将游戏窗口置于后台。'
  }
  Write-Output '原版兼容输入：窗口保留渲染并置于后台，不自动最小化；运行时请暂勿操作鼠标。'
}

Write-Output ("游戏窗口已就绪：{0}x{1}" -f $width, $height)
