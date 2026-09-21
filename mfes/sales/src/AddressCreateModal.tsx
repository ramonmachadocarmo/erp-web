import { FormEvent, useState } from "react";
import { configApi } from "@erp/shared";

export function AddressCreateModal({ customer, onClose, onCreated }: { customer: any; onClose: () => void; onCreated: (id: string) => void | Promise<void> }) {
  const [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const row = {
      alias: String(f.get("alias") || "").trim(),
      zip: String(f.get("zip") || "").trim(),
      street: String(f.get("street") || "").trim(),
      number: String(f.get("number") || "").trim(),
      complement: String(f.get("complement") || "").trim(),
      district: String(f.get("district") || "").trim(),
      city: String(f.get("city") || "").trim(),
      state: String(f.get("state") || "").trim().toUpperCase(),
    };
    if (!row.alias && !row.street) return;
    try {
      await configApi.updateCustomer(customer.id, { ...customer, addresses: [...(customer.addresses || []), row] });
      const list = await configApi.customers();
      const fresh = list.find((x: any) => x.id === customer.id);
      const found = (fresh?.addresses || []).find((a: any) => a.alias === row.alias && a.street === row.street) || (fresh?.addresses || []).at(-1);
      await onCreated(found?.id || "");
    } catch (err: any) {
      setError(err.message);
    }
  }
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal" onClick={(e) => e.stopPropagation()}>
        <h2>Novo endereço</h2>
        {error && <p className="error">{error}</p>}
        <form onSubmit={submit}>
          <div className="row">
            <div className="field"><label>Alias</label><input name="alias" placeholder="Casa" required /></div>
            <div className="field"><label>CEP</label><input name="zip" /></div>
          </div>
          <div className="row">
            <div className="field"><label>Logradouro</label><input name="street" /></div>
            <div className="field"><label>Número</label><input name="number" /></div>
          </div>
          <div className="row">
            <div className="field"><label>Complemento</label><input name="complement" /></div>
            <div className="field"><label>Bairro</label><input name="district" /></div>
          </div>
          <div className="row">
            <div className="field"><label>Cidade</label><input name="city" /></div>
            <div className="field"><label>UF</label><input name="state" maxLength={2} /></div>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button type="button" className="secondary" onClick={onClose}>Cancelar</button>
            <button>Salvar</button>
          </div>
        </form>
      </div>
    </div>
  );
}
