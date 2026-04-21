# Deployment Guide - Vercel & Render

## Vercel (Rekomendowane dla frontendu + API)

### Krok 1: Zaloguj się na Vercel
```bash
npm install -g vercel
vercel login
```

### Krok 2: Deploy repo
```bash
cd c:\Projekty\AnythingLLM
vercel --prod
```

### Krok 3: Ustaw Environment Variables w Vercel Dashboard
- Idź na https://vercel.com/dashboard
- Wybierz projekt
- Settings → Environment Variables
- Dodaj:
  - `ANYTHINGLLM_BASE_URL` = https://your-anythingllm-instance.com
  - `ANYTHINGLLM_API_KEY` = (z .env)
  - `OPENAI_API_KEY` = (z .env)
  - `DATABASE_URL` = (z .env)
  - `ALLOWED_ORIGINS` = https://your-vercel-domain.vercel.app

### Krok 4: Automatyczny deploy
- Każdy `git push` do `master` automatycznie deployuje na Vercel

---

## Render (Alternatywa - lepiej dla backendów)

### Krok 1: Zaloguj się na Render
- Idź na https://render.com
- Zaloguj się GitHub accountem

### Krok 2: Deploy
- Nowy → Web Service
- Wybierz repo: nocode2026/anythingllm_bot
- Build Command: `cd chatbot && pnpm install && pnpm --filter @sum/api-server build`
- Start Command: `cd chatbot/artifacts/api-server && node dist/app.js`
- Plan: Free lub Starter
- Dodaj Environment Variables:
  - `ANYTHINGLLM_BASE_URL`
  - `ANYTHINGLLM_API_KEY`
  - `OPENAI_API_KEY`
  - `DATABASE_URL`
  - `ALLOWED_ORIGINS`

### Krok 3: Widget (Static Site)
- Nowy → Static Site
- Build Command: `cd chatbot && pnpm install && pnpm --filter @sum/chat-widget build`
- Publish Directory: `chatbot/chat-widget/dist`

---

## GitHub Actions (Automatyczne testy + deploy)

Możesz dodać workflow w `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [master]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8
      
      - name: Build
        run: |
          cd chatbot
          pnpm install
          pnpm build
      
      - name: Test API
        run: |
          cd chatbot/artifacts/api-server
          npm run build
      
      - name: Deploy to Vercel
        uses: vercel/action@main
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
```

---

## Weryfikacja po Deployu

### Test API
```bash
curl -X POST https://your-api.vercel.app/api/chat/message \
  -H "Content-Type: application/json" \
  -d '{"message": "ile kosztuje akademik"}'
```

### Test Widget
```bash
# Otwórz widget embed na stronie:
<script src="https://your-widget.vercel.app/chat-widget.iife.js"></script>
```

---

## Troubleshooting

### API nie startuje
```bash
# Check logs locally
cd chatbot/artifacts/api-server
pnpm build
npm start
```

### Widget nie widoczny
```bash
# Build dist
cd chatbot/chat-widget
pnpm build
ls dist/
```

### Database connection error
- Ustaw `DATABASE_URL` w environment
- Upewnij się że baza jest dostępna z serwera

---

## Porty

- **Lokalnie:** API na 3100, Widget na 3200
- **Vercel/Render:** API na `https://api-domain/api/...`, Widget na `https://widget-domain`
