# Receipt Reader

> **A small full-stack app that turns a photo of a receipt into structured data.**  
> Built for the Handa Uncle engineering take-home assignment.

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-15-000000?style=flat&logo=next.js&logoColor=white" alt="Next.js 15"/>
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat&logo=typescript&logoColor=white" alt="TypeScript 5"/>
  <img src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=flat&logo=tailwind-css&logoColor=white" alt="Tailwind CSS"/>
  <img src="https://img.shields.io/badge/Gemini_2.0-4285F4?style=flat&logo=google&logoColor=white" alt="Gemini 2.0"/>
  <img src="https://img.shields.io/badge/Groq-FF6600?style=flat&logo=groq&logoColor=white" alt="Groq Fallback"/>
  <img src="https://img.shields.io/badge/Structured_Output-4285F4?style=flat&logo=google&logoColor=white" alt="Structured Output"/>
</p>

---

## Architecture

```mermaid
graph LR
    U[User] -->|Upload Photo| F[Next.js Frontend]
    F -->|Compress 1200px| A[API /api/upload]
    A -->|Try Primary| G[Gemini 2.0 Flash]
    A -->|Fallback 429| GQ[Groq qwen3.6-27b]
    G -->|responseSchema JSON| A
    GQ -->|Structured JSON| A
    A -->|Persist| DB[(JSON File)]
    F -->|Fetch List| R[API /api/receipts]
    F -->|Save Corrections| P[API /api/receipts/:id]

    style U fill:#f5f5f5,stroke:#333
    style F fill:#e8f5e9,stroke:#2e7d32
    style A fill:#fff3e0,stroke:#e65100
    style G fill:#e3f2fd,stroke:#1565c0
    style GQ fill:#fce4ec,stroke:#880e4f
    style DB fill:#f3e5f5,stroke:#6a1b9a
```

## What I built

A single-page web app that accepts a receipt photo, extracts merchant name, date, line items, subtotal, tax, discount, tip, and total using **Gemini 2.0 Flash** (with **Groq fallback** when rate-limited), and presents the result as editable fields with deterministic validation hints. The user corrects what the LLM got wrong, saves the corrected version, and can recall it later from the receipt history list.

### Correction flow (the actual product)

| Stage | What happens |
|---|---|
| **Upload** | Drag-and-drop or click. Image auto-compressed to 1200px client-side. |
| **Parse** | Gemini extracts fields via `responseSchema` (guaranteed JSON). Falls back to Groq on quota limit. |
| **Review** | Click thumbnail to zoom. Shows validation hints: ✓ merchant present, ⚠️ total mismatch, etc. |
| **Correct** | Inline editing on every field. Subtotal, tax, discount, tip all editable. Add/remove line items. |
| **Save** | Corrected version persisted to JSON file. Receipt appears in history list. |

---

## The biggest tradeoffs I made

| Tradeoff | Chosen approach | Why | What it costs |
|---|---|---|---|
| **Database** | JSON file storage | Zero setup, zero native dependencies, works on all platforms. | Doesn't scale to production. Migrating to Postgres: ~20 min. |
| **Image storage** | Base64 in JSON file | No file system setup, no cleanup strategy, works cross-platform. | File grows large. Wrong for production. |
| **Parsing strategy** | Single prompt with `responseSchema` | Guaranteed valid JSON, no regex parsing, simpler than multi-step OCR. | Fails on rotated/unusual receipts. Correction UI catches the rest. |
| **LLM fallback** | Gemini → Groq | Free tier quota independence. No single vendor lock-in. | Two API keys needed. Different model capabilities. |
| **Validation** | Arithmetic checks over model-reported scores | Deterministic and useful (total vs subtotal+tax+tip-discount). Vision models cannot reliably self-calibrate their accuracy. | Doesn't catch semantic errors (wrong date format, etc.). |

## Where I used an LLM

- **Gemini 2.0 Flash** — Primary receipt parser. Uses `responseMimeType: 'application/json'` with a `responseSchema` that defines the exact fields: merchant, date, lineItems, subtotal, tax, discount, tip, total. This guarantees valid JSON output, eliminates regex parsing, and allows a compact ~50 token system instruction instead of a lengthy prompt.

- **Groq (qwen/qwen3.6-27b)** — Transparent fallback when Gemini rate limit is hit (429). Same output format, automatic retry.

- **Claude Code (Hermes Agent)** — Project scaffolding, Tailwind styling, prompt refinement, README. I wrote the data model, parsing logic, and correction UX myself. Every AI-generated file was reviewed before commit.

## What I'd do with another week

1. **Receipt categorization** — Tag receipts by category (groceries, dining, transport) and show spending breakdowns. A finance platform without categorization is a digital shoebox.

2. **Multi-format support** — Restaurant bills with tips, itemized receipts with discounts, digital receipts all differ. Format-specific prompts with a content router would cover more cases.

3. **Cloud persistence** — Replace the JSON file with Supabase so receipts sync across devices and survive cache clears.

4. **Batch upload** — Photograph a stack of receipts and process sequentially. Saves significant time for expense reporting.

## One thing I'd push back on in the spec

The spec says "assume a single user; no authentication." I understand the scope reasoning. But a receipt parser that doesn't connect to anything is a utility, not a product. The most valuable version would: (a) sync categorized receipts to a personal finance dashboard, (b) let you set budgets per category, and (c) alert you when spending exceeds thresholds. Without those connections, the user corrects their receipt and then has a corrected receipt with nowhere to go.

Even a minimal "tag and summarize" feature showing "you spent ₹X on food this month" after a few corrections would make the product feel complete rather than like a demo.

---

## Getting started

### Prerequisites

- **Node.js** 18+
- **npm** or **yarn**
- A **Gemini API key** from [Google AI Studio](https://aistudio.google.com/apikey) (free)
- (Optional) A **Groq API key** from [Groq Cloud](https://console.groq.com/keys) (free, for fallback)

### Run locally

```bash
# 1. Clone and install
git clone https://github.com/Muneer320/receipt-reader.git
cd receipt-reader
npm install

# 2. Add API keys
cp .env.example .env
# Edit .env: add your GEMINI_API_KEY (and GROQ_API_KEY if desired)

# 3. Start
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Yes | Google Gemini API key (AI Studio) |
| `GROQ_API_KEY` | No | Groq API key (fallback for rate limits) |

---

## API reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/upload` | Upload receipt image, returns parsed data |
| `GET` | `/api/receipts` | List all saved receipts |
| `GET` | `/api/receipts/:id` | Get single receipt with line items |
| `PUT` | `/api/receipts/:id` | Update corrected receipt fields |

### POST /api/upload

```json
// Request
{ "image": "data:image/jpeg;base64,..." }

// Response
{
  "receipt": {
    "id": "uuid",
    "merchant": "Store Name",
    "date": "2026-07-21",
    "lineItems": [
      { "name": "Item A", "amount": 22.00 },
      { "name": "Item B", "amount": 20.50 }
    ],
    "subtotal": 42.50,
    "tax": 0.00,
    "discount": 0.00,
    "tip": 0.00,
    "total": 42.50,
    "currency": "INR",
    "status": "parsed",
    "createdAt": "2026-07-21T12:00:00.000Z",
    "updatedAt": "2026-07-21T12:00:00.000Z"
  }
}
```

### PUT /api/receipts/:id

```json
// Request
{
  "merchant": "Corrected Name",
  "date": "2026-07-21",
  "lineItems": [{ "name": "Item A", "amount": 22.00 }],
  "subtotal": 42.50,
  "tax": 0.00,
  "total": 42.50
}

// Response
{
  "receipt": {
    "id": "uuid",
    "merchant": "Corrected Name",
    "status": "corrected"
  }
}
```

---

## Tech stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 15 (App Router) |
| **Language** | TypeScript 5 |
| **Storage** | JSON file (zero native deps, no compilation required) |
| **Primary LLM** | Google Gemini 2.0 Flash (structured output via `responseSchema`) |
| **Fallback LLM** | Groq (qwen/qwen3.6-27b) |
| **Styling** | Tailwind CSS (warm paper palette) |
| **No Docker, no deployment, no auth** | — |

---

## Project structure

```
receipt-reader/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── upload/route.ts      # POST — parse receipt
│   │   │   └── receipts/
│   │   │       ├── route.ts          # GET — list receipts
│   │   │       └── [id]/route.ts    # GET/PUT — single receipt
│   │   ├── globals.css               # Tailwind + warm paper theme
│   │   ├── layout.tsx                # Root layout
│   │   └── page.tsx                  # Main SPA page
│   ├── lib/
│   │   ├── api.ts                    # Frontend API client
│   │   ├── db.ts                     # JSON file storage + helpers
│   │   ├── gemini.ts                 # Gemini integration (structured output)
│   │   └── groq.ts                   # Groq fallback integration
├── .env.example                      # API key template
├── .gitignore
├── .npmrc
├── next.config.ts
├── package.json
├── tsconfig.json
└── README.md
```

---

## License

MIT — built for evaluation purposes.
