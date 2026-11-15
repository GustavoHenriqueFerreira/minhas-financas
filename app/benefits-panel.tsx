"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Pencil, Trash2 } from "lucide-react";
import {
  benefitBalance,
  benefitDelta,
  type BenefitMovement,
  type BenefitWallet,
} from "./benefits-types";
import { benefitAdjustment, countLabel } from "../lib/finance-rules";

const money = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    value / 100,
  );
const amountText = (value: number) =>
  (Math.abs(value) / 100).toFixed(2).replace(".", ",");
const today = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
};
const dateLabel = (value: string) =>
  new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");
const monthLabel = (value: string) =>
  new Date(`${value}-15T12:00:00`).toLocaleDateString("pt-BR", {
    month: "short",
    year: "numeric",
  });
const categoryLabel = (value: string) => value.replace(/^\([DR]\)\s*/, "");
function parseAmount(input: string, allowZero = false) {
  const raw = input.replace(/R\$|\s/g, "");
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const value = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(value) && (allowZero ? value >= 0 : value > 0)
    ? value
    : null;
}
function monthAt(month: string, offset: number) {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number - 1 + offset, 1))
    .toISOString()
    .slice(0, 7);
}
function habitualDate(month: string, day: number) {
  const [year, number] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return `${month}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

export default function BenefitsPanel({
  wallet,
  movements,
  onReload,
  onNotice,
  onNewExpense,
  onEditExpense,
}: {
  wallet: BenefitWallet | null;
  movements: BenefitMovement[];
  onReload: () => Promise<void>;
  onNotice: (value: string) => void;
  onNewExpense: () => void;
  onEditExpense: (item: BenefitMovement) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [setup, setSetup] = useState({
    openingBalance: "",
    openingDate: today(),
    monthlyCredit: "",
    creditDay: "",
  });
  const [config, setConfig] = useState(setup),
    [editingConfig, setEditingConfig] = useState(false);
  const [creditDate, setCreditDate] = useState(today()),
    [creditAmount, setCreditAmount] = useState("");
  const [adjustDate, setAdjustDate] = useState(today()),
    [adjustAmount, setAdjustAmount] = useState(""),
    [adjustDirection, setAdjustDirection] = useState<"in" | "out">("in"),
    [adjustNote, setAdjustNote] = useState("");
  const [actualBalance, setActualBalance] = useState("");
  const [editing, setEditing] = useState<BenefitMovement | null>(null);
  const [editDate, setEditDate] = useState(""),
    [editAmount, setEditAmount] = useState(""),
    [editDescription, setEditDescription] = useState(""),
    [editNotes, setEditNotes] = useState(""),
    [editDirection, setEditDirection] = useState<"in" | "out">("in");
  const [showAll, setShowAll] = useState(false);
  const creditKey = useRef<string | null>(null),
    adjustKey = useRef<string | null>(null),
    reconcileKey = useRef<string | null>(null);

  useEffect(() => {
    if (!wallet) return;
    queueMicrotask(() => {
      setConfig({
        openingBalance: amountText(wallet.openingBalanceCents),
        openingDate: wallet.openingDate,
        monthlyCredit: amountText(wallet.monthlyCreditCents),
        creditDay: String(wallet.creditDay),
      });
      setCreditAmount(amountText(wallet.monthlyCreditCents));
    });
  }, [wallet]);

  async function request(
    method: "POST" | "PATCH" | "DELETE",
    body: Record<string, unknown>,
  ) {
    const response = await fetch("/api/benefits", {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = (await response.json()) as Record<string, unknown>;
    if (!response.ok)
      throw new Error(typeof result.error === "string" ? result.error : "Não foi possível concluir.");
    return result;
  }
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
      await onReload();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível concluir.",
      );
    } finally {
      setBusy(false);
    }
  }
  function configPayload(value: typeof setup) {
    const openingBalanceCents = parseAmount(value.openingBalance, true);
    const monthlyCreditCents = parseAmount(value.monthlyCredit);
    const creditDay = Number(value.creditDay);
    if (
      openingBalanceCents === null ||
      monthlyCreditCents === null ||
      !Number.isInteger(creditDay) ||
      creditDay < 1 ||
      creditDay > 31
    )
      throw new Error(
        "Informe o saldo inicial, o crédito mensal e um dia entre 1 e 31.",
      );
    return {
      openingBalanceCents,
      openingDate: value.openingDate,
      monthlyCreditCents,
      creditDay,
    };
  }
  function saveSetup(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      await request("POST", { action: "setup", ...configPayload(setup) });
      onNotice(
        "Carteira de VR criada. Confirme cada crédito quando ele aparecer no cartão.",
      );
    });
  }
  function saveConfig(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      await request("PATCH", { action: "wallet", ...configPayload(config) });
      setEditingConfig(false);
      onNotice("Configuração do VR atualizada.");
    });
  }
  function saveCredit(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      const amountCents = parseAmount(creditAmount);
      if (amountCents === null)
        throw new Error("Informe um valor positivo para o crédito.");
      creditKey.current ??= crypto.randomUUID();
      await request("POST", {
        action: "movement",
        kind: "credit",
        date: creditDate,
        description: "Crédito de VR",
        amountCents,
        clientKey: creditKey.current,
      });
      creditKey.current = null;
      onNotice("Crédito de VR confirmado.");
    });
  }
  function saveAdjustment(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      const amount = parseAmount(adjustAmount);
      if (amount === null)
        throw new Error("Informe um valor positivo para o ajuste.");
      adjustKey.current ??= crypto.randomUUID();
      await request("POST", {
        action: "movement",
        kind: "adjustment",
        date: adjustDate,
        description: adjustNote.trim() || "Ajuste de saldo",
        amountCents: adjustDirection === "in" ? amount : -amount,
        clientKey: adjustKey.current,
      });
      adjustKey.current = null;
      setAdjustAmount("");
      setAdjustNote("");
      onNotice("Saldo de VR ajustado.");
    });
  }
  function saveReconciliation(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      const actual = parseAmount(actualBalance, true);
      if (actual === null)
        throw new Error("Informe o saldo atual mostrado no cartão.");
      const difference = benefitAdjustment(
        benefitBalance(wallet!, movements),
        actual,
      );
      if (difference === 0) {
        setActualBalance("");
        onNotice(
          "O saldo do app já confere com o cartão de benefício. Nenhum ajuste foi necessário.",
        );
        return;
      }
      reconcileKey.current ??= crypto.randomUUID();
      await request("POST", {
        action: "movement",
        kind: "adjustment",
        date: today(),
        description: "Conciliação com saldo do benefício",
        notes: `Saldo informado no cartão: ${money(actual)}`,
        amountCents: difference,
        clientKey: reconcileKey.current,
      });
      reconcileKey.current = null;
      setActualBalance("");
      onNotice("Saldo do VR conciliado com o valor mostrado pela operadora.");
    });
  }
  function openEdit(item: BenefitMovement) {
    if (item.kind === "expense") {
      onEditExpense(item);
      return;
    }
    setEditing(item);
    setEditDate(item.date);
    setEditAmount(amountText(item.amountCents));
    setEditDescription(item.description);
    setEditNotes(item.notes || "");
    setEditDirection(item.amountCents < 0 ? "out" : "in");
    setError("");
  }
  function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    void run(async () => {
      const amount = parseAmount(editAmount);
      if (amount === null) throw new Error("Informe um valor positivo.");
      await request("PATCH", {
        action: "movement",
        id: editing.id,
        date: editDate,
        description: editDescription,
        notes: editNotes,
        amountCents:
          editing.kind === "adjustment" && editDirection === "out"
            ? -amount
            : amount,
      });
      setEditing(null);
      onNotice("Movimentação de VR atualizada.");
    });
  }
  function remove(item: BenefitMovement) {
    if (
      !confirm(
        `Excluir “${item.description}” de ${dateLabel(item.date)}? O saldo de VR será recalculado.`,
      )
    )
      return;
    void run(async () => {
      await request("DELETE", { id: item.id });
      setEditing(null);
      onNotice("Movimentação de VR excluída.");
    });
  }

  if (!wallet)
    return (
      <div className="feature-stack">
        <section className="panel form-panel benefit-setup">
          <span className="section-kicker">CARTEIRA DE BENEFÍCIOS</span>
          <h2>Configurar Vale-Refeição</h2>
          <p>
            Informe o saldo que já existe no cartão. O crédito mensal é uma
            referência; ele só aumenta o saldo quando você confirmar o
            recebimento.
          </p>
          <form onSubmit={saveSetup}>
            <div className="form-grid">
              <label>
                Saldo inicial do cartão (R$)
                <input
                  required
                  inputMode="decimal"
                  placeholder="0,00"
                  value={setup.openingBalance}
                  onChange={(event) =>
                    setSetup({ ...setup, openingBalance: event.target.value })
                  }
                />
              </label>
              <label>
                Data do saldo inicial
                <input
                  required
                  type="date"
                  value={setup.openingDate}
                  onChange={(event) =>
                    setSetup({ ...setup, openingDate: event.target.value })
                  }
                />
              </label>
              <label>
                Crédito mensal habitual (R$)
                <input
                  required
                  inputMode="decimal"
                  value={setup.monthlyCredit}
                  onChange={(event) =>
                    setSetup({ ...setup, monthlyCredit: event.target.value })
                  }
                />
              </label>
              <label>
                Dia habitual do crédito
                <input
                  required
                  type="number"
                  min="1"
                  max="31"
                  placeholder="Ex.: 5"
                  value={setup.creditDay}
                  onChange={(event) =>
                    setSetup({ ...setup, creditDay: event.target.value })
                  }
                />
              </label>
            </div>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="primary-button" disabled={busy}>
              Criar carteira de VR
            </button>
          </form>
        </section>
      </div>
    );

  const currentDate = today(),
    month = currentDate.slice(0, 7),
    elapsed = Number(currentDate.slice(8));
  const balance = benefitBalance(wallet, movements);
  const actualBalanceCents = actualBalance
    ? parseAmount(actualBalance, true)
    : null;
  const reconciliationDifference =
    actualBalanceCents === null
      ? null
      : benefitAdjustment(balance, actualBalanceCents);
  const received = movements
    .filter((item) => item.kind === "credit" && item.date.startsWith(month))
    .reduce((total, item) => total + item.amountCents, 0);
  const spent = movements
    .filter((item) => item.kind === "expense" && item.date.startsWith(month))
    .reduce((total, item) => total + item.amountCents, 0);
  const percent = Math.round((spent / wallet.monthlyCreditCents) * 100);
  const creditOverdue =
    currentDate >= habitualDate(month, wallet.creditDay) && received === 0;
  let nextDate = habitualDate(month, wallet.creditDay);
  if (nextDate < currentDate || (nextDate === currentDate && received > 0))
    nextDate = habitualDate(monthAt(month, 1), wallet.creditDay);
  const daysToNext = Math.round(
    (Date.parse(`${nextDate}T12:00:00Z`) -
      Date.parse(`${currentDate}T12:00:00Z`)) /
      86400000,
  );
  const history = movements
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const months = Array.from({ length: 6 }, (_, index) =>
    monthAt(month, index - 5),
  ).map((key) => ({
    key,
    credits: movements
      .filter((item) => item.kind === "credit" && item.date.startsWith(key))
      .reduce((total, item) => total + item.amountCents, 0),
    expenses: movements
      .filter((item) => item.kind === "expense" && item.date.startsWith(key))
      .reduce((total, item) => total + item.amountCents, 0),
  }));
  const maxMonth = Math.max(
    wallet.monthlyCreditCents,
    ...months.flatMap((item) => [item.credits, item.expenses]),
  );
  return (
    <div className="feature-stack benefit-page">
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      <section className="panel benefit-hero">
        <div>
          <span className="section-kicker">VALE-REFEIÇÃO · SALDO SEPARADO</span>
          <h2>{money(balance)}</h2>
          <p>
            Disponível no VR conforme o que você registrou. O dinheiro das suas
            contas continua separado.
          </p>
          {balance < 0 && (
            <p className="benefit-warning">
              Saldo negativo nos registros: confira o saldo inicial e as
              movimentações.
            </p>
          )}
          {creditOverdue && (
            <p className="benefit-warning">
              O dia habitual do crédito já chegou e nenhum crédito foi
              confirmado neste mês. Confira o cartão de benefício.
            </p>
          )}
        </div>
        <button className="primary-button" onClick={onNewExpense}>
          + Registrar gasto com VR
        </button>
      </section>
      <section className="benefit-stats">
        <div className="panel">
          <small>Créditos confirmados no mês</small>
          <strong>{money(received)}</strong>
          <span>Crédito habitual: {money(wallet.monthlyCreditCents)}</span>
        </div>
        <div className="panel">
          <small>Utilizado no mês</small>
          <strong>{money(spent)}</strong>
          <span>{percent}% do crédito mensal de referência</span>
        </div>
        <div className="panel">
          <small>Média diária registrada</small>
          <strong>{money(Math.round(spent / elapsed))}</strong>
          <span>Desde o início deste mês</span>
        </div>
      </section>
      <section className="panel benefit-progress-panel">
        <div className="panel-head compact">
          <div>
            <span className="section-kicker">ACOMPANHAMENTO</span>
            <h2>Uso do VR neste mês</h2>
          </div>
          <strong>{percent}%</strong>
        </div>
        <div
          className="budget-track"
          role="progressbar"
          aria-label="Uso do crédito mensal de VR"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(100, percent)}
          aria-valuetext={`${percent}% do crédito mensal de referência`}
        >
          <div
            className={percent >= 100 ? "over" : percent >= 80 ? "near" : ""}
            style={{ width: `${Math.min(100, percent)}%` }}
          />
        </div>
        <p>
          O saldo pode incluir sobras de outros meses. Esta barra compara os
          gastos do mês ao crédito habitual, sem limitar o cartão.
        </p>
        <div className="benefit-daily">
          <strong>
            {daysToNext > 0
              ? `${money(Math.max(0, Math.floor(balance / daysToNext)))} por dia`
              : "Crédito habitual hoje"}
          </strong>
          <span>
            {daysToNext > 0
              ? `Referência até ${dateLabel(nextDate)} (${countLabel(daysToNext, "dia", "dias")}). Não é um limite obrigatório.`
              : "Confirme o crédito quando ele aparecer no cartão. A data habitual não cria saldo automaticamente."}
          </span>
        </div>
      </section>
      <section className="panel form-panel">
        <div className="panel-head">
          <div>
            <span className="section-kicker">MOVIMENTAÇÕES</span>
            <h2>Confirmar crédito recebido</h2>
            <p>
              Créditos previstos não entram no saldo. Só é permitido um crédito
              confirmado por mês.
            </p>
          </div>
        </div>
        <form onSubmit={saveCredit}>
          <div className="form-grid">
            <label>
              Data do crédito
              <input
                required
                type="date"
                value={creditDate}
                onChange={(event) => setCreditDate(event.target.value)}
              />
            </label>
            <label>
              Valor recebido (R$)
              <input
                required
                inputMode="decimal"
                value={creditAmount}
                onChange={(event) => setCreditAmount(event.target.value)}
              />
            </label>
          </div>
          <button className="secondary-button" disabled={busy}>
            Confirmar crédito
          </button>
        </form>
      </section>
      <section className="panel form-panel">
        <div className="panel-head">
          <div>
            <span className="section-kicker">CONCILIAÇÃO</span>
            <h2>Conferir com a operadora</h2>
            <p>
              Informe o saldo atual mostrado no cartão. O app calcula e registra
              apenas a diferença, sem alterar sua renda financeira.
            </p>
          </div>
        </div>
        <form className="reconcile-panel" onSubmit={saveReconciliation}>
          <label>
            Saldo atual do cartão de benefício (R$)
            <input
              required
              inputMode="decimal"
              value={actualBalance}
              onChange={(event) => setActualBalance(event.target.value)}
              placeholder="0,00"
            />
          </label>
          <div className="reconcile-result" aria-live="polite">
            <span>Ajuste calculado</span>
            <strong>
              {reconciliationDifference === null
                ? "Informe o saldo"
                : reconciliationDifference === 0
                  ? "Saldos conferem"
                  : `${reconciliationDifference > 0 ? "+" : "−"}${money(Math.abs(reconciliationDifference))}`}
            </strong>
          </div>
          <button
            className="primary-button"
            disabled={busy || actualBalanceCents === null}
          >
            Conciliar saldo
          </button>
        </form>
        <details className="manual-adjustment">
          <summary>Fazer um ajuste manual</summary>
          <form onSubmit={saveAdjustment}>
            <div className="form-grid">
              <label>
                Data
                <input
                  required
                  type="date"
                  value={adjustDate}
                  onChange={(event) => setAdjustDate(event.target.value)}
                />
              </label>
              <label>
                Direção
                <select
                  value={adjustDirection}
                  onChange={(event) =>
                    setAdjustDirection(event.target.value as "in" | "out")
                  }
                >
                  <option value="in">Adicionar ao saldo</option>
                  <option value="out">Reduzir o saldo</option>
                </select>
              </label>
              <label>
                Valor (R$)
                <input
                  required
                  inputMode="decimal"
                  value={adjustAmount}
                  onChange={(event) => setAdjustAmount(event.target.value)}
                  placeholder="0,00"
                />
              </label>
              <label>
                Motivo
                <input
                  value={adjustNote}
                  onChange={(event) => setAdjustNote(event.target.value)}
                  placeholder="Ex.: correção do cartão"
                  maxLength={120}
                />
              </label>
            </div>
            <button className="secondary-button" disabled={busy}>
              Registrar ajuste
            </button>
          </form>
        </details>
      </section>
      <section className="panel benefit-history">
        <div className="panel-head">
          <div>
            <span className="section-kicker">HISTÓRICO</span>
            <h2>Créditos e utilização</h2>
            <p>Edite ou exclua um registro para recalcular o saldo.</p>
          </div>
        </div>
        {history.length ? (
          <>
            {(showAll ? history : history.slice(0, 20)).map((item) => (
              <div className="benefit-history-row" key={item.id}>
                <div>
                  <strong>{item.description}</strong>
                  <small>
                    {dateLabel(item.date)} ·{" "}
                    {item.kind === "expense"
                      ? `VR · ${categoryLabel(item.category || "Sem categoria")}`
                      : item.kind === "credit"
                        ? "Crédito confirmado"
                        : "Ajuste"}
                  </small>
                </div>
                <strong
                  className={benefitDelta(item) < 0 ? "expense" : "income"}
                >
                  {benefitDelta(item) < 0 ? "−" : "+"}
                  {money(Math.abs(item.amountCents))}
                </strong>
                <button
                  className="icon-button"
                  aria-label={`Editar ${item.description}`}
                  onClick={() => openEdit(item)}
                >
                  <Pencil size={16} />
                </button>
                <button
                  className="icon-button danger"
                  aria-label={`Excluir ${item.description}`}
                  disabled={busy}
                  onClick={() => remove(item)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            {!showAll && history.length > 20 && (
              <button className="text-button" onClick={() => setShowAll(true)}>
                Ver todo o histórico
              </button>
            )}
          </>
        ) : (
          <div className="empty-list">
            Nenhuma movimentação registrada ainda.
          </div>
        )}
        <div className="benefit-opening">
          <span>Saldo inicial em {dateLabel(wallet.openingDate)}</span>
          <strong>{money(wallet.openingBalanceCents)}</strong>
        </div>
      </section>
      {editing && (
        <section className="panel form-panel">
          <div className="panel-head">
            <div>
              <span className="section-kicker">CORREÇÃO</span>
              <h2>Editar {editing.kind === "credit" ? "crédito" : "ajuste"}</h2>
            </div>
          </div>
          <form onSubmit={saveEdit}>
            <div className="form-grid">
              <label>
                Data
                <input
                  required
                  type="date"
                  value={editDate}
                  onChange={(event) => setEditDate(event.target.value)}
                />
              </label>
              <label>
                Valor (R$)
                <input
                  required
                  inputMode="decimal"
                  value={editAmount}
                  onChange={(event) => setEditAmount(event.target.value)}
                />
              </label>
              {editing.kind === "adjustment" && (
                <label>
                  Direção
                  <select
                    value={editDirection}
                    onChange={(event) =>
                      setEditDirection(event.target.value as "in" | "out")
                    }
                  >
                    <option value="in">Adicionar ao saldo</option>
                    <option value="out">Reduzir o saldo</option>
                  </select>
                </label>
              )}
            </div>
            <label>
              Descrição
              <input
                required
                maxLength={120}
                value={editDescription}
                onChange={(event) => setEditDescription(event.target.value)}
              />
            </label>
            <label>
              Observações
              <input
                maxLength={1000}
                value={editNotes}
                onChange={(event) => setEditNotes(event.target.value)}
              />
            </label>
            <div className="benefit-actions">
              <button className="primary-button" disabled={busy}>
                Salvar correção
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => setEditing(null)}
              >
                Cancelar
              </button>
            </div>
          </form>
        </section>
      )}
      <section className="panel benefit-trend">
        <div className="panel-head">
          <div>
            <span className="section-kicker">ÚLTIMOS 6 MESES</span>
            <h2>Evolução do VR</h2>
            <p>
              Créditos confirmados e gastos registrados, separados do dinheiro.
            </p>
          </div>
        </div>
        {months.map((item) => (
          <div className="benefit-month" key={item.key}>
            <span>{monthLabel(item.key)}</span>
            <div>
              <div
                className="benefit-bar credit"
                style={{ width: `${(item.credits / maxMonth) * 100}%` }}
              />
              <div
                className="benefit-bar expense"
                style={{ width: `${(item.expenses / maxMonth) * 100}%` }}
              />
            </div>
            <small>
              +{money(item.credits)} · −{money(item.expenses)}
            </small>
          </div>
        ))}
      </section>
      <section className="panel form-panel">
        <div className="panel-head">
          <div>
            <span className="section-kicker">CONFIGURAÇÃO</span>
            <h2>Carteira de VR</h2>
            <p>
              Crédito habitual {money(wallet.monthlyCreditCents)} no dia{" "}
              {wallet.creditDay}. Nenhum crédito é lançado automaticamente.
            </p>
          </div>
          <button
            className="text-button"
            onClick={() => setEditingConfig(!editingConfig)}
          >
            {editingConfig ? "Fechar" : "Editar"}
          </button>
        </div>
        {editingConfig && (
          <form onSubmit={saveConfig}>
            <div className="form-grid">
              <label>
                Saldo inicial (R$)
                <input
                  required
                  inputMode="decimal"
                  value={config.openingBalance}
                  onChange={(event) =>
                    setConfig({ ...config, openingBalance: event.target.value })
                  }
                />
              </label>
              <label>
                Data do saldo inicial
                <input
                  required
                  type="date"
                  value={config.openingDate}
                  onChange={(event) =>
                    setConfig({ ...config, openingDate: event.target.value })
                  }
                />
              </label>
              <label>
                Crédito mensal habitual (R$)
                <input
                  required
                  inputMode="decimal"
                  value={config.monthlyCredit}
                  onChange={(event) =>
                    setConfig({ ...config, monthlyCredit: event.target.value })
                  }
                />
              </label>
              <label>
                Dia habitual
                <input
                  required
                  type="number"
                  min="1"
                  max="31"
                  value={config.creditDay}
                  onChange={(event) =>
                    setConfig({ ...config, creditDay: event.target.value })
                  }
                />
              </label>
            </div>
            <p className="quiet-note">
              Alterar o saldo inicial recalcula o saldo atual. Créditos já
              confirmados conservam seus valores.
            </p>
            <button className="primary-button" disabled={busy}>
              Salvar configuração
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
