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
    initDb();
    if (!queryOne(id)) {
      return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    }
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const amounts = ["subtotal", "tax", "discount", "tip", "total"] as const;
    const valid = body && typeof body === "object" &&
      typeof body.merchant === "string" && typeof body.date === "string" &&
      Array.isArray(body.lineItems) &&
      body.lineItems.every((item: unknown) => item !== null && typeof item === "object" &&
        typeof (item as { name?: unknown }).name === "string" &&
        typeof (item as { amount?: unknown }).amount === "number" &&
        Number.isFinite((item as { amount: number }).amount)) &&
      amounts.every((field) => {
        const value = body[field];
        return typeof value === "number" && Number.isFinite(value);
      });
    if (!valid) {
      return NextResponse.json({ error: "Invalid receipt fields" }, { status: 400 });
    }
    const now = new Date().toISOString();

    updateRecord(id, {
      merchant: body.merchant as string,
      date: body.date as string,
      line_items: JSON.stringify(body.lineItems),
      subtotal: body.subtotal as number,
      tax: body.tax as number,
      discount: body.discount as number,
      tip: body.tip as number,
      total: body.total as number,
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
