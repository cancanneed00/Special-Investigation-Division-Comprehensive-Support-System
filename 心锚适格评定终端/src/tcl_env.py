"""隔离系统 Tcl/Tk，保证 tkinter 使用随包自带的同版本运行时。

必须在任何 ``import tkinter`` **之前**导入本模块。

背景：Tcl 要求「二进制 DLL」与「脚本库(init.tcl 等)」版本完全一致，否则初始化即中止并抛出
    version conflict for package "Tcl": have 8.6.12, need exactly 8.6.14
含义是：被加载的 tcl86t.dll 是 8.6.14（来自用户机器上的其它 Tcl 安装），
而脚本库是随包的 8.6.12，两者不同源。

因此这里同时固定两侧，确保同源同版本：
1) 显式预加载随包的 tcl86t.dll / tk86t.dll —— 进程内已加载同名模块后，
   tkinter 后续的 LoadLibrary 会直接复用，系统里的其它版本便无从插入；
2) 注册 DLL 搜索目录（os.add_dll_directory）并前置 PATH，作为兜底；
3) 把 TCL_LIBRARY / TK_LIBRARY 指向随包脚本库。

随包运行时缺失时（例如旧版调用系统 Python）全部静默跳过，不改变原有行为。
"""
import os

def _runtime_dirs():
    root = os.path.dirname(os.path.abspath(__file__))
    runtime = os.path.join(root, 'runtime', 'python')
    return runtime, os.path.join(runtime, 'DLLs')

def pin():
    if os.name != 'nt':
        return None
    runtime, dlls = _runtime_dirs()
    tcl = os.path.join(runtime, 'tcl', 'tcl8.6')
    tk = os.path.join(runtime, 'tcl', 'tk8.6')
    if not os.path.isdir(dlls):
        return None
    # 1) 先注册搜索目录，保证预加载时能解析到随包依赖（如 vcruntime140.dll）。
    for directory in (runtime, dlls):
        if os.path.isdir(directory):
            try:
                os.add_dll_directory(directory)
            except Exception:
                pass
    os.environ['PATH'] = os.pathsep.join([dlls, runtime, os.environ.get('PATH', '')])
    # 2) 显式预加载随包二进制，避免系统其它版本被优先加载。
    for name in ('tcl86t.dll', 'tk86t.dll'):
        path = os.path.join(dlls, name)
        if os.path.isfile(path):
            try:
                import ctypes
                ctypes.CDLL(path)
            except Exception:
                pass
    # 3) 脚本库指向随包目录，与上面加载的二进制同版本。
    if os.path.isdir(tcl):
        os.environ['TCL_LIBRARY'] = tcl
    if os.path.isdir(tk):
        os.environ['TK_LIBRARY'] = tk
    return tcl if os.path.isdir(tcl) else None

PINNED = pin()
