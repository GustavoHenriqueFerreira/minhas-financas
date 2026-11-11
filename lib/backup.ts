import { validDate, validMoney, validMonth } from "./validation.ts";

export const BACKUP_V1 = "minhas-financas-backup-v1";
export const BACKUP_V2 = "minhas-financas-backup-v2";

export type BackupData = Record<string, unknown> & {
  format?: unknown;
  transactions?: unknown;
  plans?: unknown;
  budgets?: unknown;
  categories?: unknown;
  transactionVersions?: unknown;
  benefitWallets?: unknown;
  benefitMovements?: unknown;
};

export function backupShape(data: BackupData) {
  if (![BACKUP_V1, BACKUP_V2].includes(String(data.format))) return null;
  const limits: Array<[keyof BackupData, number, boolean]> = [
    ["transactions", 20_000, true], ["plans", 1_000, true], ["budgets", 2_000, true],
    ["categories", 500, false], ["transactionVersions", 50_000, false],
    ["benefitWallets", 100, false], ["benefitMovements", 20_000, false],
  ];
  for (const [key, limit, required] of limits) {
    const value = data[key];
    if (required && !Array.isArray(value)) return null;
    if (value !== undefined && (!Array.isArray(value) || value.length > limit)) return null;
  }
  return {
    format: data.format as string,
    transactions: data.transactions as Record<string, unknown>[],
    plans: data.plans as Record<string, unknown>[],
    budgets: data.budgets as Record<string, unknown>[],
    categories: (data.categories ?? []) as Record<string, unknown>[],
    transactionVersions: (data.transactionVersions ?? []) as Record<string, unknown>[],
    benefitWallets: (data.benefitWallets ?? []) as Record<string, unknown>[],
    benefitMovements: (data.benefitMovements ?? []) as Record<string, unknown>[],
  };
}

export function field(row: Record<string, unknown>, camel: string, snake: string) {
  return row[camel] ?? row[snake];
}

export function safeId(row: Record<string, unknown>, fallback: string) {
  const id = row.id;
  return typeof id === "string" && id.length > 0 && id.length <= 200 ? id : fallback;
}

export async function importUuid(userId: string, table: string, sourceId: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${userId}\0${table}\0${sourceId}`)));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes.slice(0, 16)].map((value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function validBackupTransaction(row: Record<string, unknown>) {
  const date = field(row, "date", "date");
  const description = field(row, "description", "description");
  const type = field(row, "type", "type");
  const category = field(row, "category", "category");
  const amount = field(row, "amountCents", "amount_cents");
  return validDate(date) && typeof description === "string" && description.length > 0 && description.length <= 120 && (type === "income" || type === "expense") && typeof category === "string" && category.length > 0 && category.length <= 70 && validMoney(amount);
}

export function validBackupPlan(row: Record<string, unknown>) {
  const kind = field(row, "kind", "kind");
  const amount = field(row, "amountCents", "amount_cents");
  const count = field(row, "installmentCount", "installment_count");
  return (kind === "recurring" || kind === "installment") && validDate(field(row, "startDate", "start_date")) && validMoney(amount) && typeof field(row, "description", "description") === "string" && typeof field(row, "category", "category") === "string" && (kind === "recurring" || (Number.isInteger(count) && Number(count) >= 2 && Number(count) <= 120));
}

export function validBackupBudget(row: Record<string, unknown>) {
  const month = String(field(row, "month", "month") ?? "").slice(0, 7);
  return validMonth(month) && typeof field(row, "categoryKey", "category_key") === "string" && validMoney(field(row, "amountCents", "amount_cents"));
}

export function withoutOwnership(row: Record<string, unknown>) {
  const copy = { ...row };
  delete copy.user_id;
  delete copy.userId;
  return copy;
}
