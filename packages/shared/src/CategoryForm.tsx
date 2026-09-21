import { FormEvent, useState } from "react";
import { Autocomplete } from "./Autocomplete";
import { flattenCats, Category } from "./category";
import { stockApi } from "./api";

type Props = {
  categories: Category[];
  editing?: any;
  onSaved: (c: any) => void;
  onCancel?: () => void;
};

export function CategoryForm({ categories, editing, onSaved, onCancel }: Props) {
  const [error, setError] = useState("");

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const body = {
      name: String(f.get("name") || ""),
      parent_id: String(f.get("parent_id") || ""),
    };
    try {
      const out = editing
        ? await stockApi.updateCategory(editing.id, body).then(() => ({ ...editing, ...body }))
        : await stockApi.createCategory(body);
      form.reset();
      onSaved(out);
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <form key={editing?.id ?? "new"} onSubmit={save}>
      {error && <p className="error">{error}</p>}
      <div className="row">
        <div className="field"><label>Nome</label><input name="name" required defaultValue={editing?.name ?? ""} /></div>
        <div className="field">
          <label>Categoria pai</label>
          <Autocomplete
            name="parent_id"
            allowEmpty
            emptyLabel="Raiz"
            defaultValue={editing?.parent_id ?? ""}
            options={flattenCats(categories, "", editing?.id)}
          />
        </div>
        <button>{editing ? "Salvar categoria" : "Adicionar categoria"}</button>
        {editing && onCancel && <button type="button" className="secondary" onClick={onCancel}>Cancelar</button>}
      </div>
    </form>
  );
}
