"use client";

import { useMemo, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Row = { date: string; type: "income" | "expense"; amountCents: number };
type Point = { month: string; count: number; income: number | null; expense: number | null; net: number | null };
const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100);
const compact = (value: number) => new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value / 100);
const monthName = (month: string) => new Date(`${month}-15T12:00:00`).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
const fullMonth = (month: string) => new Date(`${month}-15T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
function monthOffset(month: string, offset: number) {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number - 1 + offset, 1)).toISOString().slice(0, 7);
}

export default function TrendChart({ rows }: { rows: Row[] }) {
  const [windowMonths, setWindowMonths] = useState<6 | 12>(6);
  const today = new Date(); today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
  const currentMonth = today.toISOString().slice(0, 7);
  const points = useMemo(() => {
    const totals = new Map<string, { income: number; expense: number; count: number }>();
    for (const row of rows) {
      const month = row.date.slice(0, 7);
      const item = totals.get(month) ?? { income: 0, expense: 0, count: 0 };
      item[row.type] += row.amountCents;
      item.count++;
      totals.set(month, item);
    }
    return Array.from({ length: windowMonths }, (_, i): Point => {
      const month = monthOffset(currentMonth, i - windowMonths + 1);
      const item = totals.get(month);
      return { month, count: item?.count ?? 0, income: item ? item.income : null, expense: item ? item.expense : null, net: item ? item.income - item.expense : null };
    });
  }, [rows, windowMonths, currentMonth]);
  const recorded = points.filter((point) => point.count > 0).length;
  return <div className="panel trend-panel">
    <div className="panel-head trend-head"><div><span className="section-kicker">EVOLUÇÃO</span><h2>Movimentação por mês</h2><p>Histórico independente do filtro acima. Meses sem registros aparecem como lacunas.</p></div><div className="trend-switch" aria-label="Período do gráfico"><button className={windowMonths === 6 ? "active" : ""} aria-pressed={windowMonths === 6} onClick={() => setWindowMonths(6)}>6 meses</button><button className={windowMonths === 12 ? "active" : ""} aria-pressed={windowMonths === 12} onClick={() => setWindowMonths(12)}>12 meses</button></div></div>
    <div className="legend trend-legend"><span><i className="legend-dot purple" />Receitas</span><span><i className="legend-dot coral" />Despesas</span><span><i className="legend-dot result" />Resultado</span></div>
    {recorded ? <div className="trend-scroll"><div className="chart-area trend-canvas" style={{ minWidth: windowMonths === 12 ? 720 : 450 }}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={points} margin={{ top: 14, right: 12, left: -17, bottom: 5 }}><CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="4 4" /><XAxis dataKey="month" tickFormatter={monthName} axisLine={false} tickLine={false} tick={{ fill: "var(--chart-axis)", fontSize: 10 }} interval={0} /><YAxis tickFormatter={compact} axisLine={false} tickLine={false} tick={{ fill: "var(--chart-axis)", fontSize: 10 }} /><Tooltip filterNull={false} content={({ active, label }) => { if (!active) return null; const point = points.find((item) => item.month === String(label)); if (!point) return null; return <div className="trend-tooltip"><strong>{fullMonth(point.month)}</strong><small>{point.month === currentMonth ? "Mês em andamento" : "Mês encerrado no calendário"} · {point.count} lançamento(s)</small>{point.count ? <><span>Receitas <b>{money(point.income ?? 0)}</b></span><span>Despesas <b>{money(point.expense ?? 0)}</b></span><span>Resultado <b>{money(point.net ?? 0)}</b></span></> : <small>Sem registros: valores desconhecidos.</small>}</div>; }} /><Bar dataKey="income" name="Receitas" fill="#6658c8" radius={[5, 5, 0, 0]} maxBarSize={22} /><Bar dataKey="expense" name="Despesas" fill="#cf7e87" radius={[5, 5, 0, 0]} maxBarSize={22} /><Line dataKey="net" name="Resultado" stroke="var(--chart-result)" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} /></ComposedChart></ResponsiveContainer></div></div> : <div className="empty-chart">Nenhum lançamento nos últimos {windowMonths} meses.</div>}
    <p className="trend-footnote">{recorded} de {windowMonths} meses com registros · {fullMonth(currentMonth)} ainda está em andamento. Meses passados também podem ter histórico incompleto.</p>
  </div>;
}
