@echo off
echo Building POS Desktop for Windows...
echo.

REM Install dependencies
echo Installing dependencies...
call npm install
if errorlevel 1 (
    echo Failed to install dependencies
    exit /b 1
)

REM Build the application
echo Building application...
call npm run build
if errorlevel 1 (
    echo Build failed
    exit /b 1
)

REM Create Windows installer
echo Creating Windows installer...
call npm run dist:win
if errorlevel 1 (
    echo Failed to create installer
    exit /b 1
)

echo.
echo Build completed successfully!
echo Check the 'release' folder for the Windows installer.
pause
