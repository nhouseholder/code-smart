# Handoff — `/data/api/*.json` "Transform" Investigation (RESOLVED, no bug)

**Date:** 2026-06-16
**Version:** 1.1.0 (unchanged — no code change, no redeploy)
**HEAD SHA:** b454b06 (docs) · live deploy `c59ad6a9` (site commit `932a91c`)
**Live:** https://code-smart.pages.dev

## Outcome

| Item | Result |
|---|---|
| Reported issue | `/data/api/*.json` served a type-schema summary instead of raw JSON |
| Verdict | **FALSE ALARM — no bug.** Origin serves correct raw JSON to all real consumers. |
| Root cause | Local RTK token-compression hook (`~/.claude/settings.json:136` → `rtk-rewrite.sh`, rtk 0.31.0) |
| Fix | None needed for the site; corrected the stale handoff record + saved a guard memory |
| Redeploy | No — nothing in the site changed |

## What actually happened

RTK rewrites Bash commands before they run: `curl …x.json` → `rtk curl …`, `cat …x.json` → `rtk read …`. Both emit a token-saving type-schema shape (`string[74]`, `date?`, `float`, alphabetized keys). `head -c`, `python3 -c json.load`, `jq`, and `WebFetch` are **not** rewritten — which is why local file checks showed raw JSON while `curl` showed the schema. That inconsistency was the tell I initially misread as a stale-cache / edge transform.

**Proof origin is correct:** `WebFetch` of `…/data/api/methodology.json` (egresses from Anthropic, bypasses the Bash/RTK channel) returned valid raw JSON with quoted keys (`"version": "3.1"` …). Ruled out repo-side (no `functions/`, `_worker.js`, `_routes.json`, `_headers`; plain `wrangler.jsonc`) and confirmed `*.pages.dev` can't carry zone Transform Rules / Worker routes anyway.

## Verification (last steps)
- `rtk rewrite "curl …methodology.json"` → `rtk curl …` (confirms the rewrite mechanism)
- `WebFetch …/data/api/methodology.json` → raw JSON, quoted keys ✓
- `/freshness/` HTML 200 from `c59ad6a9` ✓ · deployment list shows `c59ad6a9` = Production, source `bc95a95`, 19 min old at check
- Local `out/data/api/methodology.json` → valid JSON (md5 `521a0314…`) ✓

## Diagnostic gotcha (carry forward)
To inspect any JSON endpoint/file truthfully: **WebFetch**, or bypass RTK — `command curl`, `rtk read --raw`, `head`, `jq`, `python`. Saved as memory `rtk-summarizes-json-in-bash.md`.

## Top 3 next priorities
1. **375px mobile pass** — `npx serve out`, spot-check all 8 routes for horizontal overflow + reduced-motion.
2. **Wire BenchmarkSparkline history** — accrue AA snapshots so model trend charts populate (currently "Not enough history").
3. **`/compare` polish** — difference-highlighting + filter UX on the 2–6 plan picker.
