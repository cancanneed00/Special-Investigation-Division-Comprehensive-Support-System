from pathlib import Path
import shutil, subprocess, json
SRC=Path(__file__).resolve().parent
from engine import VERSION
ROOT=SRC.parent/'心锚终端'
APP=ROOT/'程序文件'
BUNDLE=Path(r'C:\Users\30860\.cache\codex-runtimes\codex-primary-runtime\dependencies\python')
DUTY=Path(r'C:\Users\30860\Documents\New project\release\特调科执勤终端-2.2.3\程序文件')
def cp(src,dst,ignore=None):
 if src.is_dir():shutil.copytree(src,dst,dirs_exist_ok=True,ignore=ignore)
 else:dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,dst)
APP.mkdir(parents=True,exist_ok=True)
from PIL import Image,ImageOps
assets=SRC/'assets';assets.mkdir(exist_ok=True)
source=Image.open(r'D:\下载\慵懒紫发章鱼少女贴纸.png').convert('RGBA')
# The supplied artwork already has alpha. Preserve it; opaque padding made bars.
bounds=source.getchannel('A').point(lambda a:255 if a>16 else 0).getbbox()
source=source.crop(bounds or source.getbbox())
icon=ImageOps.pad(source,(256,256),method=Image.Resampling.LANCZOS,color=(0,0,0,0))
icon.save(assets/'app.png');icon.save(assets/'app.ico',sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
cp(assets/'app.ico',assets/('app-'+VERSION+'.ico'))
cp(assets,APP/'assets')
for name in ['app.py','desktop.py','engine.py','scoring.py','vision.py','automation.py','game_driver.js','input_guard.js','ui_v4.py','policy_view.py','detail_view.py','history.py','ocr_worker.py','resume_scan.py','resume_ui.py']:
 cp(SRC/name,APP/name)
cp(SRC/'ocr.js',APP/'ocr.js')
py=APP/'runtime/python'
if not (py/'python.exe').exists():
 for n in ['python.exe','pythonw.exe','python3.dll','python312.dll','vcruntime140.dll','vcruntime140_1.dll','LICENSE.txt','DLLs','tcl']:
  cp(BUNDLE/n,py/n)
 cp(BUNDLE/'Lib',py/'Lib',shutil.ignore_patterns('site-packages','__pycache__','test','tests','idlelib','ensurepip'))
 for n in ['openpyxl','et_xmlfile','PIL']:
  cp(BUNDLE/'Lib/site-packages'/n,py/'Lib/site-packages'/n,shutil.ignore_patterns('__pycache__','tests'))
 for pattern in ['openpyxl-*.dist-info','et_xmlfile-*.dist-info','pillow-*.dist-info','pillow.libs']:
  for p in (BUNDLE/'Lib/site-packages').glob(pattern):cp(p,py/'Lib/site-packages'/p.name)
if not (APP/'node_modules').exists():cp(DUTY/'node_modules',APP/'node_modules')
if not (APP/'runtime/node.exe').exists():cp(DUTY/'runtime/node.exe',APP/'runtime/node.exe')
if not (APP/'resource/model').exists():cp(DUTY/'resource/base/model',APP/'resource/model')
(APP/'resource/pipeline').mkdir(parents=True,exist_ok=True)
(APP/'resource/default_pipeline.json').write_text('{}')
(APP/'resource/pipeline/empty.json').write_text('{"ReadOnlyOCR":{"recognition":"OCR","expected":".*"}}')
cp(DUTY/'licenses',ROOT/'第三方许可')
code='''using System;using System.IO;using System.Diagnostics;using System.Windows.Forms;
[assembly:System.Reflection.AssemblyTitle("心锚适格评定终端")]
[assembly:System.Reflection.AssemblyProduct("心锚适格评定终端")]
class Launcher{[STAThread]static void Main(){try{string r=AppDomain.CurrentDomain.BaseDirectory;var p=new ProcessStartInfo(Path.Combine(r,@"程序文件\\runtime\\python\\pythonw.exe"));p.Arguments="-I \\\""+Path.Combine(r,@"程序文件\\desktop.py")+"\\\"";p.WorkingDirectory=r;p.UseShellExecute=false;p.CreateNoWindow=true;Process.Start(p);}catch(Exception e){MessageBox.Show(e.Message,"心锚适格评定终端启动失败");}}}'''
(SRC/'Launcher.cs').write_text(code,encoding='utf-8-sig')
subprocess.run([r'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe','/nologo','/target:winexe','/win32icon:'+str(assets/'app.ico'),'/reference:System.Windows.Forms.dll','/out:'+str(ROOT/'心锚适格评定终端.exe'),str(SRC/'Launcher.cs')],check=True)
cp(ROOT/'心锚适格评定终端.exe',ROOT/('心锚适格评定终端-'+VERSION+'.exe'))
print(json.dumps({'root':str(ROOT),'bytes':sum(p.stat().st_size for p in ROOT.rglob('*') if p.is_file())},ensure_ascii=False))
