import { Fragment, useState } from "react";
import { Autocomplete, CompanyHeaderInfo, DataTable, DataTableColumn, Modal, StatusBadge, decodeWeightBarcode, isMaster, salesApi } from "@erp/shared";
import { itemSummary, personName, printLabels, sepNo } from "./helpers";

type Props = {
  orders: any[];
  assemblies: any[];
  products: any[];
  warehouses: any[];
  customers: any[];
  balances: any[];
  defaultWarehouse: string;
  error: string;
  onReload: () => Promise<void>;
  onError: (msg: string) => void;
  company?: CompanyHeaderInfo;
};

function pickedQty(order: any, productId: string) {
  return (order?.picks || []).filter((p: any) => p.product_id === productId).reduce((n: number, p: any) => n + Number(p.quantity), 0);
}

type Component = { product_id: string; quantity: number };

// Mirrors sales-service's domain.PickRequirements: a kit line is separated by its components
// (customer substitutions on the line win over the Montagem recipe), not by the kit product itself.
function kitComponents(item: any, assemblies: any[]): Component[] | null {
  const kit = (assemblies || []).find((a) => a.product_id && a.product_id === item.product_id);
  if (!kit) return null;
  const own = (item.components || []).filter((c: any) => c.product_id && Number(c.quantity) > 0);
  const comps: Component[] = own.length > 0
    ? own.map((c: any) => ({ product_id: c.product_id, quantity: Number(c.quantity) }))
    : (kit.items || []).map((ai: any) => ({ product_id: ai.product_id, quantity: Number(ai.quantity) * Number(item.quantity) }));
  return comps.length > 0 ? comps : null;
}

// Orders separated before kits were picked by component have the kit product itself picked in
// full and none of its components picked.
function legacyKitDone(order: any, item: any, comps: Component[]) {
  return pickedQty(order, item.product_id) + 1e-9 >= Number(item.quantity) && comps.every((c) => pickedQty(order, c.product_id) === 0);
}

function kitComponentsDone(order: any, item: any, comps: Component[]) {
  return comps.every((c) => pickedQty(order, c.product_id) + 1e-9 >= c.quantity);
}

// Kit lines require every component and, last, the kit product itself (bipped to close the kit).
function requirements(order: any, assemblies: any[]): Record<string, number> {
  const req: Record<string, number> = {};
  for (const it of order?.items || []) {
    req[it.product_id] = (req[it.product_id] || 0) + Number(it.quantity);
    const comps = kitComponents(it, assemblies);
    if (!comps || legacyKitDone(order, it, comps)) continue;
    for (const c of comps) req[c.product_id] = (req[c.product_id] || 0) + c.quantity;
  }
  return req;
}

function itemsDone(order: any, assemblies: any[]) {
  if ((order?.items || []).length === 0) return false;
  return Object.entries(requirements(order, assemblies)).every(([pid, qty]) => pickedQty(order, pid) + 1e-9 >= qty);
}

function parseScanInput(raw: string) {
  const t = raw.trim();
  const m = t.match(/^(.+?)\s*[,;]\s*(\d+(?:[.,]\d+)?)\s*$/);
  if (!m) return { code: t, qty: 1, hasQty: false };
  const qty = Number(m[2].replace(",", "."));
  if (!Number.isFinite(qty) || qty <= 0) return { code: t, qty: 1, hasQty: false };
  return { code: m[1].trim(), qty, hasQty: true };
}

export function Picking({ orders, assemblies, products, warehouses, customers, balances, defaultWarehouse, error, onReload, onError, company }: Props) {
  const [picking, setPicking] = useState<any>(null);
  const [pickWh, setPickWh] = useState("");
  const [scanCode, setScanCode] = useState("");
  const [volumes, setVolumes] = useState(1);
  const [bypassOpen, setBypassOpen] = useState(false);
  const [bypassReason, setBypassReason] = useState("");
  const [approverEmail, setApproverEmail] = useState("");
  const [approverPassword, setApproverPassword] = useState("");
  const [bypassBusy, setBypassBusy] = useState(false);
  const [bypassError, setBypassError] = useState("");

  function warehouseStock(productId: string, warehouseId: string) {
    const onHand = (balances || [])
      .filter((b) => b.product_id === productId && b.warehouse_id === warehouseId)
      .reduce((n, b) => n + Number(b.quantity_available), 0);
    const reserved = (balances || [])
      .filter((b) => b.product_id === productId && b.warehouse_id === warehouseId)
      .reduce((n, b) => n + Number(b.quantity_reserved || 0), 0);
    const mine = requirements(picking, assemblies)[productId] || 0;
    return onHand - reserved + mine;
  }

  async function applyScan(raw: string) {
    if (!picking) return;
    const weighed = decodeWeightBarcode(raw);
    const { code, qty, hasQty } = weighed ? { code: weighed.sku, qty: weighed.weightKg, hasQty: true } : parseScanInput(raw);
    const q = code.trim().toLowerCase();
    if (!q) return;
    const product = products.find((p) => String(p.barcode).toLowerCase() === q || String(p.sku).toLowerCase() === q) || null;
    const warehouse = warehouses.find((w) => String(w.code).toLowerCase() === q) || null;
    const onOrder = !!product && (requirements(picking, assemblies)[product.id] || 0) > 0;
    if (warehouse && !hasQty && !onOrder) {
      setPickWh(warehouse.id);
      setScanCode("");
      onError("");
      return;
    }
    if (!product) {
      onError("Código não encontrado");
      return;
    }
    if (!onOrder) {
      onError("Produto não está no pedido");
      return;
    }
    const warehouseId = pickWh || picking.warehouse_id || defaultWarehouse;
    if (!warehouseId) {
      onError("Selecione o almoxarifado");
      return;
    }
    const kitLine = (picking.items || []).find((it: any) => it.product_id === product.id && kitComponents(it, assemblies));
    if (kitLine) {
      const comps = kitComponents(kitLine, assemblies) as Component[];
      if (!kitComponentsDone(picking, kitLine, comps)) {
        onError("Bipe todos os itens do kit antes de bipar o kit");
        return;
      }
    } else {
      const stock = warehouseStock(product.id, warehouseId);
      const already = pickedQty(picking, product.id);
      if (already + qty > stock + 1e-9) {
        onError(`Estoque insuficiente no almoxarifado (disp. ${stock})`);
        return;
      }
    }
    try {
      const updated = await salesApi.scanPick(picking.id, { product_id: product.id, warehouse_id: warehouseId, quantity: qty });
      setPicking(updated);
      setScanCode("");
      onError("");
      await onReload();
    } catch (err: any) {
      onError(err.message);
    }
  }

  function startPicking(o: any) {
    setPicking(o);
    setPickWh(o.warehouse_id || defaultWarehouse);
    setScanCode("");
    setVolumes(Math.max(1, Number(o.picking?.volume_count || 1)));
    onError("");
  }

  async function finishPicking() {
    if (!picking) return;
    if (!itemsDone(picking, assemblies)) {
      onError("Separe todos os itens");
      return;
    }
    if (volumes < 1) {
      onError("Informe a quantidade de volumes");
      return;
    }
    const tab = window.open("about:blank", "_blank");
    if (picking.status === "PICKED") {
      await printLabels({ ...picking, picking: { ...picking.picking, volume_count: volumes } }, personName(customers, picking.customer_id), tab, company);
      return;
    }
    try {
      const updated = await salesApi.completePicking(picking.id, volumes);
      setPicking(updated);
      await onReload();
      await printLabels(updated, personName(customers, updated.customer_id), tab, company);
      onError("");
    } catch (err: any) {
      tab?.close();
      onError(err.message);
    }
  }

  function openBypass() {
    setBypassReason("");
    setApproverEmail("");
    setApproverPassword("");
    setBypassError("");
    setBypassOpen(true);
  }

  async function confirmBypass() {
    if (!picking) return;
    if (volumes < 1) {
      setBypassError("Informe a quantidade de volumes");
      return;
    }
    if (!isMaster() && (!approverEmail || !approverPassword)) {
      setBypassError("Informe e-mail e senha de um admin para aprovar.");
      return;
    }
    setBypassBusy(true);
    setBypassError("");
    const tab = window.open("about:blank", "_blank");
    try {
      const updated = await salesApi.bypassPicking(picking.id, {
        volume_count: volumes,
        reason: bypassReason,
        approver_email: approverEmail,
        approver_password: approverPassword,
      });
      setPicking(updated);
      setBypassOpen(false);
      await onReload();
      await printLabels(updated, personName(customers, updated.customer_id), tab, company);
      onError("");
    } catch (err: any) {
      tab?.close();
      setBypassError(err.message);
    } finally {
      setBypassBusy(false);
    }
  }

  const pickableColumns: DataTableColumn<any>[] = [
    { key: "customer", label: "Cliente", value: (o) => personName(customers, o.customer_id) },
    { key: "picking", label: "Separação", value: (o) => sepNo(o.picking?.number) },
    { key: "status", label: "Status", value: (o) => o.status, render: (o) => <StatusBadge status={o.status} extra={o.delivery_note} /> },
    { key: "items", label: "Itens", value: (o) => itemSummary(o.items, products), render: (o) => <span className="muted">{itemSummary(o.items, products)}</span> },
    {
      key: "actions",
      label: "",
      sortable: false,
      filterable: false,
      render: (o) => (
        <div className="row" style={{ flexWrap: "nowrap", minWidth: 220 }}>
          <button type="button" className="secondary" disabled={o.status === "PICKED"} onClick={() => startPicking(o)}>Separar</button>
          {(o.status === "PICKING" || o.status === "PICKED") && (
            <button type="button" className="danger" onClick={async () => {
              if (!confirm("Desfazer separação?")) return;
              try {
                await salesApi.undoPicking(o.id);
                await onReload();
              } catch (err: any) {
                onError(err.message);
              }
            }}>Desfazer</button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="card">
      {!picking && (
        <DataTable
          columns={pickableColumns}
          rows={orders.filter((o) => o.status === "APPROVED" || o.status === "PICKING" || o.status === "PICKED")}
          rowKey={(o) => o.id}
          emptyMessage="Nenhum pedido para separar."
        />
      )}
      {picking && (
        <>
          <div className="row">
            <p>{personName(customers, picking.customer_id)} · Sep. {sepNo(picking.picking?.number)} · <StatusBadge status={picking.status} extra={picking.delivery_note} /></p>
            <button type="button" className="secondary" onClick={() => setPicking(null)}>Voltar</button>
            {(picking.status === "PICKING" || picking.status === "PICKED") && (
              <button type="button" className="danger" onClick={async () => {
                if (!confirm("Desfazer separação?")) return;
                try {
                  await salesApi.undoPicking(picking.id);
                  setPicking(null);
                  await onReload();
                } catch (err: any) {
                  onError(err.message);
                }
              }}>Desfazer</button>
            )}
          </div>
          {error && <p className="error">{error}</p>}
          <div className="row" style={{ marginTop: 12 }}>
            <div className="field">
              <label>Almoxarifado</label>
              <Autocomplete
                required
                value={pickWh}
                options={warehouses.map((w) => ({ value: w.id, code: w.code, description: w.name }))}
                onChange={setPickWh}
              />
            </div>
            <div className="field">
              <label>Bipar código / SKU / barras</label>
              <input
                value={scanCode}
                placeholder="SKU,qtd  ex: 000001,25"
                onChange={(e) => setScanCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyScan(scanCode);
                  }
                }}
              />
            </div>
            <button type="button" disabled={picking.status === "PICKED"} onClick={() => applyScan(scanCode)}>Bipar</button>
          </div>
          <p className="muted">Digite código,quantidade ou bipe o produto. Bipe a etiqueta de pesagem para lançar produto e peso automaticamente. Bipe o código do almoxarifado para trocar o destino. Informe os volumes e finalize para gerar as etiquetas.</p>
          <div className="table-wrap"><table>
            <thead>
              <tr>
                <th>Produto</th>
                <th>Pedido</th>
                <th>Separado</th>
              </tr>
            </thead>
            <tbody>
              {(picking.items || []).map((it: any) => {
                const p = products.find((x) => x.id === it.product_id);
                const comps = kitComponents(it, assemblies);
                if (comps && !legacyKitDone(picking, it, comps)) {
                  const compsDone = kitComponentsDone(picking, it, comps);
                  const kitDone = compsDone && pickedQty(picking, it.product_id) + 1e-9 >= Number(it.quantity);
                  return (
                    <Fragment key={it.product_id}>
                      <tr>
                        <td>
                          <strong>{p ? `${p.sku} — ${p.name}` : it.product_id}</strong> <span className="muted">(kit)</span>{" "}
                          <span className={`badge ${kitDone ? "ok" : "warn"}`}>
                            {kitDone ? "Kit completo" : compsDone ? "Bipe o kit" : "Bipe os itens"}
                          </span>
                        </td>
                        <td>{it.quantity}</td>
                        <td>{pickedQty(picking, it.product_id)}</td>
                      </tr>
                      {comps.map((c) => {
                        const cp = products.find((x) => x.id === c.product_id);
                        const done = pickedQty(picking, c.product_id);
                        return (
                          <tr key={`${it.product_id}:${c.product_id}`}>
                            <td style={{ paddingLeft: 24 }}>{cp ? `${cp.sku} — ${cp.name}` : c.product_id}</td>
                            <td>{c.quantity}</td>
                            <td>{done}</td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  );
                }
                const done = pickedQty(picking, it.product_id);
                return (
                  <tr key={it.product_id}>
                    <td>{p ? `${p.sku} — ${p.name}` : it.product_id}</td>
                    <td>{it.quantity}</td>
                    <td>{done}</td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
          <div className="row" style={{ marginTop: 12 }}>
            <div className="field">
              <label>Volumes / embalagens</label>
              <input type="number" min={1} value={volumes} onChange={(e) => setVolumes(Math.max(1, Number(e.target.value) || 1))} />
            </div>
            <button type="button" disabled={!itemsDone(picking, assemblies)} onClick={() => finishPicking()}>
              {picking.status === "PICKED" ? "Gerar etiquetas" : "Finalizar e gerar etiquetas"}
            </button>
            {picking.status !== "PICKED" && !itemsDone(picking, assemblies) && (
              <button type="button" className="secondary" onClick={openBypass}>Forçar finalização</button>
            )}
          </div>
        </>
      )}
      {bypassOpen && (
        <Modal title="Forçar finalização da separação" onClose={() => setBypassOpen(false)}>
          <p className="muted">
            Finaliza mesmo com itens faltando. Fica registrado em auditoria quem pediu
            {!isMaster() && " e qual admin aprovou"}.
          </p>
          {bypassError && <p className="error">{bypassError}</p>}
          <div className="field">
            <label>Motivo (opcional)</label>
            <input value={bypassReason} onChange={(e) => setBypassReason(e.target.value)} placeholder="Cliente aceitou receber o item em falta depois" />
          </div>
          {!isMaster() && (
            <div className="row" style={{ marginTop: 8 }}>
              <div className="field">
                <label>E-mail do admin</label>
                <input type="email" value={approverEmail} onChange={(e) => setApproverEmail(e.target.value)} />
              </div>
              <div className="field">
                <label>Senha do admin</label>
                <input type="password" value={approverPassword} onChange={(e) => setApproverPassword(e.target.value)} />
              </div>
            </div>
          )}
          <div className="row" style={{ marginTop: 12 }}>
            <button type="button" disabled={bypassBusy} onClick={confirmBypass}>
              {bypassBusy ? "Confirmando..." : "Confirmar bypass"}
            </button>
            <button type="button" className="secondary" onClick={() => setBypassOpen(false)}>Cancelar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
