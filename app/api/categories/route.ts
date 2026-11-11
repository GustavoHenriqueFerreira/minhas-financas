import { bad, requireApiUser } from "../../../lib/api-auth";
import { toCamel, toCamelList } from "../../../lib/records";
import { canonicalCategoryName, normalizeCategoryKey } from "../../../lib/finance-rules";

export const dynamic = "force-dynamic";

function categoryInput(value: Record<string, unknown>) {
  const type = value.type === "income" || value.type === "expense" ? value.type : null;
  const raw = typeof value.name === "string" ? value.name : "";
  if (!type) return null;
  const name = canonicalCategoryName(raw, type);
  const normalizedKey = normalizeCategoryKey(name);
  return name && name.length <= 70 && normalizedKey ? { name, normalized_key: normalizedKey, type } : null;
}

export async function GET() {
  const auth = await requireApiUser();
  if (!auth) return bad("Entre na sua conta para continuar.", 401);
  const { data, error } = await auth.supabase.from("category_definitions").select("*").eq("user_id", auth.user.id).order("name");
  return error ? bad("Não foi possível carregar as categorias.", 500) : Response.json({ categories: toCamelList(data) });
}

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth) return bad("Entre na sua conta para continuar.", 401);
  const value = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const input = categoryInput(value);
  if (!input) return bad("Confira o nome e o tipo da categoria.");
  const { data, error } = await auth.supabase.from("category_definitions").insert({ id: crypto.randomUUID(), user_id: auth.user.id, ...input }).select().maybeSingle();
  return error ? bad(error.code === "23505" ? "Esta categoria já existe." : "Não foi possível salvar a categoria.", error.code === "23505" ? 409 : 500) : Response.json({ category: toCamel(data!) }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireApiUser();
  if (!auth) return bad("Entre na sua conta para continuar.", 401);
  const value = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const sourceName = typeof value.sourceName === "string" ? value.sourceName.trim() : "";
  const target = categoryInput({ name: value.targetName, type: value.type });
  if (!sourceName || !target || sourceName === "all" || normalizeCategoryKey(sourceName) === target.normalized_key) return bad("Escolha nomes de origem e destino diferentes.");
  const owned = await auth.supabase.from("category_definitions").select("id").eq("user_id", auth.user.id).eq("name", sourceName).maybeSingle();
  if (!owned.data) return bad("Categoria não encontrada.", 404);
  const { error } = await auth.supabase.rpc("rename_category", {
    p_source_name: sourceName,
    p_target_name: target.name,
    p_target_key: target.normalized_key,
    p_type: target.type,
  });
  if (error) return bad("Não foi possível renomear ou fundir a categoria.", 500);
  return Response.json({ renamed: true, category: toCamel(target) });
}

export async function DELETE(request: Request) {
  const auth = await requireApiUser();
  if (!auth) return bad("Entre na sua conta para continuar.", 401);
  const value = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const name = typeof value.name === "string" ? value.name.trim() : "";
  if (!name || name === "all") return bad("Categoria inválida.");
  const [tx, plan, budget, benefit] = await Promise.all([
    auth.supabase.from("transactions").select("id").eq("user_id", auth.user.id).eq("category", name).limit(1).maybeSingle(),
    auth.supabase.from("plans").select("id").eq("user_id", auth.user.id).eq("category", name).limit(1).maybeSingle(),
    auth.supabase.from("budgets").select("id").eq("user_id", auth.user.id).eq("category_key", name).limit(1).maybeSingle(),
    auth.supabase.from("benefit_movements").select("id").eq("user_id", auth.user.id).eq("category", name).limit(1).maybeSingle(),
  ]);
  if (tx.data || plan.data || budget.data || benefit.data) return bad("Esta categoria possui registros. Renomeie ou funda com outra categoria antes de excluir.", 409);
  const { data, error } = await auth.supabase.from("category_definitions").delete().eq("user_id", auth.user.id).eq("name", name).select("id").maybeSingle();
  return error || !data ? bad("Categoria não encontrada.", 404) : Response.json({ deleted: true });
}
