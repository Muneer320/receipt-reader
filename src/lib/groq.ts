import { ReceiptAnalysis } from "@/lib/gemini";

export async function analyzeWithGroq(imageBase64: string, mimeType: "image/jpeg" | "image/png" = "image/jpeg"): Promise<ReceiptAnalysis> {
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
      model: process.env.GROQ_MODEL || "qwen/qwen3.8-27b",
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
                url: `data:${mimeType};base64,${clean}`,
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

function coerceShape(input: unknown): ReceiptAnalysis {
  const parsed: Record<string, unknown> = input !== null && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown> : {};
  const amount = (key: string) => typeof parsed[key] === "number" && Number.isFinite(parsed[key])
    ? parsed[key] as number : 0;
  const lineItems = Array.isArray(parsed.lineItems) ? parsed.lineItems : [];
  return {
    merchant: typeof parsed.merchant === "string" ? parsed.merchant : "",
    date: typeof parsed.date === "string" ? parsed.date : "",
    lineItems: lineItems
      .filter((item: unknown): item is { name: string; amount?: unknown } =>
        !!item && typeof item === "object" && "name" in item && typeof item.name === "string")
      .map((item: { name: string; amount?: unknown }) => ({
        name: item.name,
        amount: typeof item.amount === "number" && Number.isFinite(item.amount) ? item.amount : 0,
      })),
    subtotal: amount("subtotal"),
    tax: amount("tax"),
    discount: amount("discount"),
    tip: amount("tip"),
    total: amount("total"),
  };
}
