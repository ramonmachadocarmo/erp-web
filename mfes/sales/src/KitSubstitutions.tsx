import { useState } from "react";
import { Autocomplete, LineItem, LineItemComponent } from "@erp/shared";
import { MAX_PREMIUM, equivalentQuantity, qtyStep, withinPremium } from "./kitSwap";

type Product = { id: string; sku: string; name: string; sale_price?: number; sale_uom?: string };
type AssemblyItem = { product_id: string; quantity: number; role?: string };
type Assembly = { id: string; code: string; name: string; product_id: string; items: AssemblyItem[] };

type Props = {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  assemblies: Assembly[];
  products: Product[];
};

function productOf(products: Product[], id: string) {
  return products.find((p) => p.id === id);
}

function salePriceOf(products: Product[], id: string) {
  return Number(productOf(products, id)?.sale_price || 0);
}

function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// The kit's own price/quantity never change here — only which real products get consumed
// from stock (see ExpandKitItems in stock-service). Absent/empty `components` means "use
// the recipe registered in Estoque -> Montagem as-is".
function effectiveComponents(it: LineItem, assembly: Assembly): LineItemComponent[] {
  if (it.components && it.components.length > 0) return it.components;
  return assembly.items.map((ai) => ({ product_id: ai.product_id, quantity: ai.quantity * it.quantity }));
}

export function KitSubstitutions({ items, onChange, assemblies, products }: Props) {
  const [swapError, setSwapError] = useState("");
  const assemblyByProduct: Record<string, Assembly> = {};
  for (const a of assemblies) if (a.product_id) assemblyByProduct[a.product_id] = a;

  const kitLines = items
    .map((it, index) => ({ it, index, assembly: assemblyByProduct[it.product_id] }))
    .filter((x): x is { it: LineItem; index: number; assembly: Assembly } => !!x.assembly);

  if (kitLines.length === 0) return null;

  function updateComponents(index: number, components: LineItemComponent[]) {
    const next = items.slice();
    next[index] = { ...items[index], components };
    onChange(next);
  }

    // Value the recipe originally called for in this slot (recipe qty x kits x sale price) — the
  // budget every swap is measured against, so repeated swaps on one row never compound drift.
  function slotBase(index: number, compIndex: number) {
    const assembly = assemblyByProduct[items[index].product_id];
    const ai = assembly.items[compIndex];
    return ai ? ai.quantity * items[index].quantity * salePriceOf(products, ai.product_id) : 0;
  }

  // Swap = remove the recipe item and add another of equivalent sale value: the new quantity
  // keeps the value (rounded to the unit's step) and may cost at most MAX_PREMIUM more than the
  // removed item — see kitSwap.ts. A refused swap leaves the row untouched and says why.
  function swapProduct(index: number, compIndex: number, newProductId: string) {
    const it = items[index];
    const assembly = assemblyByProduct[it.product_id];
    const comps = effectiveComponents(it, assembly).slice();
    if (comps[compIndex].product_id === newProductId) return;
    const original = assembly.items[compIndex];
    // Going back to the recipe's own product restores its recipe quantity.
    if (original && original.product_id === newProductId) {
      comps[compIndex] = { product_id: newProductId, quantity: Number((original.quantity * it.quantity).toFixed(4)) };
      setSwapError("");
      updateComponents(index, comps);
      return;
    }
    const target = slotBase(index, compIndex);
    const np = productOf(products, newProductId);
    const eq = equivalentQuantity(target, salePriceOf(products, newProductId), qtyStep(np?.sale_uom));
    if (!eq.ok) {
      setSwapError(`${np ? `${np.sku} — ${np.name}` : "Item"}: ${eq.reason}`);
      return;
    }
    setSwapError("");
    comps[compIndex] = { product_id: newProductId, quantity: eq.quantity };
    updateComponents(index, comps);
  }

  function updateQuantity(index: number, compIndex: number, quantity: number) {
    const it = items[index];
    const assembly = assemblyByProduct[it.product_id];
    const comps = effectiveComponents(it, assembly).slice();
    const price = salePriceOf(products, comps[compIndex].product_id);
    if (!withinPremium(quantity, price, slotBase(index, compIndex))) {
      setSwapError(`Quantidade acima do permitido: o item pode custar no máximo ${Math.round(MAX_PREMIUM * 100)}% a mais que o item original da cesta.`);
      return;
    }
    setSwapError("");
    comps[compIndex] = { ...comps[compIndex], quantity };
    updateComponents(index, comps);
  }

    function resetToDefault(index: number) {
    setSwapError("");
    updateComponents(index, []);
  }

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <h2>Itens das cestas</h2>
      <p className="muted">
                Troque um item da receita por outro sem alterar o preço da cesta — a quantidade do substituto é calculada
        pelo valor equivalente de venda (ex.: R$ 12 de banana ≈ 0,5 kg de tangerina a R$ 22/kg), e o item novo pode
        custar no máximo {Math.round(MAX_PREMIUM * 100)}% a mais que o item trocado.
      </p>
      {swapError && <p className="error">{swapError}</p>}
      {kitLines.map(({ it, index, assembly }) => {
        const comps = effectiveComponents(it, assembly);
        const customized = !!(it.components && it.components.length > 0);
        return (
          <div key={index} style={{ marginTop: 12 }}>
            <div className="row" style={{ alignItems: "center" }}>
              <strong>{assembly.code} — {assembly.name}</strong>
              <span className="muted">× {it.quantity}</span>
              {customized && (
                <button type="button" className="secondary" onClick={() => resetToDefault(index)}>
                  Restaurar receita padrão
                </button>
              )}
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Qtd</th>
                    <th>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {comps.map((c, ci) => {
                    const p = productOf(products, c.product_id);
                    const price = salePriceOf(products, c.product_id);
                    return (
                      <tr key={ci}>
                        <td style={{ minWidth: 240 }}>
                          <Autocomplete
                            value={c.product_id}
                            options={products.map((pp) => ({ value: pp.id, code: pp.sku, description: pp.name }))}
                            onChange={(newId) => swapProduct(index, ci, newId)}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="0.0001"
                            min="0"
                            value={c.quantity}
                            onChange={(e) => updateQuantity(index, ci, Number(e.target.value))}
                          />
                          {p?.sale_uom ? <span className="muted"> {p.sale_uom}</span> : null}
                        </td>
                        <td className="muted">{price > 0 ? brl(c.quantity * price) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
