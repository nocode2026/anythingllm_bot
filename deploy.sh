#!/bin/bash
# deploy.sh – kompletny deploy na serwer Linux
# Uruchom lokalnie: bash deploy.sh USER@TWOJ_SERWER chat.sum.edu.pl SK-TWOJ-OPENAI-KEY
#
# Przykład:
#   bash deploy.sh root@192.168.1.10 chat.sum.edu.pl sk-proj-abc123

set -euo pipefail

SSH_TARGET="${1:?Podaj SSH: user@host}"
DOMAIN="${2:?Podaj domenę, np: chat.sum.edu.pl}"
OPENAI_KEY="${3:?Podaj OpenAI API Key}"

echo "=== Deploy AnythingLLM SUM ==="
echo "  Cel:    $SSH_TARGET"
echo "  Domena: $DOMAIN"
echo ""

# 1. Wyślij pliki na serwer
echo "[1/5] Wysyłam pliki..."
ssh "$SSH_TARGET" "mkdir -p /opt/anythingllm/sync"
scp docker-compose.yml .env.example install.sh setup.sh \
    "$SSH_TARGET:/opt/anythingllm/"
scp sync/package.json sync/sync-api.js sync/scrape-trigger.js \
    sync/configure-workspace.js sync/cron-setup.sh \
    "$SSH_TARGET:/opt/anythingllm/sync/"

# 2. Instalacja zależności systemowych
echo "[2/5] Instalacja Docker, Node.js, Nginx..."
ssh "$SSH_TARGET" "bash /opt/anythingllm/install.sh"

# 3. Konfiguracja .env
echo "[3/5] Konfiguracja .env..."
JWT=$(openssl rand -hex 32)
ssh "$SSH_TARGET" "
  cp /opt/anythingllm/.env.example /opt/anythingllm/.env
  sed -i 's|zmien-na-losowy-ciag-min-32-znaki|$JWT|' /opt/anythingllm/.env
  sed -i 's|sk-...twoj-klucz...|$OPENAI_KEY|' /opt/anythingllm/.env
  echo 'ANYTHINGLLM_BASE_URL=https://$DOMAIN' >> /opt/anythingllm/.env
"

# 4. Setup: Docker + Nginx + SSL
echo "[4/5] Uruchamiam Docker i konfiguruję Nginx + SSL..."
ssh "$SSH_TARGET" "cd /opt/anythingllm && bash setup.sh $DOMAIN"

# 5. Instalacja Node dependencies
echo "[5/5] Instalacja Node.js dependencies..."
ssh "$SSH_TARGET" "cd /opt/anythingllm/sync && npm install --omit=dev"

echo ""
echo "=========================================="
echo "✅ Deploy zakończony!"
echo ""
echo "NASTĘPNE KROKI (wykonaj ręcznie):"
echo ""
echo "1. Otwórz panel: https://$DOMAIN"
echo "   → Utwórz konto admina (pierwsze logowanie)"
echo ""
echo "2. Pobierz API Key:"
echo "   → Settings → API Keys → Generate New API Key"
echo "   → Skopiuj klucz"
echo ""
echo "3. Ustaw klucz na serwerze:"
echo "   ssh $SSH_TARGET"
echo "   nano /opt/anythingllm/.env"
echo "   # Dodaj: ANYTHINGLLM_API_KEY=tu-wklej-klucz"
echo ""
echo "4. Skonfiguruj workspace:"
echo "   ssh $SSH_TARGET"
echo "   cd /opt/anythingllm/sync"
echo "   export \$(grep -v '^#' ../.env | xargs)"
echo "   node configure-workspace.js"
echo ""
echo "5. Uruchom synchronizację treści:"
echo "   node sync-api.js        # posty + placówki (REST API)"
echo "   node scrape-trigger.js  # strony Elementor (scraper)"
echo ""
echo "6. Ustaw automatyczne odświeżanie:"
echo "   bash cron-setup.sh"
echo ""
echo "7. Wklej kod embed na student.sum.edu.pl"
echo "   (kod zostanie wyświetlony przez configure-workspace.js)"
echo "=========================================="
