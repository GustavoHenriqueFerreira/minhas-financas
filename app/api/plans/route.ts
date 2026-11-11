import { bad, requireApiUser } from "../../../lib/api-auth";
import { toCamel, toCamelList } from "../../../lib/records";
import { dueDate, installmentAmount } from "../../../lib/finance-rules";
import { validDate, validMoney } from "../../../lib/validation";

export const dynamic = "force-dynamic";

function planInput(value: Record<string, unknown>, current?: Record<string, unknown>) {
  const kind = current?.kind ?? (value.kind === "recurring" || value.kind === "installment" ? value.kind : null);
  const description = typeof value.description === "string" ? value.description.trim() : String(current?.description ?? "");
  const category = typeof value.category === "string" ? value.category.trim() : String(current?.category ?? "");
  const startDate = value.startDate ?? current?.start_date;
  const amountCents = value.amountCents ?? current?.amount_cents;
  const installmentCount = kind === "installment" ? Number(value.installmentCount ?? current?.installment_count) : null;
  if (!kind || !description || description.length > 120 || !category || category.length > 70 || !validDate(startDate) || !validMoney(amountCents)) return null;
  if (kind === "installment" && (!Number.isInteger(installmentCount) || Number(installmentCount) < 2 || Number(installmentCount) > 120 || Number(installmentCount) > Number(amountCents))) return null;
  return { kind, description, category, start_date: startDate, amount_cents: Number(amountCents), installment_count: installmentCount, notes: typeof value.notes === "string" ? value.notes.trim().slice(0, 1000) || null : (current?.notes ?? null) };
}

export async function GET() {
  const auth = await requireApiUser();
  if (!auth) return bad("Entre na sua conta para continuar.", 401);
  const { data, error } = await auth.supabase.from("plans").select("*").eq("user_id", auth.user.id);
  return error ? bad("Não foi possível carregar os planos.", 500) : Response.json({ plans: toCamelList(data) });
}

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth) return bad("Entre na sua conta para continuar.", 401);
  const value = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const input = planInput(value);
  if (!input) return bad("Confira os dados do plano.");
  const { data, error } = await auth.supabase.from("plans").insert({ id: crypto.randomUUID(), user_id: auth.user.id, ...input, status: "active" }).select().single();
  return error ? bad("Não foi possível salvar o plano.", 500) : Response.json({ plan: toCamel(data) }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireApiUser();
  if (!auth) return bad("Entre na sua conta para continuar.", 401);
  const value = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = typeof value.id === "string" ? value.id : "";
  const before = await auth.supabase.from("plans").select("*").eq("id", id).eq("user_id", auth.user.id).maybeSingle();
  if (!before.data) return bad("Plano não encontrado.", 404);
  const paid = await auth.supabase.from("transactions").select("id").eq("user_id", auth.user.id).eq("plan_id", id).limit(1).maybeSingle();
  if (paid.data && (value.startDate !== undefined || value.installmentCount !== undefined || (before.data.kind === "installment" && value.amountCents !== undefined))) return bad("Depois de um pagamento, a data inicial e as parcelas ficam preservadas. Em recorrências, o novo valor vale para cobranças futuras.", 409);
  const input = planInput(value, before.data);
  if (!input) return bad("Confira os dados do plano.");
  const status = ["active", "paused", "canceled"].includes(String(value.status)) ? value.status : before.data.status;
  const { data, error } = await auth.supabase.from("plans").update({ ...input, status }).eq("id", id).eq("user_id", auth.user.id).select().single();
  return error ? bad("Não foi possível atualizar o plano.", 500) : Response.json({ plan: toCamel(data) });
}

export async function PUT(request: Request) {
  const auth = await requireApiUser();
  if (!auth) return bad("Entre na sua conta para continuar.", 401);
  const value = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = typeof value.id === "string" ? value.id : "";
  const index = Number(value.index);
  if (!id || !Number.isInteger(index) || index < 0 || index > 1199) return bad("Parcela inválida.");
  const planResult = await auth.supabase.from("plans").select("*").eq("id", id).eq("user_id", auth.user.id).maybeSingle();
  const plan = planResult.data;
  if (!plan || plan.status !== "active" || (plan.kind === "installment" && index >= (plan.installment_count || 0))) return bad("Plano inativo ou parcela inválida.", 409);
  const amount = plan.kind === "recurring" ? plan.amount_cents : installmentAmount(plan.amount_cents, plan.installment_count || 1, index);
  const row = { id: crypto.randomUUID(), user_id: auth.user.id, date: dueDate(plan.start_date, index), description: plan.description, type: "expense", category: plan.category, amount_cents: amount, source: plan.kind === "recurring" ? "recurrence" : "installment", plan_id: id, occurrence_index: index };
  const { data, error } = await auth.supabase.from("transactions").insert(row).select().maybeSingle();
  if (!error && data) return Response.json({ transaction: toCamel(data) }, { status: 201 });
  if (error?.code === "23505") {
    const existing = await auth.supabase.from("transactions").select("*").eq("user_id", auth.user.id).eq("plan_id", id).eq("occurrence_index", index).maybeSingle();
    if (existing.data) return Response.json({ transaction: toCamel(existing.data), duplicateRequest: true });
  }
  return bad("Não foi possível confirmar o pagamento.", 500);
}
