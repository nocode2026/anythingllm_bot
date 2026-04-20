# start-local.ps1 – uruchomienie bota lokalnie na Windows (testy)
# Uruchomienie w PowerShell:
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#   .\start-local.ps1

$ErrorActionPreference = "Stop"

function Write-Step($msg)  { Write-Host "`n>>> $msg" -ForegroundColor Cyan }
function Write-OK($msg)    { Write-Host "v $msg" -ForegroundColor Green }
function Write-Warn($msg)  { Write-Host "! $msg" -ForegroundColor Yellow }
function Write-Fail($msg)  { Write-Host "X BLAD: $msg" -ForegroundColor Red }

Clear-Host
Write-Host @"
  ╔══════════════════════════════════════════════════════╗
  ║        BOT STUDENTA – Tryb lokalny (Windows)         ║
  ║              Testy na swoim komputerze               ║
  ╚══════════════════════════════════════════════════════╝
"@ -ForegroundColor White

# ── KROK 1: Sprawdź Docker Desktop ───────────────────────────────────────────
Write-Step "KROK 1/4 – Sprawdzam czy Docker Desktop jest zainstalowany"

try {
    $dockerVersion = docker --version 2>&1
    Write-OK "Docker znaleziony: $dockerVersion"
} catch {
    Write-Fail "Docker nie jest zainstalowany lub nie działa."
    Write-Host ""
    Write-Host "Pobierz i zainstaluj Docker Desktop:" -ForegroundColor Yellow
    Write-Host "  https://www.docker.com/products/docker-desktop/" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Po instalacji uruchom ponownie ten skrypt." -ForegroundColor Yellow
    Start-Process "https://www.docker.com/products/docker-desktop/"
    exit 1
}

# Sprawdź czy Docker daemon działa
try {
    docker info 2>&1 | Out-Null
} catch {
    Write-Fail "Docker Desktop jest zainstalowany ale nie jest uruchomiony."
    Write-Host "Uruchom Docker Desktop (ikona wieloryba w pasku zadań) i spróbuj ponownie." -ForegroundColor Yellow
    exit 1
}

# ── KROK 2: Przygotuj .env ────────────────────────────────────────────────────
Write-Step "KROK 2/4 – Konfiguruję plik .env"

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-OK "Plik .env utworzony z szablonu"
} else {
    Write-OK "Plik .env już istnieje – używam istniejącego"
}

# Sprawdź czy jest klucz OpenAI
$envContent = Get-Content ".env" -Raw
if ($envContent -match "sk-\.\.\.twoj-klucz") {
    Write-Host ""
    Write-Warn "Brak klucza OpenAI API w pliku .env"
    Write-Host ""
    Write-Host "Podaj swój klucz OpenAI API (zaczyna sie od sk-):" -ForegroundColor White
    Write-Host "(Znajdziesz go na: platform.openai.com -> API Keys)" -ForegroundColor Gray
    $openAiKey = Read-Host "Klucz"
    $openAiKey = $openAiKey.Trim()

    if ($openAiKey -notmatch "^sk-") {
        Write-Warn "Klucz nie zaczyna sie od 'sk-'. Możesz to zmienić później w pliku .env"
    }

    # Zapisz klucz do .env (bezpieczna podmiana)
    $envContent = $envContent -replace "sk-\.\.\.twoj-klucz\.\.\.", $openAiKey
    $envContent | Set-Content ".env" -Encoding UTF8 -NoNewline
    Write-OK "Klucz OpenAI zapisany"
}

# Ustaw JWT_SECRET jeśli domyślny
if ($envContent -match "zmien-na-losowy-ciag") {
    $jwt = -join ((1..32) | ForEach-Object { '{0:x}' -f (Get-Random -Max 16) })
    $envContent = (Get-Content ".env" -Raw) -replace "zmien-na-losowy-ciag-min-32-znaki", $jwt
    $envContent | Set-Content ".env" -Encoding UTF8 -NoNewline
    Write-OK "JWT Secret wygenerowany automatycznie"
}

# ── KROK 3: Uruchom kontener ──────────────────────────────────────────────────
Write-Step "KROK 3/4 – Uruchamiam bota (Docker)"
Write-Host "Pobieranie obrazu AnythingLLM (pierwsze uruchomienie: ~500MB, chwilę poczekaj)..."
Write-Host ""

# Utwórz katalog storage
if (-not (Test-Path "storage")) {
    New-Item -ItemType Directory -Path "storage" | Out-Null
}

docker compose up -d

Write-OK "Bot uruchomiony!"

# ── KROK 4: Czekaj aż bot wystartuje ─────────────────────────────────────────
Write-Step "KROK 4/4 – Czekam aż bot będzie gotowy"
Write-Host "Sprawdzam http://localhost:3001 ..."

$maxTries = 20
$ready = $false
for ($i = 1; $i -le $maxTries; $i++) {
    Start-Sleep -Seconds 3
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3001" -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            $ready = $true
            break
        }
    } catch { }
    Write-Host "  Czekam... ($i/$maxTries)" -ForegroundColor Gray
}

Write-Host ""
if ($ready) {
    Write-OK "Bot jest gotowy!"
} else {
    Write-Warn "Bot moze jeszcze startowac. Otwórz http://localhost:3001 za chwilę."
}

# ── Otwórz przeglądarkę ───────────────────────────────────────────────────────
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host "  ✅ LOKALNY BOT DZIAŁA!" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host ""
Write-Host "  Adres w przeglądarce: " -NoNewline
Write-Host "http://localhost:3001" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Co teraz zrobić:" -ForegroundColor White
Write-Host "  1. Otwiera sie przeglądarka → utwórz konto admina"
Write-Host "  2. Idz do: Ustawienia → API Keys → wygeneruj klucz"
Write-Host "  3. Zapisz klucz w pliku .env jako: ANYTHINGLLM_API_KEY=..."
Write-Host "  4. Uruchom w PowerShell:"
Write-Host "       cd sync" -ForegroundColor Cyan
Write-Host "       npm install" -ForegroundColor Cyan
Write-Host "       # ustaw zmienne srodowiskowe z .env:" -ForegroundColor Gray
Write-Host "       Get-Content ../.env | Where-Object { `$_ -match '=' -and `$_ -notmatch '^#' } | ForEach-Object { `$k,$v = `$_ -split '=',2; [System.Environment]::SetEnvironmentVariable(`$k,`$v,'Process') }" -ForegroundColor Cyan
Write-Host "       node configure-workspace.js" -ForegroundColor Cyan
Write-Host "       node sync-api.js" -ForegroundColor Cyan
Write-Host "       node scrape-trigger.js" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Zatrzymanie bota:" -ForegroundColor Gray
Write-Host "       docker compose down" -ForegroundColor Gray
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Green

Start-Process "http://localhost:3001"
