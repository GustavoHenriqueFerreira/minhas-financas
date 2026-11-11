"use client";

type Row = { type: "income" | "expense"; amountCents: number };
type Budget = { categoryKey: string; amountCents: number };
const money = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    value / 100,
  );

export default function MonthPulse({
  rows,
  budgets,
  period,
}: {
  rows: Row[];
  budgets: Budget[];
  period: string;
}) {
  if (!/^\d{4}-\d{2}$/.test(period)) return null;
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  const currentMonth = now.toISOString().slice(0, 7),
    isCurrent = period === currentMonth;
  const [year, month] = period.split("-").map(Number);
  const totalDays = new Date(year, month, 0).getDate();
  const elapsedDays = isCurrent
    ? Number(now.toISOString().slice(8, 10))
    : totalDays;
  const remainingDays = Math.max(0, totalDays - elapsedDays);
  const expense = rows.reduce(
    (total, row) => total + (row.type === "expense" ? row.amountCents : 0),
    0,
  );
  const income = rows.reduce(
    (total, row) => total + (row.type === "income" ? row.amountCents : 0),
    0,
  );
  const average = elapsedDays ? Math.round(expense / elapsedDays) : 0;
  const projection = Math.round(average * totalDays);
  const totalBudget = budgets.find(
    (budget) => budget.categoryKey === "all",
  )?.amountCents;
  const hasDailyBase = totalBudget !== undefined || income > 0;
  const available =
    totalBudget !== undefined ? totalBudget - expense : income - expense;
  const dailyAvailable = remainingDays
    ? Math.max(0, Math.floor(available / remainingDays))
    : Math.max(0, available);
  return (
    <section className="month-pulse" aria-label="Ritmo do mês">
      <div>
        <small>Gasto até agora</small>
        <strong>{money(expense)}</strong>
        <span>{elapsedDays} dia(s) considerados</span>
      </div>
      <div>
        <small>Média diária</small>
        <strong>{money(average)}</strong>
        <span>Com base no que foi registrado</span>
      </div>
      <div>
        <small>Projeção do mês</small>
        <strong>{money(projection)}</strong>
        <span>
          {isCurrent ? "Mantendo o ritmo atual" : "Média do mês encerrado"}
        </span>
      </div>
      <div>
        <small>
          {totalBudget !== undefined
            ? "Disponível por dia no orçamento"
            : "Receita restante por dia"}
        </small>
        <strong>{hasDailyBase ? money(dailyAvailable) : "Sem base"}</strong>
        <span>
          {hasDailyBase
            ? remainingDays
              ? `${remainingDays} dia(s) restantes`
              : "Mês encerrado"
            : "Registre uma receita ou orçamento"}
        </span>
      </div>
    </section>
  );
}
