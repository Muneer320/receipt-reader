import { ReceiptAnalysis } from "@/lib/gemini";

export async function analyzeWithGroq(imageBase64: string): Promise<ReceiptAnalysis> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not set");

  const clean = imageBase64.replace(/^data:image\/\w+;base64,/, "");

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "qwen/qwen3.6-27b",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "You are a receipt parser. Extract the following from this receipt image: merchant name, date, line items (each with name and amount), subtotal, tax, discount, tip, and total amount. Return ONLY valid JSON. No markdown, no code fences, no explanations. Use this exact JSON structure: {\"merchant\": \"\", \"date\": \"YYYY-MM-DD\", \"lineItems\": [{\"name\": \"\", \"amount\": 0.0}], \"subtotal\": 0.0, \"tax\": 0.0, \"discount\": 0.0, \"tip\": 0.0, \"total\": 0.0}",
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${clean}`,
                detail: "low",
              },
            },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Groq API error: ${response.status} ${text}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || "";

  // Strategy 1: Try direct JSON parse
  const trimmed = text.trim();
  try {
    return coerceShape(JSON.parse(trimmed));
  } catch {
    // Strategy 2: Extract from markdown code block
    const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      try {
        return coerceShape(JSON.parse(codeBlockMatch[1].trim()));
      } catch {
        // fall through
      }
    }
    // Strategy 3: Find the first JSON object
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return coerceShape(JSON.parse(jsonMatch[0]));
      } catch {
        // fall through
      }
    }
  }

  console.error("Groq raw response:", text.slice(0, 500));
  throw new Error("Groq returned invalid JSON: " + text.slice(0, 200));
}

function coerceShape(parsed: any): ReceiptAnalysis {
  if (typeof parsed.merchant !== "string") parsed.merchant = "";
  if (typeof parsed.date !== "string") parsed.date = "";
  if (!Array.isArray(parsed.lineItems)) parsed.lineItems = [];
  if (typeof parsed.subtotal !== "number") parsed.subtotal = 0;
  if (typeof parsed.tax !== "number") parsed.tax = 0;
  if (typeof parsed.discount !== "number") parsed.discount = 0;
  if (typeof parsed.tip !== "number") parsed.tip = 0;
  if (typeof parsed.total !== "number") parsed.total = 0;

  parsed.lineItems = parsed.lineItems
    .filter((item: any) => item && typeof item.name === "string")
    .map((item: any) => ({
      name: item.name,
      amount: typeof item.amount === "number" ? item.amount : 0,
    }));

  return parsed;
}
