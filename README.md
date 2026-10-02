# Social Proof SaaS

Production-ready Node.js service that selects unpublished 5-star reviews, generates social copy with OpenAI, creates an image with Bannerbear, and publishes via each customer's Ayrshare key.

## Production deployment

The project is configured for Railway. Railway builds with `npm ci && npm run build`, starts `npm start`, and checks `/health`.

The service runs the weekly automation every Monday at 08:00 UTC and also exposes an authenticated `/api/cron` endpoint for an external scheduler or manual run.

### Required production secrets

Set these in Railway:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `BANNERBEAR_API_KEY`
- `BANNERBEAR_TEMPLATE_ID`
- `CRON_SECRET`
- `PORT` (Railway normally supplies this automatically)

Run `supabase.sql` in the Supabase SQL Editor before accepting customers.

## Local

```bash
npm ci
npm run build
npm start
```

Health check: `GET /health`
Manual automation: `POST /api/cron` with `Authorization: Bearer <CRON_SECRET>`.
