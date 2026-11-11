import assert from "node:assert/strict";
import test from "node:test";
import {
  benefitAdjustment,
  canonicalCategoryName,
  dueDate,
  importFingerprint,
  installmentAmount,
  normalizeCategoryKey,
  parsePositiveCents,
} from "../lib/finance-rules.ts";

test("normaliza categorias equivalentes", () => {
  assert.equal(normalizeCategoryKey("(D) Alimentação"), "alimentacao");
  assert.equal(normalizeCategoryKey("  alimentação  "), "alimentacao");
  assert.equal(
    canonicalCategoryName("alimentação", "expense"),
    "(D) alimentação",
  );
});

test("converte valores brasileiros em centavos", () => {
  assert.equal(parsePositiveCents("R$ 1.254,90"), 125490);
  assert.equal(parsePositiveCents("32.90"), 3290);
  assert.equal(parsePositiveCents("0"), null);
});

test("preserva o dia possível ao avançar meses", () => {
  assert.equal(dueDate("2026-01-31", 1), "2026-02-28");
  assert.equal(dueDate("2026-01-31", 2), "2026-03-31");
});

test("divide parcelas sem perder centavos", () => {
  const parts = Array.from({ length: 3 }, (_, index) =>
    installmentAmount(1000, 3, index),
  );
  assert.deepEqual(parts, [334, 333, 333]);
  assert.equal(
    parts.reduce((total, value) => total + value, 0),
    1000,
  );
});

test("detecta duplicidade mesmo com acentos diferentes na categoria", () => {
  const base = {
    date: "2026-11-02",
    type: "expense",
    amountCents: 3290,
    description: "Almoço",
  };
  assert.equal(
    importFingerprint({ ...base, category: "(D) Alimentação" }),
    importFingerprint({ ...base, category: "alimentacao" }),
  );
});

test("calcula ajuste de conciliação do benefício", () => {
  assert.equal(benefitAdjustment(50000, 48750), -1250);
  assert.equal(benefitAdjustment(50000, 52000), 2000);
});
