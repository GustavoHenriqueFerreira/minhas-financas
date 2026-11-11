import { bad, requireApiUser } from "../../../lib/api-auth";
import { importFingerprint } from "../../../lib/finance-rules";
import { validEntry } from "../../../lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth) return bad("Entre na sua conta para continuar.", 401);
  const payload = (await request.json().catch(() => ({}))) as { rows?: unknown; batchId?: unknown };
  if (!Array.isArray(payload.rows) || payload.rows.length < 1 || payload.rows.length > 300 || typeof payload.batchId !== "string" || !/^[\w-]{16,100}$/.test(payload.batchId)) return bad("Envie de 1 a 300 linhas válidas por vez.");
  const entries = payload.rows.map((row) => validEntry((row || {}) as Record<string, unknown>));
  if (entries.some((entry) => !entry)) return bad("Há linhas com data, tipo, categoria ou valor inválido.");
  const current = await auth.supabase.from("transactions").select("date,type,amount_cents,description,category").eq("user_id", auth.user.id).is("deleted_at", null);
  if (current.error) return bad("Não foi possível importar.", 500);
  const seen = new Set((current.data ?? []).map((row) => importFingerprint({ ...row, amountCents: row.amount_cents })));
  let imported = 0, skipped = 0;
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]!;
    const fingerprint = importFingerprint(entry);
    if (seen.has(fingerprint)) { skipped++; continue; }
    const clientKey = `${auth.user.id}:import:${payload.batchId}:${index}`;
    const { error } = await auth.supabase.from("transactions").insert({ id: crypto.randomUUID(), user_id: auth.user.id, date: entry.date, description: entry.description, type: entry.type, category: entry.category, amount_cents: entry.amountCents, notes: entry.notes, source: "import", client_key: clientKey });
    if (error?.code === "23505") skipped++;
    else if (error) return bad("A importação foi interrompida. Reenvie o mesmo lote para continuar sem duplicar itens.", 500);
    else { imported++; seen.add(fingerprint); }
  }
  return Response.json({ imported, skipped });
}
