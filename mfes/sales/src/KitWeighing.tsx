import { useEffect, useMemo, useRef, useState } from "react";
import { Autocomplete, CompanyHeaderInfo, encodeWeightBarcode, printWeightLabelPdf } from "@erp/shared";
import { formatDateTime } from "./helpers";
import { BAUD_RATES, useScaleSerial } from "./Weighing";

type Props = { products: any[]; assemblies: any[]; company?: CompanyHeaderInfo };

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function KitWeighing({ products, assemblies, company }: Props) {
  const [kitId, setKitId] = useState("");
  const [current, setCurrent] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [printed, setPrinted] = useState<Record<string, number>>({});
  const [baudRate, setBaudRate] = useState(9600);
  const weightRef = useRef<HTMLInputElement>(null);
  const scale = useScaleSerial((kg) => setWeightKg(kg.toFixed(3)));

  const kits = useMemo(() => assemblies.filter((a) => a.active !== false), [assemblies]);
  const kit = kits.find((a) => a.id === kitId) || null;
  const items = useMemo(
    () =>
      (kit?.items || []).map((it: any) => {
        const p = products.find((x) => x.id === it.product_id);
        return { ...it, product: p, weighable: !!p && p.sale_uom === "KG" };
      }),
    [kit, products],
  );
  const pending = items.filter((it: any) => it.weighable && printed[it.product_id] == null);
  const currentItem = items.find((it: any) => it.product_id === current) || null;

  useEffect(() => {
    setPrinted({});
    setWeightKg("");
    setCurrent("");
  }, [kitId]);

  useEffect(() => {
    if (kit && !current && pending.length > 0) setCurrent(pending[0].product_id);
  }, [kit, current, pending.length]);

  useEffect(() => {
    if (current) weightRef.current?.focus();
  }, [current]);

  const weight = Number(weightKg.replace(",", "."));
  const validWeight = Number.isFinite(weight) && weight > 0;

  function print(withPrice: boolean) {
    const p = currentItem?.product;
    if (!p || !validWeight) return;
    const unitPrice = Number(p.sale_price || 0);
    printWeightLabelPdf(
      [{ sku: p.sku, name: p.name, weightKg: weight, unitPrice, barcode: encodeWeightBarcode(p.sku, weight), printedAt: formatDateTime(new Date()) }],
      company,
      { withPrice },
    );
    const nextPrinted: Record<string, number> = { ...printed, [p.id]: weight };
    setPrinted(nextPrinted);
    setWeightKg("");
    const next = items.find((it: any) => it.weighable && nextPrinted[it.product_id] == null);
    setCurrent(next ? next.product_id : "");
  }

  return (
    <div className="card">
      <p className="muted">
        Escolha o kit, pese cada item vendido por peso e imprima a etiqueta (peso embutido no código de barras) para bipar na separação.
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
      <div className="row" style={{ marginTop: 12 }}>
        <div className="field">
          <label>Kit</label>
          <Autocomplete
            required
            value={kitId}
            options={kits.map((a) => ({ value: a.id, code: a.code, description: a.name }))}
            onChange={setKitId}
          />
        </div>
      </div>
      {kit && (
        <>
          <div className="table-wrap"><table>
            <thead>
              <tr>
                <th>Produto</th>
                <th>Qtd no kit</th>
                <th>Peso lido</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it: any) => {
                const p = it.product;
                const done = printed[it.product_id];
                return (
                  <tr key={it.product_id} style={it.product_id === current ? { background: "var(--panel-2)" } : undefined}>
                    <td>{p ? `${p.sku} — ${p.name}` : it.product_id}</td>
                    <td>{it.quantity} {p?.sale_uom || ""}</td>
                    <td>
                      {!it.weighable ? <span className="muted">não pesável</span> : done != null ? <span className="badge ok">{done.toFixed(3)} kg</span> : <span className="badge warn">pendente</span>}
                    </td>
                    <td>
                      {it.weighable && (
                        <button type="button" className="secondary" onClick={() => setCurrent(it.product_id)}>
                          {done != null ? "Repesar" : "Pesar"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
          {currentItem?.product && (
            <>
              <div className="row" style={{ marginTop: 12 }}>
                <div className="field field-narrow">
                  <label>Peso (kg) — {currentItem.product.name}</label>
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
                Preço/kg: {brl(Number(currentItem.product.sale_price || 0))}
                {validWeight && <> · Total: {brl(weight * Number(currentItem.product.sale_price || 0))}</>}
              </p>
            </>
          )}
          {pending.length === 0 && items.some((it: any) => it.weighable) && (
            <p className="muted" style={{ marginTop: 12 }}>Todos os itens pesáveis deste kit foram pesados. Escolha outro kit ou use "Repesar" em algum item.</p>
          )}
          {!items.some((it: any) => it.weighable) && (
            <p className="error" style={{ marginTop: 12 }}>Este kit não tem itens vendidos por peso (KG).</p>
          )}
        </>
      )}
      {kits.length === 0 && <p className="error" style={{ marginTop: 12 }}>Nenhum kit ativo cadastrado.</p>}
    </div>
  );
}
