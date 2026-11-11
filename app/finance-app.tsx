"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  Copy,
  Download,
  FileUp,
  Gift,
  LayoutDashboard,
  Menu,
  Moon,
  Pencil,
  Plus,
  Repeat2,
  Search,
  Settings2,
  Sun,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import TrendChart from "./trend-chart";
import InsightCard from "./insight-card";
import PlanCard from "./plan-card";
import PwaInstall, {
  type InstallPromptEvent,
  type WorkerState,
} from "./pwa-install";
import BenefitsPanel from "./benefits-panel";
import {
  benefitBalance,
  type BenefitMovement,
  type BenefitWallet,
} from "./benefits-types";
import {
  importFingerprint,
  normalizeCategoryKey,
  parsePositiveCents,
} from "../lib/finance-rules";
import QuickActions from "./quick-actions";
import MonthPulse from "./month-pulse";
import CategoryManager from "./category-manager";

type Transaction = {
  id: string;
  date: string;
  description: string;
  type: "income" | "expense";
  category: string;
  amountCents: number;
  notes: string | null;
  source: string;
  sourceRow: number | null;
  planId: string | null;
  occurrenceIndex: number | null;
  createdAt: string;
  deletedAt: string | null;
};
type Plan = {
  id: string;
  kind: "recurring" | "installment";
  description: string;
  category: string;
  startDate: string;
  amountCents: number;
  installmentCount: number | null;
  status: "active" | "paused" | "canceled";
  notes: string | null;
};
type Budget = {
  id: string;
  month: string;
  categoryKey: string;
  amountCents: number;
};
type CategoryDefinition = {
  id: string;
  name: string;
  type: "income" | "expense";
};
type Entry = {
  date: string;
  description: string;
  type: "income" | "expense";
  category: string;
  amountCents: number;
  notes?: string | null;
};
type Form = {
  date: string;
  description: string;
  type: "income" | "expense";
  category: string;
  amount: string;
  notes: string;
  paymentSource: "money" | "vr";
};
const money = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    v / 100,
  );
const today = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};
const freshForm = (): Form => ({
  date: today(),
  description: "",
  type: "expense",
  category: "",
  amount: "",
  notes: "",
  paymentSource: "money",
});
const dateLabel = (v: string) =>
  new Date(`${v}T12:00:00`).toLocaleDateString("pt-BR");
const fullMonth = (v: string) =>
  new Date(`${v}-15T12:00:00`).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
const categoryLabel = (v: string) => v.replace(/^\([DR]\)\s*/, "");
const colors = [
  "#6658c8",
  "#8c80dc",
  "#a99fec",
  "#c3baf2",
  "#d2a4ac",
  "#888fa8",
  "#b4bad0",
  "#ddd4f4",
];
const cents = parsePositiveCents;
function download(name: string, data: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function csvCells(line: string, delimiter: string) {
  const out: string[] = [];
  let cell = "",
    quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === delimiter && !quoted) {
      out.push(cell);
      cell = "";
    } else cell += ch;
  }
  out.push(cell);
  return out;
}
function csvRows(text: string) {
  const lines = text
    .replace(/^\ufeff/, "")
    .replace(/\r\n/g, "\n")
    .split(/\n(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    .filter((x) => x.trim());
  const separator =
    (lines[0]?.match(/;/g)?.length || 0) >= (lines[0]?.match(/,/g)?.length || 0)
      ? ";"
      : ",";
  return lines.map((line) => csvCells(line, separator));
}
function parseImport(rows: unknown[][]): {
  entries: Entry[];
  errors: string[];
} {
  const normalize = (v: unknown) =>
    String(v ?? "")
      .trim()
      .toLocaleLowerCase("pt-BR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  const headerIndex = rows.slice(0, 30).findIndex((r) => {
    const values = r.map(normalize);
    return (
      values.includes("data") &&
      values.includes("tipo") &&
      values.includes("categoria") &&
      values.includes("descricao")
    );
  });
  if (headerIndex < 0)
    return {
      entries: [],
      errors: [
        "Use colunas Data, Descrição, Tipo, Categoria e Valor; ou Receita e Despesa separadas.",
      ],
    };
  const headers = rows[headerIndex].map(normalize);
  const col = (names: string[]) =>
    headers.findIndex((h) =>
      names.some((n) => h === n || h.startsWith(`${n} (`)),
    );
  const dateCol = col(["data", "date"]),
    descriptionCol = col(["descricao", "description"]),
    typeCol = col(["tipo", "type"]),
    categoryCol = col(["categoria", "category"]),
    amountCol = col(["valor", "amount"]),
    incomeCol = col(["receita"]),
    expenseCol = col(["despesa"]),
    notesCol = col(["observacoes", "observacao", "notes"]);
  if (
    [dateCol, descriptionCol, typeCol, categoryCol].some((i) => i < 0) ||
    (amountCol < 0 && (incomeCol < 0 || expenseCol < 0))
  )
    return {
      entries: [],
      errors: [
        "Use colunas Data, Descrição, Tipo, Categoria e Valor; ou Receita e Despesa separadas.",
      ],
    };
  const entries: Entry[] = [],
    errors: string[] = [];
  rows.slice(headerIndex + 1).forEach((r, i) => {
    if (
      r.every((v) => v === null || v === undefined || String(v).trim() === "")
    )
      return;
    const rawDate = r[dateCol],
      date =
        rawDate instanceof Date
          ? `${rawDate.getFullYear()}-${String(rawDate.getMonth() + 1).padStart(2, "0")}-${String(rawDate.getDate()).padStart(2, "0")}`
          : typeof rawDate === "number" && rawDate > 1 && rawDate < 100000
            ? new Date(Date.UTC(1899, 11, 30) + rawDate * 86400000)
                .toISOString()
                .slice(0, 10)
            : String(rawDate ?? "").trim();
    const iso = /^\d{2}\/\d{2}\/\d{4}$/.test(date)
      ? date.split("/").reverse().join("-")
      : date;
    const typeText = String(r[typeCol] ?? "")
      .trim()
      .toLocaleLowerCase("pt-BR");
    const type = ["receita", "income", "r"].includes(typeText)
      ? "income"
      : ["despesa", "expense", "d"].includes(typeText)
        ? "expense"
        : null;
    const valueCell =
      amountCol >= 0
        ? r[amountCol]
        : type === "income"
          ? r[incomeCol]
          : r[expenseCol];
    const amount = cents(String(valueCell ?? ""));
    const description = String(r[descriptionCol] ?? "").trim();
    const category = String(r[categoryCol] ?? "").trim();
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(iso)
      ? new Date(`${iso}T12:00:00Z`)
      : null;
    if (String(valueCell ?? "").trim() === "0" || Number(valueCell) === 0) {
      errors.push(
        `Aviso na linha ${i + headerIndex + 2}: valor zero ignorado.`,
      );
      return;
    }
    if (
      !parsed ||
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== iso ||
      !type ||
      !amount ||
      !description ||
      !category ||
      description.length > 120 ||
      category.length > 70
    ) {
      errors.push(
        `Linha ${i + headerIndex + 2}: confira data, tipo, valor, descrição e categoria.`,
      );
      return;
    }
    entries.push({
      date: iso,
      description,
      type,
      category,
      amountCents: amount,
      notes: notesCol < 0 ? null : String(r[notesCol] ?? "").slice(0, 1000),
    });
  });
  return { entries, errors };
}
const fingerprint = importFingerprint;

export default function FinanceApp({ displayName }: { displayName: string }) {
  const [rows, setRows] = useState<Transaction[]>([]),
    [plans, setPlans] = useState<Plan[]>([]),
    [budgets, setBudgets] = useState<Budget[]>([]);
  const [customCategories, setCustomCategories] = useState<
    CategoryDefinition[]
  >([]);
  const [benefitWallet, setBenefitWallet] = useState<BenefitWallet | null>(
      null,
    ),
    [benefitMovements, setBenefitMovements] = useState<BenefitMovement[]>([]);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [tab, setTab] = useState<
    "overview" | "transactions" | "benefits" | "plans" | "budgets" | "data"
  >("overview");
  const [mobileMore, setMobileMore] = useState(false),
    [spendingView, setSpendingView] = useState<"money" | "vr" | "all">("money");
  const [period, setPeriod] = useState(() => today().slice(0, 7)),
    [start, setStart] = useState(""),
    [end, setEnd] = useState("");
  const [search, setSearch] = useState(""),
    [listType, setListType] = useState("all"),
    [listCategory, setListCategory] = useState("all"),
    [sort, setSort] = useState("date-asc");
  const [modal, setModal] = useState(false),
    [editing, setEditing] = useState<Transaction | null>(null),
    [detail, setDetail] = useState<Transaction | null>(null),
    [form, setForm] = useState<Form>(freshForm),
    [formKey, setFormKey] = useState(""),
    [formError, setFormError] = useState("");
  const [editingBenefit, setEditingBenefit] = useState<BenefitMovement | null>(
    null,
  );
  const [planKind, setPlanKind] = useState<"recurring" | "installment">(
      "recurring",
    ),
    [editingPlan, setEditingPlan] = useState<Plan | null>(null),
    [planForm, setPlanForm] = useState({
      description: "",
      category: "",
      startDate: today(),
      amount: "",
      installmentCount: "2",
    });
  const [budgetForm, setBudgetForm] = useState({
    month: today().slice(0, 7),
    categoryKey: "all",
    amount: "",
  });
  const [importEntries, setImportEntries] = useState<Entry[]>([]),
    [importErrors, setImportErrors] = useState<string[]>([]),
    [importFile, setImportFile] = useState("");
  const [dark, setDark] = useState(true);
  const themeHasMounted = useRef(false);
  const [worker, setWorker] = useState<WorkerState>({ status: "checking" });
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(
    null,
  );
  const [installed, setInstalled] = useState(false);
  const [shortcutHandled, setShortcutHandled] = useState(false);
  const load = useCallback(async () => {
    try {
      const responses = await Promise.all(
        ["transactions", "plans", "budgets", "benefits", "categories"].map(
          (path) => fetch(`/api/${path}`, { cache: "no-store" }),
        ),
      );
      const data = (await Promise.all(responses.map((r) => r.json()))) as Array<Record<string, unknown>>;
      for (let i = 0; i < responses.length; i++) {
        const responseError = data[i].error;
        if (!responses[i].ok)
          throw new Error(typeof responseError === "string" ? responseError : "Falha ao carregar.");
      }
      const list = data[0].transactions as Transaction[];
      setRows(list);
      setPlans(data[1].plans as Plan[]);
      setBudgets(data[2].budgets as Budget[]);
      setBenefitWallet((data[3].wallet ?? null) as BenefitWallet | null);
      setBenefitMovements(data[3].movements as BenefitMovement[]);
      setCustomCategories((data[4].categories ?? []) as CategoryDefinition[]);
      setPeriod((current) => current || today().slice(0, 7));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível carregar.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);
  useEffect(() => {
    const savedTheme = localStorage.getItem("minhas-financas-theme");
    if (savedTheme === "dark" || savedTheme === "light") {
      queueMicrotask(() => setDark(savedTheme === "dark"));
    }
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    if (themeHasMounted.current) {
      localStorage.setItem("minhas-financas-theme", dark ? "dark" : "light");
    } else {
      themeHasMounted.current = true;
    }
  }, [dark]);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      queueMicrotask(() => setWorker({ status: "unsupported" }));
      return;
    }
    navigator.serviceWorker
      .register("/service-worker.js", { scope: "/" })
      .then(() => setWorker({ status: "ready" }))
      .catch((cause: unknown) => {
        const detail =
          cause instanceof Error ? cause.message : "Falha desconhecida.";
        console.warn("Falha no registro do service worker:", detail);
        setWorker({ status: "failed", detail });
      });
  }, []);
  useEffect(() => {
    queueMicrotask(() => setInstalled(window.matchMedia("(display-mode: standalone)").matches));
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    queueMicrotask(() => setNotice(""));
  }, [tab]);
  async function installApp() {
    if (!installPrompt) return;
    try {
      await installPrompt.prompt();
      await installPrompt.userChoice;
      setInstallPrompt(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível iniciar a instalação.",
      );
    }
  }
  const months = useMemo(
    () =>
      [
        ...new Set([
          ...rows.map((r) => r.date.slice(0, 7)),
          today().slice(0, 7),
        ]),
      ]
        .sort()
        .reverse(),
    [rows],
  );
  const years = useMemo(
    () =>
      [
        ...new Set([
          ...rows.map((r) => r.date.slice(0, 4)),
          today().slice(0, 4),
        ]),
      ]
        .sort()
        .reverse(),
    [rows],
  );
  const categories = useMemo(
    () =>
      [
        ...new Set(
          rows
            .map((r) => r.category)
            .concat(
              plans.map((p) => p.category),
              benefitMovements
                .filter((item) => item.kind === "expense")
                .map((item) => item.category || ""),
              customCategories.map((item) => item.name),
            ),
        ),
      ]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "pt-BR")),
    [rows, plans, benefitMovements, customCategories],
  );
  const selected = useMemo(
    () =>
      rows.filter(
        (r) =>
          period === "all" ||
          (period === "custom"
            ? (!start || r.date >= start) && (!end || r.date <= end)
            : period.startsWith("year:")
              ? r.date.startsWith(period.slice(5))
              : r.date.startsWith(period)),
      ),
    [rows, period, start, end],
  );
  const income = selected.reduce(
      (n, r) => n + (r.type === "income" ? r.amountCents : 0),
      0,
    ),
    expense = selected.reduce(
      (n, r) => n + (r.type === "expense" ? r.amountCents : 0),
      0,
    ),
    net = income - expense;
  const prior =
    period && /^\d{4}-\d{2}$/.test(period)
      ? (() => {
          const [y, m] = period.split("-").map(Number);
          const prev = new Date(Date.UTC(y, m - 2, 1))
            .toISOString()
            .slice(0, 7);
          const cutoff =
            period === today().slice(0, 7) ? Number(today().slice(8)) : 31;
          const list = rows.filter(
            (r) => r.date.startsWith(prev) && Number(r.date.slice(8)) <= cutoff,
          );
          return {
            month: prev,
            rows: list,
            income: list.reduce(
              (n, r) => n + (r.type === "income" ? r.amountCents : 0),
              0,
            ),
            expense: list.reduce(
              (n, r) => n + (r.type === "expense" ? r.amountCents : 0),
              0,
            ),
          };
        })()
      : null;
  const comparison = (current: number, previous: number) =>
    !prior
      ? "Selecione um mês para comparar"
      : prior.rows.length
        ? previous === 0
          ? "Sem base percentual"
          : `${current >= previous ? "+" : ""}${Math.round(((current - previous) / previous) * 100)}% vs. ${period === today().slice(0, 7) ? "mesmos dias do mês anterior" : "mês anterior"}`
        : "Sem registros no mês anterior";
  const periodName =
    period === "all"
      ? "todo o histórico"
      : period === "custom"
        ? "intervalo escolhido"
        : period.startsWith("year:")
          ? `ano de ${period.slice(5)}`
          : period
            ? fullMonth(period)
            : "período";
  const selectedBenefitExpenses = useMemo(
    () =>
      benefitMovements.filter(
        (item) =>
          item.kind === "expense" &&
          (period === "all" ||
            (period === "custom"
              ? (!start || item.date >= start) && (!end || item.date <= end)
              : period.startsWith("year:")
                ? item.date.startsWith(period.slice(5))
                : item.date.startsWith(period))),
      ),
    [benefitMovements, period, start, end],
  );
  const categoryData = useMemo(() => {
    const map = new Map<string, { finance: number; vr: number }>();
    selected
      .filter((r) => r.type === "expense")
      .forEach((r) => {
        const item = map.get(r.category) || { finance: 0, vr: 0 };
        item.finance += r.amountCents;
        map.set(r.category, item);
      });
    selectedBenefitExpenses.forEach((r) => {
      const name = r.category || "Sem categoria";
      const item = map.get(name) || { finance: 0, vr: 0 };
      item.vr += r.amountCents;
      map.set(name, item);
    });
    return [...map]
      .map(([name, values]) => ({
        name,
        ...values,
        value:
          spendingView === "money"
            ? values.finance
            : spendingView === "vr"
              ? values.vr
              : values.finance + values.vr,
      }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [selected, selectedBenefitExpenses, spendingView]);
  const categoryTotal = categoryData.reduce(
    (total, item) => total + item.value,
    0,
  );
  const visible = useMemo(
    () =>
      rows
        .filter(
          (r) =>
            (listType === "all" || r.type === listType) &&
            (listCategory === "all" || r.category === listCategory) &&
            `${r.description} ${r.category}`
              .toLocaleLowerCase("pt-BR")
              .includes(search.toLocaleLowerCase("pt-BR")),
        )
        .sort((a, b) =>
          sort === "date-asc"
            ? a.date.localeCompare(b.date)
            : sort === "amount-desc"
              ? b.amountCents - a.amountCents
              : sort === "amount-asc"
                ? a.amountCents - b.amountCents
                : sort === "description"
                  ? a.description.localeCompare(b.description, "pt-BR")
                  : b.date.localeCompare(a.date),
        ),
    [rows, listType, listCategory, search, sort],
  );
  const shown = visible;
  const observedCategories = useMemo(
    () =>
      categories.map((name) => ({
        name,
        type: (name.startsWith("(R)") ? "income" : "expense") as
          "income" | "expense",
        count:
          rows.filter((row) => row.category === name).length +
          plans.filter((plan) => plan.category === name).length +
          benefitMovements.filter((item) => item.category === name).length +
          budgets.filter((budget) => budget.categoryKey === name).length,
      })),
    [categories, rows, plans, benefitMovements, budgets],
  );
  const recurringSuggestions = useMemo(() => {
    const grouped = new Map<
      string,
      {
        description: string;
        category: string;
        months: Set<string>;
        amounts: number[];
      }
    >();
    for (const row of rows) {
      if (row.type !== "expense" || row.planId) continue;
      const key = `${normalizeCategoryKey(row.description)}|${normalizeCategoryKey(row.category)}`;
      const item = grouped.get(key) || {
        description: row.description,
        category: row.category,
        months: new Set<string>(),
        amounts: [],
      };
      item.months.add(row.date.slice(0, 7));
      item.amounts.push(row.amountCents);
      grouped.set(key, item);
    }
    return [...grouped.values()]
      .filter(
        (item) =>
          item.months.size >= 2 &&
          !plans.some(
            (plan) =>
              normalizeCategoryKey(plan.description) ===
              normalizeCategoryKey(item.description),
          ),
      )
      .sort((a, b) => b.months.size - a.months.size)
      .slice(0, 3)
      .map((item) => ({
        ...item,
        average: Math.round(
          item.amounts.reduce((total, amount) => total + amount, 0) /
            item.amounts.length,
        ),
      }));
  }, [rows, plans]);
  async function api(
    path: string,
    method: string,
    body: unknown,
  ): Promise<Record<string, unknown>> {
    const r = await fetch(`/api/${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await r.json()) as Record<string, unknown>;
    if (!r.ok) throw new Error(typeof data.error === "string" ? data.error : "Não foi possível concluir.");
    return data;
  }
  function resolvedCategory(value: string, type: "income" | "expense") {
    const key = normalizeCategoryKey(value);
    return (
      categories.find(
        (item) =>
          (type === "income"
            ? !item.startsWith("(D)")
            : !item.startsWith("(R)")) && normalizeCategoryKey(item) === key,
      ) || value.trim()
    );
  }
  const openNew = useCallback((type: "income" | "expense" = "expense", from?: Transaction) => {
    const rememberedCategory =
      localStorage.getItem(`minhas-financas-last-category-${type}`) || "";
    const rememberedPayment =
      type === "expense" &&
      benefitWallet &&
      localStorage.getItem("minhas-financas-last-payment-source") === "vr"
        ? "vr"
        : "money";
    setEditing(null);
    setEditingBenefit(null);
    setDetail(null);
    setForm(
      from
        ? {
            date: today(),
            description: from.description,
            type: from.type,
            category: from.category,
            amount: (from.amountCents / 100).toFixed(2).replace(".", ","),
            notes: from.notes || "",
            paymentSource: "money",
          }
        : {
            ...freshForm(),
            type,
            category: categories.includes(rememberedCategory)
              ? rememberedCategory
              : "",
            paymentSource: rememberedPayment,
          },
    );
    setFormKey(crypto.randomUUID());
    setFormError("");
    setModal(true);
  }, [benefitWallet, categories]);
  function openPreset(description: string, categoryHint: string) {
    const normalizedHint = categoryHint
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR");
    const category = categories.find((item) =>
      categoryLabel(item)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("pt-BR")
        .includes(normalizedHint),
    );
    openNew("expense");
    setForm((current) => ({
      ...current,
      description,
      category: category || current.category,
    }));
  }
  const openBenefitNew = useCallback(() => {
    setEditing(null);
    setEditingBenefit(null);
    setDetail(null);
    setForm({
      ...freshForm(),
      paymentSource: "vr",
      category:
        categories.find(
          (category) =>
            categoryLabel(category).toLocaleLowerCase("pt-BR") ===
            "alimentação",
        ) || "Alimentação",
    });
    setFormKey(crypto.randomUUID());
    setFormError("");
    setModal(true);
  }, [categories]);
  useEffect(() => {
    if (loading || shortcutHandled) return;
    const params = new URLSearchParams(window.location.search),
      action = params.get("action");
    if (action) window.history.replaceState({}, "", window.location.pathname);
    queueMicrotask(() => {
      if (action === "vr" && benefitWallet) openBenefitNew();
      else if (action === "expense") openNew("expense");
      else if (action === "income") openNew("income");
      setShortcutHandled(true);
    });
  }, [loading, shortcutHandled, benefitWallet, openBenefitNew, openNew]);
  function openEdit(row: Transaction) {
    setEditing(row);
    setEditingBenefit(null);
    setDetail(null);
    setForm({
      date: row.date,
      description: row.description,
      type: row.type,
      category: row.category,
      amount: (row.amountCents / 100).toFixed(2).replace(".", ","),
      notes: row.notes || "",
      paymentSource: "money",
    });
    setFormKey(crypto.randomUUID());
    setFormError("");
    setModal(true);
  }
  function openBenefitEdit(row: BenefitMovement) {
    setEditing(null);
    setEditingBenefit(row);
    setDetail(null);
    setForm({
      date: row.date,
      description: row.description,
      type: "expense",
      category: row.category || "Alimentação",
      amount: (row.amountCents / 100).toFixed(2).replace(".", ","),
      notes: row.notes || "",
      paymentSource: "vr",
    });
    setFormKey(crypto.randomUUID());
    setFormError("");
    setModal(true);
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const amountCents = cents(form.amount);
    if (!amountCents) {
      setFormError("Informe um valor positivo com até duas casas decimais.");
      return;
    }
    if (!form.category.trim()) {
      setFormError("Escolha uma categoria.");
      return;
    }
    if (form.paymentSource === "vr" && !benefitWallet) {
      setFormError(
        "Configure a carteira de VR em Benefícios antes de registrar gastos.",
      );
      return;
    }
    setBusy(true);
    setFormError("");
    try {
      const category = resolvedCategory(form.category, form.type);
      if (form.paymentSource === "vr") {
        await api("benefits", editingBenefit ? "PATCH" : "POST", {
          action: "movement",
          ...(editingBenefit
            ? { id: editingBenefit.id }
            : { clientKey: formKey, kind: "expense" }),
          date: form.date,
          description: form.description,
          category,
          amountCents,
          notes: form.notes,
        });
        setTab("benefits");
        window.setTimeout(
          () =>
            setNotice(
              editingBenefit
                ? "Gasto de VR atualizado."
                : "Gasto de VR registrado.",
            ),
          0,
        );
      } else {
        const data = await api("transactions", editing ? "PATCH" : "POST", {
          ...(editing ? { id: editing.id } : { clientKey: formKey }),
          date: form.date,
          description: form.description,
          type: form.type,
          category,
          amountCents,
          notes: form.notes,
        });
        setNotice(editing ? "Lançamento atualizado." : "Lançamento salvo.");
        setPeriod((data.transaction as Transaction).date.slice(0, 7));
      }
      localStorage.setItem(
        "minhas-financas-last-payment-source",
        form.paymentSource,
      );
      localStorage.setItem(
        `minhas-financas-last-category-${form.type}`,
        category,
      );
      setModal(false);
      await load();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }
  async function remove(row: Transaction) {
    if (
      !confirm(
        `Excluir “${row.description}” de ${dateLabel(row.date)}? O registro poderá ser recuperado pelo backup.`,
      )
    )
      return;
    setBusy(true);
    try {
      await api("transactions", "DELETE", { id: row.id });
      setDetail(null);
      setNotice("Lançamento excluído.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao excluir.");
    } finally {
      setBusy(false);
    }
  }
  function exportCsv() {
    const escape = (v: string) => `"${v.replaceAll('"', '""')}"`;
    const lines = [
      [
        "Data",
        "Descrição",
        "Tipo",
        "Categoria",
        "Valor (R$)",
        "Observações",
        "Origem",
      ]
        .map(escape)
        .join(";"),
    ];
    rows.forEach((r) =>
      lines.push(
        [
          r.date,
          r.description,
          r.type === "income" ? "Receita" : "Despesa",
          r.category,
          (r.amountCents / 100).toFixed(2).replace(".", ","),
          r.notes || "",
          r.source,
        ]
          .map(escape)
          .join(";"),
      ),
    );
    download(
      `minhas-financas-${today()}.csv`,
      "\ufeff" + lines.join("\r\n"),
      "text/csv;charset=utf-8",
    );
  }
  async function exportBackup() {
    setBusy(true);
    try {
      const r = await fetch("/api/backup", { cache: "no-store" });
      const data = (await r.json()) as Record<string, unknown>;
      if (!r.ok) throw new Error(typeof data.error === "string" ? data.error : "Falha ao gerar backup.");
      download(
        `minhas-financas-backup-${today()}.json`,
        JSON.stringify(data, null, 2),
        "application/json",
      );
      setNotice("Backup baixado.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao gerar backup.");
    } finally {
      setBusy(false);
    }
  }
  async function restoreBackup(file: File) {
    setBusy(true);
    try {
      const data = JSON.parse(await file.text());
      if (
        !["minhas-financas-backup-v1", "minhas-financas-backup-v2"].includes(data.format) ||
        !Array.isArray(data.transactions)
      )
        throw new Error("Arquivo de backup inválido.");
      if (
        !confirm(
          `Mesclar ${data.transactions.length} registros deste backup? Registros existentes serão preservados.`,
        )
      )
        return;
      const result = await api("backup", "POST", data);
      setNotice(
        `${result.restored} lançamentos recuperados, ${result.revived} reativados; VR: ${result.benefitRestored || 0} movimentações recuperadas, ${result.benefitRevived || 0} reativadas.`,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na restauração.");
    } finally {
      setBusy(false);
    }
  }
  async function readImport(file: File) {
    setImportFile(file.name);
    setImportEntries([]);
    setImportErrors([]);
    try {
      let data: unknown[][];
      if (/\.xlsx?$/i.test(file.name)) {
        const readXlsxFile = (await import("read-excel-file/browser")).default;
        const sheets = await readXlsxFile(file);
        data =
          sheets
            .map((s) => s.data)
            .find(
              (candidate) =>
                !parseImport(candidate).errors.some((e) =>
                  e.startsWith("Use colunas"),
                ),
            ) ||
          sheets[0]?.data ||
          [];
      } else if (/\.csv$/i.test(file.name)) data = csvRows(await file.text());
      else throw new Error("Selecione um arquivo CSV ou XLSX.");
      const parsed = parseImport(data);
      const seen = new Set(rows.map(fingerprint));
      const uniques = parsed.entries.filter((entry) => {
        const key = fingerprint(entry);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setImportEntries(uniques);
      setImportErrors([
        ...parsed.errors,
        ...(parsed.entries.length !== uniques.length
          ? [
              `${parsed.entries.length - uniques.length} possível(is) duplicidade(s) retirada(s) da prévia.`,
            ]
          : []),
      ]);
    } catch (e) {
      setImportErrors([
        e instanceof Error ? e.message : "Não foi possível ler o arquivo.",
      ]);
    }
  }
  async function importNow() {
    if (!importEntries.length) return;
    setBusy(true);
    try {
      let imported = 0,
        skipped = 0;
      const batchId = crypto.randomUUID();
      for (let i = 0; i < importEntries.length; i += 300) {
        const result = await api("import", "POST", {
          rows: importEntries.slice(i, i + 300),
          batchId: `${batchId}-${i}`,
        });
        imported += Number(result.imported);
        skipped += Number(result.skipped);
      }
      setImportEntries([]);
      setNotice(
        `${imported} importado(s), ${skipped} ignorado(s) por duplicidade.`,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na importação.");
    } finally {
      setBusy(false);
    }
  }
  async function savePlan(e: React.FormEvent) {
    e.preventDefault();
    const amountCents = cents(planForm.amount);
    if (!amountCents) {
      setError("Valor inválido.");
      return;
    }
    const hasPayments =
      !!editingPlan && rows.some((row) => row.planId === editingPlan.id);
    setBusy(true);
    try {
      await api("plans", editingPlan ? "PATCH" : "POST", {
        ...(editingPlan ? { id: editingPlan.id } : { kind: planKind }),
        description: planForm.description,
        category: planForm.category,
        ...(!hasPayments
          ? {
              startDate: planForm.startDate,
              amountCents,
              installmentCount: Number(planForm.installmentCount),
            }
          : editingPlan?.kind === "recurring"
            ? { amountCents }
            : {}),
      });
      setPlanForm({
        description: "",
        category: "",
        startDate: today(),
        amount: "",
        installmentCount: "2",
      });
      setEditingPlan(null);
      setNotice(
        editingPlan
          ? "Plano atualizado."
          : "Plano criado. Valores previstos não entram nos indicadores até serem marcados como pagos.",
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar plano.");
    } finally {
      setBusy(false);
    }
  }
  function openPlanEdit(plan: Plan) {
    setEditingPlan(plan);
    setPlanKind(plan.kind);
    setPlanForm({
      description: plan.description,
      category: plan.category,
      startDate: plan.startDate,
      amount: (plan.amountCents / 100).toFixed(2).replace(".", ","),
      installmentCount: String(plan.installmentCount || 2),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function changePlan(id: string, status: Plan["status"]) {
    setBusy(true);
    try {
      await api("plans", "PATCH", { id, status });
      setNotice("Plano atualizado.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao atualizar plano.");
    } finally {
      setBusy(false);
    }
  }
  async function payPlan(id: string, index: number) {
    if (
      !confirm(
        "Confirmar que esta cobrança foi paga? Ela passará a contar nas despesas registradas.",
      )
    )
      return;
    setBusy(true);
    try {
      await api("plans", "PUT", { id, index });
      setNotice("Pagamento registrado.");
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Falha ao confirmar pagamento.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function saveBudget(e: React.FormEvent) {
    e.preventDefault();
    const amountCents = cents(budgetForm.amount);
    if (!amountCents) {
      setError("Valor inválido.");
      return;
    }
    setBusy(true);
    try {
      await api("budgets", "POST", {
        month: budgetForm.month,
        categoryKey: budgetForm.categoryKey,
        amountCents,
      });
      setBudgetForm({ ...budgetForm, amount: "" });
      setNotice("Orçamento salvo.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar orçamento.");
    } finally {
      setBusy(false);
    }
  }
  async function removeBudget(id: string) {
    setBusy(true);
    try {
      await api("budgets", "DELETE", { id });
      setNotice("Orçamento removido.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao remover orçamento.");
    } finally {
      setBusy(false);
    }
  }
  const nav = [
    { id: "overview", name: "Visão geral", icon: LayoutDashboard },
    { id: "transactions", name: "Lançamentos", icon: Activity },
    { id: "benefits", name: "Benefícios", icon: Gift },
    { id: "plans", name: "Planejamento", icon: Repeat2 },
    { id: "data", name: "Dados", icon: Settings2 },
  ] as const;
  const activeNav =
    tab === "budgets"
      ? nav.find((item) => item.id === "plans")
      : nav.find((item) => item.id === tab);
  const selectedMonth = /^\d{4}-\d{2}$/.test(period)
    ? period
    : today().slice(0, 7);
  const budgetForMonth = budgets.filter((b) => b.month === selectedMonth);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Wallet size={23} />
          </span>
          <span>
            minhas<span className="brand-light">finanças</span>
            <small>CONTROLE PESSOAL</small>
          </span>
        </div>
        <div className="side-label">ESPAÇO FINANCEIRO</div>
        {nav.map((item) => (
          <button
            key={item.id}
            className={`side-link ${(item.id === "plans" ? tab === "plans" || tab === "budgets" : tab === item.id) ? "active" : ""}`}
            onClick={() => setTab(item.id)}
          >
            <item.icon size={19} />
            {item.name}
          </button>
        ))}
        <div className="sidebar-bottom">
          <div className="profile">
            <span className="avatar">
              {displayName.slice(0, 1).toUpperCase()}
            </span>
            <span className="profile-name">
              Minha conta<small>{displayName}</small>
            </span>
          </div>
          <form action="/auth/signout" method="post">
            <button className="signout-button" type="submit">Sair</button>
          </form>
        </div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <div className="mobile-brand">
            <span className="brand-mark">
              <Wallet size={19} />
            </span>{" "}
            minhas finanças
          </div>
          <span className="topbar-caption">
            Clareza para cuidar do seu dinheiro.
          </span>
          <div className="topbar-actions">
            <button
              className="icon-button"
              aria-label={dark ? "Usar modo claro" : "Usar modo escuro"}
              title="Alternar tema"
              onClick={() => setDark(!dark)}
            >
              {dark ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <button
              className="icon-button"
              title="Exportar CSV"
              aria-label="Exportar CSV"
              onClick={exportCsv}
            >
              <Download size={19} />
            </button>
            <span className="avatar top-avatar">
              {displayName.slice(0, 1).toUpperCase()}
            </span>
          </div>
        </header>
        <div className="content-wrap">
          {error && (
            <div className="error-banner" role="alert">
              {error}
              <button
                onClick={() => {
                  setError("");
                  void load();
                }}
              >
                Tentar novamente
              </button>
            </div>
          )}
          {notice && (
            <div className="notice-banner" role="status">
              <Check size={17} />
              {notice}
              <button aria-label="Fechar aviso" onClick={() => setNotice("")}>
                <X size={16} />
              </button>
            </div>
          )}
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                MINHAS FINANÇAS / {activeNav?.name.toUpperCase()}
              </div>
              <h1>{activeNav?.name}</h1>
              <p>
                {tab === "overview"
                  ? "Um retrato do que você registrou."
                  : tab === "transactions"
                    ? "Consulte, filtre e organize seus registros."
                    : tab === "benefits"
                      ? "Acompanhe o VR sem misturar com seu dinheiro."
                      : tab === "plans" || tab === "budgets"
                        ? "Planos e limites mensais, sem poluir sua rotina."
                        : "Importe, exporte e proteja seu histórico."}
              </p>
            </div>
            <button
              className="primary-button heading-add"
              onClick={() => openNew()}
            >
              <Plus size={18} /> Novo lançamento
            </button>
          </div>
          {tab === "overview" && (
            <div className="filter-row">
              <div className="period-control">
                <CalendarDays size={18} />
                <select
                  aria-label="Período"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                >
                  <option value="all">Todo o histórico</option>
                  <option value="custom">Intervalo personalizado</option>
                  {years.map((y) => (
                    <option key={y} value={`year:${y}`}>
                      Ano de {y}
                    </option>
                  ))}
                  {months.map((m) => (
                    <option key={m} value={m}>
                      {fullMonth(m)}
                    </option>
                  ))}
                </select>
                <ChevronDown size={16} />
              </div>
              {period === "custom" && (
                <div className="custom-range">
                  <label>
                    De{" "}
                    <input
                      type="date"
                      value={start}
                      onChange={(e) => setStart(e.target.value)}
                    />
                  </label>
                  <label>
                    Até{" "}
                    <input
                      type="date"
                      min={start}
                      value={end}
                      onChange={(e) => setEnd(e.target.value)}
                    />
                  </label>
                </div>
              )}
            </div>
          )}
          {loading ? (
            <div className="loading-state">Carregando seus lançamentos...</div>
          ) : tab === "overview" ? (
            <>
              <QuickActions
                hasRecent={rows.length > 0}
                hasBenefit={!!benefitWallet}
                onNew={() => openNew()}
                onRepeat={() => openNew(rows[0]?.type || "expense", rows[0])}
                onVr={openBenefitNew}
                onPreset={openPreset}
              />
              <section className="stats-grid" aria-label="Resumo do período">
                <div className="stat-card">
                  <div className="stat-top">
                    Receitas registradas
                    <span className="stat-icon income-icon">
                      <ArrowDownLeft size={19} />
                    </span>
                  </div>
                  <strong>{money(income)}</strong>
                  <small>{comparison(income, prior?.income || 0)}</small>
                </div>
                <div className="stat-card">
                  <div className="stat-top">
                    Despesas registradas
                    <span className="stat-icon expense-icon">
                      <ArrowUpRight size={19} />
                    </span>
                  </div>
                  <strong>{money(expense)}</strong>
                  <small>{comparison(expense, prior?.expense || 0)}</small>
                </div>
                <div className="stat-card net-card">
                  <div className="stat-top">
                    Resultado dos registros
                    <span className="stat-icon net-icon">
                      <Wallet size={19} />
                    </span>
                  </div>
                  <strong>{money(net)}</strong>
                  <small>Receitas menos despesas em {periodName}</small>
                </div>
              </section>
              <MonthPulse
                rows={selected}
                budgets={budgetForMonth}
                period={period}
              />
              {benefitWallet && (
                <section className="panel benefit-overview">
                  <div>
                    <span className="section-kicker">BENEFÍCIO SEPARADO</span>
                    <h2>Vale-Refeição</h2>
                    <p>
                      Saldo registrado{" "}
                      <strong>
                        {money(benefitBalance(benefitWallet, benefitMovements))}
                      </strong>{" "}
                      · gasto neste mês{" "}
                      {money(
                        benefitMovements
                          .filter(
                            (item) =>
                              item.kind === "expense" &&
                              item.date.startsWith(today().slice(0, 7)),
                          )
                          .reduce((total, item) => total + item.amountCents, 0),
                      )}
                    </p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => setTab("benefits")}
                  >
                    Ver VR →
                  </button>
                </section>
              )}
              {selected.some((r) => r.source === "recurrence") && (
                <p className="classified-note">
                  Despesas recorrentes pagas neste período:{" "}
                  {money(
                    selected
                      .filter((r) => r.source === "recurrence")
                      .reduce((n, r) => n + r.amountCents, 0),
                  )}
                  . Os demais gastos não têm classificação fixa ou variável.
                </p>
              )}
              <section className="chart-grid">
                <TrendChart rows={rows} />
                <div className="panel category-panel">
                  <div className="panel-head">
                    <div>
                      <span className="section-kicker">CATEGORIAS</span>
                      <h2>Onde você gastou</h2>
                      <p>
                        {spendingView === "money"
                          ? "Despesas pagas com dinheiro ou contas."
                          : spendingView === "vr"
                            ? "Consumo pago com Vale-Refeição."
                            : "Consumo total com dinheiro e VR, sem alterar o resultado financeiro."}
                      </p>
                    </div>
                  </div>
                  <div
                    className="spending-switch"
                    aria-label="Fonte de pagamento"
                  >
                    <button
                      className={spendingView === "money" ? "active" : ""}
                      aria-pressed={spendingView === "money"}
                      onClick={() => setSpendingView("money")}
                    >
                      Dinheiro
                    </button>
                    <button
                      className={spendingView === "vr" ? "active" : ""}
                      aria-pressed={spendingView === "vr"}
                      onClick={() => setSpendingView("vr")}
                    >
                      VR
                    </button>
                    <button
                      className={spendingView === "all" ? "active" : ""}
                      aria-pressed={spendingView === "all"}
                      onClick={() => setSpendingView("all")}
                    >
                      Total
                    </button>
                  </div>
                  {categoryData.length ? (
                    <>
                      <div className="donut-wrap">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={categoryData}
                              dataKey="value"
                              innerRadius={66}
                              outerRadius={88}
                              paddingAngle={2}
                              stroke="none"
                            >
                              {categoryData.map((entry, index) => (
                                <Cell
                                  key={entry.name}
                                  fill={colors[index % colors.length]}
                                />
                              ))}
                            </Pie>
                            <Tooltip
                              formatter={(value) => money(Number(value))}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="donut-center">
                          <strong>{money(categoryTotal)}</strong>
                          <span>
                            {spendingView === "money"
                              ? "despesas"
                              : spendingView === "vr"
                                ? "gastos VR"
                                : "consumo total"}
                          </span>
                        </div>
                      </div>
                      <div className="category-list">
                        {categoryData.slice(0, 6).map((item, index) => (
                          <button
                            type="button"
                            className="category-line"
                            key={item.name}
                            onClick={() => {
                              if (
                                spendingView === "money" ||
                                (spendingView === "all" && item.finance > 0)
                              ) {
                                setListCategory(item.name);
                                setListType("expense");
                                setTab("transactions");
                              } else setTab("benefits");
                            }}
                          >
                            <span>
                              <i
                                className="legend-dot"
                                style={{
                                  background: colors[index % colors.length],
                                }}
                              />
                              {categoryLabel(item.name)}{" "}
                              <small>
                                {Math.round((item.value / categoryTotal) * 100)}
                                %
                              </small>
                              {spendingView === "all" && (
                                <small className="category-sources">
                                  Dinheiro {money(item.finance)} · VR{" "}
                                  {money(item.vr)}
                                </small>
                              )}
                            </span>
                            <strong>{money(item.value)}</strong>
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="empty-chart">
                      Nenhum gasto registrado nessa fonte e período.
                    </div>
                  )}
                </div>
              </section>
              <section className="bottom-grid">
                <div className="panel activity-panel">
                  <div className="panel-head compact">
                    <div>
                      <span className="section-kicker">ATIVIDADE</span>
                      <h2>Últimos lançamentos</h2>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => setTab("transactions")}
                    >
                      Ver todos →
                    </button>
                  </div>
                  {selected.length ? (
                    selected
                      .slice(0, 5)
                      .map((r) => (
                        <TransactionRow
                          key={r.id}
                          row={r}
                          onClick={() => setDetail(r)}
                        />
                      ))
                  ) : (
                    <div className="empty-list">
                      Nenhum registro em {periodName}.
                    </div>
                  )}
                </div>
                <InsightCard
                  selected={selected}
                  allRows={rows}
                  plans={plans}
                  period={period}
                  periodName={periodName}
                  prior={
                    prior
                      ? { expense: prior.expense, count: prior.rows.length }
                      : null
                  }
                />
              </section>
              {budgetForMonth.length > 0 && (
                <section className="panel budget-preview">
                  <div className="panel-head compact">
                    <div>
                      <span className="section-kicker">PLANEJAMENTO</span>
                      <h2>Orçamentos de {fullMonth(selectedMonth)}</h2>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => setTab("budgets")}
                    >
                      Ver todos →
                    </button>
                  </div>
                  {budgetForMonth.map((b) => (
                    <BudgetRow key={b.id} budget={b} rows={rows} />
                  ))}
                </section>
              )}
            </>
          ) : tab === "transactions" ? (
            <section className="panel all-transactions">
              <div className="panel-head">
                <div>
                  <span className="section-kicker">HISTÓRICO</span>
                  <h2>{visible.length} lançamento(s)</h2>
                  <p>
                    Histórico contínuo de todos os meses. Toque em uma linha
                    para ver os detalhes.
                  </p>
                </div>
                <button className="secondary-button" onClick={exportCsv}>
                  <Download size={16} /> Exportar CSV
                </button>
              </div>
              <div className="list-filters">
                <label className="search-field">
                  <Search size={18} />
                  <input
                    aria-label="Buscar descrição ou categoria"
                    placeholder="Buscar descrição ou categoria"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <select
                  aria-label="Filtrar por tipo"
                  value={listType}
                  onChange={(e) => setListType(e.target.value)}
                >
                  <option value="all">Todos os tipos</option>
                  <option value="expense">Despesas</option>
                  <option value="income">Receitas</option>
                </select>
                <select
                  aria-label="Filtrar por categoria"
                  value={listCategory}
                  onChange={(e) => setListCategory(e.target.value)}
                >
                  <option value="all">Todas as categorias</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {categoryLabel(c)}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Ordenar"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="date-desc">Data: mais recentes</option>
                  <option value="date-asc">Data: mais antigos</option>
                  <option value="amount-desc">Valor: maior</option>
                  <option value="amount-asc">Valor: menor</option>
                  <option value="description">Descrição: A–Z</option>
                </select>
              </div>
              {shown.length ? (
                <>
                  <div className="continuous-table-wrap">
                    <table className="continuous-table">
                      <thead>
                        <tr>
                          <th>Data</th>
                          <th>Mês</th>
                          <th>Descrição</th>
                          <th>Tipo</th>
                          <th>Categoria</th>
                          <th className="amount-column">Receita</th>
                          <th className="amount-column">Despesa</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shown.map((r) => (
                          <tr
                            key={r.id}
                            tabIndex={0}
                            role="button"
                            aria-label={`Ver detalhes de ${r.description}`}
                            onClick={() => setDetail(r)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setDetail(r);
                              }
                            }}
                          >
                            <td>{dateLabel(r.date)}</td>
                            <td className="month-cell">
                              {new Date(`${r.date}T12:00:00`)
                                .toLocaleDateString("pt-BR", { month: "short" })
                                .replace(".", "")
                                .toUpperCase()}
                            </td>
                            <td className="description-cell">
                              <strong>{r.description}</strong>
                              {r.source === "historical" && (
                                <small>histórico</small>
                              )}
                            </td>
                            <td>
                              <span className={`type-pill ${r.type}`}>
                                {r.type === "income" ? "Receita" : "Despesa"}
                              </span>
                            </td>
                            <td>
                              <span className="category-pill">
                                {categoryLabel(r.category)}
                              </span>
                            </td>
                            <td className="amount-column income-value">
                              {r.type === "income" ? money(r.amountCents) : "—"}
                            </td>
                            <td className="amount-column expense-value">
                              {r.type === "expense"
                                ? money(r.amountCents)
                                : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="transaction-list mobile-transaction-list">
                    {shown.map((r) => (
                      <TransactionRow
                        key={r.id}
                        row={r}
                        onClick={() => setDetail(r)}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <div className="empty-list">
                  Nenhum lançamento encontrado para esses filtros.
                </div>
              )}
            </section>
          ) : tab === "benefits" ? (
            <BenefitsPanel
              wallet={benefitWallet}
              movements={benefitMovements}
              onReload={load}
              onNotice={setNotice}
              onNewExpense={openBenefitNew}
              onEditExpense={openBenefitEdit}
            />
          ) : tab === "plans" ? (
            <div className="feature-stack">
              <div
                className="planning-tabs"
                role="tablist"
                aria-label="Planejamento"
              >
                <button
                  className="active"
                  role="tab"
                  aria-selected="true"
                  onClick={() => setTab("plans")}
                >
                  Planos
                </button>
                <button
                  role="tab"
                  aria-selected="false"
                  onClick={() => setTab("budgets")}
                >
                  Orçamentos
                </button>
              </div>
              {recurringSuggestions.length > 0 && (
                <section className="panel recurring-suggestions">
                  <div>
                    <span className="section-kicker">PADRÕES ENCONTRADOS</span>
                    <h2>Talvez sejam despesas recorrentes</h2>
                    <p>
                      Sugestões só aparecem depois que o mesmo gasto é
                      identificado em pelo menos dois meses.
                    </p>
                  </div>
                  <div className="suggestion-chips">
                    {recurringSuggestions.map((item) => (
                      <button
                        key={`${item.description}:${item.category}`}
                        onClick={() => {
                          setPlanKind("recurring");
                          setPlanForm({
                            description: item.description,
                            category: item.category,
                            startDate: today(),
                            amount: (item.average / 100)
                              .toFixed(2)
                              .replace(".", ","),
                            installmentCount: "2",
                          });
                        }}
                      >
                        <strong>{item.description}</strong>
                        <span>
                          {item.months.size} meses · média {money(item.average)}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              )}
              <section className="panel form-panel">
                <span className="section-kicker">NOVO PLANO</span>
                <h2>{editingPlan ? "Editar plano" : "Planeje uma despesa"}</h2>
                <p>
                  Previsões só entram nas despesas depois que você confirma o
                  pagamento.
                </p>
                <form onSubmit={savePlan}>
                  <div className="type-toggle">
                    <button
                      type="button"
                      className={planKind === "recurring" ? "selected" : ""}
                      disabled={!!editingPlan}
                      onClick={() => setPlanKind("recurring")}
                    >
                      Mensal recorrente
                    </button>
                    <button
                      type="button"
                      className={planKind === "installment" ? "selected" : ""}
                      disabled={!!editingPlan}
                      onClick={() => setPlanKind("installment")}
                    >
                      Compra parcelada
                    </button>
                  </div>
                  <div className="form-grid">
                    <label>
                      Descrição
                      <input
                        required
                        maxLength={120}
                        value={planForm.description}
                        onChange={(e) =>
                          setPlanForm({
                            ...planForm,
                            description: e.target.value,
                          })
                        }
                        placeholder="Ex.: Internet"
                      />
                    </label>
                    <label>
                      Categoria
                      <input
                        required
                        list="expense-categories"
                        value={planForm.category}
                        onChange={(e) =>
                          setPlanForm({ ...planForm, category: e.target.value })
                        }
                        placeholder="Escolha ou digite"
                      />
                    </label>
                    <label>
                      {planKind === "installment"
                        ? "Valor total (R$)"
                        : "Valor mensal (R$)"}
                      <input
                        required
                        inputMode="decimal"
                        value={planForm.amount}
                        disabled={
                          !!editingPlan &&
                          editingPlan.kind === "installment" &&
                          rows.some((row) => row.planId === editingPlan.id)
                        }
                        onChange={(e) =>
                          setPlanForm({ ...planForm, amount: e.target.value })
                        }
                        placeholder="0,00"
                      />
                    </label>
                    <label>
                      Primeira cobrança
                      <input
                        required
                        type="date"
                        value={planForm.startDate}
                        disabled={
                          !!editingPlan &&
                          rows.some((row) => row.planId === editingPlan.id)
                        }
                        onChange={(e) =>
                          setPlanForm({
                            ...planForm,
                            startDate: e.target.value,
                          })
                        }
                      />
                    </label>
                    {planKind === "installment" && (
                      <label>
                        Quantidade de parcelas
                        <input
                          required
                          type="number"
                          min="2"
                          max="120"
                          value={planForm.installmentCount}
                          disabled={
                            !!editingPlan &&
                            rows.some((row) => row.planId === editingPlan.id)
                          }
                          onChange={(e) =>
                            setPlanForm({
                              ...planForm,
                              installmentCount: e.target.value,
                            })
                          }
                        />
                      </label>
                    )}
                  </div>
                  {editingPlan &&
                    rows.some((row) => row.planId === editingPlan.id) && (
                      <p className="quiet-note">
                        {editingPlan.kind === "recurring"
                          ? "Após um pagamento, o valor editado vale para as próximas cobranças. Pagamentos anteriores e data inicial ficam preservados."
                          : "Após um pagamento, descrição e categoria podem mudar; valor e datas ficam preservados."}
                      </p>
                    )}
                  <button className="primary-button" disabled={busy}>
                    {editingPlan ? "Salvar plano" : "Criar plano"}
                  </button>
                  {editingPlan && (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        setEditingPlan(null);
                        setPlanForm({
                          description: "",
                          category: "",
                          startDate: today(),
                          amount: "",
                          installmentCount: "2",
                        });
                      }}
                    >
                      Cancelar edição
                    </button>
                  )}
                </form>
              </section>
              <section className="panel plans-panel">
                <div className="panel-head">
                  <div>
                    <span className="section-kicker">ACOMPANHAMENTO</span>
                    <h2>Seus planos</h2>
                  </div>
                </div>
                {plans.length ? (
                  plans.map((p) => (
                    <PlanCard
                      key={p.id}
                      plan={p}
                      rows={rows}
                      busy={busy}
                      onEdit={() => openPlanEdit(p)}
                      onPay={(index) => void payPlan(p.id, index)}
                      onStatus={(status) => void changePlan(p.id, status)}
                    />
                  ))
                ) : (
                  <div className="empty-list">
                    Nenhum plano criado. Você pode usar o app sem planos.
                  </div>
                )}
              </section>
            </div>
          ) : tab === "budgets" ? (
            <div className="feature-stack">
              <div
                className="planning-tabs"
                role="tablist"
                aria-label="Planejamento"
              >
                <button
                  role="tab"
                  aria-selected="false"
                  onClick={() => setTab("plans")}
                >
                  Planos
                </button>
                <button
                  className="active"
                  role="tab"
                  aria-selected="true"
                  onClick={() => setTab("budgets")}
                >
                  Orçamentos
                </button>
              </div>
              <section className="panel form-panel">
                <span className="section-kicker">PLANEJAMENTO OPCIONAL</span>
                <h2>Definir limite mensal</h2>
                <p>
                  Compare o limite com as despesas efetivamente registradas.
                </p>
                <form onSubmit={saveBudget}>
                  <div className="form-grid">
                    <label>
                      Mês
                      <input
                        required
                        type="month"
                        value={budgetForm.month}
                        onChange={(e) =>
                          setBudgetForm({
                            ...budgetForm,
                            month: e.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Categoria
                      <select
                        value={budgetForm.categoryKey}
                        onChange={(e) =>
                          setBudgetForm({
                            ...budgetForm,
                            categoryKey: e.target.value,
                          })
                        }
                      >
                        <option value="all">Todas as despesas</option>
                        {categories
                          .filter(
                            (c) => c.startsWith("(D)") || !c.startsWith("(R)"),
                          )
                          .map((c) => (
                            <option key={c} value={c}>
                              {categoryLabel(c)}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      Limite (R$)
                      <input
                        required
                        inputMode="decimal"
                        value={budgetForm.amount}
                        onChange={(e) =>
                          setBudgetForm({
                            ...budgetForm,
                            amount: e.target.value,
                          })
                        }
                        placeholder="0,00"
                      />
                    </label>
                  </div>
                  <button className="primary-button" disabled={busy}>
                    Salvar orçamento
                  </button>
                </form>
              </section>
              <section className="panel budget-panel">
                <div className="panel-head">
                  <div>
                    <span className="section-kicker">ACOMPANHAMENTO</span>
                    <h2>Orçamentos</h2>
                  </div>
                </div>
                {budgets.length ? (
                  budgets
                    .slice()
                    .sort((a, b) => b.month.localeCompare(a.month))
                    .map((b) => (
                      <div className="budget-item" key={b.id}>
                        <BudgetRow budget={b} rows={rows} />
                        <button
                          className="icon-button danger"
                          aria-label={`Remover orçamento de ${b.month}`}
                          title="Remover orçamento"
                          disabled={busy}
                          onClick={() => void removeBudget(b.id)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))
                ) : (
                  <div className="empty-list">
                    Nenhum orçamento configurado. Esse recurso é opcional.
                  </div>
                )}
              </section>
            </div>
          ) : (
            <div className="feature-stack">
              <section className="panel form-panel">
                <span className="section-kicker">SEUS DADOS</span>
                <h2>Exportar e recuperar</h2>
                <p>
                  Seus lançamentos ficam no banco do app e acompanham sua conta.
                  Guarde uma cópia local para recuperação.
                </p>
                <div className="data-actions">
                  <button className="secondary-button" onClick={exportCsv}>
                    <Download size={17} /> Exportar histórico CSV
                  </button>
                  <button
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => void exportBackup()}
                  >
                    <Download size={17} /> Baixar backup completo JSON
                  </button>
                  <label className="secondary-button file-label">
                    <FileUp size={17} /> Restaurar backup JSON
                    <input
                      type="file"
                      accept=".json,application/json"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void restoreBackup(file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
                <p className="quiet-note">
                  A restauração mescla registros ausentes. Ela não substitui
                  registros já existentes. Se for interrompida, envie o mesmo
                  arquivo novamente para continuar com segurança.
                </p>
              </section>
              <section className="panel form-panel">
                <span className="section-kicker">IMPORTAÇÃO</span>
                <h2>Importar CSV ou Excel</h2>
                <p>
                  Colunas esperadas: Data, Descrição, Tipo, Categoria e Valor.
                  Datas em AAAA-MM-DD ou DD/MM/AAAA; tipos Receita ou Despesa.
                </p>
                <label className="secondary-button file-label">
                  <FileUp size={17} /> Selecionar arquivo
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void readImport(file);
                      e.target.value = "";
                    }}
                  />
                </label>
                {importFile && (
                  <div className="import-preview">
                    <strong>{importFile}</strong>
                    <p>
                      {importEntries.length} registro(s) novo(s) na prévia.
                      Nenhum registro existente será alterado.
                    </p>
                    {importErrors.length > 0 && (
                      <div className="import-errors">
                        {importErrors.slice(0, 6).map((v, i) => (
                          <div key={i}>{v}</div>
                        ))}
                        {importErrors.length > 6 && (
                          <div>…e mais {importErrors.length - 6} avisos.</div>
                        )}
                      </div>
                    )}
                    {importEntries.length > 0 && (
                      <>
                        <div className="preview-table">
                          {importEntries.slice(0, 8).map((r, i) => (
                            <div key={i}>
                              <span>
                                {dateLabel(r.date)} · {r.description}
                              </span>
                              <strong>{money(r.amountCents)}</strong>
                            </div>
                          ))}
                        </div>
                        <button
                          className="primary-button"
                          disabled={
                            busy ||
                            importErrors.some((v) => v.startsWith("Linha"))
                          }
                          onClick={() => void importNow()}
                        >
                          Importar {importEntries.length} registro(s)
                        </button>
                      </>
                    )}
                  </div>
                )}
              </section>
              <CategoryManager
                observed={observedCategories}
                onReload={load}
                onNotice={setNotice}
              />
              <PwaInstall
                worker={worker}
                prompt={installPrompt}
                installed={installed}
                onInstall={() => void installApp()}
              />
              <section className="panel form-panel">
                <span className="section-kicker">SOBRE OS DADOS</span>
                <h2>Seus dados</h2>
                <p>
                  Os números representam somente os lançamentos que você
                  registrou ou importou nesta conta. Contas novas começam vazias
                  e os totais e gráficos não representam automaticamente o saldo
                  de suas contas bancárias.
                </p>
              </section>
            </div>
          )}
        </div>
      </main>
      <nav className="mobile-nav" aria-label="Navegação">
        {nav.slice(0, 2).map((item) => (
          <button
            key={item.id}
            className={tab === item.id ? "active" : ""}
            onClick={() => {
              setMobileMore(false);
              setTab(item.id);
            }}
          >
            <item.icon size={20} />
            <span>{item.name === "Visão geral" ? "Início" : "Registros"}</span>
          </button>
        ))}
        <button
          className="mobile-add"
          aria-label="Novo lançamento"
          onClick={() => {
            setMobileMore(false);
            openNew();
          }}
        >
          <Plus size={25} />
        </button>
        <button
          className={tab === "benefits" ? "active" : ""}
          onClick={() => {
            setMobileMore(false);
            setTab("benefits");
          }}
        >
          <Gift size={20} />
          <span>Benefícios</span>
        </button>
        <button
          className={
            mobileMore || ["plans", "budgets", "data"].includes(tab)
              ? "active"
              : ""
          }
          aria-expanded={mobileMore}
          onClick={() => setMobileMore(!mobileMore)}
        >
          <Menu size={20} />
          <span>Mais</span>
        </button>
        {mobileMore && (
          <div className="mobile-more-menu" role="menu">
            {nav.slice(3).map((item) => (
              <button
                key={item.id}
                role="menuitem"
                onClick={() => {
                  setTab(item.id);
                  setMobileMore(false);
                }}
              >
                <item.icon size={18} />
                {item.name}
              </button>
            ))}
          </div>
        )}
      </nav>
      <datalist id="expense-categories">
        {categories
          .filter((c) => !c.startsWith("(R)"))
          .map((c) => (
            <option key={c} value={c} />
          ))}
      </datalist>
      {detail && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDetail(null);
          }}
        >
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-label="Detalhes do lançamento"
          >
            <div className="modal-head">
              <div>
                <span className="section-kicker">DETALHES</span>
                <h2>{detail.description}</h2>
              </div>
              <button
                className="icon-button"
                aria-label="Fechar"
                onClick={() => setDetail(null)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="detail-amount">
              {detail.type === "income" ? "+" : "−"}
              {money(detail.amountCents)}
            </div>
            <dl className="detail-list">
              <div>
                <dt>Data</dt>
                <dd>{dateLabel(detail.date)}</dd>
              </div>
              <div>
                <dt>Tipo</dt>
                <dd>{detail.type === "income" ? "Receita" : "Despesa"}</dd>
              </div>
              <div>
                <dt>Categoria</dt>
                <dd>{categoryLabel(detail.category)}</dd>
              </div>
              <div>
                <dt>Origem</dt>
                <dd>
                  {detail.source === "historical"
                    ? "Histórico original"
                    : detail.source === "import"
                      ? "Importação"
                      : detail.planId
                        ? "Plano"
                        : "App"}
                </dd>
              </div>
              {detail.notes && (
                <div>
                  <dt>Observações</dt>
                  <dd>{detail.notes}</dd>
                </div>
              )}
            </dl>
            <div className="detail-actions">
              <button
                className="secondary-button"
                onClick={() => openNew(detail.type, detail)}
              >
                <Copy size={16} /> Duplicar
              </button>
              {!detail.planId && (
                <>
                  <button
                    className="secondary-button"
                    onClick={() => openEdit(detail)}
                  >
                    <Pencil size={16} /> Editar
                  </button>
                  <button
                    className="secondary-button danger"
                    onClick={() => void remove(detail)}
                  >
                    <Trash2 size={16} /> Excluir
                  </button>
                </>
              )}
            </div>
            {detail.source === "historical" && (
              <p className="quiet-note">
                Alterações no histórico ficam registradas no backup completo.
              </p>
            )}
          </div>
        </div>
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) setModal(false);
          }}
        >
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-label={
              editing || editingBenefit
                ? "Editar lançamento"
                : "Novo lançamento"
            }
          >
            <div className="modal-head">
              <div>
                <span className="section-kicker">
                  {editing || editingBenefit ? "EDITAR" : "REGISTRO RÁPIDO"}
                </span>
                <h2>
                  {editing || editingBenefit
                    ? "Editar lançamento"
                    : "Novo lançamento"}
                </h2>
                <p>Preencha os dados e salve.</p>
              </div>
              <button
                className="icon-button"
                aria-label="Fechar"
                onClick={() => setModal(false)}
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={save}>
              <div className="type-toggle">
                <button
                  type="button"
                  className={form.type === "expense" ? "selected expense" : ""}
                  disabled={!!editingBenefit}
                  onClick={() =>
                    setForm({ ...form, type: "expense", category: "" })
                  }
                >
                  <ArrowUpRight size={17} /> Despesa
                </button>
                <button
                  type="button"
                  className={form.type === "income" ? "selected income" : ""}
                  disabled={!!editingBenefit}
                  onClick={() =>
                    setForm({
                      ...form,
                      type: "income",
                      category: "",
                      paymentSource: "money",
                    })
                  }
                >
                  <ArrowDownLeft size={17} /> Receita
                </button>
              </div>
              {form.type === "expense" && (
                <div className="payment-selector">
                  <span className="payment-selector-title">Pago com</span>
                  {editing || editingBenefit ? (
                    <div className="payment-current">
                      {form.paymentSource === "vr" ? (
                        <Gift size={17} />
                      ) : (
                        <Wallet size={17} />
                      )}
                      <span>
                        {form.paymentSource === "vr"
                          ? "Vale-Refeição"
                          : "Dinheiro ou conta"}
                      </span>
                    </div>
                  ) : (
                    <>
                      <div
                        className="payment-options"
                        role="group"
                        aria-label="Forma de pagamento"
                      >
                        <button
                          type="button"
                          className={`payment-option ${form.paymentSource === "money" ? "selected" : ""}`}
                          aria-pressed={form.paymentSource === "money"}
                          onClick={() =>
                            setForm({ ...form, paymentSource: "money" })
                          }
                        >
                          <Wallet size={18} />
                          <span>
                            <strong>Dinheiro</strong>
                            <small>Conta ou cartão</small>
                          </span>
                        </button>
                        <button
                          type="button"
                          className={`payment-option ${form.paymentSource === "vr" ? "selected" : ""}`}
                          aria-pressed={form.paymentSource === "vr"}
                          disabled={!benefitWallet}
                          onClick={() =>
                            setForm({ ...form, paymentSource: "vr" })
                          }
                        >
                          <Gift size={18} />
                          <span>
                            <strong>Vale-Refeição</strong>
                            <small>Saldo do VR</small>
                          </span>
                        </button>
                      </div>
                      {!benefitWallet && (
                        <p className="payment-setup-note">
                          Para usar VR,{" "}
                          <button
                            type="button"
                            onClick={() => {
                              setModal(false);
                              setTab("benefits");
                            }}
                          >
                            configure a carteira
                          </button>
                          .
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
              <div className="form-grid">
                <label>
                  Valor (R$)
                  <input
                    autoFocus
                    inputMode="decimal"
                    placeholder="0,00"
                    value={form.amount}
                    onChange={(e) =>
                      setForm({ ...form, amount: e.target.value })
                    }
                    required
                  />
                </label>
                <label>
                  Data
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    required
                  />
                </label>
              </div>
              <label>
                Descrição
                <input
                  placeholder="Ex.: Almoço, mercado, recebimento..."
                  value={form.description}
                  maxLength={120}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  required
                />
              </label>
              <label>
                Categoria
                <input
                  list="form-categories"
                  placeholder="Escolha ou escreva"
                  value={form.category}
                  maxLength={70}
                  onChange={(e) =>
                    setForm({ ...form, category: e.target.value })
                  }
                  required
                />
                <datalist id="form-categories">
                  {categories
                    .filter((c) =>
                      form.type === "income"
                        ? !c.startsWith("(D)")
                        : !c.startsWith("(R)"),
                    )
                    .map((c) => (
                      <option value={c} key={c} />
                    ))}
                </datalist>
              </label>
              <div className="category-chips">
                {categories
                  .filter((c) =>
                    form.type === "income"
                      ? !c.startsWith("(D)")
                      : !c.startsWith("(R)"),
                  )
                  .sort(
                    (a, b) =>
                      rows.filter((r) => r.category === b).length -
                      rows.filter((r) => r.category === a).length,
                  )
                  .slice(0, 5)
                  .map((c) => (
                    <button
                      type="button"
                      className={form.category === c ? "chosen" : ""}
                      key={c}
                      onClick={() => setForm({ ...form, category: c })}
                    >
                      {categoryLabel(c)}
                    </button>
                  ))}
              </div>
              <label>
                Observações (opcional)
                <textarea
                  value={form.notes}
                  maxLength={1000}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={3}
                  placeholder="Algo que ajude você a lembrar"
                />
              </label>
              {formError && (
                <div className="form-error" role="alert">
                  {formError}
                </div>
              )}
              <button
                className="primary-button form-submit"
                disabled={busy}
                type="submit"
              >
                {busy
                  ? "Salvando..."
                  : editing || editingBenefit
                    ? "Salvar alterações"
                    : "Salvar lançamento"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function TransactionRow({
  row,
  onClick,
}: {
  row: Transaction;
  onClick: () => void;
}) {
  return (
    <button className="transaction-row" onClick={onClick}>
      <span className={`transaction-symbol ${row.type}`}>
        {row.type === "income" ? (
          <ArrowDownLeft size={18} />
        ) : (
          <ArrowUpRight size={18} />
        )}
      </span>
      <span className="transaction-main">
        <strong>{row.description}</strong>
        <span>
          {categoryLabel(row.category)} · {dateLabel(row.date)}
          {row.source === "historical" && <em>histórico</em>}
        </span>
      </span>
      <strong className={`transaction-amount ${row.type}`}>
        {row.type === "income" ? "+" : "−"}
        {money(row.amountCents)}
      </strong>
    </button>
  );
}
function BudgetRow({ budget, rows }: { budget: Budget; rows: Transaction[] }) {
  const used = rows
    .filter(
      (r) =>
        r.type === "expense" &&
        r.date.startsWith(budget.month) &&
        (budget.categoryKey === "all" || r.category === budget.categoryKey),
    )
    .reduce((n, r) => n + r.amountCents, 0);
  const ratio = used / budget.amountCents;
  return (
    <div className="budget-row">
      <div className="budget-top">
        <div>
          <strong>
            {budget.categoryKey === "all"
              ? "Todas as despesas"
              : categoryLabel(budget.categoryKey)}
          </strong>
          <span>{fullMonth(budget.month)}</span>
        </div>
        <strong>
          {money(used)} <small>de {money(budget.amountCents)}</small>
        </strong>
      </div>
      <div
        className="budget-track"
        role="progressbar"
        aria-label={
          budget.categoryKey === "all"
            ? "Orçamento de todas as despesas"
            : "Orçamento de " + categoryLabel(budget.categoryKey)
        }
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, Math.round(ratio * 100))}
        aria-valuetext={Math.round(ratio * 100) + "% utilizado"}
      >
        <div
          className={ratio >= 1 ? "over" : ratio >= 0.8 ? "near" : ""}
          style={{ width: `${Math.min(100, ratio * 100)}%` }}
        />
      </div>
      <small>
        {ratio >= 1
          ? "Limite ultrapassado · "
          : ratio >= 0.8
            ? "Próximo do limite · "
            : ""}
        {Math.round(ratio * 100)}% utilizado ·{" "}
        {ratio > 1
          ? `${money(used - budget.amountCents)} acima do limite`
          : `${money(budget.amountCents - used)} disponível`}
      </small>
    </div>
  );
}
