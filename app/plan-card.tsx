"use client";

import { dueDate, installmentAmount } from "../lib/finance-rules";

type Plan = { id: string; kind: "recurring" | "installment"; description: string; category: string; startDate: string; amountCents: number; installmentCount: number | null; status: "active" | "paused" | "canceled" };
type Row = { planId: string | null; occurrenceIndex: number | null; amountCents: number; date: string };
const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100);
const label = (value: string) => value.replace(/^\([DR]\)\s*/, "");
const dateLabel = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");
const today = () => { const value = new Date(); value.setMinutes(value.getMinutes() - value.getTimezoneOffset()); return value.toISOString().slice(0, 10); };
function amount(plan: Plan, index: number) {
  if (plan.kind === "recurring") return plan.amountCents;
  const count = plan.installmentCount || 1;
  return installmentAmount(plan.amountCents, count, index);
}
export default function PlanCard({ plan, rows, busy, onEdit, onPay, onStatus }: { plan: Plan; rows: Row[]; busy: boolean; onEdit: () => void; onPay: (index: number) => void; onStatus: (status: Plan["status"]) => void }) {
  const paid = rows.filter((row) => row.planId === plan.id);
  const paidIndexes = new Set(paid.map((row) => row.occurrenceIndex));
  const paidByIndex = new Map(paid.map((row) => [row.occurrenceIndex, row]));
  const now = today();
  const monthIndex = (Number(now.slice(0, 4)) - Number(plan.startDate.slice(0, 4))) * 12 + Number(now.slice(5, 7)) - Number(plan.startDate.slice(5, 7));
  const currentIndex = Math.max(0, monthIndex);
  const nextIndex = plan.kind === "installment" ? Array.from({ length: plan.installmentCount || 0 }, (_, i) => i).find((i) => !paidIndexes.has(i)) : (() => { let i = currentIndex; while (paidIndexes.has(i)) i++; return i; })();
  const paidTotal = paid.reduce((total, row) => total + row.amountCents, 0);
  const timeline = plan.kind === "installment" ? Array.from({ length: plan.installmentCount || 0 }, (_, i) => i) : [...new Set([...paid.map((row) => row.occurrenceIndex).filter((i): i is number => i !== null), ...Array.from({ length: 5 }, (_, i) => currentIndex + i - 2).filter((i) => i >= 0)])].sort((a, b) => a - b);
  return <div className="plan-item"><div className="plan-main"><strong>{plan.description}</strong><span>{plan.kind === "installment" ? `${plan.installmentCount} parcelas · total ${money(plan.amountCents)}` : `${money(plan.amountCents)} por mês`} · {label(plan.category)}</span><small>{plan.status === "active" ? "Ativo" : plan.status === "paused" ? "Pausado" : "Cancelado"} · {paid.length} paga(s){plan.kind === "installment" ? ` · ${(plan.installmentCount || 0) - paid.length} pendente(s) · resta ${money(Math.max(0, plan.amountCents - paidTotal))}` : ""}</small></div><div className="plan-actions"><button className="text-button" onClick={onEdit}>Editar</button>{nextIndex !== undefined && plan.status === "active" && <button className="secondary-button" disabled={busy} onClick={() => onPay(nextIndex)}>Confirmar {plan.kind === "installment" ? `parcela ${nextIndex + 1}/${plan.installmentCount}` : "mensalidade"} · {money(amount(plan, nextIndex))} <small>{dateLabel(dueDate(plan.startDate, nextIndex))}</small></button>}{plan.status === "active" ? <button className="text-button" disabled={busy} onClick={() => onStatus("paused")}>Pausar</button> : plan.status === "paused" ? <button className="text-button" disabled={busy} onClick={() => onStatus("active")}>Retomar</button> : null}{plan.status !== "canceled" && <button className="text-button danger" disabled={busy} onClick={() => onStatus("canceled")}>Cancelar</button>}</div><details className="plan-details"><summary>Ver cobranças previstas e pagas</summary><div className="plan-timeline">{timeline.map((index) => { const date = dueDate(plan.startDate, index); const payment = paidByIndex.get(index); const isPaid = !!payment; return <div key={index} className="plan-occurrence"><span><strong>{plan.kind === "installment" ? `Parcela ${index + 1}/${plan.installmentCount}` : "Mensalidade"}</strong><small>{dateLabel(payment?.date ?? date)} · {isPaid ? "Paga" : date < now ? "Pendente" : "Prevista"}</small></span><strong>{money(payment?.amountCents ?? amount(plan, index))}</strong>{!isPaid && plan.status === "active" && <button className="text-button" disabled={busy} onClick={() => onPay(index)}>Confirmar pagamento</button>}</div>; })}</div><p className="quiet-note">Cobranças previstas não entram nos totais até o pagamento ser confirmado. Recorrências mostram as últimas, as próximas e todas as já pagas.</p></details></div>;
}
