import { FormEvent, useEffect, useState } from "react";
import { Modal } from "./Modal";
import { ProductForm } from "./ProductForm";
import { CategoryForm } from "./CategoryForm";
import { PersonForm } from "./PersonForm";
import { CodeInput } from "./CodeInput";
import { Category } from "./category";
import { configApi, stockApi } from "./api";

export function ProductCreateModal({
  onClose, onCreated, depth = 0,
}: { onClose: () => void; onCreated: (p: any) => void; depth?: number }) {
  const [units, setUnits] = useState<any[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  useEffect(() => {
    Promise.all([configApi.units(), stockApi.categories()]).then(([u, c]) => {
      setUnits(u);
      setCategories(c);
    });
  }, []);
  return (
    <Modal title="Novo produto" onClose={onClose} depth={depth}>
      <ProductForm
        units={units}
        categories={categories}
        onCategoriesChange={setCategories}
        onSaved={(p) => { onCreated(p); onClose(); }}
        onCancel={onClose}
      />
    </Modal>
  );
}

export function CategoryCreateModal({
  onClose, onCreated, depth = 0,
}: { onClose: () => void; onCreated: (c: any) => void; depth?: number }) {
  const [categories, setCategories] = useState<Category[]>([]);
  useEffect(() => {
    stockApi.categories().then(setCategories);
  }, []);
  return (
    <Modal title="Nova categoria" onClose={onClose} depth={depth}>
      <CategoryForm
        categories={categories}
        onSaved={(c) => { onCreated(c); onClose(); }}
        onCancel={onClose}
      />
    </Modal>
  );
}

export function PersonCreateModal({
  role, onClose, onCreated, depth = 0,
}: { role: "customer" | "supplier"; onClose: () => void; onCreated: (p: any) => void; depth?: number }) {
  return (
    <Modal title={role === "customer" ? "Novo cliente" : "Novo fornecedor"} onClose={onClose} depth={depth}>
      <PersonForm
        submitLabel="Cadastrar"
        onCancel={onClose}
        onSave={async (body) => {
          const p = role === "customer"
            ? await configApi.createCustomer(body)
            : await configApi.createSupplier(body);
          onCreated(p);
          onClose();
        }}
      />
    </Modal>
  );
}

export function WarehouseCreateModal({
  onClose, onCreated, depth = 0,
}: { onClose: () => void; onCreated: (w: any) => void; depth?: number }) {
  const [error, setError] = useState("");
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    try {
      const w = await stockApi.createWarehouse({ code: f.get("code"), name: f.get("name") });
      form.reset();
      onCreated(w);
      onClose();
    } catch (err: any) {
      setError(err.message);
    }
  }
  return (
    <Modal title="Novo almoxarifado" onClose={onClose} depth={depth}>
      <form className="row" onSubmit={save}>
        {error && <p className="error">{error}</p>}
        <CodeInput />
        <div className="field"><label>Nome</label><input name="name" required /></div>
        <button>Cadastrar</button>
        <button type="button" className="secondary" onClick={onClose}>Cancelar</button>
      </form>
    </Modal>
  );
}
