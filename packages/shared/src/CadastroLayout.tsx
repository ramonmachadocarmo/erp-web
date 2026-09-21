import { ReactNode } from "react";

type Props = {
  formTitle?: string;
  listTitle?: string;
  formOpen: boolean;
  listOpen?: boolean;
  onFormOpen: (open: boolean) => void;
  onListOpen?: (open: boolean) => void;
  form: ReactNode;
  list: ReactNode;
};

export function CadastroLayout({
  formTitle = "Cadastro",
  listTitle = "Listagem",
  formOpen,
  listOpen = true,
  onFormOpen,
  onListOpen,
  form,
  list,
}: Props) {
  return (
    <div className="cadastro">
      <section className="card">
        <button type="button" className="collapse-head" onClick={() => onFormOpen(!formOpen)}>
          <span>{formTitle}</span>
          <span className="muted">{formOpen ? "ocultar" : "mostrar"}</span>
        </button>
        {formOpen && form}
      </section>
      <section className="card">
        {onListOpen ? (
          <button type="button" className="collapse-head" onClick={() => onListOpen(!listOpen)}>
            <span>{listTitle}</span>
            <span className="muted">{listOpen ? "ocultar" : "mostrar"}</span>
          </button>
        ) : (
          <div className="collapse-head"><span>{listTitle}</span></div>
        )}
        {listOpen && list}
      </section>
    </div>
  );
}
