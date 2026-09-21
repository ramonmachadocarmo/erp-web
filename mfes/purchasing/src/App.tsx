import { FormEvent, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { Autocomplete, CadastroLayout, CompanyHeaderInfo, DataTable, DataTableColumn, LineItems, LineItem, Loading, Modal, PersonCreateModal, ProductCreateModal, PURCHASE_DOC_COLUMNS, PurchaseDocColumnKey, Quote, biApi, companyHeaderInfo, configApi, invoicingApi, openPurchaseDocPdf, purchasingApi, stockApi } from "@erp/shared";

function brl(n: number) {
  return Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function personOption(p: any) {
  return { value: p.id, code: p.document, description: p.kind === "PJ" ? p.company_name || p.name : p.name };
}

function personName(list: any[], id: string) {
  const p = list.find((x) => x.id === id);
  if (!p) return id;
  return p.kind === "PJ" ? p.company_name || p.name : p.name;
}

function itemSummary(items: any[], products: any[]) {
  return (items || [])
    .map((it) => {
      const p = products.find((x) => x.id === it.product_id);
      const uom = p?.purchase_uom ? ` ${p.purchase_uom}` : "";
      return `${p?.sku || it.product_id} × ${it.quantity}${uom}`;
    })
    .join(", ");
}

// Status de entrega do pedido, como aparecem na tela. Os valores técnicos (APPROVED, RECEIVED,
// CONFERRED, CANCELLED) são mantidos porque outros serviços (BI) filtram por eles.
const DELIVERY_LABEL: Record<string, string> = {
  APPROVED: "Pendente entrega",
  RECEIVED: "Recebido",
  CONFERRED: "Finalizado",
  CANCELLED: "Cancelado",
};
const PAYMENT_LABEL: Record<string, string> = { PENDING: "Pendente pagamento", PAID: "Pago" };

function itemVolumes(items: any[]) {
  return (items || []).reduce((sum, it) => sum + Number(it.quantity || 0), 0);
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

// Peso do item = quantidade (na unidade de compra) convertida para a unidade de venda × peso
// (kg/un. venda) cadastrado no produto — mesmo conversor usado em Estoque → Produto.
function itemWeightKg(items: any[], products: any[]) {
  return (items || []).reduce((sum, it) => {
    const p = products.find((x) => x.id === it.product_id);
    if (!p || !(Number(p.weight_kg || 0) > 0)) return sum;
    const saleQty = convertQty(Number(it.quantity || 0), p.purchase_uom, p.sale_uom, p.uom_conversions);
    if (saleQty == null) return sum;
    return sum + saleQty * Number(p.weight_kg || 0);
  }, 0);
}

export default function App() {
  const page = useLocation().pathname.split("/").filter(Boolean).pop() || "orcamentos";
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [quoteItems, setQuoteItems] = useState<LineItem[]>([]);
  const [quoteDiscount, setQuoteDiscount] = useState("0");
  const [quoteDelivery, setQuoteDelivery] = useState("0");
  const [orderItems, setOrderItems] = useState<LineItem[]>([]);
  const [quoteRequired, setQuoteRequired] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [compare, setCompare] = useState<any>(null);
  const [applyingPrices, setApplyingPrices] = useState(false);
  const [priceUpdateMsg, setPriceUpdateMsg] = useState("");
  const [methods, setMethods] = useState<any[]>([]);
  const [terms, setTerms] = useState<any[]>([]);
  const [payMethod, setPayMethod] = useState("");
  const [payTerm, setPayTerm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(true);
  const [listOpen, setListOpen] = useState(true);
  const [productModal, setProductModal] = useState(false);
  const [personModal, setPersonModal] = useState(false);
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);
  const [editingOrder, setEditingOrder] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState<any>(null);
  const [convertError, setConvertError] = useState("");
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [defaultWarehouse, setDefaultWarehouse] = useState("");
  const [receiving, setReceiving] = useState<any>(null);
  const [receiveWh, setReceiveWh] = useState("");
  const [receiveError, setReceiveError] = useState("");
  const [invoices, setInvoices] = useState<any[]>([]);
  const [conferring, setConferring] = useState<any>(null);
  const [conferCounts, setConferCounts] = useState<Record<string, number>>({});
  const [conferScan, setConferScan] = useState("");
  const [conferFilter, setConferFilter] = useState<"pending" | "all">("pending");
  const [company, setCompany] = useState<CompanyHeaderInfo | undefined>(undefined);
  const [storagePlan, setStoragePlan] = useState<any[]>([]);
  const [printingQuote, setPrintingQuote] = useState<Quote | null>(null);
  const [hiddenPrintCols, setHiddenPrintCols] = useState<Set<PurchaseDocColumnKey>>(new Set());

  async function load() {
    try {
      const [s, o, q, p, h, setting, m, t, w, defWh, inv, co, sp] = await Promise.all([
        configApi.suppliers(),
        purchasingApi.orders(),
        purchasingApi.quotes(),
        stockApi.products(),
        stockApi.purchasePrices(),
        configApi.setting("purchase_quote_required").catch(() => ({ value: "false" })),
        configApi.paymentMethods(),
        configApi.paymentTerms(),
        stockApi.warehouses().catch(() => []),
        configApi.setting("default_warehouse_id").catch(() => ({ value: "" })),
        invoicingApi.invoices("IN").catch(() => []),
        configApi.company().catch(() => null),
        biApi.storagePlan({ coverage_weeks: 1 }).catch(() => []),
      ]);
      setSuppliers(s);
      setOrders(o);
      setQuotes(q);
      setProducts(p);
      setHistory(h);
      setQuoteRequired(setting.value === "true");
      setMethods(m);
      setTerms(t);
      setWarehouses(w);
      setDefaultWarehouse(defWh.value || "");
      setInvoices(inv);
      setCompany(companyHeaderInfo(co));
      setStoragePlan(sp);
    } finally {
      setLoading(false);
    }
  }

  // Estoque atual e quantidade necessária para 1 semana de vendas (previsão líquida de estoque
  // e pedidos já em aberto — mesmo cálculo do Plano de estoque em Inteligência de Negócio, mas
  // com coverage_weeks=1 aqui: o orçamento é sobre o que falta AGORA, não um plano de N semanas), convertidos
  // para a unidade de compra para aparecerem junto do campo de quantidade do orçamento.
  const stockInfoByProduct = useMemo(() => {
    const out: Record<string, { stock: number; needed: number }> = {};
    for (const line of storagePlan) {
      const p = products.find((x) => x.id === line.product_id);
      if (!p) continue;
      const from = stockUom(p);
      const toPurchase = (qty: number) => {
        if (!from || !p.purchase_uom || from === p.purchase_uom) return qty;
        const converted = convertQty(qty, from, p.purchase_uom, p.uom_conversions);
        return converted == null ? qty : converted;
      };
      out[line.product_id] = { stock: toPurchase(Number(line.on_hand_qty || 0)), needed: toPurchase(Number(line.needed_qty || 0)) };
    }
    return out;
  }, [storagePlan, products]);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    configApi
      .setting("purchase_quote_required")
      .then((s) => setQuoteRequired(s.value === "true"))
      .catch(() => {});
  }, [page]);

  function clearQuoteForm() {
    setEditingQuote(null);
    setQuoteItems([]);
    setQuoteDiscount("0");
    setQuoteDelivery("0");
  }

  async function saveQuote(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    const form = e.currentTarget;
    const f = new FormData(form);
    const body: Quote = {
      supplier_id: String(f.get("supplier_id") || ""),
      notes: String(f.get("notes") || ""),
      discount_amount: Number(quoteDiscount || 0),
      delivery_amount: Number(quoteDelivery || 0),
      items: quoteItems,
    };
    setSaving(true);
    try {
      if (editingQuote) await purchasingApi.updateQuote(editingQuote.id!, body);
      else await purchasingApi.createQuote(body);
      form.reset();
      clearQuoteForm();
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function startEditQuote(q: Quote) {
    setEditingQuote(q);
    setQuoteItems((q.items || []).map((it) => ({ product_id: it.product_id, quantity: it.quantity, unit_price: it.unit_price })));
    setQuoteDiscount(String(q.discount_amount ?? 0));
    setQuoteDelivery(String(q.delivery_amount ?? 0));
    setFormOpen(true);
  }

  async function removeQuote(id: string) {
    try {
      await purchasingApi.deleteQuote(id);
      if (editingQuote?.id === id) clearQuoteForm();
      setSelected((cur) => cur.filter((x) => x !== id));
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  function clearOrderForm() {
    setEditingOrder(null);
    setOrderItems([]);
  }

  async function saveOrder(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    const form = e.currentTarget;
    const f = new FormData(form);
    const body = {
      supplier_id: f.get("supplier_id"),
      payment_method_id: f.get("payment_method_id"),
      payment_term_id: f.get("payment_term_id"),
      items: orderItems,
    };
    setSaving(true);
    try {
      if (editingOrder) await purchasingApi.updateOrder(editingOrder.id, body);
      else await purchasingApi.createOrder(body);
      form.reset();
      clearOrderForm();
      setError("");
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function startEditOrder(o: any) {
    setEditingOrder(o);
    setOrderItems((o.items || []).map((it: any) => ({ product_id: it.product_id, quantity: it.quantity, unit_price: it.unit_price })));
    setFormOpen(true);
  }

  async function removeOrder(o: any) {
    if (!window.confirm(`Excluir o pedido de ${personName(suppliers, o.supplier_id)}? A programação de caixa será removida.`)) return;
    try {
      await purchasingApi.deleteOrder(o.id);
      if (editingOrder?.id === o.id) clearOrderForm();
      setError("");
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

    async function changeOrderStatus(o: any, apply: () => Promise<unknown>) {
    setError("");
    try {
      await apply();
      await load();
    } catch (err: any) {
      setError(err.message);
      await load();
    }
  }

  async function cancelOrder(o: any) {
    if (!window.confirm(`Cancelar o pedido de ${personName(suppliers, o.supplier_id)}? A programação de caixa será removida.`)) return;
    if (editingOrder?.id === o.id) clearOrderForm();
    await changeOrderStatus(o, () => purchasingApi.cancelOrder(o.id));
  }

  async function confirmConvert() {
    if (!payMethod || !payTerm) {
      setConvertError("Selecione forma e condição de pagamento.");
      return;
    }
    try {
      await purchasingApi.convertQuote(converting.id, { payment_method_id: payMethod, payment_term_id: payTerm });
      setConverting(null);
      setConvertError("");
      await load();
    } catch (err: any) {
      setConvertError(err.message);
    }
  }

  async function confirmReceive() {
    const warehouseId = receiveWh || defaultWarehouse;
    if (!warehouseId) {
      setReceiveError("Selecione o almoxarifado para receber.");
      return;
    }
    try {
      await purchasingApi.receive(receiving.id, { warehouse_id: warehouseId });
      setReceiving(null);
      setReceiveError("");
      await load();
    } catch (err: any) {
      setReceiveError(err.message);
    }
  }

  function invoiceOf(orderId: string) {
    return invoices.find((i) => i.purchase_order_id === orderId);
  }

  function inboundOrders() {
    return orders.filter((o) => invoiceOf(o.id) && o.status === "APPROVED");
  }

  function conferOrders() {
    return orders.filter((o) => o.status === "RECEIVED");
  }

  function parseScanInput(raw: string) {
    const t = raw.trim();
    const m = t.match(/^(.+?)\s*[,;]\s*(\d+(?:[.,]\d+)?)\s*$/);
    if (!m) return { code: t, qty: 1 };
    const qty = Number(m[2].replace(",", "."));
    if (!Number.isFinite(qty) || qty <= 0) return { code: t, qty: 1 };
    return { code: m[1].trim(), qty };
  }

  function resolveCode(code: string) {
    const q = code.trim().toLowerCase();
    if (!q) return null;
    return products.find((p) => String(p.barcode).toLowerCase() === q || String(p.sku).toLowerCase() === q) || null;
  }

  function applyConferScan(raw: string) {
    if (!conferring) return;
    const { code, qty } = parseScanInput(raw);
    const product = resolveCode(code);
    if (!product) {
      setError("Código não encontrado");
      return;
    }
    const expected = (conferring.items || []).find((it: any) => it.product_id === product.id);
    if (!expected) {
      setError("Produto não está no pedido");
      return;
    }
    setConferCounts((cur) => ({ ...cur, [product.id]: (cur[product.id] || 0) + qty }));
    setConferScan("");
    setError("");
  }

  async function confirmConfer() {
    if (!conferring) return;
    for (const it of conferring.items || []) {
      if ((conferCounts[it.product_id] || 0) + 1e-9 < Number(it.quantity)) {
        setError("Conferência incompleta");
        return;
      }
    }
    try {
      await purchasingApi.confer(conferring.id);
      setConferring(null);
      setConferCounts({});
      setError("");
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  function itemConferred(it: any) {
    return (conferCounts[it.product_id] || 0) + 1e-9 >= Number(it.quantity);
  }

  function toggle(id: string) {
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  async function runCompare() {
    setPriceUpdateMsg("");
    setCompare(await purchasingApi.compareQuotes(selected));
  }

  // Aplica no cadastro do produto o menor preço ofertado entre os orçamentos selecionados,
  // registrando o histórico com o orçamento vencedor como documento de referência — mesma
  // rotina (RegisterPurchasePrice) usada ao receber um pedido de compra.
  async function applyBestPrices() {
    if (!selected.length) return;
    setApplyingPrices(true);
    setPriceUpdateMsg("");
    try {
      const result = await purchasingApi.compareQuotes(selected);
      setCompare(result);
      const productsToApply = result.products || [];
      for (const p of productsToApply) {
        await stockApi.createPurchasePrice({
          product_id: p.product_id,
          new_price: p.best_unit_price,
          reference_doc_id: p.best_quote_id,
        });
      }
      setPriceUpdateMsg(`Preço de custo atualizado para ${productsToApply.length} produto(s).`);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setApplyingPrices(false);
    }
  }

  function printQuote(q: Quote, hiddenCols: Set<PurchaseDocColumnKey>) {
    const columns = PURCHASE_DOC_COLUMNS.map((c) => c.key).filter((k) => !hiddenCols.has(k));
    openPurchaseDocPdf(
      {
        title: "Orçamento de compra",
        headerLines: [
          `Fornecedor: ${personName(suppliers, q.supplier_id)}`,
          `Status: ${q.status}`,
          ...(q.notes ? [`Observação: ${q.notes}`] : []),
          ...(q.discount_amount ? [`Desconto: -${brl(q.discount_amount)}`] : []),
          ...(q.delivery_amount ? [`Frete: +${brl(q.delivery_amount)}`] : []),
          `Data: ${q.created_at ? new Date(q.created_at).toLocaleString("pt-BR") : ""}`,
        ],
        items: (q.items || []).map((it) => {
          const p = products.find((x) => x.id === it.product_id);
          return {
            code: p?.sku || it.product_id,
            description: p?.name || "",
            qty: `${it.quantity}${p?.purchase_uom ? ` ${p.purchase_uom}` : ""}`,
            unitPrice: brl(it.unit_price),
            total: brl(Number(it.quantity) * Number(it.unit_price)),
          };
        }),
        totalLabel: `Total: ${brl(q.total_amount ?? 0)}`,
        company,
        columns,
      },
      `orcamento-${(q.id || "").slice(0, 8)}.pdf`,
    );
  }

  function toggleHiddenPrintCol(key: PurchaseDocColumnKey) {
    setHiddenPrintCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const quoteSubtotal = quoteItems.reduce((sum, it: any) => sum + Number(it.quantity || 0) * Number(it.unit_price || 0), 0);
  const quoteTotal = quoteSubtotal - Number(quoteDiscount || 0) + Number(quoteDelivery || 0);

  const quoteColumns: DataTableColumn<any>[] = [
    {
      key: "select",
      label: "",
      sortable: false,
      filterable: false,
      render: (q) => <input type="checkbox" checked={selected.includes(q.id)} onChange={() => toggle(q.id)} />,
    },
    { key: "supplier", label: "Fornecedor", value: (q) => personName(suppliers, q.supplier_id) },
    { key: "status", label: "Status", value: (q) => q.status, render: (q) => <span className={`badge ${q.status === "CONVERTED" ? "ok" : ""}`}>{q.status}</span> },
    { key: "items", label: "Itens", value: (q) => itemSummary(q.items, products), render: (q) => <span className="muted">{itemSummary(q.items, products)}</span> },
    { key: "volumes", label: "Volumes", value: (q) => itemVolumes(q.items), render: (q) => itemVolumes(q.items).toLocaleString("pt-BR") },
    {
      key: "weight",
      label: "Peso",
      value: (q) => itemWeightKg(q.items, products),
      render: (q) => `${itemWeightKg(q.items, products).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} kg`,
    },
    { key: "total_amount", label: "Total", value: (q) => Number(q.total_amount || 0), render: (q) => brl(q.total_amount) },
    {
      key: "actions",
      label: "",
      sortable: false,
      filterable: false,
      render: (q) => (
        <div className="row" style={{ flexWrap: "nowrap" }}>
          {q.status === "OPEN" && (
            <>
              <button type="button" className="secondary" onClick={() => startEditQuote(q)}>Editar</button>
              <button type="button" className="secondary" onClick={() => removeQuote(q.id)}>Excluir</button>
              <button type="button" className="secondary" onClick={() => { setConvertError(""); setConverting(q); }}>Gerar pedido</button>
            </>
          )}
          <button type="button" className="secondary" onClick={() => { setHiddenPrintCols(new Set()); setPrintingQuote(q); }}>Imprimir</button>
        </div>
      ),
    },
  ];

  const compareColumns: DataTableColumn<any>[] = [
    {
      key: "product",
      label: "Produto",
      value: (p) => {
        const prod = products.find((x) => x.id === p.product_id);
        return prod ? `${prod.sku} — ${prod.name}` : p.product_id;
      },
    },
    { key: "best_unit_price", label: "Melhor preço", value: (p) => Number(p.best_unit_price || 0), render: (p) => brl(p.best_unit_price) },
    {
      key: "best_supplier",
      label: "Fornecedor",
      value: (p) => personName(suppliers, (p.lines || []).find((l: any) => l.quote_id === p.best_quote_id)?.supplier_id),
    },
    {
      key: "offers",
      label: "Ofertas",
      value: (p) => (p.lines || []).map((l: any) => `${personName(suppliers, l.supplier_id)} ${brl(l.unit_price)} × ${l.quantity}`).join(" | "),
      render: (p) => (
        <span className="muted">
          {(p.lines || []).map((l: any) => `${personName(suppliers, l.supplier_id)} ${brl(l.unit_price)} × ${l.quantity}`).join(" | ")}
        </span>
      ),
    },
  ];

  const orderColumns: DataTableColumn<any>[] = [
    { key: "supplier", label: "Fornecedor", value: (o) => personName(suppliers, o.supplier_id) },
    {
      key: "payment",
      label: "Pagamento",
      value: (o) => `${methods.find((x) => x.id === o.payment_method_id)?.name || o.payment_method_id} · ${terms.find((x) => x.id === o.payment_term_id)?.name || o.payment_term_id}`,
      render: (o) => (
        <span className="muted">
          {methods.find((x) => x.id === o.payment_method_id)?.name || o.payment_method_id} · {terms.find((x) => x.id === o.payment_term_id)?.name || o.payment_term_id}
        </span>
      ),
    },
    {
      key: "status",
      label: "Entrega",
      value: (o) => DELIVERY_LABEL[o.status] || o.status,
      render: (o) => {
        // Manual: pendente entrega <-> finalizado (o fluxo de NF — Entrada e Conferência — também
        // move este status). Reabrir é bloqueado pelo backend depois que o estoque recebeu.
        if (o.status === "CANCELLED") return <span className="badge">{DELIVERY_LABEL.CANCELLED}</span>;
        return (
          <select
            value={o.status}
            style={{ minWidth: 150 }}
            onChange={(e) => changeOrderStatus(o, () => purchasingApi.setOrderDeliveryStatus(o.id, e.target.value as "APPROVED" | "CONFERRED"))}
          >
            <option value="APPROVED">{DELIVERY_LABEL.APPROVED}</option>
            {o.status === "RECEIVED" && <option value="RECEIVED" disabled>{DELIVERY_LABEL.RECEIVED} (conferir)</option>}
            <option value="CONFERRED">{DELIVERY_LABEL.CONFERRED}</option>
          </select>
        );
      },
    },
    {
      key: "payment_status",
      label: "Financeiro",
      value: (o) => (o.status === "CANCELLED" ? "—" : PAYMENT_LABEL[o.payment_status] || o.payment_status),
      render: (o) =>
        o.status === "CANCELLED" ? (
          <span className="muted">—</span>
        ) : (
          <select
            value={o.payment_status || "PENDING"}
            style={{ minWidth: 150 }}
            onChange={(e) => changeOrderStatus(o, () => purchasingApi.setOrderPaymentStatus(o.id, e.target.value as "PENDING" | "PAID"))}
          >
            <option value="PENDING">{PAYMENT_LABEL.PENDING}</option>
            <option value="PAID">{PAYMENT_LABEL.PAID}</option>
          </select>
        ),
    },
    { key: "items", label: "Itens", value: (o) => itemSummary(o.items, products), render: (o) => <span className="muted">{itemSummary(o.items, products)}</span> },
    { key: "total_amount", label: "Total", value: (o) => Number(o.total_amount || 0), render: (o) => brl(o.total_amount) },
    {
      key: "actions",
      label: "",
      sortable: false,
      filterable: false,
      render: (o) => {
        // Editar/excluir: só pendente entrega, não pago e sem nota de entrada. Cancelar: qualquer
        // pedido ainda não recebido.
        const editable = o.status === "APPROVED" && o.payment_status !== "PAID" && !invoiceOf(o.id);
        const cancellable = o.status === "APPROVED";
        if (!editable && !cancellable) return null;
        return (
          <div className="row" style={{ flexWrap: "nowrap" }}>
            {editable && <button type="button" className="secondary" onClick={() => startEditOrder(o)}>Editar</button>}
            {editable && <button type="button" className="secondary" onClick={() => removeOrder(o)}>Excluir</button>}
            {cancellable && <button type="button" className="secondary" onClick={() => cancelOrder(o)}>Cancelar</button>}
          </div>
        );
      },
    },
  ];

  const historyColumns: DataTableColumn<any>[] = [
    { key: "sku", label: "Código" },
    { key: "created_at", label: "Data", value: (h) => new Date(h.created_at), render: (h) => new Date(h.created_at).toLocaleString("pt-BR") },
    { key: "previous_price", label: "Preço anterior", value: (h) => Number(h.previous_price || 0), render: (h) => brl(h.previous_price) },
    { key: "new_price", label: "Novo preço", value: (h) => Number(h.new_price || 0), render: (h) => brl(h.new_price) },
    { key: "reference_doc_id", label: "Documento", render: (h) => <span className="muted">{h.reference_doc_id}</span> },
  ];

  const inboundColumns: DataTableColumn<any>[] = [
    { key: "supplier", label: "Fornecedor", value: (o) => personName(suppliers, o.supplier_id) },
    { key: "invoice", label: "Nota", value: (o) => { const inv = invoiceOf(o.id); return inv ? `${inv.series}-${inv.invoice_number}` : "—"; } },
    { key: "items", label: "Itens", value: (o) => itemSummary(o.items, products), render: (o) => <span className="muted">{itemSummary(o.items, products)}</span> },
    { key: "total_amount", label: "Total", value: (o) => Number(o.total_amount || 0), render: (o) => brl(o.total_amount) },
    {
      key: "actions",
      label: "",
      sortable: false,
      filterable: false,
      render: (o) => (
        <button className="secondary" onClick={() => { setReceiveError(""); setReceiveWh(defaultWarehouse); setReceiving(o); }}>Receber</button>
      ),
    },
  ];

  const conferColumns: DataTableColumn<any>[] = [
    { key: "supplier", label: "Fornecedor", value: (o) => personName(suppliers, o.supplier_id) },
    { key: "invoice", label: "Nota", value: (o) => { const inv = invoiceOf(o.id); return inv ? `${inv.series}-${inv.invoice_number}` : "—"; } },
    { key: "items", label: "Itens", value: (o) => itemSummary(o.items, products), render: (o) => <span className="muted">{itemSummary(o.items, products)}</span> },
    {
      key: "actions",
      label: "",
      sortable: false,
      filterable: false,
      render: (o) => (
        <button type="button" className="secondary" onClick={() => {
          setConferring(o);
          setConferCounts({});
          setConferScan("");
          setConferFilter("pending");
          setError("");
        }}>Conferir</button>
      ),
    },
  ];

  return (
    <div>
      <h1>{page === "pedidos" ? "Pedidos de compra" : page === "historico" ? "Histórico de compra" : page === "entrada" ? "Entrada" : page === "conferencia" ? "Conferência" : "Orçamentos"}</h1>
      {error && <p className="error">{error}</p>}
      {loading ? <Loading /> : (
        <>
      {page === "orcamentos" && (
        <CadastroLayout
          formTitle={editingQuote ? "Editar orçamento" : "Novo orçamento"}
          listTitle="Listagem"
          formOpen={formOpen}
          listOpen={listOpen}
          onFormOpen={setFormOpen}
          onListOpen={setListOpen}
          form={
          <form key={editingQuote?.id ?? "new"} onSubmit={saveQuote}>
            <div className="row">
              <div className="field">
                <label>Fornecedor</label>
                <Autocomplete
                  name="supplier_id"
                  required
                  defaultValue={editingQuote?.supplier_id ?? ""}
                  options={suppliers.map(personOption)}
                  createLabel="Cadastrar fornecedor"
                  onCreate={() => setPersonModal(true)}
                />
              </div>
              <div className="field">
                <label>Observação</label>
                <input name="notes" defaultValue={editingQuote?.notes ?? ""} />
              </div>
            </div>
            <LineItems products={products} priceKey="purchase_price" items={quoteItems} onChange={setQuoteItems} onCreateProduct={() => setProductModal(true)} stockInfoByProduct={stockInfoByProduct} />
            <div className="row" style={{ marginTop: 12 }}>
              <div className="field">
                <label>Desconto</label>
                <input
                  name="discount_amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={quoteDiscount}
                  onChange={(e) => setQuoteDiscount(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Frete</label>
                <input
                  name="delivery_amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={quoteDelivery}
                  onChange={(e) => setQuoteDelivery(e.target.value)}
                />
              </div>
            </div>
            <p className="muted">
              Subtotal: {brl(quoteSubtotal)} · Desconto: -{brl(Number(quoteDiscount || 0))} · Frete: +{brl(Number(quoteDelivery || 0))} · Total: {brl(quoteTotal)}
            </p>
            <div className="row" style={{ marginTop: 12 }}>
              <button disabled={saving || quoteItems.length === 0}>{saving ? <><span className="btn-spinner" />Salvando...</> : "Salvar orçamento"}</button>
              {editingQuote && <button type="button" className="secondary" onClick={() => { clearQuoteForm(); setFormOpen(false); }}>Cancelar</button>}
            </div>
          </form>
          }
          list={
          <>
          <div className="row" style={{ marginTop: 0 }}>
            <button type="button" className="secondary" disabled={selected.length < 2} onClick={() => runCompare().catch((e) => setError(e.message))}>
              Comparar selecionados
            </button>
            <button
              type="button"
              className="secondary"
              disabled={applyingPrices || !selected.length}
              onClick={() => applyBestPrices()}
            >
              {applyingPrices ? "Atualizando..." : "Atualizar preço de custo"}
            </button>
            {priceUpdateMsg && <p className="muted" style={{ margin: 0 }}>{priceUpdateMsg}</p>}
          </div>
          <DataTable columns={quoteColumns} rows={quotes} rowKey={(q) => q.id ?? ""} emptyMessage="Nenhum orçamento cadastrado." />
          {compare && (
            <div style={{ marginTop: 20 }}>
              <h2 style={{ margin: 0 }}>Comparação</h2>
              <p className="muted">
                Menor total: {brl(compare.lowest_total)} ({personName(suppliers, compare.quotes?.find((q: any) => q.id === compare.lowest_total_id)?.supplier_id)})
              </p>
              <DataTable columns={compareColumns} rows={compare.products || []} rowKey={(p: any) => p.product_id} emptyMessage="Nenhum produto para comparar." />
            </div>
          )}
          </>
          }
        />
      )}
      {page === "pedidos" && (
        <CadastroLayout
          formTitle={editingOrder ? "Editar pedido" : "Novo pedido"}
          formOpen={formOpen}
          listOpen={listOpen}
          onFormOpen={setFormOpen}
          onListOpen={setListOpen}
          form={
          <>
          {quoteRequired && !editingOrder && <p className="muted">Pedido exige orçamento. Converta um orçamento aberto.</p>}
          {(!quoteRequired || editingOrder) && (
            <form key={editingOrder?.id ?? "new"} onSubmit={saveOrder}>
              <div className="row">
                <div className="field">
                  <label>Fornecedor</label>
                  <Autocomplete
                    name="supplier_id"
                    required
                    defaultValue={editingOrder?.supplier_id ?? ""}
                    options={suppliers.map(personOption)}
                    createLabel="Cadastrar fornecedor"
                    onCreate={() => setPersonModal(true)}
                  />
                </div>
                <div className="field">
                  <label>Forma</label>
                  <Autocomplete name="payment_method_id" required defaultValue={editingOrder?.payment_method_id ?? ""} options={methods.map((x) => ({ value: x.id, code: x.code, description: x.name }))} />
                </div>
                <div className="field">
                  <label>Condição</label>
                  <Autocomplete name="payment_term_id" required defaultValue={editingOrder?.payment_term_id ?? ""} options={terms.map((x) => ({ value: x.id, code: x.code, description: x.name }))} />
                </div>
              </div>
              <LineItems products={products} priceKey="purchase_price" items={orderItems} onChange={setOrderItems} onCreateProduct={() => setProductModal(true)} />
              <div className="row" style={{ marginTop: 12 }}>
                <button disabled={saving || orderItems.length === 0}>{saving ? <><span className="btn-spinner" />Salvando...</> : editingOrder ? "Salvar pedido" : "Criar pedido"}</button>
                {editingOrder && <button type="button" className="secondary" onClick={() => { clearOrderForm(); setFormOpen(false); }}>Cancelar</button>}
              </div>
            </form>
          )}
          </>
          }
          list={
          <DataTable columns={orderColumns} rows={orders} rowKey={(o) => o.id} emptyMessage="Nenhum pedido cadastrado." />
          }
        />
      )}
      {page === "historico" && (
        <div className="card">
          <DataTable columns={historyColumns} rows={history} rowKey={(h) => h.id} emptyMessage="Nenhum histórico encontrado." />
        </div>
      )}
      {page === "entrada" && (
        <div className="card">
          <p className="muted">Pedidos com nota fiscal de entrada. Confirme o recebimento no almoxarifado.</p>
          <DataTable columns={inboundColumns} rows={inboundOrders()} rowKey={(o) => o.id} emptyMessage="Nenhum pedido com nota de entrada." />
        </div>
      )}
      {page === "conferencia" && (
        <div className="card">
          {!conferring && (
            <DataTable columns={conferColumns} rows={conferOrders()} rowKey={(o) => o.id} emptyMessage="Nenhum pedido para conferência." />
          )}
          {conferring && (
            <>
              <div className="row">
                <p>{personName(suppliers, conferring.supplier_id)} · <span className="badge">{DELIVERY_LABEL[conferring.status] || conferring.status}</span></p>
                <button type="button" className="secondary" onClick={() => setConferring(null)}>Voltar</button>
              </div>
              <div className="row" style={{ marginTop: 12 }}>
                <div className="field">
                  <label>Bipar código / SKU / barras</label>
                  <input
                    value={conferScan}
                    placeholder="SKU,qtd  ex: 000001,25"
                    onChange={(e) => setConferScan(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        applyConferScan(conferScan);
                      }
                    }}
                  />
                </div>
                <button type="button" onClick={() => applyConferScan(conferScan)}>Bipar</button>
                <button type="button" onClick={() => confirmConfer()}>Confirmar conferência</button>
              </div>
              <div className="row" style={{ marginTop: 12 }}>
                <div className="field field-narrow">
                  <label>Mostrar</label>
                  <select value={conferFilter} onChange={(e) => setConferFilter(e.target.value as "pending" | "all")}>
                    <option value="pending">Pendentes</option>
                    <option value="all">Todos</option>
                  </select>
                </div>
              </div>
              <div className="table-wrap"><table>
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>Pedido</th>
                    <th>Conferido</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(conferring.items || [])
                    .filter((it: any) => conferFilter === "all" || !itemConferred(it))
                    .map((it: any) => {
                      const p = products.find((x) => x.id === it.product_id);
                      const done = itemConferred(it);
                      return (
                        <tr key={it.product_id}>
                          <td>{p ? `${p.sku} — ${p.name}` : it.product_id}</td>
                          <td>{it.quantity}{p?.purchase_uom ? ` ${p.purchase_uom}` : ""}</td>
                          <td>{conferCounts[it.product_id] || 0}</td>
                          <td><span className={`badge ${done ? "ok" : "warn"}`}>{done ? "Conferido" : "Pendente"}</span></td>
                        </tr>
                      );
                    })}
                  {conferFilter === "pending" && (conferring.items || []).every((it: any) => itemConferred(it)) && (
                    <tr><td colSpan={4} className="muted">Todos os itens já foram conferidos.</td></tr>
                  )}
                </tbody>
              </table></div>
            </>
          )}
        </div>
      )}
      {receiving && (
        <Modal title="Receber pedido" onClose={() => setReceiving(null)}>
          <p className="muted">Os produtos entram no almoxarifado selecionado.</p>
          {receiveError && <p className="error">{receiveError}</p>}
          {warehouses.length === 0 && (
            <p className="error">Cadastre um almoxarifado em Estoque → Almoxarifados.</p>
          )}
          <div className="row" style={{ marginTop: 12 }}>
            <div className="field">
              <label>Almoxarifado</label>
              <Autocomplete
                required
                value={receiveWh}
                options={warehouses.map((w) => ({ value: w.id, code: w.code, description: w.name }))}
                onChange={setReceiveWh}
              />
            </div>
          </div>
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Qtd</th>
                  <th>Almoxarifado</th>
                </tr>
              </thead>
              <tbody>
                {(receiving.items || []).map((it: any, i: number) => {
                  const p = products.find((x) => x.id === it.product_id);
                  const wh = warehouses.find((w) => w.id === (receiveWh || defaultWarehouse));
                  return (
                    <tr key={`${it.product_id}-${i}`}>
                      <td>{p ? `${p.sku} — ${p.name}` : it.product_id}</td>
                      <td>{it.quantity}{p?.purchase_uom ? ` ${p.purchase_uom}` : ""}</td>
                      <td>{wh ? `${wh.code} — ${wh.name}` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button type="button" onClick={() => confirmReceive()}>Confirmar recebimento</button>
            <button type="button" className="secondary" onClick={() => setReceiving(null)}>Cancelar</button>
          </div>
        </Modal>
      )}
      {printingQuote && (
        <Modal title="Imprimir orçamento" onClose={() => setPrintingQuote(null)}>
          <p className="muted">Desmarque as colunas que não devem aparecer na impressão.</p>
          <div className="row" style={{ marginTop: 12, flexWrap: "wrap" }}>
            {PURCHASE_DOC_COLUMNS.map((c) => (
              <label key={c.key} className="check">
                <input
                  type="checkbox"
                  checked={!hiddenPrintCols.has(c.key)}
                  onChange={() => toggleHiddenPrintCol(c.key)}
                />
                {c.label}
              </label>
            ))}
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button
              type="button"
              onClick={() => {
                printQuote(printingQuote, hiddenPrintCols);
                setPrintingQuote(null);
              }}
            >
              Imprimir
            </button>
            <button type="button" className="secondary" onClick={() => setPrintingQuote(null)}>Cancelar</button>
          </div>
        </Modal>
      )}
      {converting && (
        <Modal title="Gerar pedido" onClose={() => setConverting(null)}>
          <p className="muted">Preencha forma e condição de pagamento.</p>
          {convertError && <p className="error">{convertError}</p>}
          {(methods.length === 0 || terms.length === 0) && (
            <p className="error">Cadastre em <a href="/config/cadastros/pagamento">Configurador → Cadastros → Pagamento</a>.</p>
          )}
          <div className="row" style={{ marginTop: 12 }}>
            <div className="field">
              <label>Forma</label>
              <Autocomplete required value={payMethod} onChange={setPayMethod} options={methods.map((x) => ({ value: x.id, code: x.code, description: x.name }))} />
            </div>
            <div className="field">
              <label>Condição</label>
              <Autocomplete required value={payTerm} onChange={setPayTerm} options={terms.map((x) => ({ value: x.id, code: x.code, description: x.name }))} />
            </div>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button type="button" onClick={() => confirmConvert()}>Confirmar</button>
            <button type="button" className="secondary" onClick={() => setConverting(null)}>Cancelar</button>
          </div>
        </Modal>
      )}
      {productModal && <ProductCreateModal onClose={() => setProductModal(false)} onCreated={() => load()} />}
      {personModal && <PersonCreateModal role="supplier" onClose={() => setPersonModal(false)} onCreated={() => load()} />}
        </>
      )}
    </div>
  );
}
