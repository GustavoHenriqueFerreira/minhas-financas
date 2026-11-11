export const MAX_CENTS = 100_000_000_000;

export function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validMonth(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function validMoney(value: unknown, allowZero = false) {
  return Number.isSafeInteger(value) && Number(value) >= (allowZero ? 0 : 1) && Number(value) <= MAX_CENTS;
}

export type EntryInput = {
  date?: unknown;
  description?: unknown;
  type?: unknown;
  category?: unknown;
  amountCents?: unknown;
  notes?: unknown;
  clientKey?: unknown;
};

export function validEntry(input: EntryInput) {
  const date = typeof input.date === "string" ? input.date.trim() : "";
  const description = typeof input.description === "string" ? input.description.trim() : "";
  const category = typeof input.category === "string" ? input.category.trim() : "";
  const notes = typeof input.notes === "string" ? input.notes.trim() : "";
  if (!validDate(date) || !description || description.length > 120 || !category || category.length > 70 || notes.length > 1000) return null;
  if (input.type !== "income" && input.type !== "expense") return null;
  if (!validMoney(input.amountCents)) return null;
  return { date, description, type: input.type, category, amountCents: Number(input.amountCents), notes: notes || null };
}
