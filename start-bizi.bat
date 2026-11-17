@echo off
setlocal

for %%I in ("%~dp0.") do set "ROOT=%%~fI"
set "SERVER_DIR=%ROOT%\server"
set "ML_PORT=8001"
set "API_PORT=5000"
set "DB_HOST=localhost"
set "DB_PORT=3306"
set "ML_WAIT=1"

if not exist "%SERVER_DIR%\.venv\Scripts\python.exe" (
  echo ERROR: Python virtual environment not found at server\.venv.
  echo Create or restore the project's server Python environment first.
  pause
  exit /b 1
)

for %%F in (
  final_model.joblib
  scaler.joblib
  tfidf_vectorizer.joblib
  feature_config.json
  creator_profiles.csv
) do (
  if not exist "%SERVER_DIR%\Bizi_model_export\%%F" (
    echo ERROR: Required recommendation artifact is missing: server\Bizi_model_export\%%F
    pause
    exit /b 1
  )
)
if not exist "%SERVER_DIR%\Bizi_model_export\all-MiniLM-L6-v2\config.json" (
  echo ERROR: Sentence-transformer model files are missing from server\Bizi_model_export\all-MiniLM-L6-v2.
  pause
  exit /b 1
)
if not exist "%SERVER_DIR%\node_modules\express" (
  echo ERROR: Express dependencies are missing. Run npm install in the server directory.
  pause
  exit /b 1
)
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not available on PATH.
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: npm is not available on PATH.
  pause
  exit /b 1
)

pushd "%SERVER_DIR%"
for /f "tokens=1,* delims==" %%A in ('findstr /b /c:"PORT=" ".env" 2^>nul') do set "API_PORT=%%B"
for /f "tokens=1,* delims==" %%A in ('findstr /b /c:"DB_HOST=" ".env" 2^>nul') do set "DB_HOST=%%B"

node -e "const net=require('net');const s=net.createConnection({host:process.argv[1],port:Number(process.argv[2])});const timer=setTimeout(()=>{s.destroy();process.exit(1)},2500);s.once('connect',()=>{clearTimeout(timer);s.end()});s.once('error',()=>{clearTimeout(timer);process.exit(1)})" "%DB_HOST%" "%DB_PORT%"
if errorlevel 1 (
  echo WARNING: MySQL is not reachable at %DB_HOST%:%DB_PORT%.
  echo Start MySQL using the XAMPP Control Panel, then retry database-dependent features.
) else (
  echo MySQL is reachable at %DB_HOST%:%DB_PORT%.
)

set "PORT_TO_CHECK=%ML_PORT%"
call :port_in_use
if errorlevel 1 goto start_ml
node -e "fetch('http://127.0.0.1:%ML_PORT%/health').then(async r=>{try{const d=await r.json();process.exit(r.ok&&d.status==='ok'&&d.model_loaded===true?0:1)}catch{process.exit(1)}}).catch(()=>process.exit(1))"
if errorlevel 1 (
  echo ERROR: Port %ML_PORT% is occupied, but the Bizi ML health check did not pass.
  echo No duplicate ML service was started. Check the process using port %ML_PORT%.
  set "ML_WAIT=0"
  goto start_api
)
echo Bizi ML recommendation service is already running and healthy on port %ML_PORT%.
set "ML_WAIT=0"
goto start_api

:start_ml
echo Starting FastAPI recommendation service in a new terminal...
start "Bizi ML Recommendation Service" /D "%SERVER_DIR%" cmd /k ""%SERVER_DIR%\.venv\Scripts\python.exe" -m uvicorn ml.app.main:app --host 127.0.0.1 --port %ML_PORT%"

:start_api
set "PORT_TO_CHECK=%API_PORT%"
call :port_in_use
if errorlevel 1 goto start_express
node -e "fetch('http://127.0.0.1:%API_PORT%/api/auth/session').then(r=>process.exit(r.status===200||r.status===401?0:1)).catch(()=>process.exit(1))"
if errorlevel 1 (
  echo ERROR: Port %API_PORT% is occupied, but the Bizi API check did not pass.
  echo No duplicate Express backend was started. Check the process using port %API_PORT%.
  goto verify_ml
)
echo Bizi Express backend is already responding on port %API_PORT%.
goto verify_ml

:start_express
echo Starting Express backend in a new terminal...
start "Bizi Express Backend" /D "%SERVER_DIR%" cmd /k "npm start"

:verify_ml
if "%ML_WAIT%"=="0" goto done
echo.
echo Checking FastAPI health for up to 10 minutes. The model embeds the full creator catalog during startup...
for /l %%N in (1,1,300) do (
  node -e "fetch('http://127.0.0.1:%ML_PORT%/health').then(async r=>{try{const d=await r.json();process.exit(r.ok&&d.status==='ok'&&d.model_loaded===true?0:1)}catch{process.exit(1)}}).catch(()=>process.exit(1))"
  if not errorlevel 1 goto ml_healthy
  ping 127.0.0.1 -n 3 >nul
)
echo WARNING: FastAPI did not report a loaded model within 10 minutes.
echo Check the Bizi ML Recommendation Service terminal for startup errors.
goto done

:ml_healthy
echo FastAPI is healthy and its recommendation model is loaded.
echo Health endpoint: http://127.0.0.1:%ML_PORT%/health
echo Express API: http://127.0.0.1:%API_PORT%
goto done

:port_in_use
netstat -ano -p tcp | findstr /r /c:":%PORT_TO_CHECK% .*LISTENING" >nul
exit /b %errorlevel%

:done
popd
echo.
echo Start the React frontend separately with npm run dev from the client directory.
