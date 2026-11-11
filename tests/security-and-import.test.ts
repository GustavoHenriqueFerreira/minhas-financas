import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";
import { BACKUP_V1, BACKUP_V2, backupShape, importUuid, withoutOwnership } from "../lib/backup.ts";
import { validDate, validEmail, validEntry, validMoney, validMonth } from "../lib/validation.ts";

const sql = readFileSync("supabase/migrations/202611110001_initial_schema.sql", "utf8");
const apiFiles = ["transactions", "plans", "budgets", "categories", "benefits", "import", "backup"];

test("conta nova começa vazia e não existe seed pessoal", () => {
  assert.equal(existsSync("app/data/historical.json"), false);
  assert.equal(existsSync("app/chatgpt-auth.ts"), false);
  const transactionSource = readFileSync("app/api/transactions/route.ts", "utf8");
  assert.equal(transactionSource.includes(["seed", "ForUser"].join("")), false);
  assert.equal(transactionSource.includes(["historical", "Count"].join("")), false);
  assert.equal(sql.includes(["seed", "_state"].join("")), false);
});

test("todas as APIs financeiras recusam sessão ausente com 401", () => {
  for (const name of apiFiles) {
    const source = readFileSync(`app/api/${name}/route.ts`, "utf8");
    assert.match(source, /requireApiUser\(\)/, name);
    assert.match(source, /if \(!auth\) return bad\([^;]+, 401\)/, name);
  }
});

test("RLS impede usuário A de ler, editar ou excluir registros do usuário B", () => {
  const tables = ["transactions", "transaction_versions", "plans", "budgets", "category_definitions", "benefit_wallets", "benefit_movements"];
  for (const table of tables) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    assert.match(sql, new RegExp(`create policy ${table}_select_own on public\\.${table} for select[\\s\\S]*auth\\.uid\\(\\).*user_id`, "i"));
    assert.match(sql, new RegExp(`create policy ${table}_insert_own on public\\.${table} for insert`, "i"));
    assert.match(sql, new RegExp(`create policy ${table}_update_own on public\\.${table} for update`, "i"));
    assert.match(sql, new RegExp(`create policy ${table}_delete_own on public\\.${table} for delete`, "i"));
  }
  assert.match(sql, /for update to authenticated using \(\(select auth\.uid\(\)\) = user_id\) with check/);
  assert.match(sql, /for delete to authenticated using \(\(select auth\.uid\(\)\) = user_id\)/);
});

test("inserções usam exclusivamente o usuário autenticado", () => {
  for (const name of apiFiles) {
    const source = readFileSync(`app/api/${name}/route.ts`, "utf8");
    if (/\.insert\(|\.upsert\(/.test(source)) assert.match(source, /user_id: (auth\.user\.id|userId)/, name);
  }
  assert.match(sql, /for insert to authenticated with check \(\(select auth\.uid\(\)\) = user_id\)/);
});

test("importação aceita v1 e v2, ignora userId e é idempotente", async () => {
  assert.ok(backupShape({ format: BACKUP_V1, transactions: [], plans: [], budgets: [] }));
  assert.ok(backupShape({ format: BACKUP_V2, transactions: [], plans: [], budgets: [] }));
  assert.deepEqual(withoutOwnership({ id: "x", userId: "antigo", user_id: "antigo", amountCents: 100 }), { id: "x", amountCents: 100 });
  const first = await importUuid("00000000-0000-0000-0000-000000000001", "transactions", "old-id");
  const second = await importUuid("00000000-0000-0000-0000-000000000001", "transactions", "old-id");
  assert.equal(first, second);
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("valida valores, datas e tipos", () => {
  assert.equal(validEmail("invalido"), false);
  assert.equal(validEmail("pessoa@example.com"), true);
  assert.equal(validDate("2026-02-29"), false);
  assert.equal(validDate("2028-02-29"), true);
  assert.equal(validMonth("2026-13"), false);
  assert.equal(validMoney(-1), false);
  assert.equal(validMoney(100_000_000_001), false);
  assert.equal(validEntry({ date: "2026-11-11", description: "Teste", type: "other", category: "Categoria", amountCents: 100 }), null);
  assert.ok(validEntry({ date: "2026-11-11", description: "Teste", type: "expense", category: "Categoria", amountCents: 100 }));
});

test("constraints cobrem categorias, orçamentos, planos e VR", () => {
  assert.match(sql, /unique \(user_id, month, category_key\)/);
  assert.match(sql, /unique \(user_id, type, normalized_key\)/);
  assert.match(sql, /kind in \('recurring', 'installment'\)/);
  assert.match(sql, /kind in \('credit', 'expense', 'adjustment'\)/);
  assert.match(sql, /benefit_movements_wallet_owner_fk/);
  assert.match(sql, /transactions_plan_owner_fk/);
});
