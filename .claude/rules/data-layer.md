---
paths:
  - src/data/**
  - src/lib/data-loader.ts
  - src/lib/schema.ts
---
# Data Layer Rules
- Provider JSON files are the source of truth — never generate placeholder values
- Adding a provider requires BOTH: JSON file + static import in data-loader.ts PROVIDER_FILES
- After editing any provider JSON, run `pnpm validate` (Zod schema check) before committing
- Provenance field is mandatory on every data point — never strip it
- Zod schemas in `src/lib/schema.ts` must stay in sync with `src/types/index.ts`
- `computed-scores.json` (planned) is generated output — never hand-edit
