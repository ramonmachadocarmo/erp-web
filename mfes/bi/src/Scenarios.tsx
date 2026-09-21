import { FormEvent, useEffect, useMemo, useState } from "react";
import { Autocomplete, DataTable, DataTableColumn, Loading, Modal, biApi, stockApi } from "@erp/shared";

const brl = (n: number) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const qty = (n: number) => Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const pct = (n: number) => `${Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

const LAST_KEY = "bi_last_scenario";

function readLast() {
  try {
    return localStorage.getItem(LAST_KEY) || "";
  } catch {
    return "";
  }
}

function writeLast(id: string) {
  try {
    localStorage.setItem(LAST_KEY, id);
  } catch {
    /* localStorage indisponível — só perde o "último aberto" */
  }
}

function actionLabel(action?: string, detail?: string) {
  const d = detail ? ` — ${detail}` : "";
  if (action === "SET") return `alteração${d}`;
  if (action === "REMOVE") return `remoção${d}`;
  if (action === "RESET") return "restaurar tudo ao real";
  if (action === "IMPORT_REAL") return "importação das vendas reais";
  return "";
}

function Tile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "ok" | "warn" }) {
  return (
    <div className="card" style={{ flex: "1 1 190px", minWidth: 0 }}>
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>{label}</p>
      <p style={{ margin: "6px 0 0", fontSize: 22, fontWeight: 700, color: tone === "ok" ? "var(--ok)" : tone === "warn" ? "var(--warn)" : undefined }}>{value}</p>
      {hint && <p className="muted" style={{ margin: "4px 0 0", fontSize: 12 }}>{hint}</p>}
    </div>
  );
}

export function Scenarios() {
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [kits, setKits] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");
  const [dupOpen, setDupOpen] = useState(false);
  const [dupName, setDupName] = useState("");
  const [addKind, setAddKind] = useState("PRODUCT");
  const [addTarget, setAddTarget] = useState("");
  const [addQty, setAddQty] = useState("");

  async function loadScenarios(preferId?: string) {
    const list = await biApi.scenarios();
    setScenarios(list);
    const wanted = preferId ?? selectedId ?? "";
    const pick = list.find((s: any) => s.id === wanted) || list.find((s: any) => s.id === readLast()) || list[0];
    if (pick) await openScenario(pick.id);
    else {
      setSelectedId("");
      setResult(null);
    }
  }

  async function openScenario(id: string) {
    setSelectedId(id);
    writeLast(id);
    setResult(await biApi.scenario(id));
  }

  useEffect(() => {
    (async () => {
      try {
        const [p, k] = await Promise.all([stockApi.products(), stockApi.assemblies()]);
        setProducts(p);
        setKits(k);
        await loadScenarios();
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Roda uma ação que devolve o cenário recalculado; trata erro e "ocupado" num lugar só.
  async function run(action: () => Promise<any>, after?: (out: any) => void) {
    setBusy(true);
    setError("");
    try {
      const out = await action();
      if (out && out.scenario) setResult(out);
      after?.(out);
      const list = await biApi.scenarios();
      setScenarios(list);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function createScenario(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy(true);
    setError("");
    try {
      const sc = await biApi.createScenario({ name: newName.trim() });
      setNewName("");
      await loadScenarios(sc.id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function duplicate() {
    if (!result) return;
    setBusy(true);
    setError("");
    try {
      const sc = await biApi.duplicateScenario(result.scenario.id, dupName.trim());
      setDupOpen(false);
      await loadScenarios(sc.id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeScenario() {
    if (!result || !confirm(`Excluir o cenário "${result.scenario.name}"? Isso não afeta os dados reais.`)) return;
    setBusy(true);
    setError("");
    try {
      await biApi.deleteScenario(result.scenario.id);
      await loadScenarios("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveParams(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!result) return;
    const f = new FormData(e.currentTarget);
    await run(() =>
      biApi.updateScenario(result.scenario.id, {
        name: String(f.get("name") || "").trim(),
        notes: String(f.get("notes") || ""),
        lookback_weeks: Number(f.get("lookback_weeks") || 8),
        coverage_weeks: Number(f.get("coverage_weeks") || 4),
        safety_percent: Number(f.get("safety_percent") || 0),
      }),
    );
  }

  async function addLine(e: FormEvent) {
    e.preventDefault();
    if (!result || !addTarget) return;
    const value = addQty.trim() === "" ? null : Number(addQty.replace(",", "."));
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      setError("Informe uma quantidade semanal válida (ou deixe vazio para seguir o real).");
      return;
    }
    await run(
      () => biApi.setScenarioLine(result.scenario.id, addKind, addTarget, value),
      () => {
        setAddTarget("");
        setAddQty("");
      },
    );
  }

  const inScenario = useMemo(() => new Set<string>((result?.lines || []).map((l: any) => `${l.kind}:${l.target_id}`)), [result]);
  const kitProductIds = useMemo(() => new Set<string>(kits.filter((k) => k.product_id).map((k) => k.product_id)), [kits]);

  const targetOptions = useMemo(() => {
    if (addKind === "KIT") {
      return kits
        .filter((k) => k.active !== false && !inScenario.has(`KIT:${k.id}`))
        .map((k) => ({ value: k.id, code: k.code, description: k.name }));
    }
    return products
      .filter((p) => p.kind !== "FIXED_ASSET" && !kitProductIds.has(p.id) && !inScenario.has(`PRODUCT:${p.id}`))
      .map((p) => ({ value: p.id, code: p.sku, description: p.name }));
  }, [addKind, kits, products, inScenario, kitProductIds]);

  const lineColumns: DataTableColumn<any>[] = [
    { key: "kind", label: "Tipo", value: (l) => (l.kind === "KIT" ? "Kit" : "Produto") },
    { key: "code", label: "Código" },
    { key: "name", label: "Nome" },
    {
      key: "real",
      label: "Real/semana",
      value: (l) => Number(l.real_weekly_qty || 0),
      render: (l) => <span className="muted">{qty(l.real_weekly_qty)} {l.uom}</span>,
    },
    {
      key: "sim",
      label: "Simulado/semana",
      sortable: false,
      filterable: false,
      render: (l) => (
        <div className="row" style={{ flexWrap: "nowrap", alignItems: "center" }}>
          <input
            key={`${l.kind}:${l.target_id}:${l.sim_weekly_qty ?? "real"}`}
            type="number"
            min="0"
            step="0.01"
            style={{ width: 110 }}
            disabled={busy}
            defaultValue={l.sim_weekly_qty ?? ""}
            placeholder={`${qty(l.real_weekly_qty)} (real)`}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            onBlur={(e) => {
              const raw = e.target.value.trim();
              const current = l.sim_weekly_qty == null ? "" : String(l.sim_weekly_qty);
              if (raw === current) return;
              const v = raw === "" ? null : Number(raw.replace(",", "."));
              if (v !== null && (!Number.isFinite(v) || v < 0)) return;
              run(() => biApi.setScenarioLine(result.scenario.id, l.kind, l.target_id, v));
            }}
          />
          {l.sim_weekly_qty == null && <span className="badge ok">segue o real</span>}
        </div>
      ),
    },
    {
      key: "delta",
      label: "Diferença",
      value: (l) => Number(l.delta_qty || 0),
      render: (l) =>
        Math.abs(l.delta_qty) < 1e-9 ? (
          <span className="muted">—</span>
        ) : (
          <span style={{ color: l.delta_qty > 0 ? "var(--ok)" : "var(--warn)" }}>
            {l.delta_qty > 0 ? "+" : ""}{qty(l.delta_qty)}{l.delta_percent != null ? ` (${l.delta_qty > 0 ? "+" : ""}${pct(l.delta_percent)})` : ""}
          </span>
        ),
    },
    { key: "unit_revenue", label: "Preço venda", value: (l) => Number(l.unit_revenue || 0), render: (l) => <span className="muted">{brl(l.unit_revenue)}</span> },
    { key: "weekly_revenue", label: "Receita/semana", value: (l) => Number(l.weekly_revenue || 0), render: (l) => <strong>{brl(l.weekly_revenue)}</strong> },
    { key: "weekly_cost", label: "Custo/semana", value: (l) => Number(l.weekly_cost || 0), render: (l) => brl(l.weekly_cost) },
    { key: "weekly_profit", label: "Lucro/semana", value: (l) => Number(l.weekly_profit || 0), render: (l) => brl(l.weekly_profit) },
    { key: "margin_percent", label: "Margem", value: (l) => Number(l.margin_percent || 0), render: (l) => pct(l.margin_percent) },
    {
      key: "actions",
      label: "",
      sortable: false,
      filterable: false,
      render: (l) => (
        <div className="row" style={{ flexWrap: "nowrap" }}>
          {l.sim_weekly_qty != null && (
            <button type="button" className="secondary" disabled={busy} onClick={() => run(() => biApi.setScenarioLine(result.scenario.id, l.kind, l.target_id, null))}>
              Voltar ao real
            </button>
          )}
          <button type="button" className="secondary" disabled={busy} onClick={() => run(() => biApi.removeScenarioLine(result.scenario.id, l.kind, l.target_id))}>
            Remover
          </button>
        </div>
      ),
    },
  ];

  const stockColumns: DataTableColumn<any>[] = [
    { key: "sku", label: "Código" },
    { key: "name", label: "Produto" },
    { key: "weekly_demand", label: "Demanda/semana", value: (s) => Number(s.weekly_demand), render: (s) => `${qty(s.weekly_demand)} ${s.uom}` },
    { key: "target_stock", label: "Manter em estoque", value: (s) => Number(s.target_stock), render: (s) => <strong>{qty(s.target_stock)} {s.uom}</strong> },
    { key: "on_hand_qty", label: "Em estoque", value: (s) => Number(s.on_hand_qty), render: (s) => <span className="muted">{qty(s.on_hand_qty)} {s.uom}</span> },
    { key: "open_po_qty", label: "Em compra", value: (s) => Number(s.open_po_qty), render: (s) => <span className="muted">{qty(s.open_po_qty)} {s.uom}</span> },
    {
      key: "to_buy_qty",
      label: "Comprar",
      value: (s) => Number(s.to_buy_qty),
      render: (s) => (s.to_buy_qty > 0 ? <span className="badge warn">{qty(s.to_buy_qty)} {s.uom}</span> : <span className="badge ok">ok</span>),
    },
    { key: "unit_cost", label: "Custo unit.", value: (s) => Number(s.unit_cost), render: (s) => <span className="muted">{brl(s.unit_cost)}/{s.uom}</span> },
    { key: "purchase_cost", label: "Custo da compra", value: (s) => Number(s.purchase_cost), render: (s) => <strong>{brl(s.purchase_cost)}</strong> },
  ];

  if (loading) return <Loading />;

  const sc = result?.scenario;
  const sum = result?.summary;

  return (
    <>
      {error && <p className="error">{error}</p>}
      <div className="card">
        <p className="muted">
          Simule quanto pretende vender por semana de cada produto ou kit e veja o faturamento, o estoque a manter e o que precisa comprar.
          Cada cenário é independente: não altera as vendas reais nem as previsões oficiais, e a média real fica sempre visível ao lado.
        </p>
        <div className="row" style={{ marginTop: 12 }}>
          <div className="field">
            <label>Cenário</label>
            <Autocomplete
              value={selectedId}
              options={scenarios.map((s) => ({ value: s.id, code: "", description: `${s.name} (${s.line_count} itens)` }))}
              placeholder={scenarios.length ? "Selecione um cenário" : "Nenhum cenário ainda"}
              onChange={(id) => id && openScenario(id).catch((err) => setError(err.message))}
            />
          </div>
          {sc && (
            <>
              <button type="button" className="secondary" disabled={busy} onClick={() => { setDupName(`${sc.name} (cópia)`); setDupOpen(true); }}>Duplicar</button>
              <button type="button" className="secondary" disabled={busy} onClick={removeScenario}>Excluir cenário</button>
            </>
          )}
        </div>
        <form className="row" style={{ marginTop: 12 }} onSubmit={createScenario}>
          <div className="field">
            <label>Novo cenário</label>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ex.: Base, Pico de fim de ano" />
          </div>
          <button disabled={busy || !newName.trim()}>Criar cenário</button>
        </form>
      </div>

      {!sc && <p className="muted" style={{ marginTop: 16 }}>Crie um cenário para começar a simular.</p>}

      {sc && (
        <>
          <div className="card" style={{ marginTop: 16 }}>
            <h2>Parâmetros</h2>
            <form key={sc.id + sc.updated_at} onSubmit={saveParams}>
              <div className="row">
                <div className="field"><label>Nome</label><input name="name" required defaultValue={sc.name} /></div>
                <div className="field field-narrow"><label>Semanas de histórico (média real)</label><input name="lookback_weeks" type="number" min="1" defaultValue={sc.lookback_weeks} /></div>
                <div className="field field-narrow"><label>Cobertura de estoque (semanas)</label><input name="coverage_weeks" type="number" min="1" defaultValue={sc.coverage_weeks} /></div>
                <div className="field field-narrow"><label>Margem de segurança (%)</label><input name="safety_percent" type="number" min="0" step="0.01" defaultValue={sc.safety_percent} /></div>
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <div className="field"><label>Notas</label><input name="notes" defaultValue={sc.notes} placeholder="Premissas desta simulação" /></div>
                <button disabled={busy}>Salvar parâmetros</button>
              </div>
            </form>
          </div>

          <div className="row" style={{ marginTop: 16, alignItems: "stretch" }}>
            <Tile label="Faturamento/semana" value={brl(sum.weekly_revenue)} hint={`${sc.coverage_weeks} semanas: ${brl(sum.coverage_revenue)}`} />
            <Tile label="Custo/semana" value={brl(sum.weekly_cost)} />
            <Tile label="Lucro/semana" value={brl(sum.weekly_profit)} hint={`Margem ${pct(sum.margin_percent)}`} tone={sum.weekly_profit >= 0 ? "ok" : "warn"} />
            <Tile label="Comprar agora" value={brl(sum.purchase_cost)} hint="Para cobrir o período, descontando estoque e compras abertas" tone={sum.purchase_cost > 0 ? "warn" : "ok"} />
            <Tile label="Estoque a manter" value={brl(sum.stock_value)} hint={`Valor de ${sc.coverage_weeks} semanas + segurança de ${pct(sc.safety_percent)}`} />
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h2>Itens simulados</h2>
              <div className="row">
                <button type="button" className="secondary" disabled={busy || !result.can_undo} onClick={() => run(() => biApi.undoScenario(sc.id))}
                  title={result.can_undo ? `Desfazer ${actionLabel(result.undo_action, result.undo_detail)}` : "Nada para desfazer"}>
                  Desfazer{result.can_undo ? `: ${actionLabel(result.undo_action, result.undo_detail)}` : ""}
                </button>
                <button type="button" className="secondary" disabled={busy || !result.can_redo} onClick={() => run(() => biApi.redoScenario(sc.id))}
                  title={result.can_redo ? `Refazer ${actionLabel(result.redo_action, result.redo_detail)}` : "Nada para refazer"}>
                  Refazer
                </button>
                <button type="button" className="secondary" disabled={busy} onClick={() => run(() => biApi.importRealScenario(sc.id))}>Importar vendas reais</button>
                <button type="button" className="secondary" disabled={busy || !result.lines.some((l: any) => l.sim_weekly_qty != null)}
                  onClick={() => confirm("Voltar todos os itens ao real? Dá para desfazer em seguida.") && run(() => biApi.resetScenario(sc.id))}>
                  Restaurar tudo ao real
                </button>
              </div>
            </div>
            <form className="row" style={{ marginTop: 12 }} onSubmit={addLine}>
              <div className="field field-narrow">
                <label>Tipo</label>
                <Autocomplete
                  value={addKind}
                  options={[{ value: "PRODUCT", code: "PRODUCT", description: "Produto" }, { value: "KIT", code: "KIT", description: "Kit" }]}
                  onChange={(v) => { setAddKind(v); setAddTarget(""); }}
                />
              </div>
              <div className="field">
                <label>{addKind === "KIT" ? "Kit" : "Produto"}</label>
                <Autocomplete value={addTarget} options={targetOptions} placeholder="Selecione" onChange={setAddTarget} />
              </div>
              <div className="field field-narrow">
                <label>Qtd/semana</label>
                <input type="number" min="0" step="0.01" value={addQty} onChange={(e) => setAddQty(e.target.value)} placeholder="vazio = real" />
              </div>
              <button disabled={busy || !addTarget}>Adicionar ao cenário</button>
            </form>
            <DataTable
              columns={lineColumns}
              rows={result.lines}
              rowKey={(l: any) => `${l.kind}:${l.target_id}`}
              emptyMessage="Adicione produtos ou kits, ou importe as vendas reais para partir da base atual."
              footer={() => (
                <strong>
                  Receita/semana: {brl(sum.weekly_revenue)} · Custo: {brl(sum.weekly_cost)} · Lucro: {brl(sum.weekly_profit)} ({pct(sum.margin_percent)})
                </strong>
              )}
            />
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <h2>Projeção de estoque e compras</h2>
            <p className="muted">
              Kits são abertos em seus componentes. "Manter em estoque" cobre {sc.coverage_weeks} semanas de demanda com {pct(sc.safety_percent)} de segurança;
              "Comprar" desconta o que já há em estoque e em pedidos de compra abertos.
            </p>
            <DataTable
              columns={stockColumns}
              rows={result.stock}
              rowKey={(s: any) => s.product_id}
              emptyMessage="Sem demanda simulada."
              footer={() => <strong>Comprar agora: {brl(sum.purchase_cost)} · Estoque a manter: {brl(sum.stock_value)}</strong>}
            />
          </div>
        </>
      )}

      {dupOpen && (
        <Modal title="Duplicar cenário" onClose={() => setDupOpen(false)}>
          <div className="field">
            <label>Nome da cópia</label>
            <input value={dupName} onChange={(e) => setDupName(e.target.value)} />
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button type="button" disabled={busy} onClick={duplicate}>Duplicar</button>
            <button type="button" className="secondary" onClick={() => setDupOpen(false)}>Cancelar</button>
          </div>
        </Modal>
      )}
    </>
  );
}
