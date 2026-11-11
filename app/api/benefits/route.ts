import { bad, requireApiUser } from "../../../lib/api-auth";
import { toCamel, toCamelList } from "../../../lib/records";
import { MAX_CENTS, validDate, validMoney } from "../../../lib/validation";

export const dynamic = "force-dynamic";

function walletInput(value: Record<string, unknown>) {
  if (!validMoney(value.openingBalanceCents, true) || !validDate(value.openingDate) || !validMoney(value.monthlyCreditCents) || !Number.isInteger(value.creditDay) || Number(value.creditDay) < 1 || Number(value.creditDay) > 31) return null;
  return { opening_balance_cents: Number(value.openingBalanceCents), opening_date: value.openingDate, monthly_credit_cents: Number(value.monthlyCreditCents), credit_day: Number(value.creditDay) };
}

function movementInput(value: Record<string, unknown>, kind: "credit" | "expense" | "adjustment") {
  const description = typeof value.description === "string" ? value.description.trim() : "";
  const category = typeof value.category === "string" ? value.category.trim() : "";
  const notes = typeof value.notes === "string" ? value.notes.trim() : "";
  const amount = Number(value.amountCents);
  if (!validDate(value.date) || !description || description.length > 120 || notes.length > 1000 || (kind === "expense" && (!category || category.length > 70)) || (kind !== "adjustment" && !validMoney(value.amountCents)) || (kind === "adjustment" && (!Number.isSafeInteger(value.amountCents) || amount === 0 || Math.abs(amount) > MAX_CENTS))) return null;
  return { date: value.date, description, category: kind === "expense" ? category : null, notes: notes || null, amount_cents: amount, credit_month: kind === "credit" ? `${String(value.date).slice(0, 7)}-01` : null };
}

async function vrWallet(auth: Awaited<ReturnType<typeof requireApiUser>>) {
  if (!auth) return null;
  const result = await auth.supabase.from("benefit_wallets").select("*").eq("user_id", auth.user.id).eq("code", "VR").maybeSingle();
  return result.data;
}

export async function GET() {
  const auth = await requireApiUser();
  if (!auth) return bad("Entre na sua conta para continuar.", 401);
  const wallet = await vrWallet(auth);
  if (!wallet) return Response.json({ wallet: null, movements: [] }, { headers: { "cache-control": "no-store" } });
  const { data, error } = await auth.supabase.from("benefit_movements").select("*").eq("user_id", auth.user.id).eq("wallet_id", wallet.id).is("deleted_at", null).order("date", { ascending: false }).order("created_at", { ascending: false });
  return error ? bad("Não foi possível carregar o VR.", 500) : Response.json({ wallet: toCamel(wallet), movements: toCamelList((data ?? []).map((row) => ({ ...row, credit_month: row.credit_month ? String(row.credit_month).slice(0, 7) : null }))) }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth) return bad("Entre na sua conta para continuar.", 401);
  const value = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (value.action === "setup") {
    const config = walletInput(value);
    if (!config) return bad("Confira saldo inicial, valor mensal e dia do crédito.");
    const { data, error } = await auth.supabase.from("benefit_wallets").insert({ id: crypto.randomUUID(), user_id: auth.user.id, code: "VR", name: "Vale-Refeição", ...config }).select().maybeSingle();
    return error ? bad(error.code === "23505" ? "A carteira de VR já existe." : "Não foi possível criar a carteira de VR.", error.code === "23505" ? 409 : 500) : Response.json({ wallet: toCamel(data!) }, { status: 201 });
  }
  if (value.action !== "movement" || !["credit", "expense", "adjustment"].includes(String(value.kind))) return bad("Movimentação inválida.");
  const kind = value.kind as "credit" | "expense" | "adjustment";
  const entry = movementInput(value, kind);
  const rawKey = typeof value.clientKey === "string" && /^[\w-]{16,100}$/.test(value.clientKey) ? value.clientKey : null;
  if (!entry || !rawKey) return bad("Confira data, descrição, categoria e valor.");
  const wallet = await vrWallet(auth);
  if (!wallet) return bad("Configure a carteira de VR antes de registrar movimentações.", 409);
  const clientKey = `${auth.user.id}:benefit:${rawKey}`;
  const { data, error } = await auth.supabase.from("benefit_movements").insert({ id: crypto.randomUUID(), user_id: auth.user.id, wallet_id: wallet.id, kind, ...entry, client_key: clientKey }).select().maybeSingle();
  if (!error && data) return Response.json({ movement: toCamel(data) }, { status: 201 });
  if (error?.code === "23505") {
    const same = await auth.supabase.from("benefit_movements").select("*").eq("user_id", auth.user.id).eq("client_key", clientKey).maybeSingle();
    if (same.data) return Response.json({ movement: toCamel(same.data), duplicateRequest: true });
  }
  return bad(kind === "credit" ? "Já existe um crédito de VR confirmado para esse mês." : "Não foi possível registrar a movimentação.", 409);
}

export async function PATCH(request: Request) {
  const auth = await requireApiUser();
  if (!auth) return bad("Entre na sua conta para continuar.", 401);
  const value = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const wallet = await vrWallet(auth);
  if (!wallet) return bad("Carteira de VR não encontrada.", 404);
  if (value.action === "wallet") {
    const config = walletInput(value);
    if (!config) return bad("Confira os dados da carteira.");
    const { data, error } = await auth.supabase.from("benefit_wallets").update(config).eq("id", wallet.id).eq("user_id", auth.user.id).select().single();
    return error ? bad("Não foi possível atualizar a carteira.", 500) : Response.json({ wallet: toCamel(data) });
  }
  if (value.action !== "movement" || typeof value.id !== "string") return bad("Movimentação inválida.");
  const before = await auth.supabase.from("benefit_movements").select("*").eq("id", value.id).eq("user_id", auth.user.id).eq("wallet_id", wallet.id).is("deleted_at", null).maybeSingle();
  if (!before.data) return bad("Movimentação não encontrada.", 404);
  const entry = movementInput(value, before.data.kind);
  if (!entry) return bad("Confira os dados da movimentação.");
  const { data, error } = await auth.supabase.from("benefit_movements").update(entry).eq("id", value.id).eq("user_id", auth.user.id).is("deleted_at", null).select().maybeSingle();
  return error || !data ? bad("Não foi possível atualizar. Confira se já existe crédito para esse mês.", 409) : Response.json({ movement: toCamel(data) });
}

export async function DELETE(request: Request) {
  const auth = await requireApiUser();
  if (!auth) return bad("Entre na sua conta para continuar.", 401);
  const value = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof value.id !== "string") return bad("Movimentação inválida.");
  const wallet = await vrWallet(auth);
  if (!wallet) return bad("Carteira de VR não encontrada.", 404);
  const { data, error } = await auth.supabase.from("benefit_movements").update({ deleted_at: new Date().toISOString() }).eq("id", value.id).eq("user_id", auth.user.id).eq("wallet_id", wallet.id).is("deleted_at", null).select("id").maybeSingle();
  return error || !data ? bad("Movimentação não encontrada.", 404) : Response.json({ deleted: true });
}
