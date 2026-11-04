@echo off
chcp 65001 >nul
cd /d "%~dp0程序文件"
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -STA -File bootstrap.ps1 -SelfTest > "%TEMP%\EchoesDuty-startup.txt" 2>&1
type "%TEMP%\EchoesDuty-startup.txt"
echo.
echo Log: %TEMP%\EchoesDuty-startup.txt
pause
