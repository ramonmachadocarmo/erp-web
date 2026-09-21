import { Autocomplete, LineItem, LineItemComponent } from "@erp/shared";

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

  // Swapping the product recalculates quantity from the SAME base value the recipe originally
  // called for (from.quantity * from's own sale price) — not the current row's possibly
  // already-edited quantity — so repeated swaps on one row don't compound rounding drift.
  function swapProduct(index: number, compIndex: number, newProductId: string) {
    const it = items[index];
    const assembly = assemblyByProduct[it.product_id];
    const comps = effectiveComponents(it, assembly).slice();
    const from = comps[compIndex];
    const targetValue = from.quantity * salePriceOf(products, from.product_id);
    const toPrice = salePriceOf(products, newProductId);
    const quantity = toPrice > 0 ? Number((targetValue / toPrice).toFixed(4)) : from.quantity;
    comps[compIndex] = { product_id: newProductId, quantity };
    updateComponents(index, comps);
  }

  function updateQuantity(index: number, compIndex: number, quantity: number) {
    const it = items[index];
    const assembly = assemblyByProduct[it.product_id];
    const comps = effectiveComponents(it, assembly).slice();
    comps[compIndex] = { ...comps[compIndex], quantity };
    updateComponents(index, comps);
  }

  function resetToDefault(index: number) {
    updateComponents(index, []);
  }

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <h2>Itens das cestas</h2>
      <p className="muted">
        Troque um item da receita por outro sem alterar o preço da cesta — a quantidade do substituto é calculada
        pelo valor equivalente de venda (ex.: 1kg de maçã ≈ o mesmo valor em uva).
      </p>
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
