export function normalizeCategoryKey(value: string) {
  return value
    .replace(/^\([DR]\)\s*/i, "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

export function canonicalCategoryName(
  value: string,
  type: "income" | "expense",
) {
  const clean = value
    .replace(/^\([DR]\)\s*/i, "")
    .trim()
    .replace(/\s+/g, " ");
  return clean ? `(${type === "income" ? "R" : "D"}) ${clean}` : "";
}

export function parsePositiveCents(input: string) {
  const raw = input.replace(/R\$|\s/g, "");
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const value = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function dueDate(startDate: string, index: number) {
  const [year, month, day] = startDate.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1 + index, 1));
  const last = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
}

export function installmentAmount(
  totalCents: number,
  count: number,
  index: number,
) {
  return Math.floor(totalCents / count) + (index < totalCents % count ? 1 : 0);
}

export function importFingerprint(row: {
  date: string;
  type: string;
  amountCents: number;
  description: string;
  category: string;
}) {
  return [
    row.date,
    row.type,
    row.amountCents,
    row.description.trim().toLocaleLowerCase("pt-BR"),
    normalizeCategoryKey(row.category),
  ].join("|");
}

export function benefitAdjustment(
  recordedBalanceCents: number,
  actualBalanceCents: number,
) {
  return actualBalanceCents - recordedBalanceCents;
}

/**
 * Bases abaixo de R$ 100,00 não geram percentual: pequenas variações absolutas
 * podem produzir números extremos e pouco úteis para decisões financeiras.
 */
export const MIN_PERCENT_COMPARISON_BASE_CENTS = 10_000;

export function percentageChangeForComparison(
  currentCents: number,
  previousCents: number,
): number | "small-base" | null {
  if (previousCents <= 0) return null;
  if (previousCents < MIN_PERCENT_COMPARISON_BASE_CENTS) return "small-base";
  return Math.round(((currentCents - previousCents) / previousCents) * 100);
}

export function countLabel(
  count: number,
  singular: string,
  plural: string,
) {
  return `${count} ${count === 1 ? singular : plural}`;
}
