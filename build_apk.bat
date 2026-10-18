@echo off
title Build Remote Mouse Android APK
echo ============================================
echo   Building Remote Mouse Android APK...
echo ============================================

set "JAVA_HOME=C:\Program Files\Java\jdk-21.0.10"
set "PATH=%JAVA_HOME%\bin;%PATH%"

echo 1. Syncing assets...
call npx cap sync android

echo 2. Building debug APK...
cd android
call gradlew.bat assembleDebug --no-daemon

echo 3. Copying APK to root...
cd ..
copy /y "android\app\build\outputs\apk\debug\app-debug.apk" "RemoteMouse.apk"

echo ============================================
echo   Build complete! Output:
echo   D:\Github\Project Mouse Remote\RemoteMouse.apk
echo ============================================
pause
