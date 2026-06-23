# Handoff 2026-06-23 — provider catalog + logos
HEAD: 1636eb8  Version: v1.11.0

## Shipped
- New `/providers` page: 18 providers in 4 category sections (AI Labs / IDE Tools / Platforms / Open Source) with search + AA Score/A–Z sort
- `ProviderTableCard`: tier column table (individual/pro), mobile stacked fallback, "API only" message for providers without plans
- `ProviderLogo`: 7 real SVGs (anthropic, openai, google, github, meta, mistral, deepseek); initials fallback for rest (microsoft absent from Simple Icons)
- Hero: text pills replaced with linked logo strips sorted by plan count
- Nav: "Providers" link added; `scripts/download-logos.sh` wired as `prebuild`

## State
v1.11.0 is live on Cloudflare Pages. All 18 provider cards render; logos verified live at `/logos/*.svg`. No open bugs.

## Next
1. Add `ProviderLogo` to `/providers/[id]` detail page header (currently shows text badge only)
2. Explore adding more provider data (Qwen, Kimi, Windsurf, xAI) — many have 0 plans and show "API only"
3. Wire `globalTiers` to show `free` tier if providers with free plans are added to scope
