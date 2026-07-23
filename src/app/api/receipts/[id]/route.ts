import { NextRequest, NextResponse } from "next/server";
import { initDb, updateRecord, queryOne, normalizeReceipt } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    initDb();
    const record = queryOne(id);
    if (!record) {
      return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    }
    return NextResponse.json({ receipt: normalizeReceipt(record) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    initDb();
    const now = new Date().toISOString();

    updateRecord(id, {
      merchant: body.merchant,
      date: body.date,
      line_items: JSON.stringify(body.lineItems || []),
      subtotal: body.subtotal || 0,
      tax: body.tax || 0,
      discount: body.discount || 0,
      tip: body.tip || 0,
      total: body.total || 0,
      status: "corrected",
      updated_at: now,
    });

    const record = queryOne(id);
    return NextResponse.json({ receipt: normalizeReceipt(record) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
