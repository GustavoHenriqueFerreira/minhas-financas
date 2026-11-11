import { bad, requireApiUser } from "../../../lib/api-auth";
import { toCamel, toCamelList } from "../../../lib/records";
import { validMoney, validMonth } from "../../../lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireApiUser();
  if (!auth) return bad("Entre na sua conta para continuar.", 401);
  const { data, error } = await auth.supabase.from("budgets").select("*").eq("user_id", auth.user.id);
  return error ? bad("Não foi possível carregar orçamentos.", 500) : Response.json({ budgets: toCamelList((data ?? []).map((row) => ({ ...row, month: String(row.month).slice(0, 7) }))) });
}

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth) return bad("Entre na sua conta para continuar.", 401);
  const value = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const categoryKey = typeof value.categoryKey === "string" ? value.categoryKey.trim() : "";
  if (!validMonth(value.month) || !categoryKey || categoryKey.length > 70 || !validMoney(value.amountCents)) return bad("Confira mês, categoria e valor.");
  const row = { user_id: auth.user.id, month: `${value.month}-01`, category_key: categoryKey, amount_cents: Number(value.amountCents) };
  const { data, error } = await auth.supabase.from("budgets").upsert(row, { onConflict: "user_id,month,category_key" }).select().single();
  if (error) return bad("Não foi possível salvar o orçamento.", 500);
  return Response.json({ budget: toCamel({ ...data, month: String(data.month).slice(0, 7) }) }, { status: 201 });
}

export async function DELETE(request: Request) {
  const auth = await requireApiUser();
  if (!auth) return bad("Entre na sua conta para continuar.", 401);
  const value = (await request.json().catch(() => ({}))) as { id?: unknown };
  if (typeof value.id !== "string") return bad("Orçamento inválido.");
  const { data, error } = await auth.supabase.from("budgets").delete().eq("id", value.id).eq("user_id", auth.user.id).select("id").maybeSingle();
  return error || !data ? bad("Orçamento não encontrado.", 404) : Response.json({ deleted: true });
}
