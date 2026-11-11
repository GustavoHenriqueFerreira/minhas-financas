import { bad, requireApiUser } from "../../../lib/api-auth";
import { BACKUP_V2, backupShape, field, importUuid, safeId, validBackupBudget, validBackupPlan, validBackupTransaction, withoutOwnership } from "../../../lib/backup";
import { toCamel } from "../../../lib/records";
import { validDate, validMoney } from "../../../lib/validation";

export const dynamic = "force-dynamic";
const tables = ["transactions", "plans", "budgets", "category_definitions", "transaction_versions", "benefit_wallets", "benefit_movements"] as const;

export async function GET() {
  const auth = await requireApiUser();
  if (!auth) return bad("Entre na sua conta para continuar.", 401);
  const results = await Promise.all(tables.map((table) => auth.supabase.from(table).select("*").eq("user_id", auth.user.id)));
  if (results.some((result) => result.error)) return bad("Não foi possível gerar o backup.", 500);
  const exported = results.map((result) => (result.data ?? []).map((row) => withoutOwnership(toCamel(row))));
  const versions = exported[4].map((version) => {
    const previous = version.previousJson;
    return {
      ...version,
      previousJson: previous && typeof previous === "object"
        ? withoutOwnership(toCamel(previous as Record<string, unknown>))
        : previous,
    };
  });
  return Response.json({
    format: BACKUP_V2, exportedAt: new Date().toISOString(),
    transactions: exported[0], plans: exported[1], budgets: exported[2], categories: exported[3],
    transactionVersions: versions, benefitWallets: exported[5], benefitMovements: exported[6],
  }, { headers: { "cache-control": "no-store", "content-disposition": "attachment; filename=minhas-financas-backup.json" } });
}

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth) return bad("Entre na sua conta para continuar.", 401);
  const parsed = backupShape((await request.json().catch(() => ({}))) as Record<string, unknown>);
  if (!parsed) return bad("Arquivo de backup inválido.");
  if (parsed.transactions.some((row) => !validBackupTransaction(row)) || parsed.plans.some((row) => !validBackupPlan(row)) || parsed.budgets.some((row) => !validBackupBudget(row))) return bad("O backup contém lançamentos, planos ou orçamentos inválidos.");

  const userId = auth.user.id;
  const planIds = new Map<string, string>();
  const walletIds = new Map<string, string>();
  const transactionIds = new Map<string, string>();
  for (let i = 0; i < parsed.plans.length; i++) planIds.set(safeId(parsed.plans[i], `plan-${i}`), await importUuid(userId, "plans", safeId(parsed.plans[i], `plan-${i}`)));
  for (let i = 0; i < parsed.transactions.length; i++) transactionIds.set(safeId(parsed.transactions[i], `transaction-${i}`), await importUuid(userId, "transactions", safeId(parsed.transactions[i], `transaction-${i}`)));

  let restored = 0, revived = 0, benefitRestored = 0, benefitRevived = 0;
  try {
    for (let i = 0; i < parsed.plans.length; i++) {
      const row = parsed.plans[i], oldId = safeId(row, `plan-${i}`);
      const input = { id: planIds.get(oldId), user_id: userId, kind: field(row, "kind", "kind"), description: String(field(row, "description", "description")).slice(0, 120), category: String(field(row, "category", "category")).slice(0, 70), start_date: field(row, "startDate", "start_date"), amount_cents: field(row, "amountCents", "amount_cents"), installment_count: field(row, "installmentCount", "installment_count") ?? null, status: ["active", "paused", "canceled"].includes(String(field(row, "status", "status"))) ? field(row, "status", "status") : "active", notes: typeof field(row, "notes", "notes") === "string" ? String(field(row, "notes", "notes")).slice(0, 1000) : null };
      const result = await auth.supabase.from("plans").upsert(input, { onConflict: "id", ignoreDuplicates: true });
      if (result.error) throw result.error;
    }
    for (let i = 0; i < parsed.budgets.length; i++) {
      const row = parsed.budgets[i], month = String(field(row, "month", "month")).slice(0, 7);
      const result = await auth.supabase.from("budgets").upsert({ id: await importUuid(userId, "budgets", safeId(row, `budget-${i}`)), user_id: userId, month: `${month}-01`, category_key: field(row, "categoryKey", "category_key"), amount_cents: field(row, "amountCents", "amount_cents") }, { onConflict: "user_id,month,category_key", ignoreDuplicates: true });
      if (result.error) throw result.error;
    }
    for (let i = 0; i < parsed.categories.length; i++) {
      const row = parsed.categories[i], type = field(row, "type", "type"), name = field(row, "name", "name"), key = field(row, "normalizedKey", "normalized_key");
      if ((type !== "income" && type !== "expense") || typeof name !== "string" || !name || typeof key !== "string" || !key) return bad("O backup contém uma categoria inválida.");
      const result = await auth.supabase.from("category_definitions").upsert({ id: await importUuid(userId, "categories", safeId(row, `category-${i}`)), user_id: userId, name: name.slice(0, 70), normalized_key: key.slice(0, 70), type }, { onConflict: "user_id,type,normalized_key", ignoreDuplicates: true });
      if (result.error) throw result.error;
    }

    const currentWallets = await auth.supabase.from("benefit_wallets").select("id,code").eq("user_id", userId);
    if (currentWallets.error) throw currentWallets.error;
    for (let i = 0; i < parsed.benefitWallets.length; i++) {
      const row = parsed.benefitWallets[i], oldId = safeId(row, `wallet-${i}`), code = field(row, "code", "code");
      if (typeof code !== "string" || !code || typeof field(row, "name", "name") !== "string" || !validDate(field(row, "openingDate", "opening_date")) || !validMoney(field(row, "openingBalanceCents", "opening_balance_cents"), true) || !validMoney(field(row, "monthlyCreditCents", "monthly_credit_cents")) || !Number.isInteger(field(row, "creditDay", "credit_day"))) return bad("O backup contém uma carteira de benefício inválida.");
      const existing = currentWallets.data?.find((wallet) => wallet.code === code);
      const id = existing?.id ?? await importUuid(userId, "benefit_wallets", oldId);
      walletIds.set(oldId, id);
      if (!existing) {
        const result = await auth.supabase.from("benefit_wallets").upsert({ id, user_id: userId, code: code.slice(0, 20), name: String(field(row, "name", "name")).slice(0, 80), opening_balance_cents: field(row, "openingBalanceCents", "opening_balance_cents"), opening_date: field(row, "openingDate", "opening_date"), monthly_credit_cents: field(row, "monthlyCreditCents", "monthly_credit_cents"), credit_day: field(row, "creditDay", "credit_day") }, { onConflict: "id", ignoreDuplicates: true });
        if (result.error) throw result.error;
      }
    }

    for (let i = 0; i < parsed.benefitMovements.length; i++) {
      const row = parsed.benefitMovements[i], oldWalletId = String(field(row, "walletId", "wallet_id") ?? ""), walletId = walletIds.get(oldWalletId), kind = field(row, "kind", "kind"), amount = field(row, "amountCents", "amount_cents");
      if (!walletId || !["credit", "expense", "adjustment"].includes(String(kind)) || !validDate(field(row, "date", "date")) || !Number.isSafeInteger(amount) || Number(amount) === 0) return bad("O backup contém uma movimentação de benefício inválida.");
      const id = await importUuid(userId, "benefit_movements", safeId(row, `movement-${i}`));
      const existing = await auth.supabase.from("benefit_movements").select("id,deleted_at").eq("id", id).eq("user_id", userId).maybeSingle();
      if (existing.data) {
        if (existing.data.deleted_at && !field(row, "deletedAt", "deleted_at")) {
          const revivedResult = await auth.supabase.from("benefit_movements").update({ deleted_at: null }).eq("id", id).eq("user_id", userId);
          if (!revivedResult.error) benefitRevived++;
        }
        continue;
      }
      const month = field(row, "creditMonth", "credit_month");
      const result = await auth.supabase.from("benefit_movements").insert({ id, user_id: userId, wallet_id: walletId, kind, date: field(row, "date", "date"), description: String(field(row, "description", "description") ?? "Movimentação importada").slice(0, 120), category: kind === "expense" ? String(field(row, "category", "category") ?? "Importado").slice(0, 70) : null, amount_cents: amount, credit_month: kind === "credit" ? `${String(month ?? field(row, "date", "date")).slice(0, 7)}-01` : null, notes: typeof field(row, "notes", "notes") === "string" ? String(field(row, "notes", "notes")).slice(0, 1000) : null, deleted_at: field(row, "deletedAt", "deleted_at") ?? null, client_key: null });
      if (result.error?.code !== "23505" && result.error) throw result.error;
      if (!result.error) benefitRestored++;
    }

    for (let i = 0; i < parsed.transactions.length; i++) {
      const row = parsed.transactions[i], oldId = safeId(row, `transaction-${i}`), id = transactionIds.get(oldId)!;
      const existing = await auth.supabase.from("transactions").select("id,deleted_at").eq("id", id).eq("user_id", userId).maybeSingle();
      if (existing.data) {
        if (existing.data.deleted_at && !field(row, "deletedAt", "deleted_at")) {
          const result = await auth.supabase.from("transactions").update({ deleted_at: null }).eq("id", id).eq("user_id", userId);
          if (!result.error) revived++;
        }
        continue;
      }
      const oldPlan = field(row, "planId", "plan_id");
      const source = String(field(row, "source", "source") ?? "import");
      const result = await auth.supabase.from("transactions").insert({ id, user_id: userId, date: field(row, "date", "date"), description: field(row, "description", "description"), type: field(row, "type", "type"), category: field(row, "category", "category"), amount_cents: field(row, "amountCents", "amount_cents"), source: ["historical", "manual", "import", "recurrence", "installment"].includes(source) ? source : "import", source_row: field(row, "sourceRow", "source_row") ?? null, notes: typeof field(row, "notes", "notes") === "string" ? String(field(row, "notes", "notes")).slice(0, 1000) : null, deleted_at: field(row, "deletedAt", "deleted_at") ?? null, client_key: null, plan_id: typeof oldPlan === "string" ? planIds.get(oldPlan) ?? null : null, occurrence_index: field(row, "occurrenceIndex", "occurrence_index") ?? null });
      if (result.error?.code !== "23505" && result.error) throw result.error;
      if (!result.error) restored++;
    }

    for (let i = 0; i < parsed.transactionVersions.length; i++) {
      const row = parsed.transactionVersions[i], oldTx = String(field(row, "transactionId", "transaction_id") ?? ""), transactionId = transactionIds.get(oldTx), action = field(row, "action", "action");
      if (!transactionId || !["edit", "delete", "restore"].includes(String(action))) continue;
      let previous = field(row, "previousJson", "previous_json");
      if (typeof previous === "string") {
        try { previous = JSON.parse(previous); } catch { previous = {}; }
      }
      const cleanPrevious = previous && typeof previous === "object"
        ? withoutOwnership(toCamel(previous as Record<string, unknown>))
        : {};
      const result = await auth.supabase.from("transaction_versions").upsert({ id: await importUuid(userId, "transaction_versions", safeId(row, `version-${i}`)), transaction_id: transactionId, user_id: userId, action, previous_json: { ...cleanPrevious, id: transactionId }, changed_at: field(row, "changedAt", "changed_at") ?? new Date().toISOString() }, { onConflict: "id", ignoreDuplicates: true });
      if (result.error) throw result.error;
    }
  } catch {
    return bad("A restauração foi interrompida. Reenvie o mesmo arquivo para continuar sem duplicar itens já importados.", 500);
  }
  return Response.json({ restored, revived, unchanged: parsed.transactions.length - restored - revived, benefitRestored, benefitRevived });
}
