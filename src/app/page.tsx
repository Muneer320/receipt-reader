"use client";

import { useEffect, useRef, useState } from "react";
import {
  getReceipt,
  getReceipts,
  ParsedReceipt,
  SavedReceipt,
  updateReceipt,
  uploadReceipt,
} from "@/lib/api";

interface ReceiptFormData {
  merchant: string;
  date: string;
  lineItems: { id: string; name: string; amount: number }[];
  subtotal: number;
  tax: number;
  discount: number;
  tip: number;
  total: number;
}

interface ValidationFlags {
  totalMatchesItems: boolean | null;
  merchantPresent: boolean;
  datePresent: boolean;
  hasItems: boolean;
  totalPresent: boolean;
}

function validateReceipt(data: ReceiptFormData): ValidationFlags {
  const expected = data.subtotal + data.tax + data.tip - data.discount;
  const totalMatchesItems =
    data.total > 0
      ? Math.abs(data.total - expected) < 0.5
      : null;
  return {
    totalMatchesItems,
    merchantPresent: data.merchant.trim().length > 0,
    datePresent: data.date.trim().length > 0,
    hasItems: data.lineItems.length > 0,
    totalPresent: data.total > 0,
  };
}

function emptyReceipt(): ReceiptFormData {
  return {
    merchant: "",
    date: "",
    lineItems: [{ id: "new-0", name: "", amount: 0 }],
    subtotal: 0,
    tax: 0,
    discount: 0,
    tip: 0,
    total: 0,
  };
}

function toISODate(value: string): string {
  if (!value) return "";
  const iso = new Date(value);
  if (Number.isNaN(iso.getTime())) return value;
  return iso.toISOString().split("T")[0];
}

function formatCurrency(value: number): string {
  return "₹" + (Number.isFinite(value) ? value : 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function parseAmount(value: string): number {
  const num = parseFloat(value);
  return Number.isNaN(num) ? 0 : num;
}

function calculateItemsSum(items: ReceiptFormData["lineItems"]): number {
  return items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
}

function calculateComputedTotal(data: ReceiptFormData): number {
  const computed = data.subtotal + data.tax + data.tip - data.discount;
  return computed < 0 ? 0 : computed;
}

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [isZoomed, setIsZoomed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const [receipt, setReceipt] = useState<ReceiptFormData>(emptyReceipt());
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const [savedReceipts, setSavedReceipts] = useState<SavedReceipt[]>([]);
  const [isLoadingSaved, setIsLoadingSaved] = useState(false);
  const [savedError, setSavedError] = useState<string | null>(null);

  const validation = validateReceipt(receipt);

  useEffect(() => {
    loadSavedReceipts();
  }, []);

  async function loadSavedReceipts() {
    setIsLoadingSaved(true);
    setSavedError(null);
    try {
      const receipts = await getReceipts();
      setSavedReceipts(receipts);
    } catch (err) {
      setSavedError(err instanceof Error ? err.message : "Failed to load receipts");
    } finally {
      setIsLoadingSaved(false);
    }
  }

  function resetSaveStatus() {
    setSaveStatus("idle");
    setSaveError(null);
  }

  function handleFileSelect(file: File) {
    if (!file.type.startsWith("image/")) {
      setParseError("Please upload a JPG or PNG image.");
      return;
    }
    setParseError(null);
    resetSaveStatus();

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setImagePreview(result);
      compressImage(result, 1200, 85).then((compressed) => {
        setImageBase64(compressed.split(",")[1]);
      });
    };
    reader.readAsDataURL(file);
  }

  function compressImage(
    dataUrl: string,
    maxDim: number,
    quality: number
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const ratio = maxDim / Math.max(width, height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = dataUrl;
    });
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  }

  async function handleParse() {
    if (!imageBase64) return;
    setIsParsing(true);
    setParseError(null);
    resetSaveStatus();
    try {
      const parsed = await uploadReceipt(imageBase64);
      applyParsedReceipt(parsed);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Failed to parse receipt");
    } finally {
      setIsParsing(false);
    }
  }

  function normalizeLineItems(parsedItems?: ParsedReceipt["lineItems"]): ReceiptFormData["lineItems"] {
    if (!parsedItems?.length) return [{ id: "new-0", name: "", amount: 0 }];
    return parsedItems.map((item) => ({
      id: crypto.randomUUID(),
      name: item.name,
      amount: item.amount,
    }));
  }

  function applyParsedReceipt(parsed: ParsedReceipt) {
    setReceiptId(parsed.id || null);
    setReceipt({
      merchant: parsed.merchant || "",
      date: toISODate(parsed.date || ""),
      lineItems: normalizeLineItems(parsed.lineItems),
      subtotal: typeof parsed.subtotal === "number" ? parsed.subtotal : 0,
      tax: typeof parsed.tax === "number" ? parsed.tax : 0,
      discount: typeof parsed.discount === "number" ? parsed.discount : 0,
      tip: typeof parsed.tip === "number" ? parsed.tip : 0,
      total: typeof parsed.total === "number" ? parsed.total : 0,
    });
  }

  function updateField<K extends keyof ReceiptFormData>(
    field: K,
    value: ReceiptFormData[K]
  ) {
    setReceipt((prev) => ({ ...prev, [field]: value }));
    resetSaveStatus();
  }

  function updateAmountField(field: "subtotal" | "tax" | "discount" | "tip" | "total", value: string) {
    setReceipt((prev) => ({ ...prev, [field]: parseAmount(value) }));
    resetSaveStatus();
  }

  function updateLineItem(
    index: number,
    patch: Partial<ReceiptFormData["lineItems"][number]>
  ) {
    setReceipt((prev) => {
      const next = prev.lineItems.map((item, i) =>
        i === index ? { ...item, ...patch } : item
      );
      return { ...prev, lineItems: next };
    });
    resetSaveStatus();
  }

  function addLineItem() {
    setReceipt((prev) => ({
      ...prev,
      lineItems: [...prev.lineItems, { id: crypto.randomUUID(), name: "", amount: 0 }],
    }));
    resetSaveStatus();
  }

  function removeLineItem(index: number) {
    setReceipt((prev) => {
      const next = prev.lineItems.filter((_, i) => i !== index);
      return {
        ...prev,
        lineItems: next.length ? next : [{ id: "item-0", name: "", amount: 0 }],
      };
    });
    resetSaveStatus();
  }

  async function handleSave() {
    if (!receiptId) {
      setSaveStatus("error");
      setSaveError("Receipt must be parsed before saving.");
      return;
    }
    setIsSaving(true);
    setSaveStatus("idle");
    setSaveError(null);
    try {
      await updateReceipt(receiptId, {
        merchant: receipt.merchant,
        date: receipt.date,
        lineItems: receipt.lineItems,
        subtotal: receipt.subtotal,
        tax: receipt.tax,
        discount: receipt.discount,
        tip: receipt.tip,
        total: receipt.total,
      });
      setSaveStatus("success");
      await loadSavedReceipts();
    } catch (err) {
      setSaveStatus("error");
      setSaveError(err instanceof Error ? err.message : "Failed to save receipt");
    } finally {
      setIsSaving(false);
    }
  }

  async function loadReceiptForEdit(id: string) {
    setIsParsing(true);
    setParseError(null);
    resetSaveStatus();
    try {
      const parsed = await getReceipt(id);
      applyParsedReceipt(parsed);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Failed to load receipt");
    } finally {
      setIsParsing(false);
    }
  }

  const FieldShell = ({
    children,
    label,
    htmlFor,
    hint,
    className = "",
  }: {
    children: React.ReactNode;
    label: string;
    htmlFor: string;
    hint?: React.ReactNode;
    className?: string;
  }) => (
    <div
      className={`rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 transition-colors focus-within:border-amber-400 focus-within:ring-1 focus-within:ring-amber-200 dark:border-stone-700 dark:bg-stone-900 dark:focus-within:border-amber-600 dark:focus-within:ring-amber-900 ${className}`}
    >
      <div className="mb-1 flex items-center justify-between">
        <label
          htmlFor={htmlFor}
          className="text-xs font-medium text-stone-600 dark:text-stone-400"
        >
          {label}
        </label>
        {hint && <span className="text-xs text-stone-500">{hint}</span>}
      </div>
      {children}
    </div>
  );

  const ValidationHint = ({
    ok,
    children,
  }: {
    ok: boolean | null;
    children: React.ReactNode;
  }) => {
    if (ok === null) {
      return (
        <span className="inline-flex items-center gap-1.5 text-sm text-stone-500">
          <span className="inline-flex h-2 w-2 rounded-full bg-stone-400" />
          {children}
        </span>
      );
    }
    return ok ? (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
            clipRule="evenodd"
          />
        </svg>
        {children}
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-400">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
            clipRule="evenodd"
          />
        </svg>
        {children}
      </span>
    );
  };

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8 text-center sm:text-left">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-50 sm:text-3xl">
          Receipt Parser
        </h1>
        <p className="mt-1 text-stone-700 dark:text-stone-300">
          Upload a receipt, review the parsed fields, correct anything that looks off, and save.
        </p>
      </header>

      {/* Upload Section */}
      <section className="mb-8 rounded-xl border border-stone-200 bg-amber-50 p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900 sm:p-6">
        <h2 className="mb-4 text-lg font-medium text-stone-900 dark:text-stone-100">
          1. Upload receipt
        </h2>

        {!imagePreview ? (
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
            }}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors ${
              isDragging
                ? "border-amber-500 bg-amber-100 dark:bg-amber-950/30"
                : "border-stone-300 bg-stone-50 hover:border-amber-400 dark:border-stone-700 dark:bg-stone-900/50 dark:hover:border-amber-600"
            }`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="mb-3 h-10 w-10 text-stone-500 dark:text-stone-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
              />
            </svg>
            <p className="text-sm font-medium text-stone-800 dark:text-stone-200">
              Drag & drop a receipt image
            </p>
            <p className="mt-1 text-xs text-stone-600 dark:text-stone-400">
              or click to browse JPG/PNG
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/jpg"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
              }}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="relative overflow-hidden rounded-lg border border-stone-200 bg-stone-100 dark:border-stone-700 dark:bg-stone-800">
              <button
                type="button"
                onClick={() => setIsZoomed(true)}
                className="block w-full cursor-zoom-in"
                aria-label="Open receipt image preview"
              >
                <img
                  src={imagePreview}
                  alt="Receipt preview"
                  className="max-h-80 w-full object-contain"
                />
              </button>
              <button
                type="button"
                onClick={() => {
                  setImagePreview(null);
                  setImageBase64(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="absolute right-2 top-2 rounded-full bg-stone-900/70 p-1.5 text-stone-50 hover:bg-stone-900"
                aria-label="Remove image"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
            <button
              type="button"
              onClick={handleParse}
              disabled={isParsing}
              className="inline-flex w-full items-center justify-center rounded-lg bg-amber-700 px-4 py-2.5 text-sm font-medium text-stone-50 transition-colors hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {isParsing ? (
                <>
                  <svg
                    className="mr-2 h-4 w-4 animate-spin"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Parsing…
                </>
              ) : (
                "Parse Receipt"
              )}
            </button>
          </div>
        )}

        {parseError && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
            {parseError}
          </div>
        )}
      </section>

      {/* Zoom Modal */}
      {isZoomed && imagePreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/90 p-4"
          onClick={() => setIsZoomed(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Receipt image preview"
        >
          <button
            type="button"
            onClick={() => setIsZoomed(false)}
            className="absolute right-4 top-4 rounded-full bg-stone-800/80 p-2 text-stone-100 hover:bg-stone-700"
            aria-label="Close zoom"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
          <img
            src={imagePreview}
            alt="Receipt zoomed preview"
            className="max-h-full max-w-full rounded-lg object-contain shadow-xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Parsed Receipt View */}
      {(receipt.merchant || receipt.date || receipt.lineItems[0]?.name || receipt.total > 0) && (
        <section className="mb-8">
          <h2 className="mb-4 text-lg font-medium text-stone-900 dark:text-stone-100">
            2. Review & correct
          </h2>

          <div className="receipt-paper receipt-edge relative rounded-xl border border-stone-200 bg-stone-50 p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900 sm:p-8">
            <div className="mb-6 text-center">
              <p className="text-xs font-semibold uppercase tracking-widest text-stone-500 dark:text-stone-400">
                Parsed Receipt
              </p>
            </div>

            <div className="space-y-6">
              {/* Header info */}
              <div className="space-y-3">
                <FieldShell htmlFor="merchant" label="Merchant">
                  <input
                    id="merchant"
                    type="text"
                    value={receipt.merchant}
                    onChange={(e) => updateField("merchant", e.target.value)}
                    placeholder="Store or restaurant name"
                    className="w-full border-0 bg-transparent p-0 text-base font-medium text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-0 dark:text-stone-100"
                  />
                </FieldShell>

                <FieldShell htmlFor="date" label="Date">
                  <input
                    id="date"
                    type="date"
                    value={receipt.date}
                    onChange={(e) => updateField("date", e.target.value)}
                    className="w-full border-0 bg-transparent p-0 text-base text-stone-900 focus:outline-none focus:ring-0 dark:text-stone-100"
                  />
                </FieldShell>
              </div>

              {/* Financial Summary */}
              <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 dark:border-stone-700 dark:bg-stone-900/50">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-stone-600 dark:text-stone-400">
                  Financial Summary
                </h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <FieldShell
                    htmlFor="subtotal"
                    label="Subtotal"
                    hint={formatCurrency(receipt.subtotal)}
                  >
                    <input
                      id="subtotal"
                      type="number"
                      step="0.01"
                      min="0"
                      value={receipt.subtotal}
                      onChange={(e) => updateAmountField("subtotal", e.target.value)}
                      placeholder="0.00"
                      className="w-full border-0 bg-transparent p-0 text-base font-medium text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-0 dark:text-stone-100"
                    />
                  </FieldShell>

                  <FieldShell
                    htmlFor="tax"
                    label="Tax"
                    hint={formatCurrency(receipt.tax)}
                  >
                    <input
                      id="tax"
                      type="number"
                      step="0.01"
                      min="0"
                      value={receipt.tax}
                      onChange={(e) => updateAmountField("tax", e.target.value)}
                      placeholder="0.00"
                      className="w-full border-0 bg-transparent p-0 text-base font-medium text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-0 dark:text-stone-100"
                    />
                  </FieldShell>

                  <FieldShell
                    htmlFor="discount"
                    label="Discount"
                    hint={formatCurrency(receipt.discount)}
                  >
                    <input
                      id="discount"
                      type="number"
                      step="0.01"
                      min="0"
                      value={receipt.discount}
                      onChange={(e) => updateAmountField("discount", e.target.value)}
                      placeholder="0.00"
                      className="w-full border-0 bg-transparent p-0 text-base font-medium text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-0 dark:text-stone-100"
                    />
                  </FieldShell>

                  <FieldShell
                    htmlFor="tip"
                    label="Tip"
                    hint={formatCurrency(receipt.tip)}
                  >
                    <input
                      id="tip"
                      type="number"
                      step="0.01"
                      min="0"
                      value={receipt.tip}
                      onChange={(e) => updateAmountField("tip", e.target.value)}
                      placeholder="0.00"
                      className="w-full border-0 bg-transparent p-0 text-base font-medium text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-0 dark:text-stone-100"
                    />
                  </FieldShell>

                  <FieldShell
                    htmlFor="total"
                    label="Total"
                    className="sm:col-span-2"
                    hint={`auto: ${formatCurrency(calculateComputedTotal(receipt))}`}
                  >
                    <div className="flex items-center justify-between">
                      <input
                        id="total"
                        type="number"
                        step="0.01"
                        min="0"
                        value={receipt.total}
                        onChange={(e) => updateAmountField("total", e.target.value)}
                        placeholder="0.00"
                        className="w-full border-0 bg-transparent p-0 text-lg font-semibold text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-0 dark:text-stone-100"
                      />
                    </div>
                  </FieldShell>
                </div>
              </div>

              {/* Line Items */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-stone-600 dark:text-stone-400">
                    Line Items
                  </span>
                  <button
                    type="button"
                    onClick={addLineItem}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-stone-700 hover:bg-amber-100 dark:text-stone-300 dark:hover:bg-stone-800"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-3.5 w-3.5"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Add item
                  </button>
                </div>

                <div className="space-y-2">
                  {receipt.lineItems.map((item, idx) => (
                    <div
                      key={item.id}
                      className="grid grid-cols-1 gap-2 rounded-lg border border-stone-200 bg-stone-50 p-3 sm:grid-cols-[1fr_auto_auto] sm:items-start dark:border-stone-700 dark:bg-stone-900"
                    >
                      <div className="flex flex-col gap-1">
                        <label
                          htmlFor={`item-name-${idx}`}
                          className="text-[10px] font-medium uppercase tracking-wide text-stone-600 dark:text-stone-400"
                        >
                          Item
                        </label>
                        <input
                          id={`item-name-${idx}`}
                          type="text"
                          value={item.name}
                          onChange={(e) =>
                            updateLineItem(idx, { name: e.target.value })
                          }
                          placeholder="Item name"
                          className="w-full rounded border-0 bg-transparent p-0 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-0 dark:text-stone-100"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label
                          htmlFor={`item-amount-${idx}`}
                          className="text-[10px] font-medium uppercase tracking-wide text-stone-600 dark:text-stone-400"
                        >
                          Amount
                        </label>
                        <input
                          id={`item-amount-${idx}`}
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.amount}
                          onChange={(e) =>
                            updateLineItem(idx, {
                              amount: parseAmount(e.target.value),
                            })
                          }
                          placeholder="0.00"
                          className="w-full rounded border-0 bg-transparent p-0 text-sm font-medium text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-0 dark:text-stone-100 sm:w-28"
                        />
                      </div>
                      <div className="flex items-center justify-between gap-2 sm:pt-5">
                        <span className="text-xs text-stone-500 sm:hidden">
                          {formatCurrency(item.amount)}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeLineItem(idx)}
                          className="rounded p-1 text-stone-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
                          aria-label="Remove item"
                          title="Remove item"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-4 w-4"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                          >
                            <path
                              fillRule="evenodd"
                              d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Validation Hints */}
              <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-4 dark:border-stone-700 dark:bg-stone-900/50">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-stone-600 dark:text-stone-400">
                  Validation Hints
                </h3>
                <div className="flex flex-col gap-2">
                  <ValidationHint ok={validation.merchantPresent}>
                    {validation.merchantPresent ? "Merchant present" : "Merchant missing"}
                  </ValidationHint>
                  <ValidationHint ok={validation.datePresent}>
                    {validation.datePresent ? "Date present" : "Date missing"}
                  </ValidationHint>
                  <ValidationHint ok={validation.hasItems}>
                    {validation.hasItems ? "Has line items" : "No line items"}
                  </ValidationHint>
                  <ValidationHint ok={validation.totalPresent}>
                    {validation.totalPresent ? "Total present" : "Total missing"}
                  </ValidationHint>
                  <ValidationHint ok={validation.totalMatchesItems}>
                    {validation.totalMatchesItems === true
                      ? "Total matches items"
                      : validation.totalMatchesItems === false
                      ? "Total does not match items"
                      : "Enter total to validate"}
                  </ValidationHint>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="inline-flex flex-1 items-center justify-center rounded-lg bg-amber-700 px-4 py-2.5 text-sm font-medium text-stone-50 transition-colors hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
              >
                {isSaving ? (
                  <>
                    <svg
                      className="mr-2 h-4 w-4 animate-spin"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Saving…
                  </>
                ) : (
                  "Save Corrected Version"
                )}
              </button>

              {saveStatus === "success" && (
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Saved successfully
                </span>
              )}
              {saveStatus === "error" && saveError && (
                <span className="text-sm text-rose-700 dark:text-rose-400">
                  {saveError}
                </span>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Saved Receipts List */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-medium text-stone-900 dark:text-stone-100">
            3. Saved receipts
          </h2>
          <button
            type="button"
            onClick={loadSavedReceipts}
            disabled={isLoadingSaved}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-stone-700 hover:bg-amber-100 disabled:opacity-60 dark:text-stone-400 dark:hover:bg-stone-800"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className={`h-3.5 w-3.5 ${isLoadingSaved ? "animate-spin" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Refresh
          </button>
        </div>

        {savedError && (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
            {savedError}
          </div>
        )}

        {isLoadingSaved && savedReceipts.length === 0 ? (
          <p className="text-sm text-stone-600 dark:text-stone-400">Loading saved receipts…</p>
        ) : savedReceipts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-stone-300 bg-amber-50 px-6 py-10 text-center dark:border-stone-700 dark:bg-stone-900/50">
            <p className="text-sm text-stone-600 dark:text-stone-400">
              No saved receipts yet.
            </p>
            <p className="mt-1 text-xs text-stone-500 dark:text-stone-500">
              Upload and save a receipt to see it here.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-amber-50 dark:divide-stone-800 dark:border-stone-800 dark:bg-stone-900">
            {savedReceipts.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => loadReceiptForEdit(r.id)}
                  className="flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors hover:bg-amber-100 sm:flex-row sm:items-center sm:justify-between dark:hover:bg-stone-800/50"
                >
                  <div>
                    <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
                      {r.merchant || "Unknown merchant"}
                    </p>
                    <p className="text-xs text-stone-600 dark:text-stone-400">
                      {r.date ? new Date(r.date).toLocaleDateString() : "No date"}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                    {formatCurrency(r.total)}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
