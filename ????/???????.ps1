param([string]$PreviewPath)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $root 'lib\read-shared-text.ps1')
. (Join-Path $root 'lib\assembly-loader.ps1')
Import-DutyAssembly -Dll (Join-Path $root 'ui-style.dll') -Source (Join-Path $root 'ui-style.cs') -ReferencedAssemblies System.Drawing,System.Windows.Forms
$configFile = Join-Path $root '启动配置.json'
$logFile = Join-Path $root '运行_摘要.log'
$statusFile = Join-Path $root '运行_UI状态.json'
$runner = Join-Path $root 'run_selected_tasks.js'
$bundledNode = Join-Path $root 'runtime\node.exe'
$node = $bundledNode
$script:taskProcess = $null
$script:lastLog = ''
$script:stopAt = $null

$form = New-Object System.Windows.Forms.Form
$form.Icon = New-Object System.Drawing.Icon((Join-Path $root 'ui-assets\app.ico'))
$form.Text = '特调科执勤终端 2.2.14'
$form.StartPosition = 'CenterScreen'
$form.ClientSize = New-Object System.Drawing.Size(820, 790)
$form.MinimumSize = New-Object System.Drawing.Size(836, 829)
$form.MaximumSize = $form.MinimumSize
$form.MaximizeBox = $false
$form.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 10)
$form.BackColor = [System.Drawing.Color]::FromArgb(24, 25, 23)
$form.ForeColor = [System.Drawing.Color]::WhiteSmoke

$title = New-Object System.Windows.Forms.Label
$title.Text = '特调科  /  执勤终端'
$title.ForeColor = [System.Drawing.Color]::FromArgb(213, 190, 134)
$title.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 20, [System.Drawing.FontStyle]::Bold)
$title.Location = New-Object System.Drawing.Point(24, 18)
$title.AutoSize = $true
$form.Controls.Add($title)

$subtitle = New-Object System.Windows.Forms.Label
$subtitle.Text = 'SPECIAL INVESTIGATION   /   DUTY RECORD                         档案编号 02.0'
$subtitle.Location = New-Object System.Drawing.Point(27, 62)
$subtitle.AutoSize = $true
$subtitle.ForeColor = [System.Drawing.Color]::Silver
$form.Controls.Add($subtitle)

$performanceFile = Join-Path $root '性能配置.json'
$performanceSettings = @{ mode = 'balanced'; provider = 'Auto'; operationTimeoutMs = 60000; pollMs = 350 }
if (Test-Path $performanceFile) {
  try {
    $savedPerformance = Get-Content -Raw -LiteralPath $performanceFile -Encoding UTF8 | ConvertFrom-Json
    foreach ($property in $savedPerformance.PSObject.Properties) { $performanceSettings[$property.Name] = $property.Value }
  } catch { [System.Windows.Forms.MessageBox]::Show('性能配置无法读取，将使用默认设置。', '性能配置') | Out-Null }
}
$performanceCombo = New-Object System.Windows.Forms.ComboBox
$performanceCombo.DropDownStyle = 'DropDownList'
$performanceCombo.Location = New-Object System.Drawing.Point(520, 26)
$performanceCombo.Size = New-Object System.Drawing.Size(270, 28)
$performanceCombo.Items.AddRange(@('标准模式 / 自动后端', '低负载模式 / 自动后端', '低负载模式 / CPU', '低负载模式 / DirectML', '标准模式 / CPU', '标准模式 / DirectML'))
$performanceModes = @('balanced', 'low', 'low', 'low', 'balanced', 'balanced')
$performanceProviders = @('Auto', 'Auto', 'CPU', 'DirectML', 'CPU', 'DirectML')
$performanceCombo.SelectedIndex = 0
for ($pi = 0; $pi -lt $performanceModes.Count; $pi++) {
  if ($performanceSettings.mode -eq $performanceModes[$pi] -and $performanceSettings.provider -eq $performanceProviders[$pi]) { $performanceCombo.SelectedIndex = $pi }
}
$form.Controls.Add($performanceCombo)


$taskGroup = New-Object DutyUI.CardGroup
$taskGroup.Text = '  01   执勤指派  '
$taskGroup.Location = New-Object System.Drawing.Point(24, 92)
$taskGroup.Size = New-Object System.Drawing.Size(772, 160)
$taskGroup.ForeColor = $form.ForeColor
$form.Controls.Add($taskGroup)

$taskItems = @(
  @('external_recruit', '外部招募'),
  @('shop_daily', '商店每日奖励'),
  @('office_interpret', '事务所解读'),
  @('crisis_action', '危机行动'),
  @('stamina_clear', '回廊行动 · 清体力'),
  @('task_rewards', '任务奖励 / 最后执行')
)
$checks = @{}
for ($i = 0; $i -lt $taskItems.Count; $i++) {
  $check = New-Object DutyUI.TaskCard
  $check.Text = $taskItems[$i][1]
  $check.Checked = $true
  $check.AutoSize = $true
  $x = if (($i % 2) -eq 0) { 24 } else { 390 }
  $y = 31 + [Math]::Floor($i / 2) * 36
  $check.Location = New-Object System.Drawing.Point($x, $y)
  $taskGroup.Controls.Add($check)
  $checks[$taskItems[$i][0]] = $check
}

$selectAll = New-Object DutyUI.SoftButton
$selectAll.Text = '全选'
$selectAll.Location = New-Object System.Drawing.Point(580, 119)
$selectAll.Size = New-Object System.Drawing.Size(76, 29)
$taskGroup.Controls.Add($selectAll)
$clearAll = New-Object DutyUI.SoftButton
$clearAll.Text = '清空'
$clearAll.Location = New-Object System.Drawing.Point(668, 119)
$clearAll.Size = New-Object System.Drawing.Size(76, 29)
$taskGroup.Controls.Add($clearAll)
$selectAll.Add_Click({ foreach ($item in $checks.Values) { $item.Checked = $true } })
$clearAll.Add_Click({ foreach ($item in $checks.Values) { $item.Checked = $false } })

$officeGroup = New-Object DutyUI.CardGroup
$officeGroup.Text = '  02   解读优先级  '
$officeGroup.Location = New-Object System.Drawing.Point(24, 264)
$officeGroup.Size = New-Object System.Drawing.Size(374, 150)
$officeGroup.ForeColor = $form.ForeColor
$form.Controls.Add($officeGroup)

$firstLabel = New-Object System.Windows.Forms.Label
$firstLabel.Text = '第一优先'
$firstLabel.Location = New-Object System.Drawing.Point(20, 34)
$firstLabel.AutoSize = $true
$officeGroup.Controls.Add($firstLabel)
$firstCombo = New-Object System.Windows.Forms.ComboBox
$firstCombo.DropDownStyle = 'DropDownList'
$firstCombo.Items.AddRange(@('星砂', '金钱', '经验', '材料'))
$firstCombo.SelectedItem = '星砂'
$firstCombo.Location = New-Object System.Drawing.Point(104, 30)
$firstCombo.Size = New-Object System.Drawing.Size(238, 28)
$officeGroup.Controls.Add($firstCombo)

$secondLabel = New-Object System.Windows.Forms.Label
$secondLabel.Text = '第二优先'
$secondLabel.Location = New-Object System.Drawing.Point(20, 72)
$secondLabel.AutoSize = $true
$officeGroup.Controls.Add($secondLabel)
$secondCombo = New-Object System.Windows.Forms.ComboBox
$secondCombo.DropDownStyle = 'DropDownList'
$secondCombo.Items.AddRange(@('金钱', '星砂', '经验', '材料'))
$secondCombo.SelectedItem = '金钱'
$secondCombo.Location = New-Object System.Drawing.Point(104, 68)
$secondCombo.Size = New-Object System.Drawing.Size(238, 28)
$officeGroup.Controls.Add($secondCombo)

$officeHint = New-Object System.Windows.Forms.Label
$officeHint.Text = '按优先级解读；双缺货时退出并整理库存。'
$officeHint.Location = New-Object System.Drawing.Point(20, 110)
$officeHint.Size = New-Object System.Drawing.Size(330, 36)
$officeGroup.Controls.Add($officeHint)

$staminaGroup = New-Object DutyUI.CardGroup
$staminaGroup.Text = '  03   回廊行动 · 红币  '
$staminaGroup.Location = New-Object System.Drawing.Point(422, 264)
$staminaGroup.Size = New-Object System.Drawing.Size(374, 150)
$staminaGroup.ForeColor = $form.ForeColor
$form.Controls.Add($staminaGroup)
$staminaLabel = New-Object System.Windows.Forms.Label
$staminaLabel.Text = '刷取目标'
$staminaLabel.Location = New-Object System.Drawing.Point(20, 34)
$staminaLabel.AutoSize = $true
$staminaGroup.Controls.Add($staminaLabel)
$staminaValue = New-Object System.Windows.Forms.Label
$staminaValue.Text = '红币（固定）'
$staminaValue.Location = New-Object System.Drawing.Point(104, 34)
$staminaValue.AutoSize = $true
$staminaGroup.Controls.Add($staminaValue)
$staminaHint = New-Object System.Windows.Forms.Label
$staminaHint.Text = '自动检查回廊，持续扫荡至体力不足。'
$staminaHint.Location = New-Object System.Drawing.Point(20, 73)
$staminaHint.AutoSize = $true
$staminaHint.ForeColor = [System.Drawing.Color]::Silver
$staminaGroup.Controls.Add($staminaHint)

$startButton = New-Object DutyUI.SoftButton
$startButton.Text = '签发指令  /  开始执勤'
$startButton.Location = New-Object System.Drawing.Point(24, 435)
$startButton.Size = New-Object System.Drawing.Size(230, 43)
$startButton.BackColor = [System.Drawing.Color]::FromArgb(196, 150, 62)
$startButton.FlatStyle = 'Flat'
$form.Controls.Add($startButton)

$stopButton = New-Object DutyUI.SoftButton
$stopButton.Text = '停止'
$stopButton.Location = New-Object System.Drawing.Point(267, 435)
$stopButton.Size = New-Object System.Drawing.Size(92, 43)
$stopButton.Enabled = $false
$form.Controls.Add($stopButton)

$statusLabel = New-Object System.Windows.Forms.Label
$statusLabel.Text = '状态：等待开始'
$statusLabel.Location = New-Object System.Drawing.Point(382, 447)
$statusLabel.AutoSize = $false
$statusLabel.Size = New-Object System.Drawing.Size(414, 36)
$form.Controls.Add($statusLabel)

$logBox = New-Object System.Windows.Forms.RichTextBox
$logBox.Location = New-Object System.Drawing.Point(24, 530)
$logBox.Size = New-Object System.Drawing.Size(772, 210)
$logBox.ReadOnly = $true
$logBox.BackColor = [System.Drawing.Color]::FromArgb(18, 19, 22)
$logBox.ForeColor = [System.Drawing.Color]::Gainsboro
$logBox.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 10)
$logBox.BorderStyle = 'None'
$logBox.Text = '执勤记录将在此显示。详细识别与点击过程保存于后台日志。'
$form.Controls.Add($logBox)

$recordLabel = New-Object System.Windows.Forms.Label
$recordLabel.Text = '04   执勤简报'
$recordLabel.Location = New-Object System.Drawing.Point(24, 503)
$recordLabel.AutoSize = $true
$recordLabel.ForeColor = [System.Drawing.Color]::FromArgb(213, 190, 134)
$form.Controls.Add($recordLabel)
$detailButton = New-Object DutyUI.SoftButton
$detailButton.Text = '查看详细日志'
$detailButton.Location = New-Object System.Drawing.Point(658, 493)
$detailButton.Size = New-Object System.Drawing.Size(138, 30)
$detailButton.Add_Click({ $p=Join-Path $root '运行_UI.log'; if(Test-Path -LiteralPath $p){Start-Process notepad.exe -ArgumentList ('"'+$p+'"')} })
$form.Controls.Add($detailButton)
$footer = New-Object System.Windows.Forms.Label
$footer.Text = '运行时请勿操作鼠标   /   诊断记录自动保留 14 天，历史空间上限 100 MB'
$footer.Location = New-Object System.Drawing.Point(24, 755)
$footer.AutoSize = $true
$footer.ForeColor = [System.Drawing.Color]::FromArgb(156, 150, 130)
$form.Controls.Add($footer)
function Set-ArchiveTheme($container) {
 foreach($c in $container.Controls) {
  if($c -is [System.Windows.Forms.GroupBox]) {$c.ForeColor=[System.Drawing.Color]::FromArgb(213,190,134); $c.BackColor=[System.Drawing.Color]::FromArgb(31,32,29)}
  if($c -is [System.Windows.Forms.Button]) {$c.FlatStyle='Flat'; $c.FlatAppearance.BorderColor=[System.Drawing.Color]::FromArgb(112,99,69); $c.BackColor=[System.Drawing.Color]::FromArgb(43,44,38); $c.ForeColor=[System.Drawing.Color]::FromArgb(230,222,201); $c.Cursor='Hand'}
  if($c -is [System.Windows.Forms.ComboBox]) {$c.FlatStyle='Flat'; $c.BackColor=[System.Drawing.Color]::FromArgb(43,44,38); $c.ForeColor=[System.Drawing.Color]::FromArgb(230,222,201)}
  if($c.HasChildren){Set-ArchiveTheme $c}
 }
}
Set-ArchiveTheme $form
$startButton.BackColor=[System.Drawing.Color]::FromArgb(193,164,96)
$startButton.ForeColor=[System.Drawing.Color]::FromArgb(25,26,23)
$stopButton.ForeColor=[System.Drawing.Color]::FromArgb(215,159,140)



# Artwork has its own column; every control sits on an opaque surface.
$form.ClientSize=New-Object System.Drawing.Size(1180,780)
$form.MinimumSize=New-Object System.Drawing.Size(1196,819)
$form.MaximumSize=$form.MinimumSize
$form.BackColor=[System.Drawing.Color]::FromArgb(20,25,30)
$title.Text='特调科执勤终端';$title.Location=New-Object System.Drawing.Point(26,28)
$title.Font=New-Object System.Drawing.Font('Microsoft YaHei UI',22,[System.Drawing.FontStyle]::Bold)
$subtitle.Text='SPECIAL INVESTIGATION  /  02.0';$subtitle.Location=New-Object System.Drawing.Point(29,78)
$subtitle.ForeColor=[System.Drawing.Color]::FromArgb(155,165,171)
$art=New-Object System.Windows.Forms.PictureBox
$art.Location=New-Object System.Drawing.Point(26,128);$art.Size=New-Object System.Drawing.Size(370,264)
$art.SizeMode='Zoom';$art.Image=[System.Drawing.Image]::FromFile((Join-Path $root 'ui-assets\team.png'));$form.Controls.Add($art)
$heroTitle=New-Object System.Windows.Forms.Label
$heroTitle.Text='今日，也请有序执勤。';$heroTitle.Location=New-Object System.Drawing.Point(26,422);$heroTitle.Size=New-Object System.Drawing.Size(370,40)
$heroTitle.Font=New-Object System.Drawing.Font('Microsoft YaHei UI',18,[System.Drawing.FontStyle]::Bold);$heroTitle.ForeColor=[System.Drawing.Color]::FromArgb(228,214,177);$form.Controls.Add($heroTitle)
$heroNote=New-Object System.Windows.Forms.Label
$heroNote.Text="选择右侧任务，再开始执勤。`n进展与异常会显示在下方简报中。"
$heroNote.Location=New-Object System.Drawing.Point(28,474);$heroNote.Size=New-Object System.Drawing.Size(368,60)
$heroNote.ForeColor=[System.Drawing.Color]::FromArgb(163,174,183);$form.Controls.Add($heroNote)
$mascot=New-Object System.Windows.Forms.PictureBox
$mascot.Location=New-Object System.Drawing.Point(28,560);$mascot.Size=New-Object System.Drawing.Size(125,125);$mascot.SizeMode='Zoom'
$mascot.Image=[System.Drawing.Image]::FromFile((Join-Path $root 'ui-assets\assistant.png'));$form.Controls.Add($mascot)
$mascotNote=New-Object System.Windows.Forms.Label
$mascotNote.Text="待命中 / READY`n准备好后，签发行动指令。";$mascotNote.Location=New-Object System.Drawing.Point(166,596);$mascotNote.Size=New-Object System.Drawing.Size(230,60)
$mascotNote.ForeColor=[System.Drawing.Color]::FromArgb(196,201,204);$form.Controls.Add($mascotNote)
$taskGroup.Text='行动指派';$taskGroup.Location=New-Object System.Drawing.Point(424,26);$taskGroup.Size=New-Object System.Drawing.Size(730,270)
$taskGroup.BackColor=[System.Drawing.Color]::FromArgb(27,33,39)
$names=@('外部招募','商店每日奖励','事务所解读','危机行动','清体力 · 红币','任务奖励')
for($i=0;$i -lt $taskItems.Count;$i++){
 $c=$checks[$taskItems[$i][0]];$c.AutoSize=$false;$c.Text=$names[$i];$c.Font=New-Object System.Drawing.Font('Microsoft YaHei UI',12)
 $c.Size=New-Object System.Drawing.Size(342,54);$c.Location=New-Object System.Drawing.Point((16+($i%2)*356),(48+[Math]::Floor($i/2)*64))
}
$selectAll.Location=New-Object System.Drawing.Point(544,239);$selectAll.Size=New-Object System.Drawing.Size(76,26)
$clearAll.Location=New-Object System.Drawing.Point(632,239);$clearAll.Size=$selectAll.Size
$officeGroup.Text='解读优先级';$officeGroup.Location=New-Object System.Drawing.Point(424,310);$officeGroup.Size=New-Object System.Drawing.Size(430,160)
$officeGroup.BackColor=$taskGroup.BackColor
$firstLabel.Location=New-Object System.Drawing.Point(18,51);$firstCombo.Location=New-Object System.Drawing.Point(104,47);$firstCombo.Size=New-Object System.Drawing.Size(304,28)
$secondLabel.Location=New-Object System.Drawing.Point(18,89);$secondCombo.Location=New-Object System.Drawing.Point(104,85);$secondCombo.Size=$firstCombo.Size
$officeHint.Location=New-Object System.Drawing.Point(18,127);$officeHint.Size=New-Object System.Drawing.Size(396,26);$officeHint.Text='两类均缺货时退出，继续整理库存。'
$staminaGroup.Text='回廊行动';$staminaGroup.Location=New-Object System.Drawing.Point(868,310);$staminaGroup.Size=New-Object System.Drawing.Size(286,160);$staminaGroup.BackColor=$taskGroup.BackColor
$staminaLabel.Location=New-Object System.Drawing.Point(18,51);$staminaValue.Location=New-Object System.Drawing.Point(110,49);$staminaValue.Text='红币 / 固定'
$staminaHint.AutoSize=$false;$staminaHint.Location=New-Object System.Drawing.Point(18,91);$staminaHint.Size=New-Object System.Drawing.Size(248,50);$staminaHint.Text="自动检查当日回廊`n持续扫荡至体力不足"
$startButton.Location=New-Object System.Drawing.Point(424,488);$startButton.Size=New-Object System.Drawing.Size(570,54);$startButton.Text='开始执勤';$startButton.Font=New-Object System.Drawing.Font('Microsoft YaHei UI',15,[System.Drawing.FontStyle]::Bold)
$stopButton.Location=New-Object System.Drawing.Point(1008,488);$stopButton.Size=New-Object System.Drawing.Size(146,54)
$statusLabel.Location=New-Object System.Drawing.Point(424,554);$statusLabel.Size=New-Object System.Drawing.Size(730,28)
$recordLabel.Location=New-Object System.Drawing.Point(424,602);$recordLabel.Text='执勤简报'
$detailButton.Location=New-Object System.Drawing.Point(1016,592)
$logBox.Location=New-Object System.Drawing.Point(424,632);$logBox.Size=New-Object System.Drawing.Size(730,100);$logBox.BackColor=$taskGroup.BackColor
$logBox.Text='等待开始。这里只显示任务开始、完成与异常。'
$footer.Location=New-Object System.Drawing.Point(26,744);$footer.Text='运行时请勿操作鼠标                              诊断记录保留 14 天 / 100 MB'
$taskGroup.Controls.Add($performanceCombo)
$performanceCombo.Location=New-Object System.Drawing.Point(400,10)
$performanceCombo.Size=New-Object System.Drawing.Size(312,28)
$performanceCombo.BringToFront()
$form.Add_FormClosed({$art.Image.Dispose();$mascot.Image.Dispose()})

$checks['office_interpret'].Add_CheckedChanged({
  $officeGroup.Enabled = $checks['office_interpret'].Checked
})
$checks['stamina_clear'].Add_CheckedChanged({
  $staminaGroup.Enabled = $checks['stamina_clear'].Checked
})

$startButton.Add_Click({
  if (-not (Test-Path -LiteralPath $node)) {
    [System.Windows.Forms.MessageBox]::Show('程序包不完整：缺少 runtime\node.exe。请重新下载并完整解压后再运行。', '特调科值勤终端') | Out-Null
    return
  }
  if (-not (Test-Path -LiteralPath (Join-Path $root 'node_modules\@maaxyz\maa-node-win32-x64\MaaNode.node'))) {
    [System.Windows.Forms.MessageBox]::Show('程序包不完整：缺少 MAA 原生组件。请重新下载并完整解压后再运行。', '特调科值勤终端') | Out-Null
    return
  }
  $selected = @()
  foreach ($item in $taskItems) {
    if ($checks[$item[0]].Checked) { $selected += $item[0] }
  }
  if ($selected.Count -eq 0) {
    [System.Windows.Forms.MessageBox]::Show('请至少选择一个任务。', '特调科值勤终端') | Out-Null
    return
  }
  if ($checks['office_interpret'].Checked -and $firstCombo.SelectedItem -eq $secondCombo.SelectedItem) {
    [System.Windows.Forms.MessageBox]::Show('事务所第一优先和第二优先不能相同。', '特调科值勤终端') | Out-Null
    return
  }

  $script:stopAt = $null
  Remove-Item -LiteralPath (Join-Path $root '停止请求') -Force -ErrorAction SilentlyContinue
  $config = [ordered]@{
    inputMode = 'compatible'
    tasks = $selected
    office = [ordered]@{
      first = [string]$firstCombo.SelectedItem
      second = [string]$secondCombo.SelectedItem
      count = 'all'
    }
    stamina = '红币'
  }
  $performanceSettings.mode = $performanceModes[$performanceCombo.SelectedIndex]
  $performanceSettings.provider = $performanceProviders[$performanceCombo.SelectedIndex]
  [System.IO.File]::WriteAllText($performanceFile, ($performanceSettings | ConvertTo-Json), (New-Object System.Text.UTF8Encoding($false)))
  $json = $config | ConvertTo-Json -Depth 5
  [System.IO.File]::WriteAllText($configFile, $json, (New-Object System.Text.UTF8Encoding($false)))
  # 旧日志由 run_selected_tasks.js 先归档再清空；此处不能提前清空，否则最近运行记录会丢失。
  $script:lastLog = ''
  $logBox.Clear()

  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $node
  $psi.Arguments = '"' + $runner + '"'
  $psi.WorkingDirectory = $root
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $script:taskProcess = New-Object System.Diagnostics.Process
  $script:taskProcess.StartInfo = $psi
  if (-not $script:taskProcess.Start()) {
    [System.Windows.Forms.MessageBox]::Show('任务执行器启动失败。', '特调科值勤终端') | Out-Null
    return
  }
  $performanceCombo.Enabled = $false
  $startButton.Enabled = $false
  $stopButton.Enabled = $true
  $statusLabel.Text = '正在准备执勤'
  $mascotNote.Text = '执勤中 / RUNNING'
  $taskGroup.Enabled = $false; $officeGroup.Enabled = $false; $staminaGroup.Enabled = $false
})

$stopButton.Add_Click({
  if ($script:taskProcess -and -not $script:taskProcess.HasExited) {
    [System.IO.File]::WriteAllText((Join-Path $root '停止请求'), 'stop')
    $script:stopAt = [DateTime]::UtcNow
    $stopButton.Enabled = $false
    $statusLabel.Text = '状态：正在停止'
  }
})

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 600
$timer.Add_Tick({
  if ($script:stopAt -and $script:taskProcess -and -not $script:taskProcess.HasExited -and ([DateTime]::UtcNow - $script:stopAt).TotalSeconds -gt 8) {
    Start-Process -FilePath 'taskkill.exe' -ArgumentList @('/PID', $script:taskProcess.Id, '/T', '/F') -WindowStyle Hidden -Wait
    [System.IO.File]::WriteAllText($statusFile, '{"state":"stopped","current":"用户已停止"}', (New-Object System.Text.UTF8Encoding($false)))
  }
  if (Test-Path $logFile) {
    try {
      $text = Read-SharedText -Path $logFile
      if ($text -ne $script:lastLog) {
        $script:lastLog = $text
        $logBox.Text = $text
        $logBox.SelectionStart = $logBox.TextLength
        $logBox.ScrollToCaret()
      }
    } catch {}
  }
  if ($script:taskProcess -and -not $script:taskProcess.HasExited -and -not $script:stopAt) {
    try { $live = Read-SharedText -Path $statusFile | ConvertFrom-Json; if($live.index){$statusLabel.Text = "[$($live.index)/$($live.total)]  $($live.current)"} } catch {}
  }
  if ($script:taskProcess -and $script:taskProcess.HasExited) {
    $mascotNote.Text = '本轮结束 / FINISHED'
    $code = $script:taskProcess.ExitCode
    $script:taskProcess.Dispose()
    $script:taskProcess = $null
    $taskGroup.Enabled = $true; $officeGroup.Enabled = $checks['office_interpret'].Checked; $staminaGroup.Enabled = $checks['stamina_clear'].Checked
    $performanceCombo.Enabled = $true
    $startButton.Enabled = $true
    $stopButton.Enabled = $false
    if ($script:stopAt) {
      $statusLabel.Text = '状态：已停止'
    } elseif ($code -eq 0) {
      try {
        $finalStatus = Read-SharedText -Path $statusFile | ConvertFrom-Json
        if ($finalStatus.state -eq 'stopped') {
          $statusLabel.Text = '状态：已停止'
        } elseif ($finalStatus.state -eq 'completed_with_skips') {
          $statusLabel.Text = "状态：$($finalStatus.current)"
        } else {
          $statusLabel.Text = '状态：全部完成'
        }
      } catch {
        $statusLabel.Text = '状态：流程结束'
      }
    } else {
      $statusLabel.Text = '状态：运行失败，请查看日志'
    }
  }
})
$timer.Start()

$form.Add_FormClosing({
  param($sender, $eventArgs)
  if ($script:taskProcess -and -not $script:taskProcess.HasExited) {
    $answer = [System.Windows.Forms.MessageBox]::Show('任务仍在运行，确定退出并停止任务吗？', '特调科值勤终端', 'YesNo')
    if ($answer -ne 'Yes') { $eventArgs.Cancel = $true; return }
    [System.IO.File]::WriteAllText((Join-Path $root '停止请求'), 'stop')
    if (-not $script:taskProcess.WaitForExit(3000)) {
      Start-Process -FilePath 'taskkill.exe' -ArgumentList @('/PID', $script:taskProcess.Id, '/T', '/F') -WindowStyle Hidden -Wait
    }
    [System.IO.File]::WriteAllText($statusFile, '{"state":"stopped","current":"用户关闭终端"}', (New-Object System.Text.UTF8Encoding($false)))
  }
})

if($PreviewPath) {
 $timer.Stop(); $form.ShowInTaskbar=$false; $form.Opacity=0; $form.Show(); [System.Windows.Forms.Application]::DoEvents()
 $form.CreateControl(); function Initialize-PreviewControls($parent) { foreach($child in $parent.Controls) { $null=$child.Handle; if($child.HasChildren){Initialize-PreviewControls $child} } }; Initialize-PreviewControls $form
 $bitmap=New-Object System.Drawing.Bitmap($form.Width,$form.Height)
 $form.DrawToBitmap($bitmap,(New-Object System.Drawing.Rectangle(0,0,$form.Width,$form.Height)))
 $graphics=[System.Drawing.Graphics]::FromImage($bitmap); $origin=$form.PointToClient($logBox.PointToScreen([System.Drawing.Point]::Empty)); $borderX=($form.Width-$form.ClientSize.Width)/2; $borderY=$form.Height-$form.ClientSize.Height-$borderX; $brush=New-Object System.Drawing.SolidBrush($logBox.BackColor); $graphics.FillRectangle($brush,[int]($origin.X+$borderX),[int]($origin.Y+$borderY),$logBox.Width,$logBox.Height); $brush.Dispose(); $brush=New-Object System.Drawing.SolidBrush($logBox.ForeColor); $graphics.DrawString($logBox.Text,$logBox.Font,$brush,[single]($origin.X+$borderX+8),[single]($origin.Y+$borderY+8)); $brush.Dispose(); $graphics.Dispose(); $bitmap.Save($PreviewPath,[System.Drawing.Imaging.ImageFormat]::Png)
 $bitmap.Dispose(); $form.Dispose()
} else { [void]$form.ShowDialog() }






