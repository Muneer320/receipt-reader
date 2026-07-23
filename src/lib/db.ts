import fs from "fs";
import path from "path";

const DATA_DIR = process.env.VERCEL
  ? path.join("/tmp", "receipt-reader")
  : path.join(process.cwd(), "src", "data");

const DATA_FILE = path.join(DATA_DIR, "receipts.json");

interface ReceiptRecord {
  id: string;
  image_base64: string;
  raw_llm: string;
  merchant: string;
  date: string;
  line_items: string;
  subtotal: number;
  tax: number;
  discount: number;
  tip: number;
  total: number;
  currency: string;
  status: string;
  created_at: string;
  updated_at: string;
}

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readAll(): ReceiptRecord[] {
  ensureDir();
  if (!fs.existsSync(DATA_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function writeAll(records: ReceiptRecord[]) {
  ensureDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(records, null, 2), "utf-8");
}

export function initDb(): void {
  ensureDir();
  if (!fs.existsSync(DATA_FILE)) writeAll([]);
}

export function getDb() {
  return { readAll, writeAll };
}

export function queryAll(): Record<string, any>[] {
  return readAll().sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function queryOne(id: string): Record<string, any> | null {
  return readAll().find((r) => r.id === id) || null;
}

export function insertRecord(record: ReceiptRecord) {
  const records = readAll();
  records.push(record);
  writeAll(records);
}

export function updateRecord(id: string, updates: Partial<ReceiptRecord>) {
  const records = readAll();
  const idx = records.findIndex((r) => r.id === id);
  if (idx === -1) return;
  records[idx] = { ...records[idx], ...updates };
  writeAll(records);
}

/** Normalize a DB record into camelCase API shape with deserialized line_items */
export function normalizeReceipt(record: Record<string, any> | null | undefined): Record<string, any> | null | undefined {
  if (!record) return record;
  return {
    id: record.id,
    merchant: record.merchant,
    date: record.date,
    lineItems: typeof record.line_items === "string"
      ? JSON.parse(record.line_items || "[]")
      : record.line_items || [],
    subtotal: record.subtotal || 0,
    tax: record.tax || 0,
    discount: record.discount || 0,
    tip: record.tip || 0,
    total: record.total || 0,
    currency: record.currency || "INR",
    status: record.status || "parsed",
    imageBase64: record.image_base64,
    rawLlm: record.raw_llm,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

/** Normalize a list of records for the summary list */
export function normalizeReceiptSummary(record: Record<string, any> | null | undefined): Record<string, any> | null | undefined {
  if (!record) return record;
  return {
    id: record.id,
    merchant: record.merchant,
    date: record.date,
    total: record.total,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}
