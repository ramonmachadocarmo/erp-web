import { FormEvent, useState } from "react";
import { Autocomplete, CadastroLayout, DataTable, DataTableColumn, LineItem, LineItems, PersonCreateModal, ProductCreateModal, StatusBadge, salesApi } from "@erp/shared";
import { AddressCreateModal } from "./AddressCreateModal";
import { KitSubstitutions } from "./KitSubstitutions";
import { addrLabel, freeMap, itemSummary, onHandMap, orderShort, personName, personOption, withOrderStock } from "./helpers";

type Props = {
  customers: any[];
  products: any[];
  assemblies: any[];
  methods: any[];
  terms: any[];
  orders: any[];
  balances: any[];
  onReload: () => Promise<void>;
  onError: (msg: string) => void;
  /** PDV counter sale: no delivery address, payment collected on the spot. */
  pdv?: boolean;
};

export function Orders({ customers, products, assemblies, methods, terms, orders, balances, onReload, onError, pdv }: Props) {
  const [formOpen, setFormOpen] = useState(true);
  const [listOpen, setListOpen] = useState(true);
  const [productModal, setProductModal] = useState(false);
  const [personModal, setPersonModal] = useState(false);
  const [addressModal, setAddressModal] = useState(false);
  const [items, setItems] = useState<LineItem[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [addressId, setAddressId] = useState("");
  const [methodId, setMethodId] = useState("");
  const [termId, setTermId] = useState("");
  const [paymentStatus, setPaymentStatus] = useState(pdv ? "PAID" : "PENDING");
  const [editingOrder, setEditingOrder] = useState<any>(null);

  function clearOrderForm() {
    setItems([]);
    setCustomerId("");
    setAddressId("");
    setMethodId("");
    setTermId("");
    setPaymentStatus(pdv ? "PAID" : "PENDING");
    setEditingOrder(null);
  }

  function startEdit(o: any) {
    setEditingOrder(o);
    setCustomerId(o.customer_id);
    setAddressId(o.address?.id || "");
    setMethodId(o.payment_method_id || "");
    setTermId(o.payment_term_id || "");
    setPaymentStatus(o.payment_status || "PENDING");
    setItems((o.items || []).map((it: any) => ({
      product_id: it.product_id,
      quantity: Number(it.quantity),
      unit_price: Number(it.unit_price),
      components: it.components,
    })));
    setFormOpen(true);
    onError("");
  }

  async function addOrder(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const body = {
      customer_id: customerId,
      warehouse_id: "",
      payment_method_id: methodId,
      payment_term_id: termId,
      payment_status: paymentStatus,
      discount_amount: 0,
      address: pdv ? { alias: "" } : (customers.find((c) => c.id === customerId)?.addresses || []).find((a: any) => a.id === addressId) || { alias: "" },
      items,
    };
    try {
      if (editingOrder) await salesApi.updateOrder(editingOrder.id, body);
      else await salesApi.createOrder(body);
      form.reset();
      clearOrderForm();
      await onReload();
    } catch (err: any) {
      onError(err.message);
    }
  }

  async function togglePaymentStatus(o: any) {
    try {
      await salesApi.setPaymentStatus(o.id, o.payment_status === "PAID" ? "PENDING" : "PAID");
      await onReload();
    } catch (err: any) {
      onError(err.message);
    }
  }

  const onHand = onHandMap(balances);
  const available = editingOrder ? withOrderStock(freeMap(balances), editingOrder.items) : freeMap(balances);

  const kitByProduct: Record<string, any> = {};
  for (const a of assemblies) {
    if (a.product_id && !kitByProduct[a.product_id]) kitByProduct[a.product_id] = a;
  }
  // A kit's own product never carries real stock — it's assembled from its recipe's
  // components at sale time (see KitSubstitutions) — so the "Estoque insuficiente" check,
  // which only knows about the line's own product_id, doesn't apply to it at all.
  for (const id of Object.keys(kitByProduct)) {
    available[id] = Infinity;
    onHand[id] = Infinity;
  }
  const orderableProducts = products
    .filter((p) => p.kind !== "FIXED_ASSET")
    .map((p) => {
      const kit = kitByProduct[p.id];
      return kit ? { ...p, name: `${p.name} (Kit ${kit.code} — ${kit.name})` } : p;
    });

  const orderColumns: DataTableColumn<any>[] = [
    { key: "customer", label: "Cliente", value: (o) => personName(customers, o.customer_id) },
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
      label: "Status",
      value: (o) => o.status,
      render: (o) => (
        <>
          <StatusBadge status={o.status} extra={o.delivery_note} />
          {orderShort(o.items, onHand) && <span className="badge warn" style={{ marginLeft: 6 }}>Estoque insuficiente</span>}
        </>
      ),
    },
    {
      key: "payment_status",
      label: "Status pagamento",
      value: (o) => o.payment_status,
      render: (o) => <StatusBadge status={o.payment_status || "PENDING"} />,
    },
    { key: "items", label: "Itens", value: (o) => itemSummary(o.items, products), render: (o) => <span className="muted">{itemSummary(o.items, products)}</span> },
    { key: "total_amount", label: "Total" },
    {
      key: "actions",
      label: "",
      sortable: false,
      filterable: false,
      render: (o) => (
        <div className="row" style={{ flexWrap: "nowrap", minWidth: 200 }}>
          {o.status === "APPROVED" && (
            <button type="button" className="secondary" onClick={() => startEdit(o)}>Editar</button>
          )}
          <button type="button" className="secondary" onClick={() => togglePaymentStatus(o)}>
            {o.payment_status === "PAID" ? "Marcar pendente" : "Marcar pago"}
          </button>
          {(o.status === "APPROVED" || o.status === "PENDING_RESERVATION") && (
            <button type="button" className="danger" onClick={async () => {
              if (!confirm("Cancelar este pedido?")) return;
              try {
                await salesApi.cancelOrder(o.id);
                if (editingOrder?.id === o.id) clearOrderForm();
                await onReload();
              } catch (err: any) {
                onError(err.message);
              }
            }}>Cancelar</button>
          )}
          <button type="button" className="danger" onClick={async () => {
            if (!confirm("Excluir este pedido? Esta ação não pode ser desfeita.")) return;
            try {
              await salesApi.deleteOrder(o.id);
              if (editingOrder?.id === o.id) clearOrderForm();
              await onReload();
            } catch (err: any) {
              onError(err.message);
            }
          }}>Excluir</button>
        </div>
      ),
    },
  ];

  return (
    <>
      <CadastroLayout
        formTitle={editingOrder ? "Editar pedido" : pdv ? "Nova venda" : "Novo pedido"}
        formOpen={formOpen}
        listOpen={listOpen}
        onFormOpen={setFormOpen}
        onListOpen={setListOpen}
        form={
          <form key={editingOrder?.id ?? "new"} onSubmit={addOrder}>
            <div className="row">
              <div className="field">
                <label>Cliente</label>
                <Autocomplete
                  name="customer_id"
                  required
                  value={customerId}
                  options={customers.map(personOption)}
                  createLabel="Cadastrar cliente"
                  onCreate={() => setPersonModal(true)}
                  onChange={(v) => {
                    setCustomerId(v);
                    const addrs = customers.find((c) => c.id === v)?.addresses || [];
                    setAddressId(addrs.length === 1 ? addrs[0].id : "");
                  }}
                />
              </div>
              <div className="field">
                <label>Forma</label>
                <Autocomplete name="payment_method_id" required value={methodId} options={methods.map((x) => ({ value: x.id, code: x.code, description: x.name }))} onChange={setMethodId} />
              </div>
              <div className="field">
                <label>Condição</label>
                <Autocomplete name="payment_term_id" required value={termId} options={terms.map((x) => ({ value: x.id, code: x.code, description: x.name }))} onChange={setTermId} />
              </div>
              <div className="field">
                <label>Status pagamento</label>
                <Autocomplete
                  name="payment_status"
                  value={paymentStatus}
                  options={[
                    { value: "PAID", code: "PAID", description: "Pago" },
                    { value: "PENDING", code: "PENDING", description: "Pendente" },
                  ]}
                  onChange={setPaymentStatus}
                />
              </div>
            </div>
            {!pdv && (
              <div className="row">
                <div className="field">
                  <label>Endereço</label>
                  <Autocomplete
                    required
                    value={addressId}
                    options={(customers.find((c) => c.id === customerId)?.addresses || []).map((a: any) => ({
                      value: a.id,
                      code: a.alias || "",
                      description: addrLabel(a),
                    }))}
                    createLabel="Cadastrar endereço"
                    onCreate={() => customerId && setAddressModal(true)}
                    onChange={setAddressId}
                  />
                </div>
              </div>
            )}
            <LineItems
              products={orderableProducts}
              priceKey="sale_price"
              items={items}
              onChange={setItems}
              onCreateProduct={() => setProductModal(true)}
              availableByProduct={available}
            />
            <KitSubstitutions items={items} onChange={setItems} assemblies={assemblies} products={products} />
            <div className="row" style={{ marginTop: 12 }}>
              <button disabled={items.length === 0 || (!pdv && !addressId) || !methodId || !termId}>{editingOrder ? "Salvar" : pdv ? "Criar venda" : "Criar pedido"}</button>
              {editingOrder && <button type="button" className="secondary" onClick={clearOrderForm}>Cancelar edição</button>}
            </div>
          </form>
        }
        list={<DataTable columns={orderColumns} rows={orders} rowKey={(o) => o.id} emptyMessage="Nenhum pedido cadastrado." />}
      />
      {addressModal && customerId && (
        <AddressCreateModal
          customer={customers.find((c) => c.id === customerId)}
          onClose={() => setAddressModal(false)}
          onCreated={async (id) => {
            setAddressModal(false);
            await onReload();
            setAddressId(id);
          }}
        />
      )}
      {productModal && <ProductCreateModal onClose={() => setProductModal(false)} onCreated={() => onReload()} />}
      {personModal && <PersonCreateModal role="customer" onClose={() => setPersonModal(false)} onCreated={() => onReload()} />}
    </>
  );
}
