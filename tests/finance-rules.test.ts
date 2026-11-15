import assert from "node:assert/strict";
import test from "node:test";
import {
  benefitAdjustment,
  canonicalCategoryName,
  countLabel,
  dueDate,
  importFingerprint,
  installmentAmount,
  MIN_PERCENT_COMPARISON_BASE_CENTS,
  normalizeCategoryKey,
  parsePositiveCents,
  percentageChangeForComparison,
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

test("evita percentual enganoso quando a base anterior é muito pequena", () => {
  assert.equal(MIN_PERCENT_COMPARISON_BASE_CENTS, 10_000);
  assert.equal(percentageChangeForComparison(200110, 9990), "small-base");
  assert.equal(percentageChangeForComparison(12000, 10000), 20);
  assert.equal(percentageChangeForComparison(8000, 10000), -20);
  assert.equal(percentageChangeForComparison(5000, 0), null);
});

test("flexiona contagens no singular e no plural", () => {
  assert.equal(countLabel(1, "movimentação recuperada", "movimentações recuperadas"), "1 movimentação recuperada");
  assert.equal(countLabel(2, "movimentação recuperada", "movimentações recuperadas"), "2 movimentações recuperadas");
});
