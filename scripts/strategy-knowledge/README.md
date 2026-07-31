# YUX Strategy Knowledge Ingestion

Private ingestion pipeline for YUX Strategy Engine sources. The book and future strategy documents are transformed into internal records, reviewed concept cards, optional embeddings and retrieval logs.

The raw source stays `internal_only` by default. Client-facing agents receive compact, sanitized context packs only after cards/chunks are marked `client_safe` and approved.

## Requirements

- Node.js 18+.
- Backend/Postgres import credentials: `DATABASE_URL`. Run after backend migrations are applied.
- Optional PDF tools:
  - `pdftotext` for text extraction.
  - `pdftoppm` for page image generation.
- Optional real embeddings:
  - `JINA_API_KEY` when using `--provider jina`.

## Pipeline

```powershell
node scripts/strategy-knowledge/extract-pdf-pages.mjs --input "The Black Book.pdf" --out .strategy-work/pages.jsonl
node scripts/strategy-knowledge/clean-ocr.mjs --input .strategy-work/pages.jsonl --out .strategy-work/pages-clean.jsonl
node scripts/strategy-knowledge/chunk-sections.mjs --input .strategy-work/pages-clean.jsonl --out .strategy-work/chunks.jsonl
node scripts/strategy-knowledge/generate-page-images.mjs --input "The Black Book.pdf" --pages .strategy-work/pages-clean.jsonl --out .strategy-work/assets.jsonl
node scripts/strategy-knowledge/validate-concept-cards.mjs scripts/strategy-knowledge/example-concept-cards.json
node scripts/strategy-knowledge/embed-concept-cards.mjs --input scripts/strategy-knowledge/example-concept-cards.json --out .strategy-work/card-embeddings.jsonl
node scripts/strategy-knowledge/import-knowledge.mjs --documents .strategy-work/pages-clean.jsonl --chunks .strategy-work/chunks.jsonl --assets .strategy-work/assets.jsonl --cards scripts/strategy-knowledge/example-concept-cards.json --cardEmbeddings .strategy-work/card-embeddings.jsonl
```

Use `--provider jina --model jina-embeddings-v4` on `embed-concept-cards.mjs` only when `JINA_API_KEY` is configured. The default `mock` provider creates deterministic local embeddings for smoke tests and pipeline validation.

## Review Rules

- Raw chunks and page assets default to `internal_only`.
- Concept cards default to `requiresHumanReview: true`.
- Do not import long quoted passages into cards.
- Cards should describe YUX operational rules: problem, signals, questions, decision rules, anti-patterns and recommended actions.
- Every card must include `allowedAgentProfileKeys`, `stageTags` and `retrievalTags` so retrieval can stay narrow and cheap.

## Smoke Checks

```powershell
node scripts/strategy-knowledge/validate-concept-cards.mjs scripts/strategy-knowledge/example-concept-cards.json
node scripts/strategy-knowledge/chunk-sections.mjs --input scripts/strategy-knowledge/example-pages.jsonl --out .strategy-work/test-chunks.jsonl
```

Expected:

- `valid concept cards`
- `.strategy-work/test-chunks.jsonl` with at least one chunk.
