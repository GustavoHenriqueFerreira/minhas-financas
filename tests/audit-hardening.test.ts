import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("tema inicial é escuro sem suprimir hidratação", () => {
  const app = read("app/finance-app.tsx");
  const layout = read("app/layout.tsx");
  assert.match(app, /useState\(true\)/);
  assert.match(layout, /data-theme="dark"/);
  assert.doesNotMatch(`${app}\n${layout}`, /suppressHydrationWarning/);
});

test("magic link exige e-mail válido antes do envio", () => {
  const auth = read("app/auth-form.tsx");
  assert.match(auth, /if \(!emailIsValid\)/);
  assert.match(auth, /disabled=\{busy \|\| !emailIsValid\}/);
});

test("rotas mutáveis rejeitam origem cruzada e payload excessivo", () => {
  const proxy = read("proxy.ts");
  assert.match(proxy, /origin !== request\.nextUrl\.origin/);
  assert.match(proxy, /fetchSite === "cross-site"/);
  assert.match(proxy, /status: 403/);
  assert.match(proxy, /20 \* 1024 \* 1024/);
  assert.match(proxy, /status: 413/);
});

test("headers impedem cache financeiro, framing e MIME sniffing", () => {
  const config = read("next.config.ts");
  assert.match(config, /Content-Security-Policy/);
  assert.doesNotMatch(config, /\*\.supabase\.co/);
  assert.match(config, /configuredSupabaseSources/);
  assert.match(config, /frame-ancestors 'none'/);
  assert.match(config, /X-Content-Type-Options[\s\S]*nosniff/);
  assert.match(config, /X-Frame-Options[\s\S]*DENY/);
  assert.match(config, /Referrer-Policy/);
  assert.match(config, /source: "\/api\/:path\*"[\s\S]*private, no-store/);
  assert.match(config, /source: "\/auth\/:path\*"[\s\S]*private, no-store/);
});

test("service worker armazena somente recursos estáticos seguros", () => {
  const worker = read("public/service-worker.js");
  assert.match(worker, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(worker, /url\.pathname\.startsWith\("\/auth\/"\)/);
  assert.match(worker, /request\.mode === "navigate"/);
  assert.match(worker, /cache-control/);
  assert.match(worker, /includes\("no-store"\)/);
  assert.doesNotMatch(worker, /cache\.put\(request[\s\S]*request\.mode === "navigate"/);
});

test("CRUD principal mantém autenticação e escopo de proprietário", () => {
  const expectedMethods: Record<string, string[]> = {
    transactions: ["GET", "POST", "PATCH", "DELETE"],
    categories: ["GET", "POST", "PATCH", "DELETE"],
    budgets: ["GET", "POST", "DELETE"],
    plans: ["GET", "POST", "PATCH", "PUT"],
    benefits: ["GET", "POST", "PATCH", "DELETE"],
  };
  for (const [route, methods] of Object.entries(expectedMethods)) {
    const source = read(`app/api/${route}/route.ts`);
    for (const method of methods) assert.match(source, new RegExp(`export async function ${method}\\(`), `${route}:${method}`);
    assert.match(source, /requireApiUser\(\)/, route);
    assert.match(source, /auth\.user\.id/, route);
  }
  const transactions = read("app/api/transactions/route.ts");
  assert.match(transactions, /\.eq\("id", id\)\.eq\("user_id", auth\.user\.id\)/);
  const benefits = read("app/api/benefits/route.ts");
  assert.match(benefits, /\.eq\("id", value\.id\)\.eq\("user_id", auth\.user\.id\)/);
});

test("hardening SQL é invoker, atômico e sem elevação de privilégio", () => {
  const initial = read("supabase/migrations/202611110001_initial_schema.sql");
  const hardening = read("supabase/migrations/202611110002_security_hardening.sql");
  assert.doesNotMatch(`${initial}\n${hardening}`, /security definer/i);
  assert.match(hardening, /security invoker/i);
  assert.match(hardening, /set search_path = ''/i);
  assert.match(hardening, /current_user_id uuid := auth\.uid\(\)/i);
  assert.doesNotMatch(hardening, /p_user_id/i);
  assert.match(hardening, /revoke all on function .* from public, anon/i);
  assert.match(hardening, /grant execute .* to authenticated/i);
});
