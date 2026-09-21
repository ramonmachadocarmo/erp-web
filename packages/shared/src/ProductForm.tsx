import { FormEvent, useState } from "react";
import { Autocomplete } from "./Autocomplete";
import { CategoryForm } from "./CategoryForm";
import { flattenCats, Category } from "./category";
import { Modal } from "./Modal";
import { stockApi } from "./api";

type Props = {
  units: { code: string; name: string }[];
  categories: Category[];
  editing?: any;
  onSaved: (p: any) => void;
  onCancel?: () => void;
  onCategoriesChange?: (cats: Category[]) => void;
};

export function ProductForm({ units, categories, editing, onSaved, onCancel, onCategoriesChange }: Props) {
  const [purchaseUom, setPurchaseUom] = useState(editing?.purchase_uom || "CX");
  const [saleUom, setSaleUom] = useState(editing?.sale_uom || "KG");
  const [kind, setKind] = useState(editing?.kind || "FINAL");
  const [categoryId, setCategoryId] = useState(editing?.category_id || "");
  const [factor, setFactor] = useState(() => {
    const c = (editing?.uom_conversions || []).find((x: any) => x.from_uom === editing?.purchase_uom && x.to_uom === editing?.sale_uom)
      || (editing?.uom_conversions || [])[0];
    return c?.factor || 20;
  });
  const [catOpen, setCatOpen] = useState(false);
  const [error, setError] = useState("");
  const needsConversion = purchaseUom !== saleUom;
  const uomOptions = units.map((u) => ({ value: u.code, code: u.code, description: u.name }));

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const body = {
      sku: String(f.get("sku") || ""),
      barcode: String(f.get("barcode") || ""),
      name: String(f.get("name") || ""),
      category_id: categoryId,
      ncm: String(f.get("ncm") || ""),
      kind,
      purchase_uom: purchaseUom,
      sale_uom: saleUom,
      stock_uom: saleUom,
      unit_of_measure: saleUom,
      uom_conversions: needsConversion && factor > 0
        ? [{ from_uom: purchaseUom, to_uom: saleUom, factor }]
        : [],
      weight_kg: Number(f.get("weight_kg") || 0),
      volume_m3: Number(f.get("volume_m3") || 0),
      attributes: {},
    };
    try {
      const out = editing
        ? await stockApi.updateProduct(editing.id, body).then(() => ({ ...editing, ...body }))
        : await stockApi.createProduct(body);
      form.reset();
      onSaved(out);
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <>
      <form key={editing?.id ?? "new"} onSubmit={save}>
        {error && <p className="error">{error}</p>}
        <div className="row">
          <div className="field"><label>SKU</label><input name="sku" placeholder="Automático" defaultValue={editing?.sku ?? ""} disabled={!!editing} /></div>
          <div className="field"><label>Barras</label><input name="barcode" defaultValue={editing?.barcode ?? ""} /></div>
          <div className="field"><label>Nome</label><input name="name" required defaultValue={editing?.name ?? ""} /></div>
          <div className="field"><label>NCM</label><input name="ncm" defaultValue={editing?.ncm ?? ""} /></div>
          <div className="field">
            <label>Categoria</label>
            <Autocomplete
              value={categoryId}
              allowEmpty
              emptyLabel="—"
              options={flattenCats(categories)}
              createLabel="Cadastrar categoria"
              onCreate={() => setCatOpen(true)}
              onChange={setCategoryId}
            />
          </div>
          <div className="field">
            <label>Tipo</label>
            <Autocomplete
              value={kind}
              options={[
                { value: "FINAL", code: "FINAL", description: "Produto final" },
                { value: "SUPPORT", code: "SUPPORT", description: "Produto de apoio" },
                { value: "FIXED_ASSET", code: "FIXED_ASSET", description: "Ativo fixo" },
              ]}
              required
              onChange={setKind}
            />
          </div>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <div className="field">
            <label>Un. compra</label>
            <Autocomplete value={purchaseUom} options={uomOptions} required onChange={setPurchaseUom} />
          </div>
          <div className="field">
            <label>Un. venda</label>
            <Autocomplete value={saleUom} options={uomOptions} required onChange={setSaleUom} />
          </div>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <div className="field"><label>Peso (kg / un. venda)</label><input name="weight_kg" type="number" min="0" step="0.001" defaultValue={editing?.weight_kg ?? ""} /></div>
          <div className="field"><label>Volume (m³ / un. venda)</label><input name="volume_m3" type="number" min="0" step="0.0001" defaultValue={editing?.volume_m3 ?? ""} /></div>
        </div>
        {needsConversion && (
          <>
            <h2 style={{ marginTop: 16 }}>Equivalência entre compra e venda</h2>
            <p className="muted">Informe quantas unidades de venda cabem em 1 unidade de compra. O estoque usa essa equivalência (ex.: 1 CX = 20 KG).</p>
            <div className="row" style={{ marginTop: 8 }}>
              <div className="field">
                <label>1 {purchaseUom} =</label>
                <input type="number" step="0.0001" min="0.0001" value={factor || ""} onChange={(e) => setFactor(Number(e.target.value))} required />
              </div>
              <div className="field">
                <label>{saleUom}</label>
                <input value={saleUom} disabled />
              </div>
            </div>
          </>
        )}
        <div className="row" style={{ marginTop: 12 }}>
          <button>{editing ? "Salvar produto" : "Adicionar produto"}</button>
          {onCancel && <button type="button" className="secondary" onClick={onCancel}>Cancelar</button>}
        </div>
      </form>
      {catOpen && (
        <Modal title="Nova categoria" onClose={() => setCatOpen(false)} depth={1}>
          <CategoryForm
            categories={categories}
            onSaved={async (c) => {
              const tree = await stockApi.categories();
              onCategoriesChange?.(tree);
              setCategoryId(c.id);
              setCatOpen(false);
            }}
          />
        </Modal>
      )}
    </>
  );
}
