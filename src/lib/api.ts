export interface LineItem {
  name: string;
  amount: number;
}

export interface ParsedReceipt {
  id?: string;
  merchant: string;
  date: string;
  lineItems: LineItem[];
  subtotal: number;
  tax: number;
  discount: number;
  tip: number;
  total: number;
  currency?: string;
  status?: string;
  imageBase64?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SavedReceipt {
  id: string;
  merchant: string;
  date: string;
  total: number;
  createdAt: string;
  updatedAt: string;
}

const API_BASE = "/api";

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function uploadReceipt(imageBase64: string): Promise<ParsedReceipt> {
  const res = await fetch(`${API_BASE}/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: imageBase64 }),
  });
  const data = await handleResponse<{ receipt: ParsedReceipt }>(res);
  return data.receipt;
}

export async function updateReceipt(
  id: string,
  data: ParsedReceipt
): Promise<ParsedReceipt> {
  const res = await fetch(`${API_BASE}/receipts/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const responseData = await handleResponse<{ receipt: ParsedReceipt }>(res);
  return responseData.receipt;
}

export async function getReceipts(): Promise<SavedReceipt[]> {
  const res = await fetch(`${API_BASE}/receipts`);
  const data = await handleResponse<{ receipts: SavedReceipt[] }>(res);
  return data.receipts;
}

export async function getReceipt(id: string): Promise<ParsedReceipt> {
  const res = await fetch(`${API_BASE}/receipts/${id}`);
  const data = await handleResponse<{ receipt: ParsedReceipt }>(res);
  return data.receipt;
}
