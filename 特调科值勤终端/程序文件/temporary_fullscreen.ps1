param([ValidateSet('enter','check','click','restore','serve')][string]$Mode, [int]$X, [int]$Y, [int]$ImageWidth, [int]$ImageHeight)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
. (Join-Path $PSScriptRoot 'lib\assembly-loader.ps1')
Import-DutyAssembly -Dll (Join-Path $PSScriptRoot 'flow-window.dll') -Source (Join-Path $PSScriptRoot 'flow-window.cs')

if($Mode -eq 'serve') {
 [Console]::InputEncoding=New-Object System.Text.UTF8Encoding($false)
 while($null -ne ($line=[Console]::ReadLine())) {
  $request=$null
  try {
   $request=$line|ConvertFrom-Json
   if($request.mode -eq 'ping'){$output='ready'}else{
    if($request.mode -notin @('enter','check','click','restore')){throw 'Invalid mode'}
    $params=@{Mode=[string]$request.mode}
    foreach($key in @('X','Y','ImageWidth','ImageHeight')){if($null -ne $request.$key){$params[$key]=[int]$request.$key}}
    $output=(& $PSCommandPath @params | Out-String)
   }
   [Console]::WriteLine((@{id=$request.id;ok=$true;output=$output}|ConvertTo-Json -Compress))
  }catch{[Console]::WriteLine((@{id=$request.id;ok=$false;error=$_.Exception.Message}|ConvertTo-Json -Compress))}
 }
 return
}


[void][FlowWindow]::SetProcessDPIAware()
$h=[FlowWindow]::FindWindow('UnityWndClass','异象回声')
if($h -eq [IntPtr]::Zero){throw '游戏窗口不存在'}
$file=Join-Path $PSScriptRoot '临时全屏恢复.json'
function Test-Fullscreen {
 $r=New-Object FlowWindow+RECT
 [void][FlowWindow]::GetWindowRect($h,[ref]$r)
 $mi=New-Object FlowWindow+MONITORINFO
 $mi.cbSize=[Runtime.InteropServices.Marshal]::SizeOf($mi)
 if(-not [FlowWindow]::GetMonitorInfo([FlowWindow]::MonitorFromWindow($h,2),[ref]$mi)){throw '无法读取显示器'}
 $m=$mi.monitor
 return ([Math]::Abs($r.Left-$m.Left)-le 6 -and [Math]::Abs($r.Top-$m.Top)-le 6 -and [Math]::Abs($r.Right-$m.Right)-le 6 -and [Math]::Abs($r.Bottom-$m.Bottom)-le 6 -and (([FlowWindow]::GetWindowLong($h,-16) -band 0x00C00000)-eq 0))
}
function Focus-Game {
 # 用户正在操作电脑时，后台进程直接 SetForegroundWindow 会被 Windows 前台锁拦截。
 # 先模拟一次 ALT 按下/松开解除前台锁，再聚焦；重试最多 6 次(约1.5秒)。
 for($i=0;$i -lt 6;$i++){
  [void][FlowWindow]::keybd_event(18,56,0,[UIntPtr]::Zero)
  [void][FlowWindow]::keybd_event(18,56,2,[UIntPtr]::Zero)
  [void][FlowWindow]::SetForegroundWindow($h)
  Start-Sleep -Milliseconds 250
  if([FlowWindow]::GetForegroundWindow() -eq $h){return $true}
 }
 return $false
}
function Switch-GameFullscreen {
 if(-not (Focus-Game)){throw '无法聚焦游戏，未发送全屏快捷键'}
 try {
  [FlowWindow]::keybd_event(18,56,0,[UIntPtr]::Zero)
  [FlowWindow]::keybd_event(13,28,0,[UIntPtr]::Zero)
  Start-Sleep -Milliseconds 100
 } finally {
  [FlowWindow]::keybd_event(13,28,2,[UIntPtr]::Zero)
  [FlowWindow]::keybd_event(18,56,2,[UIntPtr]::Zero)
 }
 Start-Sleep -Milliseconds 1200
}
if($Mode -eq 'click') {
 if(-not(Test-Fullscreen)){throw '游戏不在全屏，禁止原生点击'}
 if($ImageWidth -le 0 -or $ImageHeight -le 0 -or $X -lt 0 -or $Y -lt 0 -or $X -ge $ImageWidth -or $Y -ge $ImageHeight){throw '截图点击坐标无效'}
 if(-not (Focus-Game) -or -not(Test-Fullscreen)){throw '全屏游戏未聚焦，取消点击'}
 $client=New-Object FlowWindow+RECT
 if(-not [FlowWindow]::GetClientRect($h,[ref]$client)){throw '无法读取客户区'}
 $cw=$client.Right-$client.Left; $ch=$client.Bottom-$client.Top
 if($cw -le 0 -or $ch -le 0 -or [Math]::Abs(($cw/$ch)-($ImageWidth/$ImageHeight)) -gt 0.01){throw '截图与客户区比例不一致，取消点击'}
 $point=New-Object FlowWindow+POINT
 $point.X=[int][Math]::Floor($X*$cw/$ImageWidth); $point.Y=[int][Math]::Floor($Y*$ch/$ImageHeight)
 if(-not [FlowWindow]::ClientToScreen($h,[ref]$point)){throw '客户区坐标转换失败'}
 $target=[FlowWindow]::WindowFromPoint($point)
 if($target -ne $h -and -not [FlowWindow]::IsChild($h,$target)){throw '点击位置被其他窗口遮挡，取消点击'}
 if(-not [FlowWindow]::SetCursorPos($point.X,$point.Y)){throw '移动到识别位置失败'}
 try {
  if([FlowWindow]::GetForegroundWindow() -ne $h -or -not(Test-Fullscreen)){throw '发送点击前全屏状态改变'}
  [FlowWindow]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
  Start-Sleep -Milliseconds 80
 } finally { [FlowWindow]::mouse_event(4,0,0,0,[UIntPtr]::Zero) }
 Write-Output "全屏直接点击：截图($X,$Y)/${ImageWidth}x${ImageHeight} -> 屏幕($($point.X),$($point.Y))，未移动游戏窗口"
 return
}
if($Mode -eq 'check') {
 if(-not(Test-Fullscreen)){throw '游戏不在全屏状态，禁止点击好友叉号'}
 Write-Output '已验证游戏全屏'
 return
}
if($Mode -eq 'enter'){
 if(Test-Path -LiteralPath $file){
  $state=Get-Content -LiteralPath $file -Raw|ConvertFrom-Json
  if($state.handle -ne $h.ToInt64()){throw '全屏记录与当前窗口不一致'}
  if(Test-Fullscreen){Write-Output '继续保留全屏';return}
  Switch-GameFullscreen
  if(-not(Test-Fullscreen)){throw '游戏全屏切换未生效'}
  return
 }
 $rect=New-Object FlowWindow+RECT
 if(-not [FlowWindow]::GetWindowRect($h,[ref]$rect)){throw '窗口尺寸读取失败'}
 $info=New-Object FlowWindow+MONITORINFO
 $info.cbSize=[Runtime.InteropServices.Marshal]::SizeOf($info)
 if(-not [FlowWindow]::GetMonitorInfo([FlowWindow]::MonitorFromWindow($h,2),[ref]$info)){throw '显示器尺寸读取失败'}
 $wasFull=Test-Fullscreen
 $state=@{handle=$h.ToInt64();style=[FlowWindow]::GetWindowLong($h,-16);left=$rect.Left;top=$rect.Top;width=($rect.Right-$rect.Left);height=($rect.Bottom-$rect.Top);nativeToggle=(-not $wasFull);foreground=[FlowWindow]::GetForegroundWindow().ToInt64()}
 $state|ConvertTo-Json|Set-Content -LiteralPath $file -Encoding UTF8
 if(-not $wasFull){Switch-GameFullscreen}
 if(-not(Test-Fullscreen)){throw '游戏全屏切换未生效，未点击叉号'}
 Write-Output '已验证游戏全屏，保持至好友叉号关闭成功'
}else{
 if(-not(Test-Path -LiteralPath $file)){return}
 $state=Get-Content -LiteralPath $file -Raw|ConvertFrom-Json
 if($state.handle -ne $h.ToInt64()){throw '窗口已更换，未应用旧窗口记录'}
 if($state.nativeToggle -and (Test-Fullscreen)){Switch-GameFullscreen}
 [void][FlowWindow]::SetWindowLong($h,-16,[int]$state.style)
 if(-not [FlowWindow]::SetWindowPos($h,[IntPtr]::Zero,$state.left,$state.top,$state.width,$state.height,0x0034)){throw '恢复窗口失败'}
 $restored=New-Object FlowWindow+RECT
 [void][FlowWindow]::GetWindowRect($h,[ref]$restored)
 if([Math]::Abs(($restored.Right-$restored.Left)-$state.width)-gt 4 -or [Math]::Abs(($restored.Bottom-$restored.Top)-$state.height)-gt 4){throw '恢复后的窗口尺寸不一致'}
 Remove-Item -LiteralPath $file -Force
 if($state.foreground){[void][FlowWindow]::SetForegroundWindow([IntPtr][long]$state.foreground)}
}
Start-Sleep -Milliseconds 1000

