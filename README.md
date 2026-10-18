# 特调科综合支援系统

《异象回声》辅助工具集合。

| 子项目 | 当前版本 | 说明 |
| --- | --- | --- |
| [特调科值勤终端](./特调科值勤终端/) | 2.2.14 | 日常委托、事务所与相关流程自动化 |
| [心锚适格评定终端](./心锚适格评定终端/) | 0.6.4 | 心锚扫描、评定、历史记录与断点续扫 |

## 目录与发布

两个子项目分别维护源码和使用说明，统一在本仓库管理。值勤终端的原发布名称为“特调科执勤终端”，现有文件名保留兼容。

源码目录不包含运行时、OCR 模型、用户配置、历史数据、日志或实测截图。直接使用请下载对应完整发布包；发布包应作为 GitHub Releases 附件上传，不放入 Git 历史。

- [下载值勤终端 2.2.14 完整运行包](https://github.com/cancanneed00/Special-Investigation-Division-Comprehensive-Support-System/releases/download/duty-v2.2.14/echoes-duty-terminal-2.2.14-20261019.zip)：完整解压后运行 `特调科执勤终端.exe`。
- 心锚适格评定终端完整包：`心锚适格评定终端-0.6.4.zip`

## 开发说明

值勤终端依赖 Node.js 和 `@maaxyz/maa-node` 5.13.1，入口与测试命令见子项目 `程序文件/package.json`。启动 Windows 界面还需要完整包的运行时和资源。

心锚终端源码位于 `src`，使用 Python、Pillow、openpyxl 和 Maa Node。`src/build.py` 含本机运行时与图标素材路径，移到其他机器时需调整；构建流程并非可直接复现的通用安装器。部分历史测试依赖未纳入仓库的本地截图与历史数据。具体操作见各子项目使用说明。

原有第三方许可随子项目保留；本次整理未另行指定开源许可证。

## 下载与验证

[GitHub Releases](https://github.com/cancanneed00/Special-Investigation-Division-Comprehensive-Support-System/releases)

本次整理后验证：值勤终端 2.2.14 共 84 项自动测试通过；心锚终端历史合并与规则模拟共 12 项测试通过。未执行真实游戏完整流程。
