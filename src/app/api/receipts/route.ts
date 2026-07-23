import { NextResponse } from "next/server";
import { initDb, queryAll, normalizeReceiptSummary } from "@/lib/db";

export async function GET() {
  try {
    initDb();
    const records = queryAll();
    const receipts = records.map(normalizeReceiptSummary);
    return NextResponse.json({ receipts });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
