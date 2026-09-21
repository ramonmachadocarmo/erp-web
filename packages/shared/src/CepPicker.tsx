import { Modal } from "./Modal";
import { configApi } from "./api";

export type CepAddress = {
  zip?: string;
  street?: string;
  complement?: string;
  district?: string;
  city?: string;
  state?: string;
};

/** Busca o(s) CEP(s) a partir de UF + cidade + logradouro (bairro só refina). Lança Error com mensagem para a tela. */
export async function searchCepByAddress(d: { street?: string; district?: string; city?: string; state?: string }): Promise<CepAddress[]> {
  const street = (d.street ?? "").trim();
  const city = (d.city ?? "").trim();
  const state = (d.state ?? "").trim();
  if (state.length !== 2 || city.length < 3 || street.length < 3) {
    throw new Error("Para buscar o CEP, preencha logradouro (3+ letras), cidade e UF.");
  }
  try {
    return await configApi.searchCep({ state, city, street, district: (d.district ?? "").trim() });
  } catch (e) {
    if (/not found/i.test((e as Error).message)) throw new Error("Nenhum CEP encontrado para esse endereço.");
    throw e;
  }
}

/** Lista de CEPs encontrados; o usuário escolhe qual usar. */
export function CepPicker({ results, onPick, onClose }: { results: CepAddress[]; onPick: (a: CepAddress) => void; onClose: () => void }) {
  return (
    <Modal title="Selecione o CEP" onClose={onClose} depth={2}>
      <p className="muted">{results.length} resultado(s). Informe também o bairro para refinar a busca.</p>
      <div className="cep-list">
        {results.map((a, i) => (
          <button key={`${a.zip}-${i}`} type="button" className="secondary cep-item" onClick={() => onPick(a)}>
            <strong>{a.zip}</strong>
            <span className="muted">
              {[a.street, a.complement].filter(Boolean).join(" — ")} · {a.district || "—"} · {a.city}/{a.state}
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
