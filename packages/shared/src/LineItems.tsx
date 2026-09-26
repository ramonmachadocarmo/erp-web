import { KeyboardEvent, useState } from "react";
import { Autocomplete } from "./Autocomplete";
import { InfoTooltip } from "./InfoTooltip";

export type LineItemComponent = { product_id: string; quantity: number };

// components overrides what a kit line actually consumes from stock (see KitSubstitutions
// in the sales MFE) — the kit's own price and quantity here never change because of it.
export type LineItem = { product_id: string; quantity: number; unit_price: number; components?: LineItemComponent[] };

type Product = { id: string; sku: string; name: string; popular_name?: string; sale_price?: number; purchase_price?: number; purchase_uom?: string; sale_uom?: string };

type StockInfo = { stock: number; needed: number };

type Props = {
  products: Product[];
  priceKey: "sale_price" | "purchase_price";
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  onCreateProduct?: () => void;
  availableByProduct?: Record<string, number>;
  // Informational (not a warning like availableByProduct's insufficient-stock check —
  // "not enough stock" is the reason to buy, not an error, when priceKey is purchase_price).
  // Values are expected already converted to the line's own UoM (purchase_uom here).
  stockInfoByProduct?: Record<string, StockInfo>;
  // Sales wants the product's popular_name (what goes on labels/receipts) when set, falling
  // back to name; purchasing (orçamentos/pedidos) always wants the registered name, since that's
  // what's exchanged with suppliers — so this defaults to off.
  usePopularName?: boolean;
};

export function LineItems({
  products, priceKey, items, onChange, onCreateProduct, availableByProduct, stockInfoByProduct, usePopularName,
}: Props) {
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");

  function add() {
    if (!productId || Number(qty) <= 0) return;
    const unit = Number(price);
    const existing = items.findIndex((i) => i.product_id === productId);
    if (existing >= 0) {
      const next = items.slice();
      next[existing] = { ...next[existing], quantity: next[existing].quantity + Number(qty), unit_price: Number.isFinite(unit) ? unit : next[existing].unit_price };
      onChange(next);
    } else {
      onChange([...items, { product_id: productId, quantity: Number(qty), unit_price: Number.isFinite(unit) ? unit : 0 }]);
    }
    setProductId("");
    setQty("1");
    setPrice("");
  }

  function onDraftKey(e: KeyboardEvent) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if ((e.target as HTMLElement).closest(".autocomplete")) return;
    add();
  }

  function displayName(p: Product) {
    return (usePopularName && p.popular_name) || p.name;
  }

  function productLabel(id: string) {
    const p = products.find((x) => x.id === id);
    return p ? `${p.sku} — ${displayName(p)}` : id;
  }

  function uomOf(id: string) {
    const p = products.find((x) => x.id === id);
    if (!p) return "";
    return (priceKey === "purchase_price" ? p.purchase_uom : p.sale_uom) || "";
  }

  function stockOf(id: string) {
    if (!availableByProduct) return null;
    return availableByProduct[id] ?? 0;
  }

  function stockWarn(id: string, q: number) {
    const av = stockOf(id);
    if (av == null || !(q > av + 1e-9)) return "";
    const uom = uomOf(id);
    return `Estoque insuficiente (disp. ${av}${uom ? ` ${uom}` : ""})`;
  }

  function stockInfo(id: string) {
    const info = stockInfoByProduct?.[id];
    if (!info) return "";
    const uom = uomOf(id);
    const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
    return `Estoque atual: ${fmt(info.stock)}${uom ? ` ${uom}` : ""} · Necessário: ${fmt(info.needed)}${uom ? ` ${uom}` : ""}`;
  }

  const draftNeed = Number(qty) + (items.find((i) => i.product_id === productId)?.quantity || 0);
  const draftWarn = productId ? stockWarn(productId, draftNeed) : "";

  return (
    <div className="line-items">
      <div className="row" onKeyDown={onDraftKey}>
        <div className="field">
          <label>Produto</label>
          <Autocomplete
            value={productId}
            options={products.map((p) => ({ value: p.id, code: p.sku, description: displayName(p) }))}
            createLabel="Cadastrar produto"
            onCreate={onCreateProduct}
            onChange={(id) => {
              setProductId(id);
              const p = products.find((x) => x.id === id);
              const raw = p?.[priceKey];
              setPrice(raw == null || raw === "" ? "" : String(raw));
            }}
          />
        </div>
        <div className="field field-narrow">
          <label>Qtd{productId && uomOf(productId) ? ` (${uomOf(productId)})` : ""}</label>
          <input type="number" step="0.0001" min="0.0001" value={qty} onChange={(e) => setQty(e.target.value)} />
          {draftWarn ? <p className="error">{draftWarn}</p> : null}
        </div>
        <div className="field field-narrow">
          <label>Preço</label>
          <input type="number" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        <button type="button" onClick={add}>
          Adicionar item
        </button>
      </div>
      <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Produto</th>
            <th>Qtd</th>
            <th>Preço</th>
            <th>Total</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={it.product_id}>
              <td>
                {productLabel(it.product_id)}
                {stockInfo(it.product_id) ? <InfoTooltip text={stockInfo(it.product_id)} /> : null}
              </td>
              <td>
                <input
                  type="number"
                  step="0.0001"
                  value={it.quantity}
                  onChange={(e) => {
                    const next = items.slice();
                    next[i] = { ...it, quantity: Number(e.target.value) };
                    onChange(next);
                  }}
                />
                {uomOf(it.product_id) ? <span className="muted"> {uomOf(it.product_id)}</span> : null}
                {stockWarn(it.product_id, Number(it.quantity)) ? <p className="error">{stockWarn(it.product_id, Number(it.quantity))}</p> : null}
              </td>
              <td>
                <input
                  type="number"
                  step="0.01"
                  value={it.unit_price}
                  onChange={(e) => {
                    const next = items.slice();
                    next[i] = { ...it, unit_price: Number(e.target.value) };
                    onChange(next);
                  }}
                />
              </td>
              <td>{(it.quantity * it.unit_price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
              <td>
                <button type="button" className="secondary" onClick={() => onChange(items.filter((_, idx) => idx !== i))}>
                  Remover
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
