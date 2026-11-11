"use client";

type Row = { type: "income" | "expense"; amountCents: number; category: string; planId: string | null; occurrenceIndex: number | null };
type Plan = { id: string; kind: "recurring" | "installment"; status: "active" | "paused" | "canceled"; startDate: string; amountCents: number };
const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100);
const categoryLabel = (value: string) => value.replace(/^\([DR]\)\s*/, "");
function monthIndex(start: string, target: string) {
  return (Number(target.slice(0, 4)) - Number(start.slice(0, 4))) * 12 + Number(target.slice(5, 7)) - Number(start.slice(5, 7));
}

export default function InsightCard({ selected, allRows, plans, period, periodName, prior }: { selected: Row[]; allRows: Row[]; plans: Plan[]; period: string; periodName: string; prior: { expense: number; count: number } | null }) {
  const income = selected.reduce((total, row) => total + (row.type === "income" ? row.amountCents : 0), 0);
  const expense = selected.reduce((total, row) => total + (row.type === "expense" ? row.amountCents : 0), 0);
  const byCategory = new Map<string, number>();
  for (const row of selected) if (row.type === "expense") byCategory.set(row.category, (byCategory.get(row.category) ?? 0) + row.amountCents);
  const top = [...byCategory].sort((a, b) => b[1] - a[1])[0];
  const incomeUsed = income > 0 ? Math.round(expense / income * 100) : null;
  const isMonth = /^\d{4}-\d{2}$/.test(period);
  const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  const isCurrentMonth = period === now.toISOString().slice(0, 7);
  const expected = isMonth ? plans.filter((plan) => plan.kind === "recurring" && plan.status === "active" && plan.startDate.slice(0, 7) <= period).reduce((total, plan) => {
    const index = monthIndex(plan.startDate, period);
    return allRows.some((row) => row.planId === plan.id && row.occurrenceIndex === index) ? total : total + plan.amountCents;
  }, 0) : 0;
  return <div className="insight-card"><span className="section-kicker">LEITURA DO PERÍODO</span><div className="insight-metrics">
    {top && <div><small>Maior categoria de despesa</small><strong>{categoryLabel(top[0])}</strong><span>{money(top[1])} · {Math.round(top[1] / expense * 100)}% das despesas</span></div>}
    {incomeUsed !== null && <div><small>Receita usada nas despesas</small><strong>{incomeUsed}%</strong><span>{incomeUsed <= 100 ? `${100 - incomeUsed}% da receita não consumida` : "Despesas acima da receita registrada"}</span></div>}
    {isMonth && prior?.count ? <div><small>Gastos vs. {isCurrentMonth ? "mesmos dias do mês anterior" : "mês anterior"}</small><strong>{expense >= prior.expense ? "+" : ""}{money(expense - prior.expense)}</strong><span>{prior.expense ? `${Math.round((expense - prior.expense) / prior.expense * 100)}% de diferença entre registros` : "Sem base percentual"}</span></div> : null}
    {expected > 0 && <div><small>Recorrências previstas pendentes</small><strong>{money(expected)}</strong><span>Entram nos gastos quando pagas</span></div>}
    {!top && incomeUsed === null && !expected && <p>Adicione lançamentos para acompanhar este período.</p>}
  </div><div className="insight-footer">{selected.length} lançamento(s) em {periodName} · valores registrados, não saldo bancário</div></div>;
}
