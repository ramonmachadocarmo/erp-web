import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Autocomplete,
  CompanyHeaderInfo,
  DataTable,
  DataTableColumn,
  Loading,
  companyHeaderInfo,
  configApi,
  reportsApi,
  stockApi,
} from "@erp/shared";
import { Column, KitPdfRow, exportCsv, exportKitsPdf, exportPdf, exportXlsx } from "./export";
import { CrmCustomerDetail } from "./CrmCustomerDetail";

const titles: Record<string, string> = {
  kits: "Kits",
  estoque: "Estoque de produtos",
  vendas: "Pedidos de venda",
  compras: "Pedidos de compra",
  previsao: "Previsão",
  perdas: "Perdas",
  financeiro: "Contas a pagar/receber",
  clientes: "Ranking de clientes",
  fluxo: "Fluxo de caixa: realizado × projetado",
  "vendas-produto": "Vendas por produto",
  crm: "CRM — Clientes",
};

function fmtQty(n: number) {
  return Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
}

function brl(n: number) {
  return Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(s: string) {
  return s ? new Date(s).toLocaleString("pt-BR") : "";
}

function fmtDateOnly(s: string) {
  return s ? new Date(s).toLocaleDateString("pt-BR") : "";
}

function dirLabel(d: string) {
  return d === "IN" ? "Entrada" : "Saída";
}

function cashStatusLabel(status: string, overdue: boolean) {
  if (overdue) return "Atrasado";
  return status === "CONFIRMED" ? "Confirmado" : "Previsto";
}

function originLabel(referenceType: string) {
  if (referenceType === "SALE") return "Venda";
  if (referenceType === "PURCHASE") return "Compra";
  return "Manual";
}

function kitItemsText(items: any[]) {
  return (items || []).map((i) => `${i.product_name} × ${fmtQty(i.quantity)}`).join(", ");
}

function dayStart(d: string) {
  return d ? `${d}T00:00:00.000Z` : undefined;
}

function dayEnd(d: string) {
  return d ? `${d}T23:59:59.999Z` : undefined;
}

function daysAgo(s?: string | null) {
  if (!s) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(s).getTime()) / (24 * 60 * 60 * 1000)));
}

function lastOrderLabel(s?: string | null) {
  const d = daysAgo(s);
  if (d == null) return "—";
  const rel = d === 0 ? "hoje" : `há ${d} dia${d === 1 ? "" : "s"}`;
  return `${new Date(s as string).toLocaleDateString("pt-BR")} (${rel})`;
}

const COLUMNS: Record<string, Column[]> = {
  kits: [
    { key: "code", label: "Código" },
    { key: "name", label: "Nome" },
    { key: "itemsText", label: "Itens" },
    { key: "cost", label: "Custo" },
    { key: "suggested_price", label: "Preço sugerido" },
    { key: "margin_percent", label: "Margem %" },
  ],
  estoque: [
    { key: "sku", label: "SKU" },
    { key: "product_name", label: "Produto" },
    { key: "warehouse_name", label: "Almoxarifado" },
    { key: "uom", label: "Unidade" },
    { key: "quantity_available", label: "Disponível" },
    { key: "quantity_reserved", label: "Reservado" },
    { key: "purchase_value", label: "Valor compra" },
    { key: "sale_value", label: "Valor venda" },
  ],
  vendas: [
    { key: "createdAtText", label: "Data" },
    { key: "customer_name", label: "Cliente" },
    { key: "status", label: "Status" },
    { key: "item_summary", label: "Itens" },
    { key: "total_amount", label: "Total" },
  ],
  clientes: [
    { key: "customer_name", label: "Cliente" },
    { key: "order_count", label: "Pedidos" },
    { key: "total_amount", label: "Total comprado" },
    { key: "average_ticket", label: "Ticket médio" },
  ],
  crm: [
    { key: "customer_name", label: "Cliente" },
    { key: "order_count", label: "Pedidos" },
    { key: "total_amount", label: "Valor gasto" },
    { key: "average_ticket", label: "Ticket médio" },
    { key: "cancelled_count", label: "Pedidos cancelados" },
    { key: "lastOrderText", label: "Última compra" },
    { key: "overdue_amount", label: "Em atraso" },
  ],
  "vendas-produto": [
    { key: "sku", label: "SKU" },
    { key: "product_name", label: "Produto" },
    { key: "uom", label: "Unidade" },
    { key: "quantity", label: "Quantidade vendida" },
    { key: "order_count", label: "Pedidos" },
    { key: "total_amount", label: "Total vendido" },
  ],
  compras: [
    { key: "createdAtText", label: "Data" },
    { key: "supplier_name", label: "Fornecedor" },
    { key: "status", label: "Status" },
    { key: "item_summary", label: "Itens" },
    { key: "total_amount", label: "Total" },
  ],
  previsao: [
    { key: "sku", label: "SKU" },
    { key: "product_name", label: "Produto" },
    { key: "uom", label: "Unidade" },
    { key: "forecast_qty", label: "Previsão/semana" },
    { key: "on_hand_qty", label: "Em estoque" },
    { key: "open_po_qty", label: "Em compra" },
    { key: "needed_qty", label: "Necessário" },
  ],
  perdas: [
    { key: "createdAtText", label: "Data" },
    { key: "sku", label: "SKU" },
    { key: "product_name", label: "Produto" },
    { key: "warehouse_name", label: "Almoxarifado" },
    { key: "uom", label: "Unidade" },
    { key: "quantity", label: "Quantidade" },
    { key: "purchase_value", label: "Valor compra" },
    { key: "sale_value", label: "Valor venda" },
  ],
  financeiro: [
    { key: "dueDateText", label: "Vencimento" },
    { key: "directionText", label: "Tipo" },
    { key: "party_name", label: "Cliente/Fornecedor" },
    { key: "amount", label: "Valor" },
    { key: "statusText", label: "Status" },
    { key: "payment_method_name", label: "Forma" },
    { key: "installmentText", label: "Parcela" },
    { key: "originText", label: "Origem" },
    { key: "description", label: "Descrição" },
  ],
  fluxo: [
    { key: "dateText", label: "Data" },
    { key: "realized_inflow", label: "Entradas realizadas" },
    { key: "realized_outflow", label: "Saídas realizadas" },
    { key: "realized_net", label: "Líquido realizado" },
    { key: "projected_inflow", label: "Entradas previstas" },
    { key: "projected_outflow", label: "Saídas previstas" },
    { key: "projected_net", label: "Líquido previsto" },
    { key: "balance", label: "Saldo acumulado" },
  ],
};

const CURRENCY_KEYS = new Set([
  "cost", "suggested_price", "total_amount", "amount", "average_ticket",
  "realized_inflow", "realized_outflow", "realized_net", "projected_inflow", "projected_outflow", "projected_net", "balance",
  "purchase_value", "sale_value", "overdue_amount",
]);
const QTY_KEYS = new Set(["quantity_available", "quantity_reserved", "forecast_qty", "on_hand_qty", "open_po_qty", "needed_qty", "quantity", "order_count", "cancelled_count"]);

// Flat export shape for kits: one row per (kit, item) pair, kit-level totals
// repeated on every row of that kit so a spreadsheet can filter/pivot either way.
const KIT_ITEM_COLUMNS: Column[] = [
  { key: "kit_code", label: "Código do kit" },
  { key: "kit_name", label: "Nome do kit" },
  { key: "product_sku", label: "SKU" },
  { key: "product_name", label: "Produto" },
  { key: "role", label: "Papel" },
  { key: "quantity", label: "Qtd" },
  { key: "uom", label: "Unidade" },
  { key: "unit_cost", label: "Custo unit." },
  { key: "line_cost", label: "Custo" },
  { key: "proportional_sale_price", label: "Preço venda (prop.)" },
  { key: "kit_cost", label: "Custo total do kit" },
  { key: "kit_suggested_price", label: "Preço sugerido do kit" },
  { key: "kit_margin_percent", label: "Margem % do kit" },
];

function itemMarginPercent(lineCost: number, proportionalSalePrice: number) {
  if (!(lineCost > 0)) return null;
  return (proportionalSalePrice / lineCost - 1) * 100;
}

const kitItemColumns: DataTableColumn<any>[] = [
  { key: "product_name", label: "Produto", value: (it) => `${it.product_sku ? `${it.product_sku} — ` : ""}${it.product_name}` },
  { key: "role", label: "Papel" },
  { key: "quantity", label: "Qtd", value: (it) => Number(it.quantity || 0), render: (it) => `${fmtQty(it.quantity)} ${it.uom || ""}` },
  { key: "unit_cost", label: "Custo unit.", value: (it) => Number(it.unit_cost || 0), render: (it) => `${brl(it.unit_cost)}/${it.uom || ""}` },
  { key: "line_cost", label: "Custo", value: (it) => Number(it.line_cost || 0), render: (it) => brl(it.line_cost) },
  {
    key: "proportional_sale_price",
    label: "Preço venda (prop.)",
    value: (it) => Number(it.proportional_sale_price || 0),
    render: (it) => brl(it.proportional_sale_price),
  },
  {
    key: "margin_percent",
    label: "Margem",
    value: (it) => itemMarginPercent(it.line_cost, it.proportional_sale_price) ?? 0,
    render: (it) => {
      const m = itemMarginPercent(it.line_cost, it.proportional_sale_price);
      return m == null ? "—" : `${fmtQty(m)}%`;
    },
  },
];

export default function App() {
  const navigate = useNavigate();
  const segments = useLocation().pathname.split("/").filter(Boolean);
  const crmDetailId = segments[0] === "crm" && segments.length > 1 ? segments[1] : "";
  const page = crmDetailId ? "crm" : segments[segments.length - 1] || "kits";
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [company, setCompany] = useState<CompanyHeaderInfo | undefined>(undefined);

  useEffect(() => {
    configApi.company().then((co) => setCompany(companyHeaderInfo(co))).catch(() => {});
  }, []);

  const [products, setProducts] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  useEffect(() => {
    stockApi.products().then(setProducts).catch(() => {});
    stockApi.warehouses().then(setWarehouses).catch(() => {});
  }, []);
  const productOptions = useMemo(() => products.map((p) => ({ value: p.id, code: p.sku, description: p.name })), [products]);
  const warehouseOptions = useMemo(() => warehouses.map((w) => ({ value: w.id, code: w.code, description: w.name })), [warehouses]);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [coverageWeeks, setCoverageWeeks] = useState(4);
  const [safetyPercent, setSafetyPercent] = useState(10);
  const [lookbackWeeks, setLookbackWeeks] = useState(8);
  const [showOnlyActiveKits, setShowOnlyActiveKits] = useState(true);
  const [lossProductId, setLossProductId] = useState("");
  const [lossWarehouseId, setLossWarehouseId] = useState("");
  const [cfDirection, setCfDirection] = useState("");
  const [cfStatus, setCfStatus] = useState("");
  const [cfOnlyOverdue, setCfOnlyOverdue] = useState(false);

  const columns = COLUMNS[page] || COLUMNS.kits;

  async function load() {
    if (crmDetailId) return;
    setLoading(true);
    setError("");
    try {
      let data: any[] = [];
      if (page === "kits") data = await reportsApi.kits();
      else if (page === "estoque") data = await reportsApi.stock();
      else if (page === "vendas") data = await reportsApi.sales(dayStart(from), dayEnd(to));
      else if (page === "compras") data = await reportsApi.purchases(dayStart(from), dayEnd(to));
      else if (page === "clientes") data = await reportsApi.customerRanking(dayStart(from), dayEnd(to));
      else if (page === "crm") data = await reportsApi.customerRanking(dayStart(from), dayEnd(to));
      else if (page === "vendas-produto") data = await reportsApi.productSales(dayStart(from), dayEnd(to));
      else if (page === "previsao")
        data = await reportsApi.forecast({ coverage_weeks: coverageWeeks, safety_percent: safetyPercent, lookback_weeks: lookbackWeeks });
      else if (page === "perdas")
        data = await reportsApi.losses({
          from: dayStart(from),
          to: dayEnd(to),
          product_id: lossProductId || undefined,
          warehouse_id: lossWarehouseId || undefined,
        });
      else if (page === "financeiro")
        data = await reportsApi.cashflow({
          from: dayStart(from),
          to: dayEnd(to),
          direction: cfDirection || undefined,
          status: cfStatus || undefined,
          overdue: cfOnlyOverdue || undefined,
        });
      else if (page === "fluxo") data = await reportsApi.cashflowTimeline(dayStart(from), dayEnd(to));
      setRows(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    setFrom("");
    setTo("");
    setLossProductId("");
    setLossWarehouseId("");
    setCfDirection("");
    setCfStatus("");
    setCfOnlyOverdue(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const kitRows = useMemo(() => {
    if (page !== "kits") return rows;
    return showOnlyActiveKits ? rows.filter((r) => r.active !== false) : rows;
  }, [rows, page, showOnlyActiveKits]);

  const rawRows = useMemo(
    () =>
      rows.map((r, i) => ({
        ...r,
        itemsText: page === "kits" ? kitItemsText(r.items) : undefined,
        createdAtText: r.created_at ? fmtDate(r.created_at) : undefined,
        dueDateText: page === "financeiro" && r.due_date ? fmtDateOnly(r.due_date) : undefined,
        directionText: page === "financeiro" ? dirLabel(r.direction) : undefined,
        statusText: page === "financeiro" ? cashStatusLabel(r.status, r.overdue) : undefined,
        installmentText: page === "financeiro" ? `${r.installment_no}/${r.installments_total}` : undefined,
        originText: page === "financeiro" ? originLabel(r.reference_type) : undefined,
        dateText: page === "fluxo" && r.date ? fmtDateOnly(r.date) : undefined,
        lastOrderText: page === "crm" ? lastOrderLabel(r.last_order_at) : undefined,
        _key:
          page === "perdas"
            ? `${r.sku}-${r.warehouse_code}-${r.created_at}-${i}`
            : page === "financeiro"
            ? `${r.reference_type}-${r.due_date}-${r.installment_no}-${i}`
            : page === "fluxo"
            ? r.date
            : page === "crm"
            ? r.customer_id || String(i)
            : r.order_id || r.code || (r.sku && r.warehouse_code ? `${r.sku}-${r.warehouse_code}` : r.sku) || String(i),
      })),
    [rows, page]
  );

  const formattedRows = useMemo(
    () =>
      rawRows.map((row) => {
        const out: Record<string, any> = { ...row };
        for (const c of columns) {
          const v = row[c.key];
          if (v == null) {
            out[c.key] = "—";
          } else if (CURRENCY_KEYS.has(c.key)) {
            out[c.key] = c.key === "margin_percent" ? `${fmtQty(v)}%` : brl(v);
          } else if (QTY_KEYS.has(c.key)) {
            out[c.key] = fmtQty(v);
          }
        }
        if (row.margin_percent != null) out.margin_percent = `${fmtQty(row.margin_percent)}%`;
        return out;
      }),
    [rawRows, columns]
  );

  const kitExportItemRows = useMemo(() => {
    if (page !== "kits") return [];
    const out: Record<string, any>[] = [];
    for (const kit of kitRows) {
      for (const it of kit.items || []) {
        out.push({
          kit_code: kit.code,
          kit_name: kit.name,
          product_sku: it.product_sku,
          product_name: it.product_name,
          role: it.role,
          quantity: it.quantity,
          uom: it.uom,
          unit_cost: it.unit_cost,
          line_cost: it.line_cost,
          proportional_sale_price: it.proportional_sale_price,
          kit_cost: kit.cost,
          kit_suggested_price: kit.suggested_price,
          kit_margin_percent: kit.margin_percent,
        });
      }
    }
    return out;
  }, [kitRows, page]);

  const kitPdfRows: KitPdfRow[] = useMemo(() => {
    if (page !== "kits") return [];
    return kitRows.map((kit) => ({
      code: kit.code,
      name: kit.name,
      cost: brl(kit.cost),
      suggested_price: brl(kit.suggested_price),
      margin_percent: `${fmtQty(kit.margin_percent)}%`,
      items: (kit.items || []).map((it: any) => ({
        product_sku: it.product_sku,
        product_name: it.product_name,
        role: it.role,
        quantity: `${fmtQty(it.quantity)} ${it.uom || ""}`,
        unit_cost: `${brl(it.unit_cost)}/${it.uom || ""}`,
        line_cost: brl(it.line_cost),
        proportional_sale_price: brl(it.proportional_sale_price),
      })),
    }));
  }, [kitRows, page]);

  function fname(ext: string) {
    return `${(titles[page] || "relatorio").toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.${ext}`;
  }

  const crmTotals = useMemo(() => {
    if (page !== "crm") return null;
    return rows.reduce(
      (acc, r) => ({
        customers: acc.customers + 1,
        orders: acc.orders + (r.order_count || 0),
        spent: acc.spent + (r.total_amount || 0),
        cancelled: acc.cancelled + (r.cancelled_count || 0),
        overdue: acc.overdue + (r.overdue_amount || 0),
      }),
      { customers: 0, orders: 0, spent: 0, cancelled: 0, overdue: 0 }
    );
  }, [rows, page]);

  const dataColumns: DataTableColumn<any>[] = columns.map((c) => ({
    key: c.key,
    label: c.label,
    render: (row: any) => {
      const v = row[c.key];
      if (page === "crm" && c.key === "customer_name") {
        return (
          <button type="button" className="secondary" onClick={() => navigate(`/crm/${row.customer_id}`)}>
            {v || "—"}
          </button>
        );
      }
      if (v == null) return "—";
      if (c.key === "margin_percent") return `${fmtQty(v)}%`;
      if (CURRENCY_KEYS.has(c.key)) return brl(v);
      if (QTY_KEYS.has(c.key)) return fmtQty(v);
      return String(v);
    },
  }));

  if (crmDetailId) return <CrmCustomerDetail customerId={crmDetailId} />;

  return (
    <div>
      <h1>{titles[page] || "Relatórios"}</h1>
      {error && <p className="error">{error}</p>}
      <div className="card">
        {(page === "vendas" || page === "compras" || page === "perdas" || page === "financeiro" || page === "clientes" || page === "crm" || page === "fluxo" || page === "vendas-produto") && (
          <div className="row">
            <div className="field">
              <label>{page === "financeiro" || page === "fluxo" ? "Vencimento de" : "De"}</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="field">
              <label>{page === "financeiro" || page === "fluxo" ? "Vencimento até" : "Até"}</label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
        )}
        {page === "financeiro" && (
          <div className="row">
            <div className="field">
              <label>Tipo</label>
              <select value={cfDirection} onChange={(e) => setCfDirection(e.target.value)}>
                <option value="">Todos</option>
                <option value="IN">Entrada</option>
                <option value="OUT">Saída</option>
              </select>
            </div>
            <div className="field">
              <label>Status</label>
              <select value={cfStatus} onChange={(e) => setCfStatus(e.target.value)}>
                <option value="">Todos</option>
                <option value="PENDING">Previsto</option>
                <option value="CONFIRMED">Confirmado</option>
              </select>
            </div>
            <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={cfOnlyOverdue} onChange={(e) => setCfOnlyOverdue(e.target.checked)} />
              Somente atrasados
            </label>
          </div>
        )}
        {page === "perdas" && (
          <div className="row">
            <div className="field">
              <label>Produto</label>
              <Autocomplete
                value={lossProductId}
                options={productOptions}
                allowEmpty
                emptyLabel="Todos os produtos"
                onChange={setLossProductId}
              />
            </div>
            <div className="field">
              <label>Almoxarifado</label>
              <Autocomplete
                value={lossWarehouseId}
                options={warehouseOptions}
                allowEmpty
                emptyLabel="Todos os almoxarifados"
                onChange={setLossWarehouseId}
              />
            </div>
          </div>
        )}
        {page === "previsao" && (
          <div className="row">
            <div className="field">
              <label>Cobertura (semanas)</label>
              <input type="number" min="1" value={coverageWeeks} onChange={(e) => setCoverageWeeks(Number(e.target.value) || 1)} />
            </div>
            <div className="field">
              <label>Margem de segurança (%)</label>
              <input type="number" min="0" step="0.01" value={safetyPercent} onChange={(e) => setSafetyPercent(Number(e.target.value) || 0)} />
            </div>
            <div className="field">
              <label>Semanas de histórico</label>
              <input type="number" min="1" value={lookbackWeeks} onChange={(e) => setLookbackWeeks(Number(e.target.value) || 1)} />
            </div>
          </div>
        )}
        {page === "kits" && (
          <div className="row">
            <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <input
                type="checkbox"
                checked={showOnlyActiveKits}
                onChange={(e) => setShowOnlyActiveKits(e.target.checked)}
              />
              Mostrar somente ativos
            </label>
          </div>
        )}
        <div className="row" style={{ marginTop: 12 }}>
          <button type="button" className="secondary" onClick={load}>Atualizar</button>
          {page === "kits" ? (
            <>
              <button type="button" className="secondary" disabled={kitRows.length === 0} onClick={() => exportCsv(fname("csv"), KIT_ITEM_COLUMNS, kitExportItemRows)}>
                Exportar CSV
              </button>
              <button type="button" className="secondary" disabled={kitRows.length === 0} onClick={() => exportXlsx(fname("xlsx"), KIT_ITEM_COLUMNS, kitExportItemRows)}>
                Exportar XLSX
              </button>
              <button type="button" disabled={kitRows.length === 0} onClick={() => exportKitsPdf(fname("pdf"), titles.kits, kitPdfRows, company)}>
                Exportar PDF
              </button>
            </>
          ) : (
            <>
              <button type="button" className="secondary" disabled={rows.length === 0} onClick={() => exportCsv(fname("csv"), columns, rawRows)}>
                Exportar CSV
              </button>
              <button type="button" className="secondary" disabled={rows.length === 0} onClick={() => exportXlsx(fname("xlsx"), columns, rawRows)}>
                Exportar XLSX
              </button>
              <button type="button" disabled={rows.length === 0} onClick={() => exportPdf(fname("pdf"), titles[page] || "Relatório", columns, formattedRows, company)}>
                Exportar PDF
              </button>
            </>
          )}
        </div>
      </div>
      {!loading && page === "crm" && crmTotals && (
        <div className="row" style={{ marginTop: 16, gap: 12 }}>
          <div className="card" style={{ flex: 1 }}>
            <p className="muted">Clientes</p>
            <h2>{crmTotals.customers}</h2>
          </div>
          <div className="card" style={{ flex: 1 }}>
            <p className="muted">Pedidos</p>
            <h2>{fmtQty(crmTotals.orders)}</h2>
          </div>
          <div className="card" style={{ flex: 1 }}>
            <p className="muted">Valor gasto</p>
            <h2>{brl(crmTotals.spent)}</h2>
          </div>
          <div className="card" style={{ flex: 1 }}>
            <p className="muted">Pedidos cancelados</p>
            <h2>{fmtQty(crmTotals.cancelled)}</h2>
          </div>
          <div className="card" style={{ flex: 1 }}>
            <p className="muted">Em atraso</p>
            <h2>{brl(crmTotals.overdue)}</h2>
          </div>
        </div>
      )}
      {loading ? (
        <Loading />
      ) : page === "kits" ? (
        <>
          {kitRows.length === 0 && <p className="muted" style={{ marginTop: 16 }}>Nenhum kit cadastrado.</p>}
          {kitRows.map((kit) => (
            <div className="card" key={kit.code} style={{ marginTop: 16 }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <h2>{kit.code} — {kit.name}</h2>
              </div>
              <DataTable
                columns={kitItemColumns}
                rows={kit.items || []}
                rowKey={(it: any) => it.product_sku || it.product_name}
                emptyMessage="Kit sem itens."
              />
              <div className="row" style={{ marginTop: 8, justifyContent: "flex-end" }}>
                <p className="muted">
                  <strong>Total do kit</strong> — Custo: <strong>{brl(kit.cost)}</strong> · Preço sugerido: <strong>{brl(kit.suggested_price)}</strong> · Margem:{" "}
                  <strong>{fmtQty(kit.margin_percent)}%</strong>
                </p>
              </div>
            </div>
          ))}
        </>
      ) : (
        <div className="card" style={{ marginTop: 16 }}>
          <DataTable
            columns={dataColumns}
            rows={rawRows}
            rowKey={(row) => row._key}
            emptyMessage="Nenhum dado encontrado."
            footer={
              page === "estoque" || page === "perdas"
                ? (rows) => (
                    <strong>
                      Total — Valor compra: {brl(rows.reduce((sum, r: any) => sum + Number(r.purchase_value || 0), 0))}
                      {" · "}
                      Valor venda: {brl(rows.reduce((sum, r: any) => sum + Number(r.sale_value || 0), 0))}
                    </strong>
                  )
                : undefined
            }
          />
        </div>
      )}
    </div>
  );
}
