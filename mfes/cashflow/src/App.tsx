import { FormEvent, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { CadastroLayout, cashflowApi, configApi, DataTable, DataTableColumn, Loading } from "@erp/shared";

function brl(n: number) {
  return Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function dirLabel(d: string) {
  return d === "IN" ? "Entrada" : "Saída";
}

function statusLabel(s: string) {
  return s === "CONFIRMED" ? "Confirmado" : "Previsto";
}

function originLabel(e: any) {
  if (e.reference_type === "SALE") return "Venda";
  if (e.reference_type === "PURCHASE") return "Compra";
  return "Manual";
}

export default function App() {
  const page = useLocation().pathname.split("/").filter(Boolean).pop() || "resumo";
  const [summary, setSummary] = useState<any[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [methods, setMethods] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(true);

  async function load() {
    try {
      const [s, e, m] = await Promise.all([cashflowApi.summary(), cashflowApi.entries(), configApi.paymentMethods()]);
      setSummary(s);
      setEntries(e);
      setMethods(m);
    } finally {
      setLoading(false);
    }
  }

  async function saveManual(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    try {
      await cashflowApi.createManual({
        due_date: f.get("due_date"),
        amount: Number(f.get("amount")),
        direction: f.get("direction"),
        description: f.get("description"),
        payment_method_id: f.get("payment_method_id") || undefined,
      });
      form.reset();
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function removeManual(id: string) {
    if (!window.confirm("Excluir este lançamento?")) return;
    try {
      await cashflowApi.deleteEntry(id);
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const todayRow = summary.find((d) => d.date === today);

  const summaryColumns: DataTableColumn<any>[] = [
    { key: "date", label: "Data", value: (d) => new Date(d.date + "T00:00:00"), render: (d) => new Date(d.date + "T00:00:00").toLocaleDateString("pt-BR") },
    { key: "inflow", label: "Entradas", value: (d) => Number(d.inflow || 0), render: (d) => brl(d.inflow) },
    { key: "outflow", label: "Saídas", value: (d) => Number(d.outflow || 0), render: (d) => brl(d.outflow) },
    { key: "net", label: "Líquido", value: (d) => Number(d.net || 0), render: (d) => brl(d.net) },
    { key: "balance", label: "Saldo", value: (d) => Number(d.balance || 0), render: (d) => brl(d.balance) },
  ];

  const entryColumns: DataTableColumn<any>[] = [
    { key: "due_date", label: "Vencimento", value: (e) => new Date(e.due_date), render: (e) => new Date(e.due_date).toLocaleDateString("pt-BR") },
    {
      key: "direction", label: "Tipo", value: (e) => dirLabel(e.direction),
      render: (e) => <span className={`badge ${e.direction === "IN" ? "ok" : "warn"}`}>{dirLabel(e.direction)}</span>,
    },
    { key: "payment_method_name", label: "Forma" },
    { key: "payment_term_name", label: "Condição" },
    { key: "installment", label: "Parcela", value: (e) => `${e.installment_no}/${e.installments_total}` },
    { key: "amount", label: "Valor", value: (e) => Number(e.amount || 0), render: (e) => brl(e.amount) },
    { key: "status", label: "Status", value: (e) => statusLabel(e.status) },
    {
      key: "reference_type", label: "Origem", value: (e) => originLabel(e),
      render: (e) => <span className="muted">{originLabel(e)}</span>,
    },
    { key: "description", label: "Descrição", render: (e) => <span className="muted">{e.description}</span> },
    {
      key: "actions", label: "", sortable: false, filterable: false,
      render: (e) => (e.reference_type === "MANUAL" ? <button className="secondary" onClick={() => removeManual(e.id)}>Excluir</button> : null),
    },
  ];

  const manualEntries = entries.filter((e) => e.reference_type === "MANUAL");

  return (
    <div>
      <h1>Fluxo de caixa</h1>
      {error && <p className="error">{error}</p>}
      {loading ? <Loading /> : (
        <>
      {page === "resumo" && (
        <>
      <div className="row" style={{ marginBottom: 16 }}>
        <div className="card">
          <p className="muted">Entradas hoje</p>
          <h2>{brl(todayRow?.inflow || 0)}</h2>
        </div>
        <div className="card">
          <p className="muted">Saídas hoje</p>
          <h2>{brl(todayRow?.outflow || 0)}</h2>
        </div>
        <div className="card">
          <p className="muted">Saldo projetado</p>
          <h2>{brl(summary.length ? summary[summary.length - 1].balance : 0)}</h2>
        </div>
      </div>
      <div className="card">
        <DataTable columns={summaryColumns} rows={summary} rowKey={(d) => d.date} defaultSortKey="date" emptyMessage="Nenhum dado de fluxo de caixa." />
      </div>
        </>
      )}
      {page === "lancamentos" && (
        <div className="card">
          <DataTable columns={entryColumns} rows={entries} rowKey={(e) => e.id} defaultSortKey="due_date" emptyMessage="Nenhum lançamento encontrado." />
        </div>
      )}
      {page === "novo" && (
        <CadastroLayout
          formTitle="Novo lançamento"
          listTitle="Lançamentos manuais"
          formOpen={formOpen}
          onFormOpen={setFormOpen}
          form={
            <>
            <p className="muted">Registre um lançamento avulso de caixa — não vinculado a nenhum pedido de venda ou compra.</p>
            <form onSubmit={saveManual}>
              <div className="row">
                <div className="field">
                  <label>Tipo</label>
                  <select name="direction" required defaultValue="OUT">
                    <option value="IN">Entrada</option>
                    <option value="OUT">Saída</option>
                  </select>
                </div>
                <div className="field"><label>Vencimento</label><input name="due_date" type="date" required defaultValue={today} /></div>
                <div className="field"><label>Valor</label><input name="amount" type="number" step="0.01" min="0.01" required /></div>
                <div className="field">
                  <label>Forma de pagamento</label>
                  <select name="payment_method_id" defaultValue="">
                    <option value="">—</option>
                    {methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="row" style={{ marginTop: 12 }}>
                <div className="field" style={{ flex: 2 }}><label>Descrição</label><input name="description" required placeholder="Ex.: Aluguel, Retirada de sócio, ..." /></div>
              </div>
              <div className="row" style={{ marginTop: 12 }}>
                <button>Adicionar lançamento</button>
              </div>
            </form>
            </>
          }
          list={
            <DataTable columns={entryColumns} rows={manualEntries} rowKey={(e) => e.id} defaultSortKey="due_date" emptyMessage="Nenhum lançamento manual cadastrado." />
          }
        />
      )}
        </>
      )}
    </div>
  );
}
