import { useEffect, useMemo, useRef, useState } from "react";
import { CompanyHeaderInfo, DataTable, DataTableColumn, StatusBadge, encodeWeightBarcode, printWeightLabelPdf, statusMeta } from "@erp/shared";
import {
  PENDING_DELIVERY_STATUSES, STATUS_FILTER_PENDING, STATUS_ORDER,
  fmtDate, formatDateTime, itemSummary, kitComponents, personName,
} from "./helpers";
import { BAUD_RATES, useScaleSerial } from "./Weighing";

type Props = { orders: any[]; products: any[]; assemblies: any[]; customers: any[]; company?: CompanyHeaderInfo };

type Row = { key: string; productId: string; qty: number; kitName?: string };

// Uma etiqueta impressa por linha (peso), não por produto — a mesma linha pode ser pesada mais de
// uma vez (várias caixas do mesmo item), e cada impressão fica registrada em vez de sobrescrever a
// anterior. O cache existe só na sessão (perdido ao recarregar), conforme decidido: não há tela de
// conferência de outra pessoa que precise ver isso depois.
type PrintedLabel = {
  id: string;
  key: string;
  productId: string;
  sku: string;
  name: string;
  weightKg: number;
  printedAt: string;
  ok: boolean;
};

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function OrderWeighing({ orders, products, assemblies, customers, company }: Props) {
  const [orderId, setOrderId] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(STATUS_FILTER_PENDING);
  const [deliveryFilter, setDeliveryFilter] = useState("");
  const [current, setCurrent] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [labels, setLabels] = useState<PrintedLabel[]>([]);
  const [checkedUnits, setCheckedUnits] = useState<Record<string, boolean>>({});
  const [baudRate, setBaudRate] = useState(9600);
  const weightRef = useRef<HTMLInputElement>(null);
  const scale = useScaleSerial((kg) => setWeightKg(kg.toFixed(3)));

  const order = orders.find((o) => o.id === orderId) || null;

  // Mesmo filtro padrão de Pedidos: "Pendente entrega" é tudo antes de Entregue.
  const statusOptions = STATUS_ORDER.filter((s) => orders.some((o) => o.status === s));
  const deliveryDates = Array.from(new Set(orders.map((o) => o.delivery_date || "")))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  const hasNoDate = orders.some((o) => !o.delivery_date);
  const filteredOrders = useMemo(
    () =>
      orders.filter((o) => {
        if (statusFilter === STATUS_FILTER_PENDING ? !PENDING_DELIVERY_STATUSES.has(o.status) : statusFilter && o.status !== statusFilter) return false;
        if (deliveryFilter === "none" ? !!o.delivery_date : deliveryFilter && o.delivery_date !== deliveryFilter) return false;
        return true;
      }),
    [orders, statusFilter, deliveryFilter],
  );
  const orderColumns: DataTableColumn<any>[] = [
    { key: "customer", label: "Cliente", value: (o) => personName(customers, o.customer_id) },
    { key: "status", label: "Status", value: (o) => o.status, render: (o) => <StatusBadge status={o.status} extra={o.delivery_note} /> },
    { key: "delivery_date", label: "Entrega", value: (o) => o.delivery_date || "", render: (o) => fmtDate(o.delivery_date) },
    { key: "items", label: "Itens", value: (o) => itemSummary(o.items, products), render: (o) => <span className="muted">{itemSummary(o.items, products)}</span> },
    {
      key: "actions",
      label: "",
      sortable: false,
      filterable: false,
      render: (o) => (
        <button type="button" className="secondary" onClick={() => setOrderId(o.id)}>Pesar</button>
      ),
    },
  ];

  // O que o pedido realmente contém: linhas de kit são trocadas pelos seus componentes (mesma regra
  // de Picking — respeita troca de item feita na venda), linhas de produto avulso entram direto.
  const rows: Row[] = useMemo(() => {
    if (!order) return [];
    const out: Row[] = [];
    (order.items || []).forEach((it: any, idx: number) => {
      const comps = kitComponents(it, assemblies);
      if (comps) {
        const kit = products.find((p) => p.id === it.product_id);
        for (const c of comps) {
          out.push({ key: `${idx}:${c.product_id}`, productId: c.product_id, qty: c.quantity, kitName: kit?.name });
        }
      } else {
        out.push({ key: `${idx}:${it.product_id}`, productId: it.product_id, qty: Number(it.quantity) });
      }
    });
    return out;
  }, [order, assemblies, products]);

  const rowsWithProduct = useMemo(
    () => rows.map((r) => ({ ...r, product: products.find((p) => p.id === r.productId) })),
    [rows, products],
  );
  // Só produto por peso (KG) pesa e gera etiqueta; produto por unidade só marca um check.
  const weighableRows = rowsWithProduct.filter((r) => r.product?.sale_uom === "KG");
  const unitRows = rowsWithProduct.filter((r) => r.product?.sale_uom !== "KG");

  function lastLabelFor(key: string) {
    const list = labels.filter((l) => l.key === key);
    return list.length > 0 ? list[list.length - 1] : null;
  }
  const pendingWeighable = weighableRows.filter((r) => !lastLabelFor(r.key));
  const currentRow = weighableRows.find((r) => r.key === current) || null;

  useEffect(() => {
    setLabels([]);
    setCheckedUnits({});
    setWeightKg("");
    setCurrent("");
  }, [orderId]);

  useEffect(() => {
    if (order && !current && pendingWeighable.length > 0) setCurrent(pendingWeighable[0].key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, current, pendingWeighable.length]);

  useEffect(() => {
    if (current) weightRef.current?.focus();
  }, [current]);

  const weight = Number(weightKg.replace(",", "."));
  const validWeight = Number.isFinite(weight) && weight > 0;

  function print(withPrice: boolean) {
    const p = currentRow?.product;
    if (!p || !currentRow || !validWeight) return;
    const unitPrice = Number(p.sale_price || 0);
    printWeightLabelPdf(
      [{ sku: p.sku, name: p.name, weightKg: weight, unitPrice, barcode: encodeWeightBarcode(p.sku, weight), printedAt: formatDateTime(new Date()) }],
      company,
      { withPrice },
    );
    setLabels((cur) => [
      ...cur,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        key: currentRow.key,
        productId: p.id,
        sku: p.sku,
        name: p.name,
        weightKg: weight,
        printedAt: formatDateTime(new Date()),
        ok: false,
      },
    ]);
    setWeightKg("");
    const next = weighableRows.find((r) => r.key !== currentRow.key && !lastLabelFor(r.key));
    setCurrent(next ? next.key : "");
  }

  function toggleOk(id: string) {
    setLabels((cur) => cur.map((l) => (l.id === id ? { ...l, ok: !l.ok } : l)));
  }

  function toggleUnit(key: string) {
    setCheckedUnits((cur) => ({ ...cur, [key]: !cur[key] }));
  }

  const pendingOk = labels.some((l) => !l.ok);

  return (
    <div className="card">
      <p className="muted">
        Escolha o pedido, pese cada item vendido por peso (dos kits e dos avulsos) e imprima a etiqueta
        (peso embutido no código de barras) para bipar na separação. Item vendido por unidade só precisa do check.
      </p>
      <div className="row" style={{ marginTop: 12, alignItems: "flex-end" }}>
        {scale.supported ? (
          <>
            {!scale.connected && (
              <div className="field field-narrow">
                <label>Baud rate</label>
                <select value={baudRate} onChange={(e) => setBaudRate(Number(e.target.value))}>
                  {BAUD_RATES.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
            )}
            <button type="button" className="secondary" disabled={scale.busy} onClick={() => (scale.connected ? scale.disconnect() : scale.connect(baudRate))}>
              {scale.connected ? "Desconectar balança" : scale.busy ? "Conectando..." : "Conectar balança"}
            </button>
            <p className="muted" style={{ marginBottom: 8 }}>
              {scale.connected ? `Balança conectada${scale.lastLine ? ` · última leitura: ${scale.lastLine}` : ""}` : "Balança desconectada — peso pode ser digitado manualmente."}
            </p>
          </>
        ) : (
          <p className="muted" style={{ marginBottom: 8 }}>Leitura automática da balança indisponível neste navegador/endereço — digite o peso manualmente.</p>
        )}
      </div>
      {scale.error && <p className="error">{scale.error}</p>}
      {!order && (
        <>
          <div className="row" style={{ marginTop: 12 }}>
            <div className="field field-narrow">
              <label>Status</label>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value={STATUS_FILTER_PENDING}>Pendente entrega</option>
                <option value="">Todos</option>
                {statusOptions.map((s) => (
                  <option key={s} value={s}>{statusMeta(s).label}</option>
                ))}
              </select>
            </div>
            <div className="field field-narrow">
              <label>Entrega</label>
              <select value={deliveryFilter} onChange={(e) => setDeliveryFilter(e.target.value)}>
                <option value="">Todas as datas</option>
                {deliveryDates.map((d) => (
                  <option key={d} value={d}>{fmtDate(d)}</option>
                ))}
                {hasNoDate && <option value="none">Sem data</option>}
              </select>
            </div>
          </div>
          <DataTable columns={orderColumns} rows={filteredOrders} rowKey={(o) => o.id} emptyMessage="Nenhum pedido para os filtros selecionados." />
        </>
      )}
      {order && (
        <div className="row" style={{ marginTop: 12 }}>
          <p>{personName(customers, order.customer_id)} · <StatusBadge status={order.status} extra={order.delivery_note} /></p>
          <button type="button" className="secondary" onClick={() => setOrderId("")}>Voltar</button>
        </div>
      )}
      {order && rowsWithProduct.length > 0 && (
        <>
          <div className="table-wrap"><table>
            <thead>
              <tr>
                <th>Produto</th>
                <th>Qtd</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rowsWithProduct.map((r) => {
                const p = r.product;
                const label = lastLabelFor(r.key);
                const isWeighable = p?.sale_uom === "KG";
                return (
                  <tr key={r.key} style={r.key === current ? { background: "var(--panel-2)" } : undefined}>
                    <td>
                      {p ? `${p.sku} — ${p.name}` : r.productId}
                      {r.kitName && <span className="muted"> (kit: {r.kitName})</span>}
                    </td>
                    <td>{r.qty} {p?.sale_uom || ""}</td>
                    <td>
                      {!p ? (
                        <span className="muted">produto não encontrado</span>
                      ) : isWeighable ? (
                        !label ? (
                          <span className="badge warn">pendente</span>
                        ) : label.ok ? (
                          <span className="badge ok">{label.weightKg.toFixed(3)} kg · OK</span>
                        ) : (
                          <span className="badge warn">{label.weightKg.toFixed(3)} kg · falta OK</span>
                        )
                      ) : checkedUnits[r.key] ? (
                        <span className="badge ok">OK</span>
                      ) : (
                        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <input type="checkbox" checked={!!checkedUnits[r.key]} onChange={() => toggleUnit(r.key)} />
                          check
                        </label>
                      )}
                    </td>
                    <td>
                      {isWeighable && (
                        <button type="button" className="secondary" onClick={() => setCurrent(r.key)}>
                          {label ? "Repesar" : "Pesar"}
                        </button>
                      )}
                      {!isWeighable && checkedUnits[r.key] && (
                        <button type="button" className="secondary" onClick={() => toggleUnit(r.key)}>Desmarcar</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
          {currentRow?.product && (
            <>
              <div className="row" style={{ marginTop: 12 }}>
                <div className="field field-narrow">
                  <label>Peso (kg) — {currentRow.product.name}</label>
                  <input
                    ref={weightRef}
                    type="number"
                    step="0.001"
                    min="0"
                    value={weightKg}
                    onChange={(e) => setWeightKg(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        print(true);
                      }
                    }}
                  />
                </div>
                <button type="button" disabled={!validWeight} onClick={() => print(true)}>Imprimir etiqueta</button>
                <button type="button" className="secondary" disabled={!validWeight} onClick={() => print(false)}>Imprimir sem preço</button>
              </div>
              <p className="muted" style={{ marginTop: 8 }}>
                Preço/kg: {brl(Number(currentRow.product.sale_price || 0))}
                {validWeight && <> · Total: {brl(weight * Number(currentRow.product.sale_price || 0))}</>}
              </p>
            </>
          )}
          {pendingWeighable.length === 0 && weighableRows.length > 0 && (
            <p className="muted" style={{ marginTop: 12 }}>Todos os itens pesáveis deste pedido já foram pesados ao menos uma vez. Use "Repesar" pra imprimir outra etiqueta do mesmo item.</p>
          )}
          {labels.length > 0 && (
            <>
              <h3 style={{ marginTop: 20 }}>Etiquetas impressas {pendingOk && <span className="badge warn">falta confirmar {labels.filter((l) => !l.ok).length}</span>}</h3>
              <div className="table-wrap"><table>
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>Peso</th>
                    <th>Impressa em</th>
                    <th>OK</th>
                  </tr>
                </thead>
                <tbody>
                  {labels.map((l) => (
                    <tr key={l.id}>
                      <td>{l.sku} — {l.name}</td>
                      <td>{l.weightKg.toFixed(3)} kg</td>
                      <td className="muted">{l.printedAt}</td>
                      <td>
                        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <input type="checkbox" checked={l.ok} onChange={() => toggleOk(l.id)} />
                          {l.ok ? "confirmada" : "confirmar"}
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </>
          )}
        </>
      )}
      {order && rowsWithProduct.length === 0 && (
        <p className="error" style={{ marginTop: 12 }}>Este pedido não tem itens.</p>
      )}
      {orders.length === 0 && <p className="error" style={{ marginTop: 12 }}>Nenhum pedido cadastrado.</p>}
    </div>
  );
}
