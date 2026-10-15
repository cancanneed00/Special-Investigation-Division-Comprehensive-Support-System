using System;using System.IO;using System.Diagnostics;using System.Windows.Forms;
[assembly:System.Reflection.AssemblyTitle("心锚适格评定终端")]
[assembly:System.Reflection.AssemblyProduct("心锚适格评定终端")]
class Launcher{[STAThread]static void Main(){try{string r=AppDomain.CurrentDomain.BaseDirectory;var p=new ProcessStartInfo(Path.Combine(r,@"程序文件\runtime\python\pythonw.exe"));p.Arguments="-I \""+Path.Combine(r,@"程序文件\desktop.py")+"\"";p.WorkingDirectory=r;p.UseShellExecute=false;p.CreateNoWindow=true;Process.Start(p);}catch(Exception e){MessageBox.Show(e.Message,"心锚适格评定终端启动失败");}}}