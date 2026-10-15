param([switch]$SelfTest)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
try {
 Set-Location -LiteralPath $PSScriptRoot
 Write-Output ('PowerShell: '+$PSVersionTable.PSVersion+' / 64位: '+[Environment]::Is64BitProcess)
 if(-not [Environment]::Is64BitProcess){throw '需要64位 Windows PowerShell'}
 Add-Type -AssemblyName System.Windows.Forms
 Add-Type -AssemblyName System.Drawing
 Add-Type -Path (Join-Path $PSScriptRoot 'ui-style.dll')
 Add-Type -Path (Join-Path $PSScriptRoot 'flow-window.dll')
 if($SelfTest){
  & (Join-Path $PSScriptRoot 'runtime\node.exe') -e "console.log('Node: '+process.version); require('./node_modules/@maaxyz/maa-node'); console.log('MAA native module OK')"
  if($LASTEXITCODE -ne 0){throw 'Node或MAA原生组件加载失败，请保留以上错误信息'}
  $control=New-Object DutyUI.TaskCard;$control.Dispose()
  Write-Output '启动依赖自检通过（未连接游戏）';exit 0
 }
 Write-Output '正在打开终端界面'
 & (Join-Path $PSScriptRoot '特调科值勤终端.ps1')
}catch{Write-Error ($_|Out-String) -ErrorAction Continue;exit 1}
