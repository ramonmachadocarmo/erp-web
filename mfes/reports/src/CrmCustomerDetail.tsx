import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DataTable, DataTableColumn, Loading, StatusBadge, reportsApi } from "@erp/shared";

function brl(n: number) {
  return Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtQty(n: number) {
  return Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
}

function fmtDate(s?: string | null) {
  return s ? new Date(s).toLocaleString("pt-BR") : "";
}

function daysAgo(s?: string | null) {
  if (!s) return null;
  const ms = Date.now() - new Date(s).getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

const orderColumns: DataTableColumn<any>[] = [
  { key: "createdAtText", label: "Data" },
  {
    key: "status",
    label: "Status",
    render: (o) => <StatusBadge status={o.status} />,
  },
  { key: "item_summary", label: "Itens" },
  { key: "total_amount", label: "Total", render: (o) => brl(o.total_amount) },
];

export function CrmCustomerDetail({ customerId }: { customerId: string }) {
  const navigate = useNavigate();
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    reportsApi
      .customerDetail(customerId)
      .then(setDetail)
      .catch((err: any) => setError(err.message))
      .finally(() => setLoading(false));
  }, [customerId]);

  if (loading) return <Loading />;
  if (error) return <p className="error">{error}</p>;
  if (!detail) return null;

  const since = daysAgo(detail.last_order_at);
  const rows = (detail.orders || []).map((o: any, i: number) => ({
    ...o,
    createdAtText: fmtDate(o.created_at),
    _key: o.order_id || String(i),
  }));

  return (
    <div>
      <button type="button" className="secondary" onClick={() => navigate("/crm")}>
        ← Voltar
      </button>
      <h1 style={{ marginTop: 12 }}>{detail.customer_name}</h1>
      <div className="row" style={{ marginTop: 16, gap: 12, flexWrap: "wrap" }}>
        <div className="card" style={{ flex: 1, minWidth: 140 }}>
          <p className="muted">Pedidos</p>
          <h2>{fmtQty(detail.order_count)}</h2>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 140 }}>
          <p className="muted">Valor gasto</p>
          <h2>{brl(detail.total_amount)}</h2>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 140 }}>
          <p className="muted">Ticket médio</p>
          <h2>{brl(detail.average_ticket)}</h2>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 140 }}>
          <p className="muted">Pedidos cancelados</p>
          <h2>{fmtQty(detail.cancelled_count)}</h2>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 140 }}>
          <p className="muted">Em atraso</p>
          <h2 style={detail.overdue_amount > 0 ? { color: "var(--danger, #e05555)" } : undefined}>
            {brl(detail.overdue_amount)}
          </h2>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 140 }}>
          <p className="muted">Última compra</p>
          <h2>{since == null ? "—" : since === 0 ? "Hoje" : `há ${since} dia${since === 1 ? "" : "s"}`}</h2>
          {detail.last_order_at && <p className="muted">{fmtDate(detail.last_order_at)}</p>}
        </div>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <DataTable columns={orderColumns} rows={rows} rowKey={(row) => row._key} emptyMessage="Nenhum pedido encontrado." />
      </div>
    </div>
  );
}
