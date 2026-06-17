# Deployment Guide

## Architecture

Code Smart is a **100% static Next.js site** (App Router, `output: "export"`). The build process:

1. Runs the **data pipeline**: scrape → normalize → seed AA → value estimates → rankings → static API
2. Runs **Next.js build** which pre-renders all pages to HTML
3. Outputs a `out/` directory of static files
4. Deploys to **Cloudflare Pages**

There is **no runtime server, no database queries at runtime, no API routes**. Every page is pre-built HTML + client-side JS. Static API JSON files in `/data/api/*` are served directly from the CDN.

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 22+ | Required for build scripts |
| pnpm | 9+ | Package manager |
| Cloudflare Pages account | — | Free tier sufficient |
| Wrangler CLI | 4+ | For deployment |

---

## Local build

```bash
# 1. Install dependencies
pnpm install

# 2. Set up environment
cp .env.example .env

# 3. Full build (pipeline + Next.js)
pnpm build
```

This produces the `out/` directory with the complete static site.

### Build pipeline steps

| Step | Script | Description |
|------|--------|-------------|
| 1. stale-check | `scripts/stale-check.ts` | Warn if provider data is stale |
| 2. scrape:providers | `scripts/scrape-providers.ts` | Fetch latest provider data |
| 3. normalize:usage | `scripts/normalize-usage.ts` | Normalize usage limits |
| 4. seed-aa | `scripts/seed-aa-scores.ts` | Seed AA model scores (7-day cache) |
| 5. value-estimates | `scripts/generate-model-value-estimates.ts` | Compute QAMU and WMQ |
| 6. rankings | `scripts/generate-rankings.ts` | Compute 10 ranking views |
| 7. static-api | `scripts/generate-static-api.ts` | Generate JSON API artifacts |
| 8. validate | `scripts/validate-data.ts` | Schema validation |
| 9. quality-check | `scripts/data-quality-check.ts` | Data quality checks |

---

## Deploy to Cloudflare Pages

```bash
# Deploy the out/ directory
wrangler pages deploy out --project-name=code-smart
```

The site is live at: https://code-smart.pages.dev

### Verify deployment

```bash
# Check version endpoint
curl -s https://code-smart.pages.dev/data/api/methodology.json | grep version

# Check homepage loads
curl -s -o /dev/null -w "%{http_code}" https://code-smart.pages.dev/
# → 200

# Check rankings API
curl -s https://code-smart.pages.dev/data/api/rankings.json | head -c 100
```

---

## Rollback procedure

Cloudflare Pages keeps a deployment history in the dashboard:

1. Go to Cloudflare Dashboard → Workers & Pages → code-smart
2. Click the **Deployments** tab
3. Find the previous working deployment
4. Click the **• • •** menu → **Roll back to this deployment**

Rollback takes ~30 seconds. No code changes needed.

---

## CI/CD

GitHub Actions workflow (`.github/workflows/daily-check.yml`) runs daily at 09:00 UTC:

- Downloads persisted DB from previous run
- Runs validation, DB migrations, seed, stale-check
- Creates a GitHub issue if stale data is found
- Runs **typecheck**, **lint**, **unit tests**, and **data quality checks**
- Builds the site

Manual trigger available via **Actions** tab → **Daily Data Check** → **Run workflow**.

---

## Troubleshooting

| Problem | Likely cause | Fix |
|---------|-------------|-----|
| `wrangler pages deploy` fails with `SocketError` | Local TLS bug (LibreSSL vs OpenSSL) | Prefix with `NODE_TLS_REJECT_UNAUTHORIZED=0` |
| `out/` directory is missing | Build failed | Run `pnpm build` and check for errors |
| Pipeline steps fail with `PID lock` | Previous run crashed | Delete `data/.pipeline.lock` and retry |
| AA scores stale | AA cache not refreshed | Run `pnpm pipeline:daily --refresh-aa` |
