"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { countLabel } from "../lib/finance-rules";

type CategoryType = "income" | "expense";
type Definition = { id: string; name: string; type: CategoryType };
type Observed = { name: string; type: CategoryType; count: number };
const label = (value: string) => value.replace(/^\([DR]\)\s*/, "");

export default function CategoryManager({
  observed,
  onReload,
  onNotice,
}: {
  observed: Observed[];
  onReload: () => Promise<void>;
  onNotice: (value: string) => void;
}) {
  const [definitions, setDefinitions] = useState<Definition[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [newName, setNewName] = useState(""),
    [newType, setNewType] = useState<CategoryType>("expense");
  const [editing, setEditing] = useState<Observed | null>(null),
    [targetName, setTargetName] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/categories", { cache: "no-store" });
    const data = (await response.json()) as {
      categories?: Definition[];
      error?: string;
    };
    if (!response.ok)
      throw new Error(data.error || "Não foi possível carregar as categorias.");
    setDefinitions(data.categories || []);
  }, []);
  useEffect(() => {
    queueMicrotask(() => void load().catch((cause) =>
        setError(
          cause instanceof Error
            ? cause.message
            : "Não foi possível carregar as categorias.",
        ),
      ));
  }, [load]);
  const categories = useMemo(() => {
    const map = new Map<string, Observed>();
    for (const item of observed) map.set(item.name, item);
    for (const item of definitions)
      if (!map.has(item.name))
        map.set(item.name, { name: item.name, type: item.type, count: 0 });
    return [...map.values()].sort(
      (a, b) =>
        a.type.localeCompare(b.type) ||
        label(a.name).localeCompare(label(b.name), "pt-BR"),
    );
  }, [definitions, observed]);
  async function request(method: string, body: Record<string, unknown>) {
    const response = await fetch("/api/categories", {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok)
      throw new Error(data.error || "Não foi possível concluir.");
    return data;
  }
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
      await Promise.all([load(), onReload()]);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível concluir.",
      );
    } finally {
      setBusy(false);
    }
  }
  function create(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      await request("POST", { name: newName, type: newType });
      setNewName("");
      onNotice("Categoria criada.");
    });
  }
  function rename(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const destination = targetName.trim();
    if (!destination) return;
    if (
      !confirm(
        `Renomear “${label(editing.name)}” para “${destination}”? Se a categoria já existir, os registros serão fundidos.`,
      )
    )
      return;
    void run(async () => {
      await request("PATCH", {
        sourceName: editing.name,
        targetName: destination,
        type: editing.type,
      });
      setEditing(null);
      setTargetName("");
      onNotice("Categoria atualizada em todos os registros.");
    });
  }
  function remove(item: Observed) {
    if (!confirm(`Excluir a categoria “${label(item.name)}”?`)) return;
    void run(async () => {
      await request("DELETE", { name: item.name });
      onNotice("Categoria excluída.");
    });
  }
  return (
    <section className="panel form-panel category-manager">
      <div className="panel-head">
        <div>
          <span className="section-kicker">ORGANIZAÇÃO</span>
          <h2>Gerenciar categorias</h2>
          <p>
            Crie categorias e una variações duplicadas sem perder os lançamentos
            existentes.
          </p>
        </div>
      </div>
      <form className="category-create" onSubmit={create}>
        <label>
          Nova categoria
          <input
            required
            maxLength={70}
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Ex.: Lazer"
          />
        </label>
        <label>
          Tipo
          <select
            value={newType}
            onChange={(event) => setNewType(event.target.value as CategoryType)}
          >
            <option value="expense">Despesa</option>
            <option value="income">Receita</option>
          </select>
        </label>
        <button className="secondary-button" disabled={busy}>
          <Plus size={16} /> Criar
        </button>
      </form>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      <div className="category-manage-list">
        {categories.map((item) => (
          <div
            className="category-manage-row"
            key={`${item.type}:${item.name}`}
          >
            <div>
              <strong>{label(item.name)}</strong>
              <span>
                {item.type === "expense" ? "Despesa" : "Receita"} · {countLabel(item.count, "registro", "registros")}
              </span>
            </div>
            <button
              className="icon-button"
              aria-label={`Renomear ${label(item.name)}`}
              onClick={() => {
                setEditing(item);
                setTargetName(label(item.name));
              }}
            >
              <Pencil size={16} />
            </button>
            <button
              className="icon-button danger"
              disabled={busy || item.count > 0}
              title={
                item.count > 0
                  ? "Funda ou renomeie antes de excluir"
                  : "Excluir categoria"
              }
              aria-label={`Excluir ${label(item.name)}`}
              onClick={() => remove(item)}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
      {editing && (
        <form className="category-rename" onSubmit={rename}>
          <div>
            <strong>Renomear ou fundir</strong>
            <span>{label(editing.name)}</span>
          </div>
          <label>
            Novo nome
            <input
              autoFocus
              required
              maxLength={70}
              value={targetName}
              onChange={(event) => setTargetName(event.target.value)}
            />
          </label>
          <button className="primary-button" disabled={busy}>
            Aplicar em todos
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Cancelar"
            onClick={() => setEditing(null)}
          >
            <X size={17} />
          </button>
        </form>
      )}
    </section>
  );
}
