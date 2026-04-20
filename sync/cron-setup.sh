#!/bin/bash
# cron-setup.sh – konfiguruje automatyczną synchronizację treści
# Uruchom raz na serwerze po pierwszym deployu

SYNC_DIR="/opt/anythingllm/sync"
ENV_FILE="/opt/anythingllm/.env"

# Załaduj zmienne środowiskowe z .env
set -a
source "$ENV_FILE"
set +a

# Cron jobs:
# - sync-api.js (posty + placówki):    codziennie o 03:00
# - scrape-trigger.js (strony Elementor): 1. dnia miesiąca o 02:00

CRON_API="0 3 * * * cd $SYNC_DIR && node sync-api.js >> /var/log/sum-sync-api.log 2>&1"
CRON_SCRAPE="0 2 1 * * cd $SYNC_DIR && node scrape-trigger.js >> /var/log/sum-scrape.log 2>&1"

# Dodaj do crontab (bez duplikowania)
(crontab -l 2>/dev/null | grep -v "sum-sync\|scrape-trigger"; echo "$CRON_API"; echo "$CRON_SCRAPE") | crontab -

echo "✓ Cron jobs dodane:"
echo "  $CRON_API"
echo "  $CRON_SCRAPE"
echo ""
echo "Podgląd logów: tail -f /var/log/sum-sync-api.log"
