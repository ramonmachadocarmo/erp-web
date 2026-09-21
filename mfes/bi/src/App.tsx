import { FormEvent, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Scenarios } from "./Scenarios";
import { Autocomplete, CadastroLayout, DataTable, DataTableColumn, Loading, biApi, configApi, purchasingApi, stockApi } from "@erp/shared";

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function brl(n: number) {
  return Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtQty(n: number) {
  return Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
}

function stockUom(p: any) {
  return p?.stock_uom || p?.sale_uom || p?.unit_of_measure || "";
}

function convertQty(qty: number, from: string, to: string, convs: any[]) {
  if (!from || !to || from === to) return qty;
  const c = (convs || []).find((x: any) => (x.from_uom === from && x.to_uom === to) || (x.from_uom === to && x.to_uom === from));
  if (!c?.factor) return null;
  if (c.from_uom === from && c.to_uom === to) return qty * c.factor;
  return qty / c.factor;
}

function budgetStatusLabel(status: string) {
  if (status === "DRAFT") return "Rascunho";
  if (status === "ALLOCATED") return "Alocado";
  if (status === "CONFIRMED") return "Confirmado";
  if (status === "CANCELLED") return "Cancelado";
  return status;
}

function forecastKindLabel(kind: string) {
  return kind === "KIT" ? "Kit" : "Produto";
}

function forecastKey(kind: string, targetId: string) {
  return `${kind}:${targetId}`;
}

// Para simulação de custo (não persiste nada): pega, por produto, o preço unitário do documento
// mais recente (orçamento ou pedido de compra) que o cita — mesmo critério de "mais atual" usado
// no resto da tela.
function latestUnitPriceByProduct(docs: any[]): Record<string, number> {
  const latest: Record<string, number> = {};
  const seenAt: Record<string, number> = {};
  for (const doc of docs || []) {
    const at = doc.created_at ? new Date(doc.created_at).getTime() : 0;
    for (const it of doc.items || []) {
      const price = Number(it.unit_price || 0);
      if (!(price > 0) || !it.product_id) continue;
      if (seenAt[it.product_id] === undefined || at >= seenAt[it.product_id]) {
        latest[it.product_id] = price;
        seenAt[it.product_id] = at;
      }
    }
  }
  return latest;
}

// Espelha o cálculo de custo de montagem do stock-service (Service.RecalculateAssembly), trocando
// o preço de compra do produto pelo mapa de custos simulados quando disponível.
function assemblyCostWithOverrides(assembly: any, products: any[], overrides: Record<string, number>) {
  let cost = 0;
  for (const it of assembly.items || []) {
    const p = products.find((x) => x.id === it.product_id);
    if (!p) continue;
    let qty = Number(it.quantity || 0);
    const from = stockUom(p);
    if (from && p.purchase_uom && from !== p.purchase_uom) {
      const converted = convertQty(qty, from, p.purchase_uom, p.uom_conversions);
      if (converted != null) qty = converted;
    }
    const unitPrice = overrides[it.product_id] ?? Number(p.purchase_price || 0);
    cost += qty * unitPrice;
  }
  return cost;
}

// Recalcula despesa/lucro/margem de cada linha da projeção a partir de um novo custo unitário —
// só em memória, nunca grava no produto/montagem.
function financialsWithCostOverrides(list: any[], overrides: Record<string, number> | null, kits: any[], products: any[]) {
  if (!overrides) return list;
  return list.map((f) => {
    const unitCost = f.kind === "KIT"
      ? (() => {
          const assembly = kits.find((k) => k.id === f.target_id);
          return assembly ? assemblyCostWithOverrides(assembly, products, overrides) : f.unit_cost;
        })()
      : overrides[f.target_id] ?? f.unit_cost;
    const weeklyRevenue = Number(f.weekly_qty || 0) * Number(f.unit_revenue || 0);
    const weeklyCost = Number(f.weekly_qty || 0) * unitCost;
    const weeklyProfit = weeklyRevenue - weeklyCost;
    const marginPercent = weeklyRevenue > 0 ? (weeklyProfit / weeklyRevenue) * 100 : 0;
    return { ...f, unit_cost: unitCost, weekly_revenue: weeklyRevenue, weekly_cost: weeklyCost, weekly_profit: weeklyProfit, margin_percent: marginPercent };
  });
}

// "Payback do lote": custo real de comprar exatamente as quantidades dos orçamentos/pedidos
// selecionados vs. a receita esperada ao vender essas mesmas quantidades (convertidas para a
// unidade de venda) ao preço de venda atual. Diferente de Despesa/semana (que é uma taxa recorrente
// projetada pela previsão de vendas), isto é o resultado de UM lote específico de compra — por isso
// os totais não precisam bater com Despesa/semana. Itens sem preço de venda (ex.: embalagem/insumo
// que só entra como componente de kit) entram no custo mas ficam de fora da receita, e voltam
// listados em `skippedSkus` para deixar isso visível.
function batchPayback(docs: any[], products: any[], financials: any[]) {
  let cost = 0;
  let revenue = 0;
  const skippedSkus: string[] = [];
  const involvedProductIds = new Set<string>();
  for (const doc of docs || []) {
    for (const it of doc.items || []) {
      const qty = Number(it.quantity || 0);
      const unitPrice = Number(it.unit_price || 0);
      cost += qty * unitPrice;
      const p = products.find((x) => x.id === it.product_id);
      if (!p || !(Number(p.sale_price || 0) > 0)) {
        if (p && !skippedSkus.includes(p.sku)) skippedSkus.push(p.sku);
        continue;
      }
      const stockQty = convertQty(qty, p.purchase_uom, stockUom(p), p.uom_conversions) ?? qty;
      revenue += stockQty * Number(p.sale_price || 0);
      involvedProductIds.add(p.id);
    }
  }
  let weeklyRevenueOfBatch = 0;
  for (const id of involvedProductIds) {
    const line = financials.find((f) => f.kind === "PRODUCT" && f.target_id === id);
    if (line) weeklyRevenueOfBatch += Number(line.weekly_revenue || 0);
  }
  const profit = revenue - cost;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
  const weeksCovered = weeklyRevenueOfBatch > 0 ? revenue / weeklyRevenueOfBatch : null;
  return { cost, revenue, profit, margin, weeksCovered, skippedSkus };
}

const titles: Record<string, string> = {
  simulacao: "Simulação de cenários",
  previsao: "Previsão de vendas",
  estoque: "Plano de estoque",
  orcamentos: "Orçamentos",
  precos: "Preços de fornecedores",
  financeiro: "Receita x Despesa",
  agendamentos: "Agendamentos",
};

export default function App() {
  const page = useLocation().pathname.split("/").filter(Boolean).pop() || "previsao";
  const navigate = useNavigate();

  const [products, setProducts] = useState<any[]>([]);
  const [kits, setKits] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [forecasts, setForecasts] = useState<any[]>([]);
  const [plan, setPlan] = useState<any[]>([]);
  const [financials, setFinancials] = useState<any[]>([]);
  const [costOverrides, setCostOverrides] = useState<Record<string, number> | null>(null);
  const [costSourceLabel, setCostSourceLabel] = useState("");
  const [costLoading, setCostLoading] = useState(false);
  const [purchaseQuotesCache, setPurchaseQuotesCache] = useState<any[] | null>(null);
  const [purchaseOrdersCache, setPurchaseOrdersCache] = useState<any[] | null>(null);
  const [activeCostDocs, setActiveCostDocs] = useState<any[]>([]);
  const [budgets, setBudgets] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [supplierPrices, setSupplierPrices] = useState<any[]>([]);
  const [newPriceProduct, setNewPriceProduct] = useState("");
  const [newPriceSupplier, setNewPriceSupplier] = useState("");
  const [newPriceValue, setNewPriceValue] = useState("");
  const [newPriceMinQty, setNewPriceMinQty] = useState("1");
  const [selectedBudgetId, setSelectedBudgetId] = useState("");
  const [selectedBudget, setSelectedBudget] = useState<any>(null);
  const [editingSchedule, setEditingSchedule] = useState<any>(null);
  const [schedFrequency, setSchedFrequency] = useState("WEEKLY");

  const [lookbackWeeks, setLookbackWeeks] = useState(8);
  const [coverageWeeks, setCoverageWeeks] = useState(4);
  const [safetyPercent, setSafetyPercent] = useState(10);

  const [showHiddenForecasts, setShowHiddenForecasts] = useState(false);
  const [newForecastKind, setNewForecastKind] = useState("PRODUCT");
  const [newForecastTarget, setNewForecastTarget] = useState("");
  const [newForecastQty, setNewForecastQty] = useState("");
  const [overrideDrafts, setOverrideDrafts] = useState<Record<string, string>>({});
  const [itemDrafts, setItemDrafts] = useState<Record<string, string>>({});
  const [allocDrafts, setAllocDrafts] = useState<Record<string, { supplierId?: string; qty?: string; price?: string }>>({});

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [listOpen, setListOpen] = useState(true);

  async function loadCore() {
    try {
      const [p, k, s, b, sc, sp] = await Promise.all([
        stockApi.products(),
        stockApi.assemblies(),
        configApi.suppliers(),
        biApi.budgets(),
        biApi.schedules(),
        biApi.supplierPrices(),
      ]);
      setProducts(p);
      setKits(k);
      setSuppliers(s);
      setBudgets(b);
      setSchedules(sc);
      setSupplierPrices(sp);
    } finally {
      setLoading(false);
    }
  }

  async function loadSupplierPrices() {
    try {
      setSupplierPrices(await biApi.supplierPrices());
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function loadForecasts() {
    try {
      setForecasts(await biApi.forecasts(lookbackWeeks, showHiddenForecasts));
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function hideForecast(kind: string, targetId: string) {
    setError("");
    try {
      await biApi.excludeForecast(kind, targetId);
      await loadForecasts();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function restoreForecast(kind: string, targetId: string) {
    setError("");
    try {
      await biApi.includeForecast(kind, targetId);
      await loadForecasts();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function loadPlan() {
    try {
      setPlan(await biApi.storagePlan({ coverage_weeks: coverageWeeks, safety_percent: safetyPercent, lookback_weeks: lookbackWeeks }));
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function loadFinancials() {
    try {
      setFinancials(await biApi.financials(lookbackWeeks));
      setCostOverrides(null);
      setCostSourceLabel("");
      setActiveCostDocs([]);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function applyCostFromQuotes() {
    setCostLoading(true);
    try {
      const docs = purchaseQuotesCache ?? (await purchasingApi.quotes());
      if (!purchaseQuotesCache) setPurchaseQuotesCache(docs);
      const open = docs.filter((q: any) => q.status === "OPEN");
      setCostOverrides(latestUnitPriceByProduct(open));
      setActiveCostDocs(open);
      setCostSourceLabel("Orçamentos");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCostLoading(false);
    }
  }

  async function applyCostFromOrders() {
    setCostLoading(true);
    try {
      const docs = purchaseOrdersCache ?? (await purchasingApi.orders());
      if (!purchaseOrdersCache) setPurchaseOrdersCache(docs);
      // Pedido de compra não tem status "OPEN" (só APPROVED/RECEIVED/CONFERRED/CANCELLED) — "aberto"
      // aqui é lido como "ainda válido", ou seja, tudo que não foi cancelado.
      const open = docs.filter((o: any) => o.status !== "CANCELLED");
      setCostOverrides(latestUnitPriceByProduct(open));
      setActiveCostDocs(open);
      setCostSourceLabel("Pedidos de compra");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCostLoading(false);
    }
  }

  function clearCostOverrides() {
    setCostOverrides(null);
    setCostSourceLabel("");
    setActiveCostDocs([]);
  }

  async function loadBudgets() {
    try {
      setBudgets(await biApi.budgets());
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function loadSchedules() {
    try {
      setSchedules(await biApi.schedules());
    } catch (err: any) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadCore().then(loadForecasts).then(loadPlan).then(loadFinancials).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    setFormOpen(false);
    setListOpen(true);
    setError("");
  }, [page]);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const f of forecasts) next[forecastKey(f.kind, f.target_id)] = f.override_weekly_qty != null ? String(f.override_weekly_qty) : "";
    setOverrideDrafts(next);
  }, [forecasts]);

  function productLabel(id: string) {
    const p = products.find((x) => x.id === id);
    return p ? `${p.sku} — ${p.name}` : id;
  }

  function supplierLabel(id: string) {
    const s = suppliers.find((x) => x.id === id);
    if (!s) return id;
    return s.kind === "PJ" ? s.company_name || s.name : s.name;
  }

  const productOptions = useMemo(
    () => products.filter((p) => p.kind !== "FIXED_ASSET").map((p) => ({ value: p.id, code: p.sku, description: p.name })),
    [products]
  );
  const kitOptions = useMemo(() => kits.map((k) => ({ value: k.id, code: k.code, description: k.name })), [kits]);
  // A product that's also some kit's linked final product (e.g. "Cesta 3 pessoas", assembled
  // fresh from raw items in Montagem) must be forecasted as Kit, not Produto — only the Kit
  // path explodes its weekly qty into demand for its components on the stock plan and prices
  // it from the assembly's own cost/revenue. Forecasting it as Produto instead asks the stock
  // plan to stock/purchase the finished kit-product directly, which is never right for these.
  const kitProductIds = useMemo(() => new Set(kits.map((k) => k.product_id).filter(Boolean)), [kits]);
  const forecastProductOptions = useMemo(
    () => productOptions.filter((o) => !kitProductIds.has(o.value)),
    [productOptions, kitProductIds]
  );
  const supplierOptions = useMemo(
    () => suppliers.map((s) => ({ value: s.id, code: s.document, description: s.kind === "PJ" ? s.company_name || s.name : s.name })),
    [suppliers]
  );

  function supplierPriceFor(productId: string, supplierId: string) {
    const sp = supplierPrices.find((x) => x.product_id === productId && x.supplier_id === supplierId);
    return sp ? sp.price : null;
  }

  // Mirrors bi-service's domain.PurchaseLine: converts a stock-UoM quantity into what actually
  // gets ordered — suppliers often sell in fixed pack sizes (e.g. boxes of 20kg only), so this
  // rounds UP to the next whole pack when a registered supplier price (with its min_qty pack
  // size) is known, and shows the real per-purchase-unit price instead of the per-stock-unit one.
  function purchaseLineFor(productId: string, stockQty: number, supplierId: string, unitCostFallback: number) {
    const p = products.find((x) => x.id === productId);
    if (!p || !stockQty) return null;
    const stockUoMVal = stockUom(p);
    const purchaseUoM = p.purchase_uom;
    const sp = supplierId ? supplierPrices.find((x) => x.product_id === productId && x.supplier_id === supplierId) : null;
    if (!purchaseUoM || purchaseUoM === stockUoMVal) {
      let unitPrice = unitCostFallback;
      if (sp && sp.min_qty > 0) unitPrice = sp.price / sp.min_qty;
      else if (!(unitPrice > 0)) unitPrice = p.purchase_price;
      return { purchaseQty: stockQty, unitPrice, uom: purchaseUoM || stockUoMVal };
    }
    const stockPerPurchaseUnit = convertQty(1, purchaseUoM, stockUoMVal, p.uom_conversions);
    if (stockPerPurchaseUnit == null || stockPerPurchaseUnit <= 0) return null;
    if (sp && sp.min_qty > 0) {
      const packStockQty = sp.min_qty * stockPerPurchaseUnit;
      const packs = Math.max(1, Math.ceil(stockQty / packStockQty - 1e-9));
      return { purchaseQty: packs * sp.min_qty, unitPrice: sp.price / sp.min_qty, uom: purchaseUoM };
    }
    const purchaseQty = Math.max(1, Math.ceil(stockQty / stockPerPurchaseUnit - 1e-9));
    const unitPrice = unitCostFallback > 0 ? unitCostFallback * stockPerPurchaseUnit : p.purchase_price;
    return { purchaseQty, unitPrice, uom: purchaseUoM };
  }

  async function saveOverride(kind: string, targetId: string) {
    setError("");
    const raw = overrideDrafts[forecastKey(kind, targetId)];
    const qty = Number(raw);
    if (raw === "" || Number.isNaN(qty) || qty < 0) {
      setError("Informe uma quantidade válida.");
      return;
    }
    try {
      await biApi.setForecastOverride(kind, targetId, { weekly_qty: qty });
      await loadForecasts();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function clearOverride(kind: string, targetId: string) {
    setError("");
    try {
      await biApi.clearForecastOverride(kind, targetId);
      await loadForecasts();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function addManualForecast() {
    setError("");
    const qty = Number(newForecastQty);
    if (!newForecastTarget || Number.isNaN(qty) || qty < 0) {
      setError(newForecastKind === "KIT" ? "Selecione um kit e informe a quantidade." : "Selecione um produto e informe a quantidade.");
      return;
    }
    try {
      await biApi.setForecastOverride(newForecastKind, newForecastTarget, { weekly_qty: qty });
      setNewForecastTarget("");
      setNewForecastQty("");
      await loadForecasts();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function generateBudgetFromPlan() {
    setError("");
    try {
      const b = await biApi.createBudget({ coverage_weeks: coverageWeeks, safety_percent: safetyPercent, lookback_weeks: lookbackWeeks });
      setSelectedBudgetId(b.id);
      setSelectedBudget(b);
      await loadBudgets();
      navigate("/bi/orcamentos");
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function selectBudget(id: string) {
    setError("");
    if (selectedBudgetId === id) {
      setSelectedBudgetId("");
      setSelectedBudget(null);
      return;
    }
    setSelectedBudgetId(id);
    setItemDrafts({});
    try {
      setSelectedBudget(await biApi.getBudget(id));
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function deleteBudget(id: string) {
    if (!confirm("Excluir este orçamento?")) return;
    setError("");
    try {
      await biApi.deleteBudget(id);
      if (selectedBudgetId === id) {
        setSelectedBudgetId("");
        setSelectedBudget(null);
      }
      await loadBudgets();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function refreshSelectedBudget() {
    if (!selectedBudgetId) return;
    try {
      setSelectedBudget(await biApi.getBudget(selectedBudgetId));
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function saveItemNeeded(budgetId: string, itemId: string) {
    setError("");
    const raw = itemDrafts[itemId];
    const qty = Number(raw);
    if (Number.isNaN(qty) || qty < 0) {
      setError("Quantidade inválida.");
      return;
    }
    try {
      await biApi.updateBudgetItem(budgetId, itemId, { needed_qty: qty });
      setItemDrafts((d) => {
        const next = { ...d };
        delete next[itemId];
        return next;
      });
      await refreshSelectedBudget();
      await loadBudgets();
    } catch (err: any) {
      setError(err.message);
    }
  }

  function cancelItemEdit(itemId: string) {
    setItemDrafts((d) => {
      const next = { ...d };
      delete next[itemId];
      return next;
    });
  }

  async function deleteItem(budgetId: string, itemId: string, allocatedQty: number) {
    setError("");
    const msg = allocatedQty > 0
      ? "Este item já tem alocações de fornecedor. Excluí-lo também removerá essas alocações. Confirma?"
      : "Excluir este item do orçamento?";
    if (!confirm(msg)) return;
    try {
      await biApi.deleteBudgetItem(budgetId, itemId);
      cancelItemEdit(itemId);
      await refreshSelectedBudget();
      await loadBudgets();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function addAllocation(item: any) {
    setError("");
    const draft = allocDrafts[item.id] || {};
    const qty = Number(draft.qty);
    const price = Number(draft.price || 0);
    if (!draft.supplierId || Number.isNaN(qty) || qty <= 0) {
      setError("Selecione o fornecedor e informe a quantidade.");
      return;
    }
    try {
      await biApi.addAllocation(selectedBudget.id, item.id, { supplier_id: draft.supplierId, quantity: qty, unit_price: price });
      setAllocDrafts((d) => ({ ...d, [item.id]: {} }));
      await refreshSelectedBudget();
      await loadBudgets();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function removeAllocation(allocationId: string) {
    setError("");
    try {
      await biApi.deleteAllocation(selectedBudget.id, allocationId);
      await refreshSelectedBudget();
      await loadBudgets();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function confirmBudget() {
    setError("");
    try {
      await biApi.confirmBudget(selectedBudget.id);
      await refreshSelectedBudget();
      await loadBudgets();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function cancelBudget() {
    setError("");
    if (!confirm("Cancelar este orçamento?")) return;
    try {
      await biApi.cancelBudget(selectedBudget.id);
      await refreshSelectedBudget();
      await loadBudgets();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function addSupplierPrice() {
    setError("");
    const price = Number(newPriceValue);
    const minQty = Number(newPriceMinQty);
    if (!newPriceProduct || !newPriceSupplier || Number.isNaN(price) || price < 0 || Number.isNaN(minQty) || minQty <= 0) {
      setError("Selecione o produto, o fornecedor e informe o preço e a quantidade mínima.");
      return;
    }
    try {
      await biApi.setSupplierPrice({ product_id: newPriceProduct, supplier_id: newPriceSupplier, price, min_qty: minQty });
      setNewPriceProduct("");
      setNewPriceSupplier("");
      setNewPriceValue("");
      setNewPriceMinQty("1");
      await loadSupplierPrices();
    } catch (err: any) {
      setError(err.message);
    }
  }

  // Effective price per stock/sale unit: (price ÷ min_qty) converted from the
  // product's purchase UoM into its stock UoM — the "rule of three" that lets
  // suppliers quoting different pack sizes be compared fairly.
  function supplierPriceUnitCost(sp: any) {
    const p = products.find((x) => x.id === sp.product_id);
    if (!p || !sp.min_qty) return null;
    const perPurchaseUnit = sp.price / sp.min_qty;
    const stockPerPurchase = convertQty(1, p.purchase_uom, stockUom(p), p.uom_conversions);
    if (stockPerPurchase == null || stockPerPurchase <= 0) return null;
    return perPurchaseUnit / stockPerPurchase;
  }

  // Same rule-of-three as supplierPriceUnitCost, applied to every registered price for a
  // product to find the cheapest per-stock-unit supplier — the "Preços de fornecedores"
  // screen's own best-price logic, reused here to auto-fill an item's allocation form.
  function bestSupplierPriceFor(productId: string): { sp: any; unitCost: number } | null {
    let best: any = null;
    let bestCost = Infinity;
    for (const sp of supplierPrices) {
      if (sp.product_id !== productId) continue;
      const cost = supplierPriceUnitCost(sp);
      if (cost == null) continue;
      if (cost < bestCost) {
        bestCost = cost;
        best = sp;
      }
    }
    return best ? { sp: best, unitCost: bestCost } : null;
  }

  function fillBestPrice(item: any, remaining: number) {
    const best = bestSupplierPriceFor(item.product_id);
    if (!best) {
      setError("Nenhum preço de fornecedor cadastrado para este produto.");
      return;
    }
    setError("");
    setAllocDrafts((d) => ({
      ...d,
      [item.id]: { supplierId: best.sp.supplier_id, qty: String(remaining), price: String(best.unitCost) },
    }));
  }

  async function removeSupplierPrice(id: string) {
    setError("");
    try {
      await biApi.deleteSupplierPrice(id);
      await loadSupplierPrices();
    } catch (err: any) {
      setError(err.message);
    }
  }

  // Normalizes "$Price for MinQty units of purchase UoM" into $/1 purchase-UoM unit — the
  // same basis Product.PurchasePrice is tracked in — and writes it to the product.
  async function applySupplierPriceToProduct(sp: any) {
    setError("");
    if (!sp.min_qty) return;
    try {
      await stockApi.createPurchasePrice({ product_id: sp.product_id, new_price: sp.price / sp.min_qty });
      await loadCore();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function saveSchedule(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setError("");
    const f = new FormData(form);
    const frequency = String(f.get("frequency") || "WEEKLY");
    const body: any = {
      name: f.get("name"),
      frequency,
      coverage_weeks: Number(f.get("coverage_weeks") || 4),
      safety_percent: Number(f.get("safety_percent") || 0),
      lookback_weeks: Number(f.get("lookback_weeks") || 8),
      active: f.get("active") === "on",
    };
    if (frequency === "WEEKLY") body.day_of_week = Number(f.get("day_of_week") || 0);
    else body.day_of_month = Number(f.get("day_of_month") || 1);
    try {
      if (editingSchedule) await biApi.updateSchedule(editingSchedule.id, body);
      else await biApi.createSchedule(body);
      form.reset();
      setEditingSchedule(null);
      setSchedFrequency("WEEKLY");
      setFormOpen(false);
      await loadSchedules();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function runScheduleNow(id: string) {
    setError("");
    try {
      await biApi.runScheduleNow(id);
      await loadBudgets();
      await loadSchedules();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function removeSchedule(id: string) {
    setError("");
    try {
      await biApi.deleteSchedule(id);
      if (editingSchedule?.id === id) setEditingSchedule(null);
      await loadSchedules();
    } catch (err: any) {
      setError(err.message);
    }
  }

  // Kits have no stock UoM of their own (they're a bundle code, not a stocked item) — their
  // weekly forecast is a count of assemblies, so "un" stands in for that count.
  function forecastUom(f: any) {
    if (f.kind === "KIT") return "un";
    return stockUom(products.find((x) => x.id === f.target_id));
  }

  // Rows mix products with different stock units, so a single sum would be meaningless —
  // group by unit instead (e.g. "120 un + 35 KG") over whatever's currently filtered/sorted.
  function forecastTotalsByUom(rows: any[]) {
    const totals: Record<string, number> = {};
    for (const f of rows) {
      const uom = forecastUom(f) || "—";
      totals[uom] = (totals[uom] || 0) + Number(f.effective_weekly_qty || 0);
    }
    return totals;
  }

  // A kit sells as its linked final product — same sale price shown/edited in Montagem —
  // not a price of its own, since the forecast target_id for a KIT is the assembly's id.
  function forecastSalePrice(f: any) {
    if (f.kind === "KIT") {
      const assembly = kits.find((k) => k.id === f.target_id);
      const p = assembly ? products.find((x) => x.id === assembly.product_id) : null;
      return Number(p?.sale_price || 0);
    }
    return Number(products.find((x) => x.id === f.target_id)?.sale_price || 0);
  }

  function forecastWeeklyRevenue(f: any) {
    return Number(f.effective_weekly_qty || 0) * forecastSalePrice(f);
  }

  const forecastColumns: DataTableColumn<any>[] = [
    { key: "kind", label: "Tipo", value: (f) => forecastKindLabel(f.kind) },
    { key: "code", label: "Código" },
    {
      key: "name",
      label: "Nome",
      render: (f) => (
        <>
          {f.name}
          {f.excluded && <span className="badge warn" style={{ marginLeft: 6 }}>Oculto</span>}
        </>
      ),
    },
    {
      key: "computed_weekly_qty",
      label: "Média calculada/semana",
      value: (f) => f.computed_weekly_qty,
      render: (f) => <span className="muted">{`${fmtQty(f.computed_weekly_qty)} ${forecastUom(f)}`}</span>,
    },
    {
      key: "override",
      label: "Sobreposição manual/semana",
      value: (f) => f.override_weekly_qty,
      render: (f) => (
        <div className="row" style={{ flexWrap: "nowrap", alignItems: "center" }}>
          <input
            type="number"
            step="0.0001"
            min="0"
            value={overrideDrafts[forecastKey(f.kind, f.target_id)] ?? ""}
            onChange={(e) => setOverrideDrafts((d) => ({ ...d, [forecastKey(f.kind, f.target_id)]: e.target.value }))}
            placeholder="—"
          />
          <span className="muted">{forecastUom(f)}</span>
        </div>
      ),
    },
    {
      key: "effective_weekly_qty",
      label: "Efetivo/semana",
      render: (f) => <strong>{fmtQty(f.effective_weekly_qty)} {forecastUom(f)}</strong>,
    },
    {
      key: "unit_revenue",
      label: "Preço venda",
      value: (f) => forecastSalePrice(f),
      render: (f) => <span className="muted">{brl(forecastSalePrice(f))}</span>,
    },
    {
      key: "weekly_revenue",
      label: "Receita prevista/semana",
      value: (f) => forecastWeeklyRevenue(f),
      render: (f) => <strong>{brl(forecastWeeklyRevenue(f))}</strong>,
    },
    {
      key: "actions",
      label: "",
      sortable: false,
      filterable: false,
      render: (f) => (
        <div className="row" style={{ flexWrap: "nowrap" }}>
          {!f.excluded && (
            <button type="button" className="secondary" onClick={() => saveOverride(f.kind, f.target_id)}>Salvar</button>
          )}
          {!f.excluded && f.override_weekly_qty != null && (
            <button type="button" className="secondary" onClick={() => clearOverride(f.kind, f.target_id)}>Limpar</button>
          )}
          {f.excluded ? (
            <button type="button" className="secondary" onClick={() => restoreForecast(f.kind, f.target_id)}>Restaurar</button>
          ) : (
            <button type="button" className="danger" onClick={() => hideForecast(f.kind, f.target_id)}>Excluir</button>
          )}
        </div>
      ),
    },
  ];

  const planColumns: DataTableColumn<any>[] = [
    { key: "sku", label: "SKU" },
    { key: "name", label: "Nome" },
    { key: "uom", label: "Unidade", value: (l) => stockUom(products.find((x) => x.id === l.product_id)) || "—" },
    {
      key: "forecast_qty",
      label: "Previsão/semana",
      render: (l) => `${fmtQty(l.forecast_qty)} ${stockUom(products.find((x) => x.id === l.product_id))}`,
    },
    {
      key: "on_hand_qty",
      label: "Em estoque",
      render: (l) => <span className="muted">{fmtQty(l.on_hand_qty)} {stockUom(products.find((x) => x.id === l.product_id))}</span>,
    },
    {
      key: "open_po_qty",
      label: "Em compra",
      render: (l) => <span className="muted">{fmtQty(l.open_po_qty)} {stockUom(products.find((x) => x.id === l.product_id))}</span>,
    },
    {
      key: "needed_qty",
      label: "Necessário",
      render: (l) => {
        const p = products.find((x) => x.id === l.product_id);
        const um = stockUom(p);
        const purchaseUom = p?.purchase_uom;
        const needsConversion = purchaseUom && purchaseUom !== um;
        const neededInPurchaseUom = needsConversion ? convertQty(l.needed_qty, um, purchaseUom, p?.uom_conversions) : null;
        return (
          <>
            <strong>{fmtQty(l.needed_qty)} {um}</strong>
            {needsConversion && (
              <div className="muted">
                {neededInPurchaseUom == null ? `sem conversão para ${purchaseUom}` : `≈ ${fmtQty(neededInPurchaseUom)} ${purchaseUom}`}
              </div>
            )}
          </>
        );
      },
    },
  ];

  const budgetColumns: DataTableColumn<any>[] = [
    { key: "code", label: "Código" },
    { key: "status", label: "Status", value: (b) => budgetStatusLabel(b.status), render: (b) => <span className="badge">{budgetStatusLabel(b.status)}</span> },
    {
      key: "params",
      label: "Parâmetros",
      value: (b) => `${b.coverage_weeks} sem · ${b.safety_percent}%`,
      render: (b) => <span className="muted">{b.coverage_weeks} sem · {b.safety_percent}%</span>,
    },
    {
      key: "created_at",
      label: "Criado em",
      value: (b) => new Date(b.created_at),
      render: (b) => <span className="muted">{new Date(b.created_at).toLocaleString("pt-BR")}</span>,
    },
    {
      key: "actions",
      label: "",
      sortable: false,
      filterable: false,
      render: (b) => (
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <button type="button" className="secondary" onClick={() => selectBudget(b.id)}>
            {selectedBudgetId === b.id ? "Ocultar" : "Ver"}
          </button>
          {b.status !== "CONFIRMED" && (
            <button type="button" className="danger" onClick={() => deleteBudget(b.id)}>Excluir</button>
          )}
        </div>
      ),
    },
  ];

  const priceRows = supplierPrices.map((sp) => ({ ...sp, unitCost: supplierPriceUnitCost(sp) }));
  const bestPriceByProduct: Record<string, number> = {};
  for (const sp of priceRows) {
    if (sp.unitCost == null) continue;
    if (bestPriceByProduct[sp.product_id] == null || sp.unitCost < bestPriceByProduct[sp.product_id]) {
      bestPriceByProduct[sp.product_id] = sp.unitCost;
    }
  }
  const priceColumns: DataTableColumn<any>[] = [
    { key: "product", label: "Produto", value: (sp) => productLabel(sp.product_id) },
    { key: "supplier", label: "Fornecedor", value: (sp) => supplierLabel(sp.supplier_id) },
    {
      key: "min_qty",
      label: "Qtd mínima",
      render: (sp) => <span className="muted">{fmtQty(sp.min_qty)} {products.find((p) => p.id === sp.product_id)?.purchase_uom}</span>,
    },
    { key: "price", label: "Preço", render: (sp) => brl(sp.price) },
    {
      key: "unitCost",
      label: "Preço/unidade de estoque",
      render: (sp) => {
        if (sp.unitCost == null) return <span className="muted">sem conversão</span>;
        const isBest = bestPriceByProduct[sp.product_id] === sp.unitCost;
        return (
          <>
            {brl(sp.unitCost)}/{stockUom(products.find((p) => p.id === sp.product_id))}
            {isBest && <span className="badge" style={{ marginLeft: 6 }}>Melhor preço</span>}
          </>
        );
      },
    },
    {
      key: "updated_at",
      label: "Atualizado em",
      value: (sp) => new Date(sp.updated_at),
      render: (sp) => <span className="muted">{new Date(sp.updated_at).toLocaleString("pt-BR")}</span>,
    },
    {
      key: "actions",
      label: "",
      sortable: false,
      filterable: false,
      render: (sp) => {
        const p = products.find((x) => x.id === sp.product_id);
        const newPurchasePrice = sp.min_qty ? sp.price / sp.min_qty : null;
        const upToDate = newPurchasePrice != null && p && Math.abs(Number(p.purchase_price || 0) - newPurchasePrice) < 0.005;
        return (
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <button
              type="button"
              className="secondary"
              disabled={newPurchasePrice == null || upToDate}
              onClick={() => applySupplierPriceToProduct(sp)}
              title={newPurchasePrice != null ? `Definir preço de compra do produto para ${brl(newPurchasePrice)}/${p?.purchase_uom || ""}` : undefined}
            >
              {upToDate ? "Preço atualizado" : "Atualizar preço do produto"}
            </button>
            <button type="button" className="secondary" onClick={() => removeSupplierPrice(sp.id)}>Remover</button>
          </div>
        );
      },
    },
  ];

  const financialColumns: DataTableColumn<any>[] = [
    { key: "kind", label: "Tipo", value: (f) => forecastKindLabel(f.kind) },
    { key: "code", label: "Código" },
    { key: "name", label: "Nome" },
    { key: "weekly_qty", label: "Qtd/semana", value: (f) => Number(f.weekly_qty || 0), render: (f) => fmtQty(f.weekly_qty) },
    { key: "unit_revenue", label: "Preço venda", value: (f) => Number(f.unit_revenue || 0), render: (f) => brl(f.unit_revenue) },
    { key: "unit_cost", label: "Custo", value: (f) => Number(f.unit_cost || 0), render: (f) => brl(f.unit_cost) },
    {
      key: "weekly_revenue",
      label: "Receita/semana",
      value: (f) => Number(f.weekly_revenue || 0),
      render: (f) => <span className="muted">{brl(f.weekly_revenue)}</span>,
    },
    {
      key: "weekly_cost",
      label: "Despesa/semana",
      value: (f) => Number(f.weekly_cost || 0),
      render: (f) => <span className="muted">{brl(f.weekly_cost)}</span>,
    },
    {
      key: "weekly_profit",
      label: "Lucro/semana",
      value: (f) => Number(f.weekly_profit || 0),
      render: (f) => <strong className={Number(f.weekly_profit) < 0 ? "error" : ""}>{brl(f.weekly_profit)}</strong>,
    },
    {
      key: "margin_percent",
      label: "Margem",
      value: (f) => Number(f.margin_percent || 0),
      render: (f) => <span className={Number(f.margin_percent) < 0 ? "error" : "muted"}>{Number(f.margin_percent || 0).toFixed(1)}%</span>,
    },
  ];

  const displayFinancials = useMemo(
    () => financialsWithCostOverrides(financials, costOverrides, kits, products),
    [financials, costOverrides, kits, products]
  );

  const batchSummary = useMemo(
    () => (costSourceLabel ? batchPayback(activeCostDocs, products, displayFinancials) : null),
    [costSourceLabel, activeCostDocs, products, displayFinancials]
  );

  const financeSummary = displayFinancials.reduce(
    (acc, f) => {
      acc.revenue += Number(f.weekly_revenue || 0);
      acc.cost += Number(f.weekly_cost || 0);
      return acc;
    },
    { revenue: 0, cost: 0 }
  );
  const financeProfit = financeSummary.revenue - financeSummary.cost;
  const financeMargin = financeSummary.revenue > 0 ? (financeProfit / financeSummary.revenue) * 100 : 0;

  const scheduleColumns: DataTableColumn<any>[] = [
    { key: "name", label: "Nome" },
    {
      key: "frequency",
      label: "Frequência",
      value: (s) => (s.frequency === "WEEKLY" ? `Semanal · ${WEEKDAYS[s.day_of_week ?? 0]}` : `Mensal · dia ${s.day_of_month}`),
      render: (s) => (
        <span className="muted">{s.frequency === "WEEKLY" ? `Semanal · ${WEEKDAYS[s.day_of_week ?? 0]}` : `Mensal · dia ${s.day_of_month}`}</span>
      ),
    },
    { key: "next_run_at", label: "Próxima execução", value: (s) => new Date(s.next_run_at), render: (s) => new Date(s.next_run_at).toLocaleString("pt-BR") },
    {
      key: "last_run_at",
      label: "Última execução",
      value: (s) => (s.last_run_at ? new Date(s.last_run_at) : null),
      render: (s) => <span className="muted">{s.last_run_at ? new Date(s.last_run_at).toLocaleString("pt-BR") : "—"}</span>,
    },
    { key: "active", label: "Ativo", value: (s) => (s.active ? "Sim" : "Não") },
    {
      key: "actions",
      label: "",
      sortable: false,
      filterable: false,
      render: (s) => (
        <div className="row">
          <button
            type="button"
            className="secondary"
            onClick={() => { setEditingSchedule(s); setSchedFrequency(s.frequency); setFormOpen(true); }}
          >
            Editar
          </button>
          <button type="button" className="secondary" onClick={() => runScheduleNow(s.id)}>Executar agora</button>
          <button type="button" className="secondary" onClick={() => removeSchedule(s.id)}>Excluir</button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <h1>{titles[page] || "Inteligência de Negócio"}</h1>
      {error && <p className="error">{error}</p>}
      {page === "simulacao" ? (
        <Scenarios />
      ) : loading ? (
        <Loading />
      ) : (
        <>
          {page === "previsao" && (
            <CadastroLayout
              formTitle="Parâmetros"
              listTitle="Previsão por produto"
              formOpen={formOpen}
              listOpen={listOpen}
              onFormOpen={setFormOpen}
              onListOpen={setListOpen}
              form={
                <>
                  <p className="muted">
                    Média móvel calculada a partir do histórico de vendas. Você pode sempre sobrepor manualmente — útil
                    enquanto não há histórico suficiente, e a sobreposição vale mesmo depois que o histórico existir.
                  </p>
                  <div className="row">
                    <div className="field">
                      <label>Semanas de histórico</label>
                      <input type="number" min="1" value={lookbackWeeks} onChange={(e) => setLookbackWeeks(Number(e.target.value) || 1)} />
                    </div>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={showHiddenForecasts}
                        onChange={(e) => {
                          setShowHiddenForecasts(e.target.checked);
                          biApi.forecasts(lookbackWeeks, e.target.checked).then(setForecasts).catch((err: any) => setError(err.message));
                        }}
                      />
                      Mostrar ocultos
                    </label>
                    <button type="button" className="secondary" onClick={() => loadForecasts()}>Atualizar</button>
                  </div>
                  <h2 style={{ marginTop: 16 }}>Adicionar previsão manual</h2>
                  <p className="muted">
                    Um kit vende como seu produto final, então também ganha uma média calculada a partir do histórico
                    de vendas desse produto — uma sobreposição manual continua valendo mais quando definida. De um jeito
                    ou de outro, a quantidade semanal do kit é convertida na demanda dos produtos que o compõem: o kit
                    em si nunca aparece no Plano de estoque, só seus componentes — por isso o número lá costuma ser
                    maior que a soma direta desta lista.
                  </p>
                  <p className="muted">
                    Se o produto final de uma montagem (ex.: uma cesta) tem seu próprio código, ele some da lista de
                    "Produto" abaixo — preveja-o como "Kit" mesmo assim, escolhendo a montagem correspondente. Só
                    assim a previsão vira demanda dos itens que o compõem no Plano de estoque, e o preço/custo usados
                    são os da montagem, não os do produto final (que geralmente não tem preço de compra próprio).
                  </p>
                  <div className="row">
                    <div className="field">
                      <label>Tipo</label>
                      <Autocomplete
                        value={newForecastKind}
                        options={[
                          { value: "PRODUCT", code: "PRODUCT", description: "Produto" },
                          { value: "KIT", code: "KIT", description: "Kit" },
                        ]}
                        onChange={(v) => { setNewForecastKind(v); setNewForecastTarget(""); }}
                      />
                    </div>
                    <div className="field">
                      <label>{newForecastKind === "KIT" ? "Kit" : "Produto"}</label>
                      <Autocomplete
                        value={newForecastTarget}
                        allowEmpty
                        emptyLabel="Selecione"
                        options={newForecastKind === "KIT" ? kitOptions : forecastProductOptions}
                        onChange={setNewForecastTarget}
                      />
                    </div>
                    <div className="field">
                      <label>Qtd/semana</label>
                      <input type="number" step="0.0001" min="0" value={newForecastQty} onChange={(e) => setNewForecastQty(e.target.value)} />
                    </div>
                    <button type="button" onClick={addManualForecast}>Adicionar previsão</button>
                  </div>
                </>
              }
              list={
                <DataTable
                  columns={forecastColumns}
                  rows={forecasts}
                  rowKey={(f) => forecastKey(f.kind, f.target_id)}
                  emptyMessage="Nenhum produto ou kit com histórico de vendas ou previsão manual ainda."
                  footer={(rows) => {
                    const totals = forecastTotalsByUom(rows);
                    const parts = Object.entries(totals).map(([uom, qty]) => `${fmtQty(qty)} ${uom}`);
                    const revenue = rows.reduce((sum, f) => sum + forecastWeeklyRevenue(f), 0);
                    return (
                      <>
                        <strong>Total efetivo/semana: {parts.length ? parts.join(" + ") : "—"}</strong>
                        <span style={{ marginLeft: 16 }}>
                          <strong>Receita prevista/semana: {brl(revenue)}</strong>
                        </span>
                      </>
                    );
                  }}
                />
              }
            />
          )}

          {page === "estoque" && (
            <CadastroLayout
              formTitle="Parâmetros"
              listTitle="Necessidade de compra"
              formOpen={formOpen}
              listOpen={listOpen}
              onFormOpen={setFormOpen}
              onListOpen={setListOpen}
              form={
                <>
                  <p className="muted">
                    Previsão semanal × cobertura, acrescida da margem de segurança, descontando o estoque disponível e os
                    pedidos de compra já aprovados.
                  </p>
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
                  <div className="row" style={{ marginTop: 12 }}>
                    <button type="button" className="secondary" onClick={() => loadPlan()}>Atualizar</button>
                    <button type="button" onClick={generateBudgetFromPlan}>Gerar orçamento</button>
                  </div>
                </>
              }
              list={<DataTable columns={planColumns} rows={plan} rowKey={(l) => l.product_id} emptyMessage="Nenhum produto no plano." />}
            />
          )}

          {page === "orcamentos" && (
            <>
              <CadastroLayout
                formTitle="Gerar orçamento"
                listTitle="Orçamentos"
                formOpen={formOpen}
                listOpen={listOpen}
                onFormOpen={setFormOpen}
                onListOpen={setListOpen}
                form={
                  <>
                    <p className="muted">Usa os mesmos parâmetros do Plano de estoque para montar um novo orçamento em rascunho.</p>
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
                      <button type="button" onClick={generateBudgetFromPlan}>Gerar orçamento</button>
                    </div>
                  </>
                }
                list={<DataTable columns={budgetColumns} rows={budgets} rowKey={(b) => b.id} emptyMessage="Nenhum orçamento gerado ainda." />}
              />
              {selectedBudget && (
                <div className="card" style={{ marginTop: 16 }}>
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                    <h2>Orçamento {selectedBudget.code}</h2>
                    <span className="badge">{budgetStatusLabel(selectedBudget.status)}</span>
                  </div>
                  <p className="muted">
                    Gerado com {selectedBudget.coverage_weeks} sem. de cobertura · {selectedBudget.safety_percent}% de
                    margem · {selectedBudget.lookback_weeks} sem. de histórico. Os valores de "Necessário" abaixo são um
                    retrato de quando o orçamento foi gerado — se o Plano de estoque mudou desde então (novo histórico,
                    estoque, ou parâmetros diferentes), os números podem divergir. Ajuste "Necessário" por item se quiser
                    alinhar com o plano atual.
                  </p>
                  <p className="muted">
                    Itens com preço de fornecedor cadastrado já vêm alocados ao fornecedor mais barato por unidade de
                    estoque. Você pode remover ou ajustar antes de confirmar.
                  </p>
                  {(selectedBudget.items || []).length === 0 && <p className="muted">Nenhum produto precisa de reposição neste orçamento.</p>}
                  {(selectedBudget.items || []).map((item: any) => {
                    const allocated = (item.allocations || []).reduce((n: number, a: any) => n + Number(a.quantity), 0);
                    const remaining = Math.max(0, Number(item.needed_qty) - allocated);
                    const editable = selectedBudget.status === "DRAFT" || selectedBudget.status === "ALLOCATED";
                    const itemDirty = itemDrafts[item.id] != null && itemDrafts[item.id] !== String(item.needed_qty);
                    const bestPrice = bestSupplierPriceFor(item.product_id);
                    const itemUom = stockUom(products.find((p) => p.id === item.product_id));
                    return (
                      <div key={item.id} className="card" style={{ marginTop: 12 }}>
                        <div className="row" style={{ justifyContent: "space-between" }}>
                          <strong>{productLabel(item.product_id)}</strong>
                          <span className="muted">
                            Necessário: {fmtQty(item.needed_qty)} {itemUom} · Alocado: {fmtQty(allocated)} {itemUom} · Restante: {fmtQty(remaining)} {itemUom}
                          </span>
                        </div>
                        {!bestPrice && (
                          <p className="error" style={{ marginTop: 4 }}>Nenhum preço de fornecedor cadastrado para este produto.</p>
                        )}
                        {editable && (
                          <div className="row" style={{ marginTop: 8, alignItems: "flex-end" }}>
                            <div className="field">
                              <label>Necessário ({itemUom})</label>
                              <input
                                type="number"
                                step="0.0001"
                                min="0"
                                value={itemDrafts[item.id] ?? item.needed_qty}
                                onChange={(e) => setItemDrafts((d) => ({ ...d, [item.id]: e.target.value }))}
                              />
                            </div>
                            <button type="button" className="secondary" onClick={() => saveItemNeeded(selectedBudget.id, item.id)}>
                              Salvar necessário
                            </button>
                            {itemDirty && (
                              <button type="button" className="secondary" onClick={() => cancelItemEdit(item.id)}>
                                Cancelar
                              </button>
                            )}
                            <button type="button" className="secondary" onClick={() => deleteItem(selectedBudget.id, item.id, allocated)}>
                              Excluir item
                            </button>
                          </div>
                        )}
                        {(item.allocations || []).length > 0 && (
                          <div className="table-wrap" style={{ marginTop: 8 }}>
                            <table>
                              <thead><tr><th>Fornecedor</th><th>Qtd ({itemUom})</th><th>Preço unit. (/{itemUom})</th><th>Compra real</th><th>Cotação</th><th></th></tr></thead>
                              <tbody>
                                {item.allocations.map((a: any) => {
                                  const line = purchaseLineFor(item.product_id, Number(a.quantity), a.supplier_id, Number(a.unit_price));
                                  return (
                                    <tr key={a.id}>
                                      <td>{supplierLabel(a.supplier_id)}</td>
                                      <td>{fmtQty(a.quantity)} {itemUom}</td>
                                      <td>{brl(a.unit_price)}/{itemUom}</td>
                                      <td className="muted">
                                        {line ? (
                                          <>
                                            {fmtQty(line.purchaseQty)} {line.uom} · {brl(line.purchaseQty * line.unitPrice)}
                                            {line.uom !== itemUom && <> ({brl(line.unitPrice)}/{line.uom})</>}
                                          </>
                                        ) : (
                                          "sem conversão"
                                        )}
                                      </td>
                                      <td className="muted">{a.quote_id ? "Gerada" : "—"}</td>
                                      <td>
                                        {editable && !a.quote_id && (
                                          <button type="button" className="secondary" onClick={() => removeAllocation(a.id)}>Remover</button>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                        {editable && remaining > 0 && (
                          <div className="row" style={{ marginTop: 8 }}>
                            <div className="field">
                              <label>Fornecedor</label>
                              <Autocomplete
                                value={allocDrafts[item.id]?.supplierId ?? ""}
                                allowEmpty
                                emptyLabel="Selecione"
                                options={supplierOptions}
                                onChange={(v) => {
                                  const known = supplierPriceFor(item.product_id, v);
                                  setAllocDrafts((d) => {
                                    const cur = d[item.id] || {};
                                    return {
                                      ...d,
                                      [item.id]: { ...cur, supplierId: v, price: cur.price || (known != null ? String(known) : cur.price) },
                                    };
                                  });
                                }}
                              />
                            </div>
                            <div className="field">
                              <label>Qtd ({itemUom})</label>
                              <input
                                type="number"
                                step="0.0001"
                                min="0"
                                max={remaining}
                                value={allocDrafts[item.id]?.qty ?? ""}
                                onChange={(e) => setAllocDrafts((d) => ({ ...d, [item.id]: { ...(d[item.id] || {}), qty: e.target.value } }))}
                              />
                            </div>
                            <div className="field">
                              <label>Preço unit. (/{itemUom})</label>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={allocDrafts[item.id]?.price ?? ""}
                                onChange={(e) => setAllocDrafts((d) => ({ ...d, [item.id]: { ...(d[item.id] || {}), price: e.target.value } }))}
                                placeholder="Preço de compra do produto"
                              />
                              {allocDrafts[item.id]?.supplierId && supplierPriceFor(item.product_id, allocDrafts[item.id]!.supplierId!) != null && (
                                <p className="muted">Preço cadastrado: {brl(supplierPriceFor(item.product_id, allocDrafts[item.id]!.supplierId!)!)}</p>
                              )}
                              {(() => {
                                const draft = allocDrafts[item.id];
                                const qty = Number(draft?.qty);
                                if (!draft?.supplierId || !(qty > 0)) return null;
                                const line = purchaseLineFor(item.product_id, qty, draft.supplierId, Number(draft.price || 0));
                                return (
                                  <p className="muted">
                                    {line
                                      ? `Compra real: ${fmtQty(line.purchaseQty)} ${line.uom} · ${brl(line.purchaseQty * line.unitPrice)}`
                                      : "Sem conversão de unidade para calcular a compra real."}
                                  </p>
                                );
                              })()}
                            </div>
                            <button type="button" className="secondary" onClick={() => addAllocation(item)}>Adicionar alocação</button>
                            <button
                              type="button"
                              className="secondary"
                              disabled={!bestPrice}
                              onClick={() => fillBestPrice(item, remaining)}
                              title={bestPrice ? `${supplierLabel(bestPrice.sp.supplier_id)} · ${brl(bestPrice.unitCost)}/${stockUom(products.find((p) => p.id === item.product_id))}` : undefined}
                            >
                              Preencher melhor preço
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {(selectedBudget.status === "DRAFT" || selectedBudget.status === "ALLOCATED") && (
                    <div className="row" style={{ marginTop: 12 }}>
                      <button type="button" onClick={confirmBudget}>Confirmar orçamento</button>
                      <button type="button" className="secondary" onClick={cancelBudget}>Cancelar orçamento</button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {page === "precos" && (
            <CadastroLayout
              formOpen={formOpen}
              listOpen={listOpen}
              onFormOpen={setFormOpen}
              onListOpen={setListOpen}
              form={
                <>
                  <p className="muted">
                    Relaciona quanto cada fornecedor cobra por produto. O preço é para a quantidade mínima informada, na
                    unidade de compra do produto — suprindo fornecedores que vendem em embalagens diferentes (ex.: R$12 por
                    1,5 CX). Ao gerar um orçamento, o item é alocado automaticamente ao fornecedor com o menor preço por
                    unidade de estoque, feito o cálculo de proporção entre as unidades.
                  </p>
                  <div className="row">
                    <div className="field">
                      <label>Produto</label>
                      <Autocomplete value={newPriceProduct} allowEmpty emptyLabel="Selecione" options={productOptions} onChange={setNewPriceProduct} />
                    </div>
                    <div className="field">
                      <label>Fornecedor</label>
                      <Autocomplete value={newPriceSupplier} allowEmpty emptyLabel="Selecione" options={supplierOptions} onChange={setNewPriceSupplier} />
                    </div>
                    <div className="field">
                      <label>
                        Qtd mínima{(() => {
                          const um = products.find((p) => p.id === newPriceProduct)?.purchase_uom;
                          return um ? ` (${um})` : "";
                        })()}
                      </label>
                      <input type="number" step="0.0001" min="0.0001" value={newPriceMinQty} onChange={(e) => setNewPriceMinQty(e.target.value)} />
                    </div>
                    <div className="field">
                      <label>Preço</label>
                      <input type="number" step="0.01" min="0" value={newPriceValue} onChange={(e) => setNewPriceValue(e.target.value)} />
                    </div>
                    <button type="button" onClick={addSupplierPrice}>Adicionar preço</button>
                  </div>
                </>
              }
              list={
                <DataTable
                  columns={priceColumns}
                  rows={priceRows}
                  rowKey={(sp) => sp.id}
                  defaultSortKey="product"
                  emptyMessage="Nenhum preço de fornecedor cadastrado ainda."
                />
              }
            />
          )}

          {page === "financeiro" && (
            <CadastroLayout
              formTitle="Parâmetros"
              listTitle="Projeção por item"
              formOpen={formOpen}
              listOpen={listOpen}
              onFormOpen={setFormOpen}
              onListOpen={setListOpen}
              form={
                <>
                  <p className="muted">
                    Projeção de receita e despesa a partir da previsão de vendas efetiva de cada produto e kit. A receita
                    de um kit usa o preço de venda do seu produto final; a despesa usa o custo total da montagem (todos os
                    itens, incluindo apoio como embalagem) — cadastre-os em Estoque → Montagem. Itens sem preço de venda
                    e sem custo registrados não entram na projeção.
                  </p>
                  <div className="row">
                    <div className="field">
                      <label>Semanas de histórico</label>
                      <input type="number" min="1" value={lookbackWeeks} onChange={(e) => setLookbackWeeks(Number(e.target.value) || 1)} />
                    </div>
                    <div className="field">
                      <label>Semanas de projeção</label>
                      <input type="number" min="1" value={coverageWeeks} onChange={(e) => setCoverageWeeks(Number(e.target.value) || 1)} />
                    </div>
                    <button type="button" className="secondary" onClick={() => loadFinancials()}>Atualizar</button>
                  </div>
                </>
              }
              list={
                <>
                  <div className="row" style={{ marginTop: 0 }}>
                    <div className="card">
                      <p className="muted">Receita/semana</p>
                      <h2>{brl(financeSummary.revenue)}</h2>
                      <p className="muted">{brl(financeSummary.revenue * coverageWeeks)} em {coverageWeeks} sem.</p>
                    </div>
                    <div className="card">
                      <p className="muted">Despesa/semana</p>
                      <h2>{brl(financeSummary.cost)}</h2>
                      <p className="muted">{brl(financeSummary.cost * coverageWeeks)} em {coverageWeeks} sem.</p>
                    </div>
                    <div className="card">
                      <p className="muted">Lucro/semana</p>
                      <h2 className={financeProfit < 0 ? "error" : ""}>{brl(financeProfit)}</h2>
                      <p className="muted">{brl(financeProfit * coverageWeeks)} em {coverageWeeks} sem.</p>
                    </div>
                    <div className="card">
                      <p className="muted">Margem</p>
                      <h2 className={financeMargin < 0 ? "error" : ""}>{financeMargin.toFixed(1)}%</h2>
                    </div>
                  </div>
                  <div className="row" style={{ alignItems: "center" }}>
                    <button type="button" className="secondary" disabled={costLoading} onClick={applyCostFromQuotes}>
                      Simular custo com orçamentos
                    </button>
                    <button type="button" className="secondary" disabled={costLoading} onClick={applyCostFromOrders}>
                      Simular custo com pedidos de compra
                    </button>
                    {costSourceLabel && (
                      <>
                        <span className="muted">Custo (coluna "Custo" abaixo) simulado com: {costSourceLabel} — não altera nenhum cadastro.</span>
                        <button type="button" className="secondary" onClick={clearCostOverrides}>Restaurar custo original</button>
                      </>
                    )}
                  </div>
                  {batchSummary && (
                    <>
                      <p className="muted" style={{ marginTop: 4 }}>
                        Payback do lote: comprar exatamente as quantidades dos {costSourceLabel.toLowerCase()} selecionados vs. vender essas
                        mesmas quantidades ao preço de venda atual — diferente da Despesa/semana acima, que é uma taxa recorrente
                        projetada pela previsão de vendas, não o valor deste lote.
                      </p>
                      <div className="row" style={{ marginTop: 4 }}>
                        <div className="card">
                          <p className="muted">Custo do lote</p>
                          <h2>{brl(batchSummary.cost)}</h2>
                        </div>
                        <div className="card">
                          <p className="muted">Receita estimada do lote</p>
                          <h2>{brl(batchSummary.revenue)}</h2>
                        </div>
                        <div className="card">
                          <p className="muted">Lucro do lote</p>
                          <h2 className={batchSummary.profit < 0 ? "error" : ""}>{brl(batchSummary.profit)}</h2>
                        </div>
                        <div className="card">
                          <p className="muted">Margem do lote</p>
                          <h2 className={batchSummary.margin < 0 ? "error" : ""}>{batchSummary.margin.toFixed(1)}%</h2>
                        </div>
                        <div className="card">
                          <p className="muted">Semanas de venda cobertas</p>
                          <h2>{batchSummary.weeksCovered != null ? batchSummary.weeksCovered.toFixed(1) : "—"}</h2>
                        </div>
                      </div>
                      {batchSummary.skippedSkus.length > 0 && (
                        <p className="muted">
                          Fora da receita/semanas por não ter preço de venda próprio (só compõem custo, ex. insumo/embalagem de kit):
                          {" "}{batchSummary.skippedSkus.join(", ")}.
                        </p>
                      )}
                    </>
                  )}
                  <DataTable
                    columns={financialColumns}
                    rows={displayFinancials}
                    rowKey={(f) => forecastKey(f.kind, f.target_id)}
                    defaultSortKey="weekly_profit"
                    defaultSortDir="desc"
                    emptyMessage="Nenhum item com preço de venda e custo suficientes para projetar."
                  />
                </>
              }
            />
          )}

          {page === "agendamentos" && (
            <CadastroLayout
              formOpen={formOpen}
              listOpen={listOpen}
              onFormOpen={setFormOpen}
              onListOpen={setListOpen}
              form={
                <form key={editingSchedule?.id ?? "new"} onSubmit={saveSchedule}>
                  <div className="row">
                    <div className="field"><label>Nome</label><input name="name" required defaultValue={editingSchedule?.name ?? ""} /></div>
                    <div className="field">
                      <label>Frequência</label>
                      <Autocomplete
                        name="frequency"
                        value={schedFrequency}
                        options={[
                          { value: "WEEKLY", code: "WEEKLY", description: "Semanal" },
                          { value: "MONTHLY", code: "MONTHLY", description: "Mensal" },
                        ]}
                        onChange={setSchedFrequency}
                      />
                    </div>
                    {schedFrequency === "WEEKLY" ? (
                      <div className="field">
                        <label>Dia da semana</label>
                        <Autocomplete
                          name="day_of_week"
                          defaultValue={String(editingSchedule?.day_of_week ?? 1)}
                          options={WEEKDAYS.map((d, i) => ({ value: String(i), code: String(i), description: d }))}
                        />
                      </div>
                    ) : (
                      <div className="field">
                        <label>Dia do mês</label>
                        <input name="day_of_month" type="number" min="1" max="31" defaultValue={editingSchedule?.day_of_month ?? 1} />
                      </div>
                    )}
                  </div>
                  <div className="row" style={{ marginTop: 12 }}>
                    <div className="field">
                      <label>Cobertura (semanas)</label>
                      <input name="coverage_weeks" type="number" min="1" defaultValue={editingSchedule?.coverage_weeks ?? 4} />
                    </div>
                    <div className="field">
                      <label>Margem de segurança (%)</label>
                      <input name="safety_percent" type="number" min="0" step="0.01" defaultValue={editingSchedule?.safety_percent ?? 10} />
                    </div>
                    <div className="field">
                      <label>Semanas de histórico</label>
                      <input name="lookback_weeks" type="number" min="1" defaultValue={editingSchedule?.lookback_weeks ?? 8} />
                    </div>
                    <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <input name="active" type="checkbox" defaultChecked={editingSchedule?.active ?? true} /> Ativo
                    </label>
                  </div>
                  <div className="row" style={{ marginTop: 12 }}>
                    <button>{editingSchedule ? "Salvar agendamento" : "Adicionar agendamento"}</button>
                    {editingSchedule && (
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => { setEditingSchedule(null); setSchedFrequency("WEEKLY"); setFormOpen(false); }}
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                </form>
              }
              list={<DataTable columns={scheduleColumns} rows={schedules} rowKey={(s) => s.id} emptyMessage="Nenhum agendamento cadastrado ainda." />}
            />
          )}
        </>
      )}
    </div>
  );
}
