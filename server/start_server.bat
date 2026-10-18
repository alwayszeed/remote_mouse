@echo off
title Remote Mouse Server
echo Starting Remote Mouse Server...
python "%~dp0server.py" %*
pause
