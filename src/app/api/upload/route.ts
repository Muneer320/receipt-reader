import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { initDb, insertRecord, queryOne, normalizeReceipt } from "@/lib/db";
import { analyzeReceipt } from "@/lib/gemini";
import { analyzeWithGroq } from "@/lib/groq";

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const imageBase64 = body.image;
    if (!imageBase64 || typeof imageBase64 !== "string") {
      return NextResponse.json({ error: "Missing or invalid image" }, { status: 400 });
    }

    initDb();

    let analysis;
    try {
      analysis = await analyzeReceipt(imageBase64);
    } catch (geminiError) {
      const msg = geminiError instanceof Error ? geminiError.message : String(geminiError);
      if (msg.includes("429") || msg.includes("quota") || msg.includes("Too Many Requests")) {
        console.warn("Gemini rate limited, falling back to Groq");
        analysis = await analyzeWithGroq(imageBase64);
      } else {
        throw geminiError;
      }
    }

    const id = randomUUID();
    const now = new Date().toISOString();

    insertRecord({
      id,
      image_base64: imageBase64,
      raw_llm: JSON.stringify(analysis),
      merchant: analysis.merchant || "",
      date: analysis.date || "",
      line_items: JSON.stringify(analysis.lineItems || []),
      subtotal: analysis.subtotal || 0,
      tax: analysis.tax || 0,
      discount: analysis.discount || 0,
      tip: analysis.tip || 0,
      total: analysis.total || 0,
      currency: "INR",
      status: "parsed",
      created_at: now,
      updated_at: now,
    });

    const receipt = queryOne(id);
    return NextResponse.json({ receipt: normalizeReceipt(receipt) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Upload error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
