import { FormEvent, useState } from "react";
import { CompanyHeaderInfo, DataTable, DataTableColumn, Modal, StatusBadge, salesApi } from "@erp/shared";
import { addrLabel, itemSummary, personName, printLabels, sepNo } from "./helpers";

type Props = {
  orders: any[];
  products: any[];
  customers: any[];
  onReload: () => Promise<void>;
  onError: (msg: string) => void;
  company?: CompanyHeaderInfo;
};

export function Delivery({ orders, products, customers, onReload, onError, company }: Props) {
  const [failOrder, setFailOrder] = useState<any>(null);

  const deliverable = orders.filter((o) => o.status === "PICKED" || o.status === "DELIVERED" || o.status === "UNDELIVERED");

  const columns: DataTableColumn<any>[] = [
    { key: "customer", label: "Cliente", value: (o) => personName(customers, o.customer_id) },
    { key: "picking", label: "Separação", value: (o) => sepNo(o.picking?.number) },
    { key: "address", label: "Endereço", value: (o) => addrLabel(o.address) },
    { key: "volumes", label: "Volumes", value: (o) => o.picking?.volume_count || "—" },
    { key: "items", label: "Itens", value: (o) => itemSummary(o.items, products), render: (o) => <span className="muted">{itemSummary(o.items, products)}</span> },
    { key: "status", label: "Status", value: (o) => o.status, render: (o) => <StatusBadge status={o.status} extra={o.delivery_note} /> },
    {
      key: "actions",
      label: "",
      sortable: false,
      filterable: false,
      render: (o) => (
        <div className="row">
          {o.status === "DELIVERED" ? (
            <button type="button" className="danger" onClick={async () => {
              if (!confirm("Cancelar esta entrega?")) return;
              try {
                await salesApi.undoDeliver(o.id);
                await onReload();
              } catch (err: any) {
                onError(err.message);
              }
            }}>Cancelar entrega</button>
          ) : (
            <>
              <button type="button" className="secondary" onClick={() => printLabels(o, personName(customers, o.customer_id), undefined, company)}>Etiquetas</button>
              <button type="button" onClick={async () => {
                try {
                  await salesApi.deliver(o.id);
                  await onReload();
                } catch (err: any) {
                  onError(err.message);
                }
              }}>Confirmar entrega</button>
              <button type="button" className="danger" onClick={() => setFailOrder(o)}>Não foi possível</button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="card">
      <DataTable columns={columns} rows={deliverable} rowKey={(o) => o.id} emptyMessage="Nenhum pedido para entrega." />
      {failOrder && (
        <Modal title="Não foi possível entregar" onClose={() => setFailOrder(null)}>
          <form onSubmit={async (e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            const note = String(new FormData(e.currentTarget).get("note") || "").trim();
            if (!note) return;
            try {
              await salesApi.failDelivery(failOrder.id, note);
              setFailOrder(null);
              await onReload();
            } catch (err: any) {
              onError(err.message);
            }
          }}>
            <div className="field">
              <label>Motivo</label>
              <textarea name="note" required rows={4} defaultValue={failOrder.delivery_note || ""} />
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <button type="button" className="secondary" onClick={() => setFailOrder(null)}>Voltar</button>
              <button>Registrar</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
