# Receipt Reader

An archived receipt parsing demo built with Next.js, TypeScript, and Tailwind CSS. Upload a JPEG or PNG receipt, review the extracted fields, correct them, and save the result to a local JSON file.

## Run locally

Requires Node.js 20.9 or newer and a Gemini API key. A Groq key enables a fallback parser.

```bash
npm ci
cp .env.example .env.local
# Set GEMINI_API_KEY in .env.local, and optionally GROQ_API_KEY
npm run dev
```

Open http://localhost:3000. Run `npm run lint` and `npm run build` to check the project.

The model IDs in `.env.example` can be changed with `GEMINI_MODEL` and `GROQ_MODEL`. Parsing depends on external model availability, API access, and image quality. Always review extracted amounts and dates.

## How it works

- `POST /api/upload` accepts a JPEG or PNG image as a base64 data URL (or raw base64), up to 5 MB. It uses Gemini for structured extraction and tries Groq if Gemini fails and a Groq key is configured.
- `GET /api/receipts` lists saved receipt summaries. `GET /api/receipts/:id` returns a saved receipt. `PUT /api/receipts/:id` saves corrected fields.
- The interface lets you edit merchant, date, line items, subtotal, tax, discount, tip, and total. It flags mismatches between the total and breakdown and between item amounts and subtotal.

## Data and deployment limits

The app assumes INR for every receipt. It has no authentication: anyone who can access a running deployment can upload receipts and read or edit saved receipts, including their images. Use only test data in a public deployment.

Local storage is `src/data/receipts.json`. On Vercel, storage uses `/tmp`, which is temporary and isolated per function instance. History can disappear or differ between requests. This demo needs authentication and durable private storage before use with personal receipts.

## License

[MIT](LICENSE)
