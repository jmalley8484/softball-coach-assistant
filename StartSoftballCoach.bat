@echo off
title 🥎 Softball Coach Assistant
color 0A

echo.
echo  ==========================================
echo   🥎  10U Softball Coach Assistant
echo  ==========================================
echo.
echo  Starting server...
echo.

cd /d "\\BigDog\MalleyMedia\Claude\Projects\Softball Coach - Youth\app"

:: Start the Node server in the background
start /B npm start > "%TEMP%\softball-coach.log" 2>&1

:: Wait for server to start
timeout /t 3 /nobreak > nul

:: Open browser
echo  Opening browser at http://localhost:3000
echo.
start http://localhost:3000

echo  Server is running. Close this window to STOP the app.
echo.
echo  ==========================================
echo.

:: Keep window open (closing it stops the server)
cmd /k
