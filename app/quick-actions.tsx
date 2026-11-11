"use client";

import { Copy, Gift, Plus, ShoppingBasket, Utensils, Bus } from "lucide-react";

export default function QuickActions({
  hasRecent,
  hasBenefit,
  onNew,
  onRepeat,
  onVr,
  onPreset,
}: {
  hasRecent: boolean;
  hasBenefit: boolean;
  onNew: () => void;
  onRepeat: () => void;
  onVr: () => void;
  onPreset: (description: string, categoryHint: string) => void;
}) {
  return (
    <section className="quick-actions" aria-label="Lançamento rápido">
      <button onClick={() => onPreset("Almoço", "alimentação")}>
        <Utensils size={18} />
        <span>
          <strong>Almoço</strong>
          <small>Preencher rápido</small>
        </span>
      </button>
      <button onClick={() => onPreset("Mercado", "mercado")}>
        <ShoppingBasket size={18} />
        <span>
          <strong>Mercado</strong>
          <small>Preencher rápido</small>
        </span>
      </button>
      <button onClick={() => onPreset("Transporte", "transporte")}>
        <Bus size={18} />
        <span>
          <strong>Transporte</strong>
          <small>Preencher rápido</small>
        </span>
      </button>
      {hasRecent && (
        <button onClick={onRepeat}>
          <Copy size={18} />
          <span>
            <strong>Repetir último</strong>
            <small>Com data de hoje</small>
          </span>
        </button>
      )}
      {hasBenefit && (
        <button onClick={onVr}>
          <Gift size={18} />
          <span>
            <strong>Gasto com VR</strong>
            <small>Saldo separado</small>
          </span>
        </button>
      )}
      <button className="quick-primary" onClick={onNew}>
        <Plus size={18} />
        <span>
          <strong>Novo</strong>
          <small>Outro lançamento</small>
        </span>
      </button>
    </section>
  );
}
