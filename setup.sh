#!/bin/bash
# setup.sh – konfiguracja katalogu, .env, uruchomienie kontenera
# Użycie: bash setup.sh chat.sum.edu.pl
#
# Uruchom po install.sh, po uzupełnieniu .env

set -euo pipefail

DOMAIN="${1:-chat.sum.edu.pl}"
INSTALL_DIR="/opt/anythingllm"

echo "=== Tworzenie katalogu $INSTALL_DIR ==="
mkdir -p "$INSTALL_DIR/storage"
chmod 777 "$INSTALL_DIR/storage"

echo "=== Kopiowanie plików projektu ==="
cp docker-compose.yml "$INSTALL_DIR/"
cp .env.example "$INSTALL_DIR/.env.example"

# Generuj JWT_SECRET jeśli brak w .env
if [ ! -f "$INSTALL_DIR/.env" ]; then
  cp .env.example "$INSTALL_DIR/.env"
  JWT=$(openssl rand -hex 32)
  sed -i "s/zmien-na-losowy-ciag-min-32-znaki/$JWT/" "$INSTALL_DIR/.env"
  echo "⚠️ Uzupełnij OPEN_AI_KEY w pliku $INSTALL_DIR/.env !"
fi

echo "=== Uruchomienie AnythingLLM ==="
cd "$INSTALL_DIR"
docker compose up -d
echo "Kontener uruchomiony. Sprawdzam status..."
sleep 5
docker compose ps

echo ""
echo "=== Konfiguracja Nginx dla domeny: $DOMAIN ==="
cp /dev/stdin "/etc/nginx/sites-available/anythingllm.conf" <<NGINX
server {
    listen 80;
    server_name $DOMAIN;

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

echo ""
echo "=== Certyfikat SSL dla $DOMAIN ==="
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email admin@sum.edu.pl --redirect

echo ""
echo "✅ GOTOWE!"
echo "   Panel Admin: https://$DOMAIN"
echo "   Zaloguj się i pobierz API Key z Settings → API Keys"
echo "   Następnie: bash sync/sync-api.sh"
