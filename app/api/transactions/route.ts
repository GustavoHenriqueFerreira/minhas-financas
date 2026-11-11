import { bad, requireApiUser } from "../../../lib/api-auth";
import { toCamel, toCamelList } from "../../../lib/records";
import { type EntryInput, validEntry } from "../../../lib/validation";

export const dynamic = "force-dynamic";
export { bad, validEntry };

export async function GET() {
  const auth = await requireApiUser();
  if (!auth) return bad("Entre na sua conta para continuar.", 401);
  const { data, error } = await auth.supabase.from("transactions").select("*")
    .eq("user_id", auth.user.id).is("deleted_at", null)
    .order("date", { ascending: false }).order("created_at", { ascending: false });
  return error ? bad("Não foi possível carregar os lançamentos.", 500) : Response.json({ transactions: toCamelList(data) });
}

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth) return bad("Entre na sua conta para continuar.", 401);
  const payload = (await request.json().catch(() => ({}))) as EntryInput;
  const entry = validEntry(payload);
  const rawKey = typeof payload.clientKey === "string" && /^[\w-]{16,100}$/.test(payload.clientKey) ? payload.clientKey : null;
  if (!entry || !rawKey) return bad("Confira data, descrição, categoria e valor.");
  const clientKey = `${auth.user.id}:${rawKey}`;
  const insert = {
    id: crypto.randomUUID(), user_id: auth.user.id, date: entry.date,
    description: entry.description, type: entry.type, category: entry.category,
    amount_cents: entry.amountCents, notes: entry.notes, client_key: clientKey,
    source: "manual", source_row: null,
  };
  const { data, error } = await auth.supabase.from("transactions").insert(insert).select().maybeSingle();
  if (!error && data) return Response.json({ transaction: toCamel(data) }, { status: 201 });
  if (error?.code === "23505") {
    const existing = await auth.supabase.from("transactions").select("*")
      .eq("user_id", auth.user.id).eq("client_key", clientKey).maybeSingle();
    if (existing.data) return Response.json({ transaction: toCamel(existing.data), duplicateRequest: true });
  }
  return bad("Não foi possível salvar o lançamento.", 500);
}

export async function PATCH(request: Request) {
  const auth = await requireApiUser();
  if (!auth) return bad("Entre na sua conta para continuar.", 401);
  const payload = (await request.json().catch(() => ({}))) as EntryInput & { id?: unknown };
  const id = typeof payload.id === "string" ? payload.id : "";
  const entry = validEntry(payload);
  if (!id || !entry) return bad("Confira os dados do lançamento.");
  const before = await auth.supabase.from("transactions").select("id,plan_id")
    .eq("id", id).eq("user_id", auth.user.id).is("deleted_at", null).maybeSingle();
  if (!before.data) return bad("Lançamento não encontrado.", 404);
  if (before.data.plan_id) return bad("Edite ou cancele o plano associado a este pagamento.", 409);
  const { data, error } = await auth.supabase.from("transactions").update({
    date: entry.date, description: entry.description, type: entry.type,
    category: entry.category, amount_cents: entry.amountCents, notes: entry.notes,
  }).eq("id", id).eq("user_id", auth.user.id).is("deleted_at", null).select().maybeSingle();
  return error || !data ? bad("Não foi possível atualizar o lançamento.", 500) : Response.json({ transaction: toCamel(data) });
}

export async function DELETE(request: Request) {
  const auth = await requireApiUser();
  if (!auth) return bad("Entre na sua conta para continuar.", 401);
  const payload = (await request.json().catch(() => ({}))) as { id?: unknown };
  const id = typeof payload.id === "string" ? payload.id : "";
  if (!id) return bad("Lançamento inválido.");
  const before = await auth.supabase.from("transactions").select("id,plan_id")
    .eq("id", id).eq("user_id", auth.user.id).is("deleted_at", null).maybeSingle();
  if (!before.data) return bad("Lançamento não encontrado.", 404);
  if (before.data.plan_id) return bad("Este pagamento pertence a um plano e deve ser tratado por ele.", 409);
  const { data, error } = await auth.supabase.from("transactions")
    .update({ deleted_at: new Date().toISOString() }).eq("id", id)
    .eq("user_id", auth.user.id).is("deleted_at", null).select("id").maybeSingle();
  return error || !data ? bad("Não foi possível excluir o lançamento.", 500) : Response.json({ deleted: true });
}
