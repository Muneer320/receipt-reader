import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { initDb, insertRecord, queryOne, normalizeReceipt } from "@/lib/db";
import { analyzeReceipt } from "@/lib/gemini";
import { analyzeWithGroq } from "@/lib/groq";

export const maxDuration = 30;

function imageData(input: unknown): { base64: string; mimeType: "image/jpeg" | "image/png" } | null {
  if (typeof input !== "string") return null;
  const match = /^data:(image\/(?:jpeg|png));base64,(.*)$/.exec(input);
  const base64 = match ? match[2] : input;
  if (!base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return null;
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length === 0 || bytes.length > 5_000_000) return null;
  const mimeType = bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
    ? "image/jpeg" : bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ? "image/png" : null;
  if (!mimeType || (match && match[1] !== mimeType)) return null;
  return { base64, mimeType };
}

export async function POST(request: NextRequest) {
  try {
    let body: { image?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    if (typeof body?.image === "string" && body.image.length > 7_000_000) {
      return NextResponse.json({ error: "Image exceeds 5 MB limit" }, { status: 413 });
    }
    const image = imageData(body?.image);
    if (!image) {
      return NextResponse.json({ error: "Expected a JPEG or PNG image up to 5 MB" }, { status: 400 });
    }

    initDb();

    let analysis;
    try {
      analysis = await analyzeReceipt(image.base64, image.mimeType);
    } catch (geminiError) {
      if (process.env.GROQ_API_KEY) {
        console.warn("Gemini failed; trying Groq fallback");
        analysis = await analyzeWithGroq(image.base64, image.mimeType);
      } else {
        throw geminiError;
      }
    }

    const id = randomUUID();
    const now = new Date().toISOString();

    insertRecord({
      id,
      image_base64: image.base64,
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
