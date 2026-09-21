import { FormEvent, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Autocomplete, DataTable, DataTableColumn, LineItems, LineItem, Loading, ProductCreateModal, WarehouseCreateModal, configApi, invoicingApi, purchasingApi, stockApi } from "@erp/shared";

function brl(n: number) {
  return Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function personName(list: any[], id: string) {
  const p = list.find((x) => x.id === id);
  if (!p) return id;
  return p.kind === "PJ" ? p.company_name || p.name : p.name;
}

export default function App() {
  const page = useLocation().pathname.split("/").filter(Boolean).pop() || "saida";
  const tab = page === "entrada" ? "IN" : "OUT";
  const [invoices, setInvoices] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [warehouseId, setWarehouseId] = useState("");
  const [items, setItems] = useState<LineItem[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [productModal, setProductModal] = useState(false);
  const [warehouseModal, setWarehouseModal] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [purchaseOrderId, setPurchaseOrderId] = useState("");
  const [withoutNote, setWithoutNote] = useState(false);

  async function load(direction = tab) {
    try {
      const [inv, p, w, o, s] = await Promise.all([
        invoicingApi.invoices(direction),
        stockApi.products(),
        stockApi.warehouses(),
        purchasingApi.orders().catch(() => []),
        configApi.suppliers().catch(() => []),
      ]);
      setInvoices(inv);
      setProducts(p);
      setWarehouses(w);
      setOrders(o);
      setSuppliers(s);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setConfirming(null);
    setItems([]);
    setWarehouseId("");
    setPurchaseOrderId("");
    setWithoutNote(false);
    setLoading(true);
    load(tab).catch((e) => setError(e.message));
  }, [tab]);

  async function importFile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const file = f.get("file") as File | null;
    const hasFile = !!file && file.size > 0;
    if (tab === "IN" && !purchaseOrderId) {
      setError("Selecione o pedido de compra");
      return;
    }
    if (!withoutNote && !hasFile) {
      setError("Selecione o XML ou PDF da nota");
      return;
    }
    if (hasFile && file) {
      const name = file.name.toLowerCase();
      if (!name.endsWith(".xml") && !name.endsWith(".pdf")) {
        setError("Arquivo deve ser XML ou PDF");
        return;
      }
    }
    try {
      await invoicingApi.importFile(tab, hasFile ? file : null, purchaseOrderId || undefined, withoutNote && !hasFile);
      form.reset();
      setPurchaseOrderId("");
      setWithoutNote(false);
      setError("");
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function confirm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!confirming) return;
    try {
      await invoicingApi.confirm(confirming, {
        warehouse_id: warehouseId,
        items: items.map((it) => ({ product_id: it.product_id, quantity: it.quantity })),
      });
      setConfirming(null);
      setItems([]);
      setWarehouseId("");
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  const invoiceColumns: DataTableColumn<any>[] = [
    { key: "number", label: "Número", value: (inv) => `${inv.series}-${inv.invoice_number}` },
    {
      key: "status", label: "Status", value: (inv) => inv.status,
      render: (inv) => <span className={`badge ${inv.status === "AUTHORIZED" || inv.status === "IMPORTED" || inv.status === "CONFIRMED" ? "ok" : "warn"}`}>{inv.status}</span>,
    },
    { key: "source", label: "Origem", value: (inv) => (inv.source === "IMPORT" ? "Importada" : inv.source === "MANUAL" ? "Sem nota" : "Pedido") },
    {
      key: "purchase_order_id", label: "Pedido",
      value: (inv) => (inv.purchase_order_id ? inv.purchase_order_id.slice(0, 8) : "—"),
      render: (inv) => <span className="muted">{inv.purchase_order_id ? inv.purchase_order_id.slice(0, 8) : "—"}</span>,
    },
    { key: "file_name", label: "Arquivo", render: (inv) => <span className="muted">{inv.file_name}</span> },
    { key: "total_products", label: "Produtos", value: (inv) => Number(inv.total_products || 0), render: (inv) => brl(inv.total_products) },
    { key: "total_taxes", label: "Impostos", value: (inv) => Number(inv.total_taxes || 0), render: (inv) => brl(inv.total_taxes) },
    { key: "total_invoice", label: "Total", value: (inv) => Number(inv.total_invoice || 0), render: (inv) => brl(inv.total_invoice) },
    {
      key: "actions", label: "", sortable: false, filterable: false,
      render: (inv) => (
        <>
          {inv.status === "PENDING_SEFAZ" && (
            <button onClick={() => invoicingApi.issue(inv.id).then(() => load()).catch((e) => setError(e.message))}>Emitir NFe</button>
          )}
          {inv.status === "IMPORTED" && !(tab === "IN" && inv.purchase_order_id) && (
            <button className="secondary" onClick={() => setConfirming(inv.id)}>Confirmar</button>
          )}
          {inv.status !== "AUTHORIZED" && inv.status !== "CONFIRMED" && (
            <button className="danger" onClick={async () => {
              if (!window.confirm("Excluir esta nota?")) return;
              try {
                await invoicingApi.deleteInvoice(inv.id);
                if (confirming === inv.id) { setConfirming(null); setItems([]); }
                await load();
              } catch (err: any) {
                setError(err.message);
              }
            }}>Excluir</button>
          )}
        </>
      ),
    },
  ];

  return (
    <div>
      <h1>{tab === "OUT" ? "Nota de saída" : "Nota de entrada"}</h1>
      {error && <p className="error">{error}</p>}
      {loading ? <Loading /> : (
        <>
      <div className="card">
        <p className="muted">
          {tab === "OUT"
            ? "Notas de saída (venda). Emita o rascunho do pedido ou importe XML/PDF e confirme para baixar o estoque."
            : "Notas de entrada (compra). Vincule o pedido. O arquivo XML/PDF é opcional se marcar entrada sem nota. A entrada física fica em Logística."}
        </p>
        <form className="row" onSubmit={importFile} style={{ marginTop: 12 }}>
          {tab === "IN" && (
            <div className="field">
              <label>Pedido de compra</label>
              <Autocomplete
                required
                value={purchaseOrderId}
                options={orders.filter((o) => o.status === "APPROVED").map((o) => ({
                  value: o.id,
                  code: o.id.slice(0, 8),
                  description: `${personName(suppliers, o.supplier_id)} · ${o.created_at ? new Date(o.created_at).toLocaleDateString("pt-BR") : "—"} · ${brl(o.total_amount)}`,
                }))}
                onChange={setPurchaseOrderId}
              />
            </div>
          )}
          <div className="field">
            <label>Arquivo XML ou PDF</label>
            <input name="file" type="file" accept=".xml,.pdf,application/xml,application/pdf" required={!withoutNote} disabled={withoutNote} />
          </div>
          {tab === "IN" && (
            <label className="field" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={withoutNote} onChange={(e) => setWithoutNote(e.target.checked)} />
              Entrada sem nota
            </label>
          )}
          <button>Importar</button>
        </form>
        {confirming && (
          <form onSubmit={confirm} style={{ marginTop: 16 }}>
            <p className="muted">Confirme os itens e o almoxarifado para movimentar o estoque.</p>
            <div className="row" style={{ marginTop: 8 }}>
              <div className="field">
                <label>Almoxarifado</label>
                <Autocomplete
                  value={warehouseId}
                  required
                  options={warehouses.map((w) => ({ value: w.id, code: w.code, description: w.name }))}
                  createLabel="Cadastrar almoxarifado"
                  onCreate={() => setWarehouseModal(true)}
                  onChange={setWarehouseId}
                />
              </div>
            </div>
            <LineItems
              products={products.filter((p) => p.kind !== "FIXED_ASSET")}
              priceKey={tab === "OUT" ? "sale_price" : "purchase_price"}
              items={items}
              onChange={setItems}
              onCreateProduct={() => setProductModal(true)}
            />
            <div className="row" style={{ marginTop: 12 }}>
              <button disabled={!warehouseId || items.length === 0}>Confirmar nota</button>
              <button type="button" className="secondary" onClick={() => { setConfirming(null); setItems([]); }}>Cancelar</button>
            </div>
          </form>
        )}
        <DataTable columns={invoiceColumns} rows={invoices} rowKey={(inv) => inv.id} emptyMessage="Nenhuma nota encontrada." />
      </div>
      {productModal && <ProductCreateModal onClose={() => setProductModal(false)} onCreated={() => load()} />}
      {warehouseModal && (
        <WarehouseCreateModal
          onClose={() => setWarehouseModal(false)}
          onCreated={(w) => { setWarehouseId(w.id); load(); }}
        />
      )}
        </>
      )}
    </div>
  );
}
