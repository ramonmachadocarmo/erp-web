import { FormEvent, useState } from "react";
import { Autocomplete } from "./Autocomplete";
import { configApi } from "./api";

const kinds = [
  { value: "PF", code: "PF", description: "Pessoa física" },
  { value: "PJ", code: "PJ", description: "Pessoa jurídica" },
];

const genders = [
  { value: "M", code: "M", description: "Masculino" },
  { value: "F", code: "F", description: "Feminino" },
  { value: "O", code: "O", description: "Outro" },
];

type Address = {
  alias: string;
  zip: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  lat?: number | null;
  lng?: number | null;
};

const emptyAddress = (): Address => ({
  alias: "", zip: "", street: "", number: "", complement: "", district: "", city: "", state: "",
});

type Props = {
  editing?: any;
  onCancel?: () => void;
  onSave: (body: unknown) => Promise<void>;
  submitLabel?: string;
};

export function PersonForm({ editing, onCancel, onSave, submitLabel }: Props) {
  const [kind, setKind] = useState(editing?.kind ?? "PF");
  const [addresses, setAddresses] = useState<Address[]>(editing?.addresses ?? []);
  const [draft, setDraft] = useState<Address>(emptyAddress());
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  function patch(partial: Partial<Address>) {
    setDraft((d) => ({ ...d, ...partial }));
  }

  async function searchCep() {
    setError("");
    setBusy("cep");
    try {
      const a = await configApi.lookupCep(draft.zip);
      patch({
        zip: a.zip || draft.zip,
        street: a.street || draft.street,
        complement: a.complement || draft.complement,
        district: a.district || draft.district,
        city: a.city || draft.city,
        state: a.state || draft.state,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function fromLocation() {
    setError("");
    if (!navigator.geolocation) {
      setError("Geolocalização indisponível");
      return;
    }
    setBusy("geo");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const a = await configApi.lookupGeo(pos.coords.latitude, pos.coords.longitude);
          patch({
            zip: a.zip || "",
            street: a.street || "",
            number: a.number || "",
            complement: a.complement || "",
            district: a.district || "",
            city: a.city || "",
            state: a.state || "",
            lat: a.lat,
            lng: a.lng,
          });
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy("");
        }
      },
      (err) => {
        setError(err.message);
        setBusy("");
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  }

  function addAddress() {
    const row = { ...draft, alias: draft.alias.trim(), state: draft.state.toUpperCase() };
    if (!row.alias && !row.zip && !row.street && !row.city) return;
    if (editIndex === null) setAddresses([...addresses, row]);
    else setAddresses(addresses.map((a, i) => (i === editIndex ? row : a)));
    setDraft(emptyAddress());
    setEditIndex(null);
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await onSave({
        kind,
        document: f.get("document"),
        name: f.get("name"),
        phone: f.get("phone"),
        addresses,
        birth_date: kind === "PF" ? f.get("birth_date") : "",
        gender: kind === "PF" ? f.get("gender") : "",
        company_name: kind === "PJ" ? f.get("company_name") : "",
        responsible_name: kind === "PJ" ? f.get("responsible_name") : "",
      });
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="row">
        <div className="field">
          <label>Tipo</label>
          <Autocomplete value={kind} options={kinds} required onChange={setKind} />
        </div>
        <div className="field">
          <label>{kind === "PJ" ? "CNPJ" : "CPF"}</label>
          <input name="document" defaultValue={editing?.document ?? ""} />
        </div>
        <div className="field">
          <label>Nome</label>
          <input name="name" required defaultValue={editing?.name ?? ""} />
        </div>
        <div className="field">
          <label>Telefone</label>
          <input name="phone" required defaultValue={editing?.phone ?? ""} />
        </div>
      </div>
      {kind === "PF" && (
        <div className="row" style={{ marginTop: 12 }}>
          <div className="field">
            <label>Data de nascimento</label>
            <input name="birth_date" type="date" defaultValue={editing?.birth_date ?? ""} />
          </div>
          <div className="field">
            <label>Gênero</label>
            <Autocomplete name="gender" defaultValue={editing?.gender ?? ""} options={genders} allowEmpty emptyLabel="—" />
          </div>
        </div>
      )}
      {kind === "PJ" && (
        <div className="row" style={{ marginTop: 12 }}>
          <div className="field">
            <label>Razão social</label>
            <input name="company_name" defaultValue={editing?.company_name ?? ""} />
          </div>
          <div className="field">
            <label>Nome do responsável</label>
            <input name="responsible_name" defaultValue={editing?.responsible_name ?? ""} />
          </div>
        </div>
      )}
      <h2 style={{ marginTop: 16 }}>Endereços</h2>
      <p className="muted">Opcional. Alias identifica o local (Casa, Fazenda, Entrega).</p>
      {error && <p className="error">{error}</p>}
      <div className="row" style={{ marginTop: 8 }}>
        <div className="field"><label>Alias</label><input value={draft.alias} onChange={(e) => patch({ alias: e.target.value })} placeholder="Casa" /></div>
        <div className="field"><label>CEP</label><input value={draft.zip} onChange={(e) => patch({ zip: e.target.value })} /></div>
        <button type="button" className="secondary" disabled={busy !== ""} onClick={searchCep}>{busy === "cep" ? "Buscando..." : "Buscar CEP"}</button>
        <button type="button" className="secondary" disabled={busy !== ""} onClick={fromLocation}>{busy === "geo" ? "Localizando..." : "Usar localização"}</button>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <div className="field"><label>Logradouro</label><input value={draft.street} onChange={(e) => patch({ street: e.target.value })} /></div>
        <div className="field field-narrow"><label>Número</label><input value={draft.number} onChange={(e) => patch({ number: e.target.value })} /></div>
        <div className="field"><label>Complemento</label><input value={draft.complement} onChange={(e) => patch({ complement: e.target.value })} /></div>
        <div className="field"><label>Bairro</label><input value={draft.district} onChange={(e) => patch({ district: e.target.value })} /></div>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <div className="field"><label>Cidade</label><input value={draft.city} onChange={(e) => patch({ city: e.target.value })} /></div>
        <div className="field field-narrow"><label>UF</label><input maxLength={2} value={draft.state} onChange={(e) => patch({ state: e.target.value })} /></div>
        <button type="button" className="secondary" onClick={addAddress}>{editIndex === null ? "Incluir endereço" : "Atualizar endereço"}</button>
        {editIndex !== null && <button type="button" className="secondary" onClick={() => { setDraft(emptyAddress()); setEditIndex(null); }}>Cancelar</button>}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Alias</th><th>CEP</th><th>Logradouro</th><th>Cidade</th><th>UF</th><th></th></tr>
          </thead>
          <tbody>
            {addresses.map((a, i) => (
              <tr key={i}>
                <td>{a.alias || "—"}</td>
                <td>{a.zip}</td>
                <td>{[a.street, a.number].filter(Boolean).join(", ")}</td>
                <td>{a.city}</td>
                <td>{a.state}</td>
                <td className="row">
                  <button type="button" className="secondary" onClick={() => { setDraft(a); setEditIndex(i); }}>Editar</button>
                  <button type="button" className="secondary" onClick={() => setAddresses(addresses.filter((_, j) => j !== i))}>Remover</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button>{submitLabel || (editing ? "Salvar" : "Adicionar")}</button>
        {onCancel && <button type="button" className="secondary" onClick={onCancel}>Cancelar</button>}
      </div>
    </form>
  );
}
