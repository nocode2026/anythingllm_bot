#!/bin/bash
# install.sh – instalacja AnythingLLM na serwerze Linux (Ubuntu 22.04)
# Uruchom jako root lub użytkownik z sudo:
#   bash install.sh

set -euo pipefail

echo "=== [1/5] Aktualizacja systemu ==="
apt-get update -y && apt-get upgrade -y

echo "=== [2/5] Instalacja Docker ==="
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com | bash
  systemctl enable docker
  systemctl start docker
  echo "Docker zainstalowany."
else
  echo "Docker już zainstalowany: $(docker --version)"
fi

echo "=== [3/5] Instalacja Docker Compose ==="
if ! command -v docker compose &> /dev/null; then
  apt-get install -y docker-compose-plugin
fi

echo "=== [4/5] Instalacja Node.js (dla skryptu sync) ==="
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
  echo "Node.js: $(node --version)"
else
  echo "Node.js już zainstalowany: $(node --version)"
fi

echo "=== [5/5] Instalacja Nginx + Certbot ==="
apt-get install -y nginx certbot python3-certbot-nginx

echo ""
echo "✅ Instalacja zakończona. Kolejny krok:"
echo "   cd /opt/anythingllm && cp .env.example .env && nano .env"
echo "   bash setup.sh TWOJA_DOMENA"
