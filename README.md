# Phone Partner Engine

Production-ready version of the Phone Partner Engine.

## Architecture
- **Frontend**: Existing dashboard (public/index.html) — preserved design & functionality
- **Backend**: Express + SQLite (server/index.js)
- **Bot API**: POST /api/stores with `x-api-key` header
- **Persistence**: SQLite file (survives restarts; use Postgres in true production)
- **Campaigns**: Approval required before Bland dialing

## Environment variables
- `BOT_API_KEY` — key the Grok Bot uses
- `ADMIN_API_KEY` — admin key
- `PORT` — default 3000
- `BLAND_API_KEY` — (add when wiring real Bland calls)

## Local run
```bash
npm install
BOT_API_KEY=your-bot-key ADMIN_API_KEY=your-admin-key npm start
```

## Deploy
- **Railway / Render**: Connect GitHub repo, set env vars, start command `npm start`
- **Static frontend alternative**: Host `public/` on Netlify/Cloudflare and point API calls to the backend URL

## Bot usage
```bash
curl -X POST https://your-domain/api/stores \
  -H "Content-Type: application/json" \
  -H "x-api-key: $BOT_API_KEY" \
  -d '[{"name":"Store","phone":"555-1234","city":"Brooklyn","state":"NY"}]'
```

Data persists across restarts. Redeploy keeps the SQLite file if the volume is persistent (Railway volumes / Render disks).
