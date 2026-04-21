# Railway + Vercel Deployment Guide

## Architektura

```
Frontend (Vercel):
  └─ chatbot/chat-widget (React + Vite → IIFE dist)
     └─ Publiczny URL: https://widget.vercel.app/chat-widget.iife.js

Backend (Railway):
  └─ chatbot/artifacts/api-server (Express + TypeScript)
     └─ URL: https://sum-chatbot-api.railway.app
     └─ Port: 3100 (auto-assigned na Railway)
```

---

## STEP 1: Deploy Backend na Railway

### 1.1 Utwórz projekt na Railway
- Idź na https://railway.app
- Nowy projekt → GitHub
- Wybierz repo: `nocode2026/anythingllm_bot`
- Zatwierdź deploy

### 1.2 Railway auto-deployuje z `railway.json`
```json
{
  "build": {
    "buildCommand": "cd chatbot && pnpm install && pnpm --filter @sum/api-server build"
  },
  "deploy": {
    "startCommand": "cd chatbot/artifacts/api-server && node dist/app.js"
  }
}
```

### 1.3 Ustaw Environment Variables w Railway Dashboard
- Railway Dashboard → Variables
- Dodaj:
  ```
  PORT=3100
  ANYTHINGLLM_BASE_URL=https://your-anythingllm.com
  ANYTHINGLLM_API_KEY=xxx
  OPENAI_API_KEY=xxx
  DATABASE_URL=postgresql://...
  ALLOWED_ORIGINS=https://your-vercel-domain.vercel.app
  ```

### 1.4 Skopiuj URL Railway
- Railway Dashboard → URL
- Coś w stylu: `https://sum-chatbot-api.railway.app`
- **Zapamiętaj to — potrzebne do Vercel**

---

## STEP 2: Deploy Frontend na Vercel

### 2.1 Utwórz projekt na Vercel
- Idź na https://vercel.com/dashboard
- New Project → Import Git Repository
- Wybierz repo: `nocode2026/anythingllm_bot`

### 2.2 Konfiguracja Build
- Framework Preset: **Other**
- Build Command: `cd chatbot && pnpm install && pnpm --filter @sum/chat-widget build`
- Output Directory: `chatbot/chat-widget/dist`
- Root Directory: `.` (leave empty)

### 2.3 Environment Variables w Vercel
- Settings → Environment Variables
- Dodaj:
  ```
  VITE_API_URL=https://sum-chatbot-api.railway.app
  VITE_WIDGET_VERSION=1.0.0
  ```

### 2.4 Deploy
- Click "Deploy"
- Vercel auto-deployuje na `https://your-project.vercel.app`

### 2.5 Widget URL
- Frontend: `https://your-project.vercel.app/`
- Widget JS (publiczny): `https://your-project.vercel.app/chat-widget.iife.js`
- Widget CSS: `https://your-project.vercel.app/style.css`

---

## STEP 3: Osadź Widget Publiczny

### 3.1 Na dowolnej stronie HTML
```html
<!DOCTYPE html>
<html>
<head>
  <!-- Widget CSS -->
  <link rel="stylesheet" href="https://your-project.vercel.app/style.css" />
</head>
<body>
  <h1>Witaj na mojej stronie</h1>

  <!-- Widget JS with config -->
  <script>
    window.SUM_CHATBOT_CONFIG = {
      apiUrl: 'https://sum-chatbot-api.railway.app',
      theme: 'light'
    };
  </script>
  <script src="https://your-project.vercel.app/chat-widget.iife.js"></script>
</body>
</html>
```

### 3.2 Na WordPress (via Theme Header)
```php
<!-- W wp-content/themes/your-theme/header.php -->
<link rel="stylesheet" href="https://your-project.vercel.app/style.css" />

<script>
  window.SUM_CHATBOT_CONFIG = {
    apiUrl: 'https://sum-chatbot-api.railway.app',
    theme: 'light'
  };
</script>
<script src="https://your-project.vercel.app/chat-widget.iife.js" defer></script>
```

### 3.3 Ustawienia Widgetu
```javascript
window.SUM_CHATBOT_CONFIG = {
  apiUrl: 'https://sum-chatbot-api.railway.app',  // Zmień na swój Railway URL
  theme: 'light'  // lub 'dark'
};
```

---

## STEP 4: Automatyczne Deploye (CI/CD)

### 4.1 GitHub Actions (opcjonalnie)
- Każdy git push → auto-deploy na Railway + Vercel
- Plik: `.github/workflows/deploy.yml`

### 4.2 Railway + Vercel Auto-Deploy
- Railway: automatycznie deployuje na push do `master`
- Vercel: automatycznie deployuje na push do `master`
- Nie trzeba nic dodatkowego!

---

## STEP 5: Testowanie

### 5.1 Test API (Railway)
```bash
curl -X POST https://sum-chatbot-api.railway.app/api/chat/message \
  -H "Content-Type: application/json" \
  -d '{"message": "ile kosztuje akademik"}'
```

### 5.2 Test Widget (Vercel)
- Otwórz: https://your-project.vercel.app
- Powinien się wyświetlić widget bez błędów

### 5.3 Test Embeded Widget
```html
<script>
  window.SUM_CHATBOT_CONFIG = {
    apiUrl: 'https://sum-chatbot-api.railway.app',
    theme: 'light'
  };
</script>
<script src="https://your-project.vercel.app/chat-widget.iife.js"></script>
```
- Otwórz HTML w przeglądarce
- Widget powinien się pojawić w prawym dolnym rogu

---

## Troubleshooting

### Widget nie łączy się z API
- ✅ Sprawdź czy `ALLOWED_ORIGINS` na Railway zawiera domenę Vercel
- ✅ Check CORS headers: `Access-Control-Allow-Origin`

### Railway build fails
```bash
# Debug lokalnie
cd chatbot/artifacts/api-server
pnpm install
pnpm build
node dist/app.js
```

### Vercel build fails
```bash
# Debug lokalnie
cd chatbot/chat-widget
pnpm install
pnpm build
ls dist/
```

### API timeout
- Railway free tier — może być powolne
- Upgrade na Starter plan

---

## Ważne URLs do zapamiętania

| Komponent | URL |
|-----------|-----|
| Backend API | `https://sum-chatbot-api.railway.app` |
| Frontend | `https://your-project.vercel.app` |
| Widget JS | `https://your-project.vercel.app/chat-widget.iife.js` |
| Widget CSS | `https://your-project.vercel.app/style.css` |
| GitHub | `https://github.com/nocode2026/anythingllm_bot` |

---

## Następne Kroki

1. Deploy na Railway ✅
2. Deploy na Vercel ✅
3. Osadź widget na stronie SUM
4. Skonfiguruj CORS w API
5. Test end-to-end
6. Monitoruj logi na Railway + Vercel
