#!/bin/bash
# =============================================================
#  BOT SUM – Kreator instalacji (dla nietech nicznych)
#  Uruchomienie: bash start.sh
# =============================================================

set -euo pipefail

# Kolory
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # reset

log_step() { echo -e "\n${CYAN}${BOLD}>>> $1${NC}"; }
log_ok()   { echo -e "${GREEN}✓ $1${NC}"; }
log_warn() { echo -e "${YELLOW}⚠  $1${NC}"; }
log_err()  { echo -e "${RED}✗ BŁĄD: $1${NC}"; }
ask()      { echo -e "${BOLD}$1${NC}"; }

clear
echo -e "${BOLD}"
cat << 'LOGO'
  ╔══════════════════════════════════════════════════════╗
  ║        BOT STUDENTA – student.sum.edu.pl             ║
  ║              Kreator instalacji v1.0                 ║
  ╚══════════════════════════════════════════════════════╝
LOGO
echo -e "${NC}"
echo "Ten kreator przeprowadzi Cię przez całą instalację."
echo "Potrzebujesz tylko 3 rzeczy:"
echo ""
echo "  1. Adres Twojego serwera (np. 5.22.100.10 lub mój.serwer.pl)"
echo "  2. Domenę dla bota (np. chat.sum.edu.pl)"
echo "  3. Klucz OpenAI API (z platform.openai.com)"
echo ""
read -rp "Naciśnij ENTER kiedy jesteś gotowy..."

# ──────────────────────────────────────────────────────────────
# KROK 1: Zbierz dane od użytkownika
# ──────────────────────────────────────────────────────────────
clear
log_step "KROK 1 z 7 – Dane do instalacji"
echo ""

ask "Podaj adres IP lub nazwę serwera (np. 185.200.100.10):"
read -rp "> " SERVER_HOST
SERVER_HOST="${SERVER_HOST// /}"

ask "\nPodaj użytkownika SSH (zazwyczaj 'root'):"
read -rp "> " SSH_USER
SSH_USER="${SSH_USER// /}"
SSH_USER="${SSH_USER:-root}"

ask "\nPodaj domenę dla bota (np. chat.sum.edu.pl):"
echo "  (Ta domena musi już wskazywać na Twój serwer w DNS!)"
read -rp "> " DOMAIN
DOMAIN="${DOMAIN// /}"

ask "\nPodaj swój klucz OpenAI API (zaczyna się od sk-):"
echo "  (Znajdziesz go na platform.openai.com → API Keys)"
read -rsp "> " OPENAI_KEY
echo ""
OPENAI_KEY="${OPENAI_KEY// /}"

if [[ ! "$OPENAI_KEY" =~ ^sk- ]]; then
  log_warn "Klucz nie zaczyna się od 'sk-'. Upewnij się, że jest poprawny."
  ask "Kontynuować mimo to? (tak/nie)"
  read -rp "> " ANS
  [[ "$ANS" != "tak" ]] && exit 1
fi

echo ""
echo "═══════════════════════════════════════"
echo "  Podsumowanie:"
echo "  Serwer:  ${SSH_USER}@${SERVER_HOST}"
echo "  Domena:  ${DOMAIN}"
echo "  OpenAI:  sk-****${OPENAI_KEY: -4}"
echo "═══════════════════════════════════════"
ask "\nCzy dane są poprawne? (tak/nie)"
read -rp "> " CONFIRM
[[ "$CONFIRM" != "tak" ]] && { echo "Zrestartuj skrypt i wpisz poprawne dane."; exit 0; }

SSH_TARGET="${SSH_USER}@${SERVER_HOST}"

# ──────────────────────────────────────────────────────────────
# KROK 2: Test połączenia SSH
# ──────────────────────────────────────────────────────────────
clear
log_step "KROK 2 z 7 – Sprawdzam połączenie z serwerem"
echo ""
echo "Próbuję połączyć się z ${SSH_TARGET}..."
echo "(Może zapytać o hasło lub potwierdzenie klucza – wpisz 'yes' jeśli zapyta)"
echo ""

if ! ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new \
         "$SSH_TARGET" "echo 'Połączenie OK'" 2>/dev/null; then
  log_err "Nie mogę połączyć się z serwerem."
  echo ""
  echo "Sprawdź:"
  echo "  • Czy adres serwera jest poprawny: ${SERVER_HOST}"
  echo "  • Czy możesz połączyć się ręcznie: ssh ${SSH_TARGET}"
  echo "  • Czy serwer jest włączony i dostępny"
  exit 1
fi
log_ok "Połączenie z serwerem działa!"

# ──────────────────────────────────────────────────────────────
# KROK 3: Wyślij pliki na serwer
# ──────────────────────────────────────────────────────────────
clear
log_step "KROK 3 z 7 – Wysyłam pliki na serwer"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ssh "$SSH_TARGET" "mkdir -p /opt/anythingllm/sync"

scp -q \
    "$SCRIPT_DIR/docker-compose.yml" \
    "$SCRIPT_DIR/.env.example" \
    "$SCRIPT_DIR/install.sh" \
    "$SCRIPT_DIR/setup.sh" \
    "$SSH_TARGET:/opt/anythingllm/"

scp -q \
    "$SCRIPT_DIR/sync/package.json" \
    "$SCRIPT_DIR/sync/sync-api.js" \
    "$SCRIPT_DIR/sync/scrape-trigger.js" \
    "$SCRIPT_DIR/sync/configure-workspace.js" \
    "$SCRIPT_DIR/sync/cron-setup.sh" \
    "$SSH_TARGET:/opt/anythingllm/sync/"

log_ok "Pliki wysłane!"

# ──────────────────────────────────────────────────────────────
# KROK 4: Instalacja na serwerze (Docker, Node, Nginx)
# ──────────────────────────────────────────────────────────────
clear
log_step "KROK 4 z 7 – Instalacja oprogramowania na serwerze"
echo ""
echo "To może potrwać 3-5 minut. Poczekaj..."
echo ""

ssh "$SSH_TARGET" "bash /opt/anythingllm/install.sh" 2>&1 | \
  grep -E "(===|zainstal|Installed|już|OK|błąd)" || true

log_ok "Oprogramowanie zainstalowane!"

# ──────────────────────────────────────────────────────────────
# KROK 5: Konfiguracja .env + uruchomienie bota
# ──────────────────────────────────────────────────────────────
clear
log_step "KROK 5 z 7 – Konfiguruję i uruchamiam bota"
echo ""

JWT=$(openssl rand -hex 32)

ssh "$SSH_TARGET" "
  cp /opt/anythingllm/.env.example /opt/anythingllm/.env
  sed -i 's|zmien-na-losowy-ciag-min-32-znaki|${JWT}|' /opt/anythingllm/.env
  sed -i 's|sk-...twoj-klucz...|${OPENAI_KEY}|'        /opt/anythingllm/.env
  echo 'ANYTHINGLLM_BASE_URL=https://${DOMAIN}'      >> /opt/anythingllm/.env
  cd /opt/anythingllm && docker compose up -d
"

log_ok "Bot uruchomiony w kontenerze Docker!"

# ──────────────────────────────────────────────────────────────
# KROK 6: Nginx + SSL
# ──────────────────────────────────────────────────────────────
clear
log_step "KROK 6 z 7 – Konfiguruję stronę i certyfikat SSL (https://)"
echo ""
echo "Tworzę konfigurację Nginx dla domeny: ${DOMAIN}"
echo ""

ssh "$SSH_TARGET" "bash -s" <<ENDSSH
cat > /etc/nginx/sites-available/anythingllm.conf <<'NGINX'
server {
    listen 80;
    server_name ${DOMAIN};
    client_max_body_size 100M;
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
    }
}
NGINX
ln -sf /etc/nginx/sites-available/anythingllm.conf /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d ${DOMAIN} --non-interactive --agree-tos \
        --email admin@sum.edu.pl --redirect || echo "SSL_WARN"
ENDSSH

log_ok "Nginx skonfigurowany!"

# ──────────────────────────────────────────────────────────────
# KROK 7: Instalacja zależności Node (sync scripts)
# ──────────────────────────────────────────────────────────────
clear
log_step "KROK 7 z 7 – Instalacja skryptów synchronizacji"
echo ""

ssh "$SSH_TARGET" "cd /opt/anythingllm/sync && npm install --omit=dev --silent"
log_ok "Skrypty sync gotowe!"

# ──────────────────────────────────────────────────────────────
# GOTOWE – instrukcja końcowa
# ──────────────────────────────────────────────────────────────
clear
echo -e "${GREEN}${BOLD}"
cat << 'DONE'
  ╔══════════════════════════════════════════════════════╗
  ║              ✅ INSTALACJA ZAKOŃCZONA!               ║
  ╚══════════════════════════════════════════════════════╝
DONE
echo -e "${NC}"

echo "Bot działa! Teraz wykonaj 4 ostatnie kroki ręcznie:"
echo ""
echo -e "${BOLD}──── KROK A: Utwórz konto admina ────${NC}"
echo "  1. Otwórz przeglądarkę"
echo "  2. Wejdź na: https://${DOMAIN}"
echo "  3. Utwórz konto (e-mail + hasło) – to jest tylko dla Ciebie"
echo "  4. Zaloguj się"
echo ""
echo -e "${BOLD}──── KROK B: Pobierz klucz API ────${NC}"
echo "  1. W panelu kliknij: Ustawienia (ikonka koła zębatego)"
echo "  2. Wybierz: API Keys"
echo "  3. Kliknij: Generate New API Key"
echo "  4. Skopiuj klucz (długi ciąg znaków)"
echo ""
echo -e "${BOLD}──── KROK C: Wpisz klucz i skonfiguruj bota ────${NC}"
echo "  Połącz się z serwerem i uruchom:"
echo ""
echo -e "  ${CYAN}ssh ${SSH_TARGET}${NC}"
echo -e "  ${CYAN}nano /opt/anythingllm/.env${NC}"
echo "  → Znajdź linię ANYTHINGLLM_API_KEY= i wklej swój klucz"
echo "  → Ctrl+O (zapisz), Enter, Ctrl+X (wyjdź)"
echo ""
echo "  Następnie:"
echo -e "  ${CYAN}cd /opt/anythingllm/sync${NC}"
echo -e "  ${CYAN}export \$(grep -v '^#' ../.env | xargs)${NC}"
echo -e "  ${CYAN}node configure-workspace.js${NC}"
echo ""
echo -e "${BOLD}──── KROK D: Załaduj treść strony do bota ────${NC}"
echo "  (zaraz po configure-workspace.js):"
echo ""
echo -e "  ${CYAN}node sync-api.js        ${NC}← pobiera aktualności i placówki (5 min)"
echo -e "  ${CYAN}node scrape-trigger.js  ${NC}← skanuje strony wydziałów (15-30 min)"
echo ""
echo "  Po zakończeniu scraper wyświetli kod JavaScript."
echo "  Wklej go do nagłówka strony student.sum.edu.pl."
echo ""
echo -e "${BOLD}──── Automatyczne odświeżanie (raz) ────${NC}"
echo -e "  ${CYAN}bash cron-setup.sh${NC}  ← bot będzie się aktualizował automatycznie"
echo ""
echo "═══════════════════════════════════════════════════════"
echo -e "  Panel bota: ${CYAN}https://${DOMAIN}${NC}"
echo "═══════════════════════════════════════════════════════"
echo ""
