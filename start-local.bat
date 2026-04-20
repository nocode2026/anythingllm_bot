@echo off
REM start-local.bat – uruchom bota lokalnie na Windows
REM Wymaga: Docker Desktop (https://docker.com/products/docker-desktop)

echo.
echo  ╔══════════════════════════════════════════════════╗
echo  ║       BOT SUM – tryb lokalny (testowy)          ║
echo  ╚══════════════════════════════════════════════════╝
echo.

REM Sprawdź czy Docker jest zainstalowany
docker --version >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo  BLAD: Docker nie jest zainstalowany!
    echo.
    echo  Pobierz i zainstaluj Docker Desktop:
    echo  https://www.docker.com/products/docker-desktop
    echo.
    pause
    exit /b 1
)

REM Skopiuj .env jeśli nie istnieje
IF NOT EXIST ".env" (
    copy ".env.example" ".env" >nul
    echo  Stworzono plik .env
    echo.
    echo  WYMAGANE: Otwórz plik .env i uzupełnij:
    echo    OPEN_AI_KEY=sk-twoj-klucz-openai
    echo    JWT_SECRET=dowolny-losowy-ciag-min-32-znaki
    echo.
    echo  Następnie uruchom ten plik ponownie.
    pause
    exit /b 0
)

REM Sprawdź czy klucz OpenAI jest ustawiony
findstr /C:"sk-...twoj-klucz..." .env >nul
IF %ERRORLEVEL% EQU 0 (
    echo  UWAGA: Nie ustawiłeś OPEN_AI_KEY w pliku .env !
    echo  Otwórz .env i wpisz swój klucz OpenAI (sk-...).
    pause
    exit /b 1
)

echo  Uruchamiam kontener AnythingLLM...
docker compose up -d

echo.
echo  ════════════════════════════════════════════════
echo   Bot działa lokalnie!
echo   Otwórz przeglądarkę: http://localhost:3001
echo  ════════════════════════════════════════════════
echo.
echo  Aby zatrzymać bota:
echo    docker compose down
echo.
pause
