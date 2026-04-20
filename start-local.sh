#!/bin/bash
# start-local.sh – uruchom bota lokalnie na Mac/Linux (testy)
# Wymaga: Docker Desktop (https://docker.com/products/docker-desktop)

set -euo pipefail

CYAN='\033[0;36m'; BOLD='\033[1m'; GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'

echo -e "${BOLD}"
echo "  ╔══════════════════════════════════════════════════╗"
echo "  ║       BOT SUM – tryb lokalny (testowy)          ║"
echo "  ╚══════════════════════════════════════════════════╝"
echo -e "${NC}"

# Sprawdź Docker
if ! command -v docker &>/dev/null; then
  echo -e "${RED}BŁĄD: Docker nie jest zainstalowany!${NC}"
  echo ""
  echo "Pobierz Docker Desktop:"
  echo "  https://www.docker.com/products/docker-desktop"
  exit 1
fi

if ! docker info &>/dev/null; then
  echo -e "${RED}BŁĄD: Docker Desktop nie jest uruchomiony!${NC}"
  echo "Uruchom aplikację Docker Desktop i spróbuj ponownie."
  exit 1
fi

# .env – skopiuj jeśli brak
if [ ! -f ".env" ]; then
  cp .env.example .env
  echo "Stworzono plik .env"
  echo ""
  echo "Uzupełnij dwie rzeczy w pliku .env:"
  echo "  1. OPEN_AI_KEY=sk-twój-klucz"
  echo "  2. JWT_SECRET=dowolny-ciąg-32-znaków"
  echo ""
  echo "Możesz otworzyć plik poleceniem:"
  echo -e "  ${CYAN}nano .env${NC}  lub  ${CYAN}open .env${NC} (Mac)"
  echo ""
  echo "Następnie uruchom ten skrypt ponownie."
  exit 0
fi

# Sprawdź czy klucz jest ustawiony
if grep -q "sk-...twoj-klucz..." .env; then
  echo -e "${RED}Nie ustawiłeś OPEN_AI_KEY w pliku .env !${NC}"
  echo "Otwórz .env i wpisz swój klucz OpenAI API."
  exit 1
fi

# Generuj JWT jeśli domyślny
if grep -q "zmien-na-losowy-ciag" .env; then
  JWT=$(openssl rand -hex 32)
  sed -i.bak "s/zmien-na-losowy-ciag-min-32-znaki/$JWT/" .env
  rm -f .env.bak
  echo "Wygenerowano JWT_SECRET automatycznie."
fi

echo "Uruchamiam kontener AnythingLLM..."
docker compose up -d

echo ""
echo -e "${GREEN}${BOLD}"
echo "  ════════════════════════════════════════════════"
echo "   ✅ Bot działa lokalnie!"
echo -e "   Otwórz: ${CYAN}http://localhost:3001${NC}${GREEN}${BOLD}"
echo "  ════════════════════════════════════════════════"
echo -e "${NC}"
echo "Aby zatrzymać bota:"
echo "  docker compose down"
echo ""
echo "Aby zobaczyć logi:"
echo "  docker compose logs -f"
echo ""

# Otwórz przeglądarkę automatycznie (Mac)
if command -v open &>/dev/null; then
  sleep 3
  open "http://localhost:3001" &>/dev/null || true
fi
