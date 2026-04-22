$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true

function Write-Step($msg)  { Write-Host "`n>>> $msg" -ForegroundColor Cyan }
function Write-OK($msg)    { Write-Host "v $msg" -ForegroundColor Green }
function Write-Warn($msg)  { Write-Host "! $msg" -ForegroundColor Yellow }
function Write-Fail($msg)  { Write-Host "X BLAD: $msg" -ForegroundColor Red }

function Ensure-EnvValue([string]$path, [string]$key, [string]$value) {
    $content = Get-Content $path -Raw
    if ($content -match "(?m)^$([regex]::Escape($key))=") {
        $updated = [regex]::Replace($content, "(?m)^$([regex]::Escape($key))=.*$", "$key=$value")
    } else {
        $updated = $content.TrimEnd() + "`r`n$key=$value`r`n"
    }
    [System.IO.File]::WriteAllText($path, $updated, [System.Text.UTF8Encoding]::new($false))
}

function Import-DotEnv([string]$path) {
    Get-Content $path | Where-Object { $_ -match '=' -and $_ -notmatch '^\s*#' } | ForEach-Object {
        $k, $v = $_ -split '=', 2
        [System.Environment]::SetEnvironmentVariable($k.Trim(), $v.Trim(), 'Process')
    }
}

Clear-Host
Write-Host @"
  ╔══════════════════════════════════════════════════════════════╗
  ║           SUM CHATBOT – PEŁNY TRYB LOKALNY (Windows)         ║
  ║     Postgres + migracje + pełny ingest + API + widget live   ║
  ╚══════════════════════════════════════════════════════════════╝
"@ -ForegroundColor White

Write-Step 'KROK 1/7 – Sprawdzam Docker Desktop i Node/pnpm'
try { docker info | Out-Null; Write-OK 'Docker Desktop działa' } catch { Write-Fail 'Docker Desktop nie działa'; exit 1 }
try { node --version | Out-Null; Write-OK 'Node.js jest dostępny' } catch { Write-Fail 'Brak Node.js'; exit 1 }
try { pnpm --version | Out-Null; Write-OK 'pnpm jest dostępny' } catch { Write-Fail 'Brak pnpm'; exit 1 }

Write-Step 'KROK 2/7 – Przygotowuję .env dla custom stacka'
if (-not (Test-Path '.env')) {
    Copy-Item '.env.example' '.env'
    Write-OK 'Utworzono .env z szablonu'
}

$envPath = Join-Path $PWD '.env'
$envContent = Get-Content $envPath -Raw

if ($envContent -match '(?m)^OPEN_AI_KEY=' -and $envContent -notmatch '(?m)^OPENAI_API_KEY=') {
    $legacyKey = ((Get-Content $envPath | Where-Object { $_ -match '^OPEN_AI_KEY=' } | Select-Object -First 1) -replace '^OPEN_AI_KEY=', '').Trim()
    if ($legacyKey) {
        Ensure-EnvValue $envPath 'OPENAI_API_KEY' $legacyKey
    }
}

Ensure-EnvValue $envPath 'DATABASE_URL' 'postgresql://postgres:postgres@localhost:5432/sum_chatbot'
Ensure-EnvValue $envPath 'OPENAI_EMBEDDING_MODEL' 'text-embedding-3-small'
Ensure-EnvValue $envPath 'VECTOR_DIMENSION' '1536'
Ensure-EnvValue $envPath 'PORT' '3100'
Ensure-EnvValue $envPath 'ALLOWED_ORIGINS' 'http://localhost:3200,http://127.0.0.1:3200'

Import-DotEnv $envPath

if (-not $env:OPENAI_API_KEY) {
    Write-Fail 'Brak OPENAI_API_KEY w .env. Uzupełnij klucz i uruchom ponownie.'
    exit 1
}

Write-OK 'Custom env gotowy'

Write-Step 'KROK 3/7 – Uruchamiam kontenery AnythingLLM + Postgres'
docker compose up -d anythingllm sum-postgres | Out-Null
Write-OK 'Kontenery wystartowane'

Write-Step 'KROK 4/7 – Czekam na Postgresa'
$pgReady = $false
for ($i = 1; $i -le 30; $i++) {
    try {
        docker exec sum-postgres psql -U postgres -d sum_chatbot -c "select 1;" | Out-Null
        $pgReady = $true
        break
    } catch {
        Start-Sleep -Seconds 2
    }
}
if (-not $pgReady) {
    Write-Fail 'Postgres nie wstał na czas'
    exit 1
}
Write-OK 'Postgres gotowy'

Write-Step 'KROK 5/7 – Instaluję zależności, uruchamiam migracje i pełny ingest'
Push-Location 'chatbot'
pnpm install
pnpm --filter @sum/db migrate
try {
    $prevTlsReject = $env:NODE_TLS_REJECT_UNAUTHORIZED
    $env:NODE_TLS_REJECT_UNAUTHORIZED = '0'
    pnpm --filter @sum/scripts ingest
    Write-OK 'Ingest zakończony'
} catch {
    Write-Warn 'Ingest nieudany (np. SSL do WP). Kontynuuję start API i widgetu.'
} finally {
    $env:NODE_TLS_REJECT_UNAUTHORIZED = $prevTlsReject
}
Pop-Location
Write-OK 'Migracje zakończone'

Write-Step 'KROK 6/7 – Uruchamiam custom API i podgląd widgetu'
$apiCommand = "Set-Location '$PWD\chatbot'; `$env:NODE_TLS_REJECT_UNAUTHORIZED='0'; Get-Content ..\.env | Where-Object { `$_ -match '=' -and `$_ -notmatch '^#' } | ForEach-Object { `$k,`$v = `$_ -split '=',2; [System.Environment]::SetEnvironmentVariable(`$k.Trim(),`$v.Trim(),'Process') }; pnpm dev:api"
$widgetCommand = "Set-Location '$PWD\chatbot'; Get-Content ..\.env | Where-Object { `$_ -match '=' -and `$_ -notmatch '^#' } | ForEach-Object { `$k,`$v = `$_ -split '=',2; [System.Environment]::SetEnvironmentVariable(`$k.Trim(),`$v.Trim(),'Process') }; pnpm --filter @sum/chat-widget dev --host 127.0.0.1 --port 3200"
Start-Process pwsh -ArgumentList '-NoExit', '-Command', $apiCommand | Out-Null
Start-Process pwsh -ArgumentList '-NoExit', '-Command', $widgetCommand | Out-Null
Write-OK 'API i widget uruchomione w osobnych oknach PowerShell'

Write-Step 'KROK 7/7 – Czekam na klienta live'
$widgetReady = $false
for ($i = 1; $i -le 40; $i++) {
    try {
        $response = Invoke-WebRequest -Uri 'http://127.0.0.1:3200' -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            $widgetReady = $true
            break
        }
    } catch {
        Start-Sleep -Seconds 2
    }
}

Write-Host ''
Write-Host '═══════════════════════════════════════════════════════' -ForegroundColor Green
Write-Host '  ✅ PEŁNY CUSTOM STACK DZIAŁA' -ForegroundColor Green
Write-Host '═══════════════════════════════════════════════════════' -ForegroundColor Green
Write-Host ''
Write-Host '  Właściwy klient live: ' -NoNewline
Write-Host 'http://127.0.0.1:3200' -ForegroundColor Cyan
Write-Host '  Surowy AnythingLLM:    ' -NoNewline
Write-Host 'http://localhost:3001' -ForegroundColor DarkGray
Write-Host '  Custom API:            ' -NoNewline
Write-Host 'http://localhost:3100/api/health' -ForegroundColor DarkGray
Write-Host ''
Write-Host '  Zatrzymanie kontenerów:' -ForegroundColor Gray
Write-Host '       docker compose down' -ForegroundColor Gray
Write-Host '  API/widget zamknij w ich oknach PowerShell.' -ForegroundColor Gray

if ($widgetReady) {
    Start-Process 'http://127.0.0.1:3200'
} else {
    Write-Warn 'Widget jeszcze startuje. Otwórz ręcznie http://127.0.0.1:3200 za chwilę.'
}
