import { FormEvent, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Autocomplete, CadastroLayout, CodeInput, DataTable, DataTableColumn, Loading, ProductCreateModal, assetsApi, stockApi } from "@erp/shared";

function brl(n: number) {
  return Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function statusLabel(s: string) {
  return s === "DISPOSED" ? "Baixado" : "Ativo";
}

function moveLabel(t: string) {
  if (t === "ACQUIRE") return "Aquisição";
  if (t === "TRANSFER") return "Transferência";
  if (t === "DEPRECIATE") return "Depreciação";
  if (t === "DISPOSE") return "Baixa";
  return t;
}

function isoDate(v?: string) {
  if (!v) return "";
  return v.slice(0, 10);
}

export default function App() {
  const page = useLocation().pathname.split("/").filter(Boolean).pop() || "bens";
  const [products, setProducts] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [editing, setEditing] = useState<any>(null);
  const [transferring, setTransferring] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [listOpen, setListOpen] = useState(true);
  const [productModal, setProductModal] = useState(false);

  const catalog = products.filter((p) => p.kind === "FIXED_ASSET");

  async function load() {
    try {
      const [p, a, m] = await Promise.all([stockApi.products(), assetsApi.assets(), assetsApi.movements()]);
      setProducts(p);
      setAssets(a);
      setMovements(m);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  function productLabel(id: string) {
    const p = products.find((x) => x.id === id);
    return p ? `${p.sku} — ${p.name}` : id;
  }

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const body = {
      product_id: f.get("product_id"),
      tag: f.get("tag"),
      serial_number: f.get("serial_number"),
      description: f.get("description"),
      location: f.get("location"),
      acquisition_date: `${f.get("acquisition_date")}T00:00:00Z`,
      acquisition_cost: Number(f.get("acquisition_cost")),
      residual_value: Number(f.get("residual_value") || 0),
      useful_life_months: Number(f.get("useful_life_months")),
      depreciation_method: "STRAIGHT_LINE",
    };
    try {
      if (editing) await assetsApi.update(editing.id, body);
      else await assetsApi.create(body);
      form.reset();
      setEditing(null);
      setFormOpen(false);
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function transfer(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await assetsApi.transfer(transferring.id, { location: f.get("location"), notes: f.get("notes") });
    setTransferring(null);
    await load();
  }

  const assetColumns: DataTableColumn<any>[] = [
    { key: "tag", label: "Plaqueta" },
    { key: "product", label: "Produto", value: (a) => productLabel(a.product_id) },
    { key: "location", label: "Local" },
    { key: "acquisition_cost", label: "Custo", value: (a) => Number(a.acquisition_cost || 0), render: (a) => brl(a.acquisition_cost) },
    { key: "accumulated_depreciation", label: "Depreciado", value: (a) => Number(a.accumulated_depreciation || 0), render: (a) => brl(a.accumulated_depreciation) },
    { key: "net_book_value", label: "Líquido", value: (a) => Number(a.net_book_value || 0), render: (a) => brl(a.net_book_value) },
    {
      key: "status", label: "Status", value: (a) => statusLabel(a.status),
      render: (a) => <span className={`badge ${a.status === "ACTIVE" ? "ok" : "warn"}`}>{statusLabel(a.status)}</span>,
    },
    {
      key: "actions", label: "", sortable: false, filterable: false,
      render: (a) =>
        a.status === "ACTIVE" ? (
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <button className="secondary" onClick={() => { setEditing(a); setFormOpen(true); }}>Editar</button>
            <button className="secondary" onClick={() => setTransferring(a)}>Transferir</button>
            <button className="secondary" onClick={() => assetsApi.depreciate(a.id).then(load).catch((e) => setError(e.message))}>Depreciar</button>
            <button className="secondary" onClick={() => assetsApi.dispose(a.id).then(load).catch((e) => setError(e.message))}>Baixar</button>
          </div>
        ) : null,
    },
  ];

  const movementColumns: DataTableColumn<any>[] = [
    { key: "occurred_at", label: "Data", value: (m) => new Date(m.occurred_at), render: (m) => new Date(m.occurred_at).toLocaleString("pt-BR") },
    { key: "movement_type", label: "Tipo", value: (m) => moveLabel(m.movement_type) },
    { key: "asset", label: "Ativo", value: (m) => assets.find((a) => a.id === m.asset_id)?.tag || m.asset_id },
    { key: "from_location", label: "De", value: (m) => m.from_location || "—", render: (m) => <span className="muted">{m.from_location || "—"}</span> },
    { key: "to_location", label: "Para", value: (m) => m.to_location || "—", render: (m) => <span className="muted">{m.to_location || "—"}</span> },
    { key: "amount", label: "Valor", value: (m) => Number(m.amount || 0), render: (m) => brl(m.amount) },
    { key: "notes", label: "Obs.", render: (m) => <span className="muted">{m.notes}</span> },
  ];

  return (
    <div>
      <h1>{page === "movimentos" ? "Movimentações" : "Ativos"}</h1>
      {error && <p className="error">{error}</p>}
      {loading ? <Loading /> : (
        <>
      {page !== "movimentos" && (
        <CadastroLayout
          formOpen={formOpen}
          listOpen={listOpen}
          onFormOpen={setFormOpen}
          onListOpen={setListOpen}
          form={
          <>
          <p className="muted">Cadastre bens vinculados a produtos do tipo ativo fixo. A depreciação é linear pelo tempo de vida útil.</p>
          <form key={editing?.id ?? "new"} onSubmit={save}>
            <div className="row">
              <div className="field">
                <label>Produto</label>
                <Autocomplete
                  name="product_id"
                  required
                  defaultValue={editing?.product_id ?? ""}
                  options={catalog.map((p) => ({ value: p.id, code: p.sku, description: p.name }))}
                  createLabel="Cadastrar produto"
                  onCreate={() => setProductModal(true)}
                />
              </div>
              <CodeInput name="tag" label="Plaqueta" defaultValue={editing?.tag ?? ""} required={!!editing} />
              <div className="field"><label>Nº série</label><input name="serial_number" defaultValue={editing?.serial_number ?? ""} /></div>
              <div className="field"><label>Local</label><input name="location" required defaultValue={editing?.location ?? ""} /></div>
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <div className="field"><label>Aquisição</label><input name="acquisition_date" type="date" required defaultValue={isoDate(editing?.acquisition_date)} /></div>
              <div className="field"><label>Custo</label><input name="acquisition_cost" type="number" step="0.01" min="0.01" required defaultValue={editing?.acquisition_cost ?? ""} /></div>
              <div className="field"><label>Residual</label><input name="residual_value" type="number" step="0.01" min="0" defaultValue={editing?.residual_value ?? 0} /></div>
              <div className="field"><label>Vida (meses)</label><input name="useful_life_months" type="number" min="1" required defaultValue={editing?.useful_life_months ?? 60} /></div>
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <div className="field" style={{ flex: 2 }}><label>Descrição</label><input name="description" defaultValue={editing?.description ?? ""} /></div>
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <button>{editing ? "Salvar ativo" : "Adicionar ativo"}</button>
              {editing && <button type="button" className="secondary" onClick={() => { setEditing(null); setFormOpen(false); }}>Cancelar</button>}
              <button type="button" className="secondary" onClick={() => assetsApi.depreciateAll().then(load).catch((e) => setError(e.message))}>Depreciar todos</button>
            </div>
          </form>
          {transferring && (
            <form className="row" style={{ marginTop: 16 }} onSubmit={transfer}>
              <div className="field"><label>Novo local ({transferring.tag})</label><input name="location" required defaultValue={transferring.location} /></div>
              <div className="field"><label>Obs.</label><input name="notes" /></div>
              <button>Transferir</button>
              <button type="button" className="secondary" onClick={() => setTransferring(null)}>Cancelar</button>
            </form>
          )}
          </>
          }
          list={
          <DataTable columns={assetColumns} rows={assets} rowKey={(a) => a.id} emptyMessage="Nenhum ativo cadastrado." />
          }
        />
      )}
      {page === "movimentos" && (
        <div className="card">
          <DataTable columns={movementColumns} rows={movements} rowKey={(m) => m.id} emptyMessage="Nenhuma movimentação registrada." />
        </div>
      )}
      {productModal && <ProductCreateModal onClose={() => setProductModal(false)} onCreated={() => load()} />}
        </>
      )}
    </div>
  );
}
