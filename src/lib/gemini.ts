import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn("GEMINI_API_KEY is not set");
}

const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export interface LineItem {
  name: string;
  amount: number;
}

export interface ReceiptAnalysis {
  merchant: string;
  date: string;
  lineItems: LineItem[];
  subtotal: number;
  tax: number;
  discount: number;
  tip: number;
  total: number;
}

const RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT as const,
  properties: {
    merchant: { type: SchemaType.STRING as const, description: "Store or merchant name" },
    date: { type: SchemaType.STRING as const, description: "Date in YYYY-MM-DD format" },
    lineItems: {
      type: SchemaType.ARRAY as const,
      items: {
        type: SchemaType.OBJECT as const,
        properties: {
          name: { type: SchemaType.STRING as const, description: "Item name" },
          amount: { type: SchemaType.NUMBER as const, description: "Item price" },
        },
        required: ["name", "amount"],
      },
    },
    subtotal: { type: SchemaType.NUMBER as const, description: "Subtotal before tax" },
    tax: { type: SchemaType.NUMBER as const, description: "Tax amount" },
    discount: { type: SchemaType.NUMBER as const, description: "Discount amount (0 if none)" },
    tip: { type: SchemaType.NUMBER as const, description: "Tip amount (0 if none)" },
    total: { type: SchemaType.NUMBER as const, description: "Grand total" },
  },
  required: ["merchant", "date", "lineItems", "subtotal", "tax", "discount", "tip", "total"],
};

const SYSTEM_PROMPT = `Extract receipt data as structured JSON. Line items are purchasable products or services only — do not include subtotal, tax, discount, tip, or total in line items. Set discount and tip to 0 if not present.`;

export async function analyzeReceipt(imageBase64: string): Promise<ReceiptAnalysis> {
  if (!genAI) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    systemInstruction: SYSTEM_PROMPT,
  });

  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: cleanBase64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.1,
    },
  });

  const text = result.response.text();

  // With responseSchema, Gemini always returns valid JSON matching the schema.
  // But we still parse safely in case of edge cases.
  try {
    const parsed = JSON.parse(text);

    // Coerce shape — defensive even with schema enforcement
    return {
      merchant: typeof parsed.merchant === "string" ? parsed.merchant : "",
      date: typeof parsed.date === "string" ? parsed.date : "",
      lineItems: Array.isArray(parsed.lineItems)
        ? parsed.lineItems
            .filter((item: any) => item && typeof item.name === "string")
            .map((item: any) => ({
              name: item.name,
              amount: typeof item.amount === "number" ? item.amount : 0,
            }))
        : [],
      subtotal: typeof parsed.subtotal === "number" ? parsed.subtotal : 0,
      tax: typeof parsed.tax === "number" ? parsed.tax : 0,
      discount: typeof parsed.discount === "number" ? parsed.discount : 0,
      tip: typeof parsed.tip === "number" ? parsed.tip : 0,
      total: typeof parsed.total === "number" ? parsed.total : 0,
    };
  } catch (e) {
    console.error("Gemini returned invalid JSON despite responseSchema:", text.slice(0, 200));
    throw new Error("Failed to parse Gemini response");
  }
}
