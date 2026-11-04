# Preserve the complete daily page and add a separate sea task page.
$dailyPanel=New-Object System.Windows.Forms.Panel
$dailyPanel.Dock='Fill'
foreach($control in @($form.Controls)){$dailyPanel.Controls.Add($control)}
$tabs=New-Object System.Windows.Forms.TabControl
$tabs.Dock='Fill'
$dailyTab=New-Object System.Windows.Forms.TabPage('主页')
$seaTab=New-Object System.Windows.Forms.TabPage('认知海域')
$dailyTab.Controls.Add($dailyPanel)
$tabs.TabPages.AddRange(@($dailyTab,$seaTab));$form.Controls.Add($tabs)
# 不再锁死 MaximumSize=MinimumSize，允许拖动边缘缩放；下限放宽以适配小屏。
$form.MinimumSize=New-Object System.Drawing.Size(760,520)
$form.ClientSize=New-Object System.Drawing.Size(1180,820)
# 控件是固定坐标，窗口缩小后会被裁掉；滚动条挂在承载页上（Dock=Fill 的 TabControl 自身不滚动）。
$dailyPanel.AutoScroll=$true
$dailyPanel.AutoScrollMinSize=New-Object System.Drawing.Size(1180,780)
$seaTab.AutoScroll=$true
$seaTab.AutoScrollMinSize=New-Object System.Drawing.Size(1180,820)
$seaTab.BackColor=[System.Drawing.Color]::FromArgb(20,25,30)

# —— 标题 ——
$seaTitle=New-Object System.Windows.Forms.Label
$seaTitle.Text='认知海域'
$seaTitle.SetBounds(32,30,1050,52)
$seaTitle.Font=New-Object System.Drawing.Font('Microsoft YaHei UI',24,[System.Drawing.FontStyle]::Bold)
$seaTitle.ForeColor=[System.Drawing.Color]::FromArgb(213,190,134)
$seaTab.Controls.Add($seaTitle)

# —— 副标题（一句，不再展开流程）——
$seaSub=New-Object System.Windows.Forms.Label
$seaSub.Text='自动下潜 · 编队 · 灵感 · 战斗循环'
$seaSub.SetBounds(34,90,1050,28)
$seaSub.Font=New-Object System.Drawing.Font('Microsoft YaHei UI',12)
$seaSub.ForeColor=[System.Drawing.Color]::FromArgb(155,165,171)
$seaTab.Controls.Add($seaSub)

# —— 状态（大字，用户最需要看的一行）——
$seaStatus=New-Object System.Windows.Forms.Label
$seaStatus.Text='准备就绪'
$seaStatus.SetBounds(32,138,1080,66)
$seaStatus.Font=New-Object System.Drawing.Font('Microsoft YaHei UI',18,[System.Drawing.FontStyle]::Bold)
$seaStatus.ForeColor=[System.Drawing.Color]::FromArgb(230,222,201)
$seaTab.Controls.Add($seaStatus)

# —— 进度（只显示累计轮次）——
$seaProgress=New-Object System.Windows.Forms.Label
$seaProgress.Text='尚未开始'
$seaProgress.SetBounds(32,208,1080,32)
$seaProgress.Font=New-Object System.Drawing.Font('Microsoft YaHei UI',13)
$seaProgress.ForeColor=[System.Drawing.Color]::FromArgb(163,174,183)
$seaTab.Controls.Add($seaProgress)

$seaControls=@{}

# —— 主按钮：开始 / 停止 合一 ——
$seaMain=New-Object System.Windows.Forms.Button
$seaMain.Text='开始任务'
$seaMain.SetBounds(32,260,420,64)
$seaMain.FlatStyle='Flat'
$seaMain.FlatAppearance.BorderColor=[System.Drawing.Color]::FromArgb(112,99,69)
$seaMain.Font=New-Object System.Drawing.Font('Microsoft YaHei UI',15,[System.Drawing.FontStyle]::Bold)
$seaMain.Cursor='Hand'
$seaTab.Controls.Add($seaMain)
$seaControls.start=$seaMain

# —— 等待操作按钮（默认隐藏，仅在需要用户操作时出现）——
$seaResume=New-Object System.Windows.Forms.Button
$seaResume.Text='继续'
$seaResume.SetBounds(32,345,340,52)
$seaResume.FlatStyle='Flat'
$seaResume.FlatAppearance.BorderColor=[System.Drawing.Color]::FromArgb(112,99,69)
$seaResume.BackColor=[System.Drawing.Color]::FromArgb(43,44,38)
$seaResume.ForeColor=[System.Drawing.Color]::FromArgb(230,222,201)
$seaResume.Font=New-Object System.Drawing.Font('Microsoft YaHei UI',15,[System.Drawing.FontStyle]::Bold)
$seaResume.Cursor='Hand'
$seaResume.Visible=$false
$seaTab.Controls.Add($seaResume)
$seaControls.resume=$seaResume

$seaExit=New-Object System.Windows.Forms.Button
$seaExit.Text='退出'
$seaExit.SetBounds(390,345,150,52)
$seaExit.FlatStyle='Flat'
$seaExit.FlatAppearance.BorderColor=[System.Drawing.Color]::FromArgb(112,99,69)
$seaExit.BackColor=[System.Drawing.Color]::FromArgb(43,44,38)
$seaExit.ForeColor=[System.Drawing.Color]::FromArgb(215,159,140)
$seaExit.Font=New-Object System.Drawing.Font('Microsoft YaHei UI',14,[System.Drawing.FontStyle]::Bold)
$seaExit.Cursor='Hand'
$seaExit.Visible=$false
$seaTab.Controls.Add($seaExit)
$seaControls.exit=$seaExit

# —— 灵感选择（用户可配置，按关卡顺序）——
$inspPool=@('心灵迷雾','维持战线','身心调和','神秘陌客','坚定信念','环境遮蔽','雾中脚步','视线扭曲','能量涌流','抵抗侵蚀','象位研究','区域强袭','战前准备','应急护盾','护盾冲击','坚定意志','火力覆盖','战术支撑')
$inspCfgPath=Join-Path $root '海域灵感配置.json'
$inspSelected=@()
if(Test-Path -LiteralPath $inspCfgPath){try{$c=Get-Content -Raw -LiteralPath $inspCfgPath -Encoding UTF8|ConvertFrom-Json;if($c.selected -is [array]){$inspSelected=@($c.selected)}}catch{}}
if($inspSelected.Count -lt 5){$inspSelected=@('能量涌流','火力覆盖','战前准备','身心调和','环境遮蔽')}
$inspHeader=New-Object System.Windows.Forms.Label
$inspHeader.Text='选择灵感（按关卡顺序，可在下拉中调整）'
$inspHeader.SetBounds(32,408,1080,24)
$inspHeader.Font=New-Object System.Drawing.Font('Microsoft YaHei UI',12)
$inspHeader.ForeColor=[System.Drawing.Color]::FromArgb(155,165,171)
$seaTab.Controls.Add($inspHeader)
$script:inspCombos=@()
for($i=0;$i-lt 5;$i++){
  $lbl=New-Object System.Windows.Forms.Label
  $lbl.Text=('阶段'+($i+1))
  $lbl.SetBounds(32+$i*212,436,200,20)
  $lbl.Font=New-Object System.Drawing.Font('Microsoft YaHei UI',11)
  $lbl.ForeColor=[System.Drawing.Color]::FromArgb(163,174,183)
  $seaTab.Controls.Add($lbl)
  $cb=New-Object System.Windows.Forms.ComboBox
  $cb.DropDownStyle='DropDownList'
  $cb.Items.AddRange($inspPool)
  $cb.SelectedItem=if($i-lt $inspSelected.Count){$inspSelected[$i]}else{$inspPool[0]}
  $cb.SetBounds(32+$i*212,458,200,26)
  $cb.BackColor=[System.Drawing.Color]::FromArgb(43,44,38)
  $cb.ForeColor=[System.Drawing.Color]::FromArgb(230,222,201)
  $cb.Font=New-Object System.Drawing.Font('Microsoft YaHei UI',11)
  $seaTab.Controls.Add($cb)
  $script:inspCombos+=$cb
}
# 灵感不重复：任一阶段选定后，其余阶段下拉移除该选项
$script:inspSyncing=$false
function Sync-InspItems{
  if($script:inspSyncing){return}
  $script:inspSyncing=$true
  try{
    $chosen=@();foreach($cb in $script:inspCombos){if($cb.SelectedItem){$chosen+=$cb.SelectedItem}}
    foreach($cb in $script:inspCombos){
      $cur=$cb.SelectedItem
      $othersChosen=$chosen|Where-Object{$_ -ne $cur}
      $avail=$inspPool|Where-Object{$othersChosen -notcontains $_}
      $cb.Items.Clear();foreach($a in $avail){$cb.Items.Add($a)}
      if($cur -and $avail -contains $cur){$cb.SelectedItem=$cur}elseif($avail.Count -gt 0){$cb.SelectedItem=$avail[0]}
    }
  }finally{$script:inspSyncing=$false}
}
foreach($cb in $script:inspCombos){$cb.Add_SelectedIndexChanged({if(-not $script:inspSyncing){Sync-InspItems}})}
Sync-InspItems

# —— 日志 ——
$seaLog=New-Object System.Windows.Forms.TextBox
$seaLog.Multiline=$true;$seaLog.ReadOnly=$true;$seaLog.ScrollBars='Vertical'
$seaLog.SetBounds(32,492,1080,278);$seaLog.BackColor=[System.Drawing.Color]::FromArgb(18,19,22)
$seaLog.ForeColor=[System.Drawing.Color]::Gainsboro
$seaLog.Font=New-Object System.Drawing.Font('Microsoft YaHei UI',10)
$seaTab.Controls.Add($seaLog)

Set-ArchiveTheme $seaTab
# 主按钮强调色（运行=停止/红色，空闲=开始/金色由状态切换维护）
$seaMain.BackColor=[System.Drawing.Color]::FromArgb(196,150,62)
$seaMain.ForeColor=[System.Drawing.Color]::FromArgb(25,26,23)

$script:seaProcess=$null;$script:seaRunId=$null;$script:seaRequest=$null;$script:seaPrompted=$null;$script:seaStopAt=$null
$seaStateFile=Join-Path $root '海域运行状态.json'
function Send-SeaCommand($action){
 if(-not $script:seaRequest){return}
 $data=@{runId=$script:seaRunId;requestId=$script:seaRequest;action=$action}|ConvertTo-Json
 $target=Join-Path $root '海域命令.json';$tmp=$target+'.tmp'
 [IO.File]::WriteAllText($tmp,$data,(New-Object Text.UTF8Encoding($false)))
 Move-Item -LiteralPath $tmp -Destination $target -Force
 $script:seaRequest=$null;$seaControls.resume.Visible=$false;$seaControls.exit.Visible=$false
}

function Set-SeaIdleAppearance(){
 $seaMain.Text='开始任务'
 $seaMain.BackColor=[System.Drawing.Color]::FromArgb(196,150,62)
 $seaMain.ForeColor=[System.Drawing.Color]::FromArgb(25,26,23)
 $seaControls.resume.Visible=$false;$seaControls.exit.Visible=$false
}
function Set-SeaRunningAppearance(){
 $seaMain.Text='停止任务'
 $seaMain.BackColor=[System.Drawing.Color]::FromArgb(150,80,70)
 $seaMain.ForeColor=[System.Drawing.Color]::FromArgb(255,240,235)
}

$seaMain.Add_Click({
 if($script:seaProcess -and -not $script:seaProcess.HasExited){
  [IO.File]::WriteAllText((Join-Path $root '海域停止请求'),'stop')
  $script:seaStopAt=[DateTime]::UtcNow
  $seaMain.Enabled=$false
  $seaControls.resume.Visible=$false;$seaControls.exit.Visible=$false
  $seaStatus.Text='正在停止…'
  return
 }
 if($script:taskProcess -and -not $script:taskProcess.HasExited){return}
 try{
  foreach($name in @('海域停止请求','停止请求','海域命令.json')){Remove-Item -LiteralPath (Join-Path $root $name) -Force -ErrorAction SilentlyContinue}
  $script:seaRunId=[guid]::NewGuid().ToString();$script:seaPrompted=$null;$script:seaRequest=$null;$script:seaStopAt=$null
  $performanceSettings.mode=$performanceModes[$performanceCombo.SelectedIndex];$performanceSettings.provider=$performanceProviders[$performanceCombo.SelectedIndex]
  [IO.File]::WriteAllText($performanceFile,($performanceSettings|ConvertTo-Json),(New-Object Text.UTF8Encoding($false)))
  $inspSel=@();foreach($cb in $script:inspCombos){$inspSel+=$cb.SelectedItem}
  [IO.File]::WriteAllText((Join-Path $root '海域灵感配置.json'),(@{selected=$inspSel}|ConvertTo-Json -Compress),(New-Object Text.UTF8Encoding($false)))
  $psi=New-Object Diagnostics.ProcessStartInfo;$psi.FileName=$node
  $psi.Arguments='"'+(Join-Path $root 'run_cognitive_sea.js')+'" '+$script:seaRunId
  $psi.WorkingDirectory=$root;$psi.UseShellExecute=$false;$psi.CreateNoWindow=$true
  $script:seaProcess=New-Object Diagnostics.Process;$script:seaProcess.StartInfo=$psi
  if(-not $script:seaProcess.Start()){throw '海域执行器无法启动'}
  $dailyPanel.Enabled=$false
  Set-SeaRunningAppearance
  $seaStatus.Text='正在准备游戏窗口'
  $seaProgress.Text='准备中…'
  $seaLog.Clear()
 }catch{$script:seaProcess=$null;[Windows.Forms.MessageBox]::Show($_.Exception.Message,'认知海域')|Out-Null}
})
$seaControls.resume.Add_Click({Send-SeaCommand 'continue'})
$seaControls.exit.Add_Click({Send-SeaCommand 'exit'})

$seaTimer=New-Object Windows.Forms.Timer;$seaTimer.Interval=500
$seaTimer.Add_Tick({
 if(-not $script:seaProcess){
  Set-SeaIdleAppearance
  $seaMain.Enabled=(-not $script:taskProcess)
  return
 }
 if($script:seaStopAt -and -not $script:seaProcess.HasExited -and ([DateTime]::UtcNow-$script:seaStopAt).TotalSeconds -gt 8){
  Start-Process 'taskkill.exe' -ArgumentList @('/PID',$script:seaProcess.Id,'/T','/F') -WindowStyle Hidden -Wait
 }
 try{
  $live=Read-SharedText -Path $seaStateFile|ConvertFrom-Json
  if($live.runId -eq $script:seaRunId){
   if(-not $script:seaStopAt){$seaStatus.Text=$live.current}
   if($live.round){$seaProgress.Text="已下潜 $($live.round) 轮"}
   if($live.state -eq 'waiting' -and -not $script:seaStopAt -and $live.requestId -ne $script:seaPrompted){
    $script:seaPrompted=$live.requestId;$script:seaRequest=$live.requestId
    $seaControls.resume.Visible=$true;$seaControls.exit.Visible=$true
    if($live.kind -eq 'full'){
     $seaControls.resume.Text='继续自由探索'
     $answer=[Windows.Forms.MessageBox]::Show($live.current,'意识碎片已满','YesNo')
     if($answer -eq 'Yes'){Send-SeaCommand 'continue'}else{Send-SeaCommand 'exit'}
    }else{
     $seaControls.resume.Text='复检编队并继续'
     [Windows.Forms.MessageBox]::Show($live.current,'请完成编队','OK')|Out-Null
    }
   }
   if($live.state -ne 'waiting'){$seaControls.resume.Visible=$false;$seaControls.exit.Visible=$false}
  }
  $text=Read-SharedText -Path (Join-Path $root '运行_认知海域.log')
  if($text.Length -gt 24000){$text=$text.Substring($text.Length-24000)}
  if($seaLog.Text -ne $text){$seaLog.Text=$text;$seaLog.SelectionStart=$seaLog.TextLength;$seaLog.ScrollToCaret()}
 }catch{}
 if($script:seaProcess.HasExited){
  if($script:seaStopAt){$seaStatus.Text='已停止任务'}elseif($live.runId -ne $script:seaRunId -or $live.state -in @('running','waiting')){$seaStatus.Text='执行器已退出，请查看下方日志'}
  $script:seaProcess.Dispose();$script:seaProcess=$null;$script:seaRequest=$null
  $dailyPanel.Enabled=$true
  Set-SeaIdleAppearance
  $seaMain.Enabled=$true
  if($live.state -eq 'completed'){$tabs.SelectedTab=$dailyTab}
 }
})
$seaTimer.Start()
$form.Add_FormClosing({param($sender,$e)
 if($e.Cancel){return}
 if($script:seaProcess -and -not $script:seaProcess.HasExited){
  if([Windows.Forms.MessageBox]::Show('海域任务仍在运行，停止并退出终端？','认知海域','YesNo') -ne 'Yes'){$e.Cancel=$true;return}
  [IO.File]::WriteAllText((Join-Path $root '海域停止请求'),'stop')
  if(-not $script:seaProcess.WaitForExit(3000)){Start-Process 'taskkill.exe' -ArgumentList @('/PID',$script:seaProcess.Id,'/T','/F') -WindowStyle Hidden -Wait}
 }
})
$form.Add_FormClosed({$seaTimer.Stop();$seaTimer.Dispose()})
if($PreviewPath){$seaTimer.Stop();if($env:DUTY_PREVIEW_SEA -eq '1'){$tabs.SelectedTab=$seaTab}}
