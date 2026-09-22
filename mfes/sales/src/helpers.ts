import { CompanyHeaderInfo, LabelAddress, openLabelPdfForCompany } from "@erp/shared";

export function personOption(p: any) {
  return { value: p.id, code: p.document, description: p.kind === "PJ" ? p.company_name || p.name : p.name };
}

export function personName(list: any[], id: string) {
  const p = list.find((x) => x.id === id);
  if (!p) return id;
  return p.kind === "PJ" ? p.company_name || p.name : p.name;
}

export function addrLabel(a: any) {
  if (!a) return "—";
  const line = [a.street && `${a.street}${a.number ? `, ${a.number}` : ""}`, a.complement, a.district, a.city && `${a.city}${a.state ? `/${a.state}` : ""}`, a.zip].filter(Boolean).join(" · ");
  return a.alias ? (line ? `${a.alias} — ${line}` : a.alias) : line || "—";
}

export function sepNo(n: number) {
  if (!n) return "—";
  return String(n).padStart(6, "0");
}

export function orderNo(id: string) {
  return (id || "").slice(0, 8).toUpperCase();
}

/** "2026-09-25" -> "25/09/2026" (a data vem do backend só como dia, sem fuso). */
export function fmtDate(d?: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
}

/** Hoje no fuso local, em YYYY-MM-DD (valor de <input type="date">). */
export function todayISO() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

export function km(m: number) {
  return `${(Number(m || 0) / 1000).toFixed(1)} km`;
}

export function mins(s: number) {
  const n = Math.round(Number(s || 0) / 60);
  return `${n} min`;
}

function labelAddress(a: any): LabelAddress {
  if (!a) return {};
  return { street: a.street, number: a.number, complement: a.complement, district: a.district, city: a.city, state: a.state, zip: a.zip };
}

export async function printLabels(order: any, customer: string, tab?: Window | null, company?: CompanyHeaderInfo) {
  const n = Math.max(1, Number(order?.picking?.volume_count || 0));
  const labels = Array.from({ length: n }, (_, i) => ({
    orderNo: orderNo(order.id),
    sepNo: sepNo(order?.picking?.number),
    customer,
    address: labelAddress(order.address),
    volume: i + 1,
    volumes: n,
  }));
  await openLabelPdfForCompany(labels, `etiquetas-${orderNo(order.id)}.pdf`, tab, company);
}

export function onHandMap(balances: any[]) {
  const m: Record<string, number> = {};
  for (const b of balances || []) {
    m[b.product_id] = (m[b.product_id] || 0) + Number(b.quantity_available);
  }
  return m;
}

export function freeMap(balances: any[]) {
  const m: Record<string, number> = {};
  for (const b of balances || []) {
    m[b.product_id] = (m[b.product_id] || 0) + Number(b.quantity_available) - Number(b.quantity_reserved || 0);
  }
  return m;
}

export function withOrderStock(free: Record<string, number>, items: any[]) {
  const m = { ...free };
  for (const it of items || []) {
    m[it.product_id] = (m[it.product_id] || 0) + Number(it.quantity);
  }
  return m;
}

export function orderShort(items: any[], onHand: Record<string, number>) {
  return (items || []).some((it) => Number(it.quantity) > (onHand[it.product_id] ?? 0) + 1e-9);
}

export function formatDateTime(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  const date = `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
  const time = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  return `${date} ${time}`;
}

export function itemSummary(items: any[], products: any[]) {
  return (items || [])
    .map((it) => {
      const p = products.find((x) => x.id === it.product_id);
      return `${p?.sku || it.product_id} × ${it.quantity}`;
    })
    .join(", ");
}
