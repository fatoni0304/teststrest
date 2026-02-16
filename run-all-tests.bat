@echo off
REM =============================================
REM DRACIN Enterprise Stress Testing Suite Runner
REM =============================================
REM Usage: run-all-tests.bat [staging|production]
REM Default: production (dracinshort.xyz)
REM =============================================

setlocal enabledelayedexpansion

set "BASE_URL=https://dracinshort.xyz"
set "TEST_MODE=FALSE"

if "%1"=="staging" (
    set "BASE_URL=http://localhost:5000"
    set "TEST_MODE=TRUE"
    echo [INFO] Running in STAGING mode against localhost:5000
) else (
    echo [INFO] Running in PRODUCTION mode against dracinshort.xyz
)

echo.
echo =============================================
echo  DRACIN Stress Testing Suite
echo  Target: %BASE_URL%
echo  Mode: %TEST_MODE%
echo =============================================
echo.

REM Create results directory
if not exist "results" mkdir results

REM Step 1: Install dependencies
echo [1/4] Installing dependencies...
call npm install
if errorlevel 1 (
    echo [ERROR] npm install failed!
    pause
    exit /b 1
)

REM Step 2: Start Telegram Bot
echo.
echo [2/4] Starting Telegram Bot...
echo Bot will run in background. Use Telegram commands to control tests.
echo.
set "DRACIN_BASE_URL=%BASE_URL%"

start "DRACIN Stress Bot" /B node bot.js
echo [OK] Bot started! Open Telegram and send /start to begin.
echo.

REM Step 3: K6 Tests (if k6 installed)
where k6 >nul 2>&1
if %errorlevel%==0 (
    echo [3/4] Running k6 tests...
    echo Running Load Test...
    k6 run --env BASE_URL=%BASE_URL% k6\load-test.js --out json=results\k6-load.json 2>results\k6-load.log
    echo Running Auth Test...
    k6 run --env BASE_URL=%BASE_URL% k6\auth-test.js --out json=results\k6-auth.json 2>results\k6-auth.log
    echo Running Search Test...
    k6 run --env BASE_URL=%BASE_URL% k6\search-test.js --out json=results\k6-search.json 2>results\k6-search.log
    echo [OK] k6 tests complete. Results in results\ folder.
) else (
    echo [SKIP] k6 not installed. Install from https://k6.io
    echo        Or use Telegram bot commands instead.
)

REM Step 4: Artillery Tests (if installed)
where artillery >nul 2>&1
if %errorlevel%==0 (
    echo [4/4] Running Artillery tests...
    artillery run artillery\artillery-load.yml --output results\artillery-load.json
    echo [OK] Artillery tests complete.
) else (
    echo [SKIP] Artillery not installed. npm install -g artillery
)

echo.
echo =============================================
echo  All automated tests complete!
echo  Results saved to: results\
echo  Telegram bot still running for manual tests.
echo  Use /stop in Telegram to stop tests.
echo =============================================
echo.
pause
