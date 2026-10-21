# 加载程序自带的 .NET 程序集（ui-style / flow-window）。
# 发布包从网络下载解压后，DLL 会被 Windows 打上"来自 Internet"标记（Zone.Identifier），
# .NET 会拒绝通过 Add-Type -Path 加载这类文件（FileLoadException 0x80131515），
# 导致好友互助关闭等窗口操作中断。这里逐级降级，保证任意解压方式都能工作：
#   1. 直接加载（本地源码目录、已解除锁定的文件走这条，零开销）；
#   2. 解除文件自身的锁定标记后重试；
#   3. 从同目录 .cs 源码在内存中编译（完全不碰磁盘上被拦截的 DLL）。
# 全部失败时抛出带操作指引的错误，而不是一串原始堆栈。
function Import-DutyAssembly {
 param([Parameter(Mandatory=$true)][string]$Dll, [string]$Source, [string[]]$ReferencedAssemblies)
 $blocked=$null; $compileError=$null
 $dllExists=Test-Path -LiteralPath $Dll
 $name=Split-Path -Leaf $Dll
 if($dllExists){
  try {
   Add-Type -Path $Dll -ErrorAction Stop
   return
  } catch {
   $blocked=$_.Exception.Message.Split("`n")[0]
   # 只有"被系统拦截"才继续降级；其它错误（如文件真损坏）原样抛出
   if($_ -isnot [System.IO.FileLoadException] -and $_.Exception -isnot [System.IO.FileLoadException]){throw}
  }
  # 降级1：解除文件自身的网络锁定标记（只影响本机，不动内容）
  try {
   Unblock-File -Path $Dll -ErrorAction Stop
   Add-Type -Path $Dll -ErrorAction Stop
   return
  } catch {}
 }
 # 降级2：内存里编译 .cs 源码，绕开磁盘 DLL 的加载拦截
 if($Source -and (Test-Path -LiteralPath $Source)) {
  $params=@{TypeDefinition=[IO.File]::ReadAllText($Source)}
  if($ReferencedAssemblies){$params.ReferencedAssemblies=$ReferencedAssemblies}
  try {
   Add-Type @params -ErrorAction Stop
   return
  } catch { $compileError=$_.Exception.Message.Split("`n")[0] }
 }
 if(-not $dllExists){
  throw ("找不到 {0}，且无法从附带源码编译：请确认发布包已完整解压、程序文件目录没有缺文件{1}" -f $name,$(if($compileError){"；编译错误：$compileError"}else{""}))
 }
 if($compileError){
  throw ("无法加载 {0}：文件被系统拦截，源码兜底编译也失败。请在资源管理器中右键该文件→属性→勾选""解除锁定""后重试。`n拦截原因：{1}`n编译错误：{2}" -f $name,$blocked,$compileError)
 }
 throw ("无法加载 {0}：该文件可能被系统标记为""来自 Internet""而遭拦截，自动降级也未成功。请在资源管理器中右键该文件→属性→勾选""解除锁定""后重试。`n原始错误：{1}" -f $name,$blocked)
}
