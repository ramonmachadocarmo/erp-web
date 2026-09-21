import { FormEvent, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Autocomplete, AuditLogEntry, CadastroLayout, CepPicker, CodeInput, DataTable, DataTableColumn, Loading, MapPicker, MENU, MenuGroup, MODULES, MODULE_LABELS, PersonForm, Role, WarehouseCreateModal, auditApi, configApi, identityApi, readLogoFile, rolesApi, searchCepByAddress, stockApi, getToken, getUser, setSession, usePermission } from "@erp/shared";

function flattenLeaves(section: MenuGroup): { to: string; label: string }[] {
  return [...(section.items ?? []), ...(section.groups ?? []).flatMap(flattenLeaves)];
}

function LevelSelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(Number(e.target.value))}>
      <option value={0}>Nenhum</option>
      <option value={1}>Visualizar</option>
      <option value={2}>Editar</option>
    </select>
  );
}

function personName(p: any) {
  return p.kind === "PJ" ? (p.company_name || p.name) : p.name;
}

const titles: Record<string, string> = {
  unidades: "Unidades",
  clientes: "Clientes",
  fornecedores: "Fornecedores",
  pagamento: "Pagamento",
  regras: "Regras",
  empresa: "Empresa",
  auditoria: "Auditoria",
  centros: "Centros de distribuição",
  veiculos: "Veículos",
  usuarios: "Usuários",
  perfis: "Perfis",
};

export default function App() {
  const page = useLocation().pathname.split("/").filter(Boolean).pop() || "unidades";
  const [units, setUnits] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [quoteRequired, setQuoteRequired] = useState(false);
  const [defaultWarehouse, setDefaultWarehouse] = useState("");
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [warehouseModal, setWarehouseModal] = useState(false);
  const [methods, setMethods] = useState<any[]>([]);
  const [terms, setTerms] = useState<any[]>([]);
  const [centers, setCenters] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [moduleMatrix, setModuleMatrix] = useState<Record<string, number>>({});
  const [menuMatrix, setMenuMatrix] = useState<Record<string, number>>({});
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [editingUnit, setEditingUnit] = useState<any>(null);
  const [editingCustomer, setEditingCustomer] = useState<any>(null);
  const [editingSupplier, setEditingSupplier] = useState<any>(null);
  const [editingMethod, setEditingMethod] = useState<any>(null);
  const [editingTerm, setEditingTerm] = useState<any>(null);
  const [editingCenter, setEditingCenter] = useState<any>(null);
  const [editingVehicle, setEditingVehicle] = useState<any>(null);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [centerDraft, setCenterDraft] = useState<any>(null);
  const [centerBusy, setCenterBusy] = useState("");
  const [installments, setInstallments] = useState<{ days: number; percent: number }[]>([{ days: 0, percent: 100 }]);
  const [companyDraft, setCompanyDraft] = useState<any>(null);
  const [companyBusy, setCompanyBusy] = useState("");
  const [cepResults, setCepResults] = useState<{ target: "center" | "company"; list: any[] } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [listOpen, setListOpen] = useState(true);
  const [termFormOpen, setTermFormOpen] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const [auditLimit, setAuditLimit] = useState(10);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditModule, setAuditModule] = useState("");
  const [auditMethod, setAuditMethod] = useState("");
  const [auditEmail, setAuditEmail] = useState("");

  async function loadAuditLogs(targetPage: number) {
    setAuditLoading(true);
    try {
      const res = await auditApi.logs({
        module: auditModule || undefined,
        method: auditMethod || undefined,
        user_email: auditEmail || undefined,
        page: targetPage,
        limit: auditLimit,
      });
      setAuditLogs(res.items);
      setAuditTotal(res.total);
      setAuditPage(res.page);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAuditLoading(false);
    }
  }

  useEffect(() => {
    if (page === "auditoria") loadAuditLogs(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, auditLimit]);

  const auditTotalPages = Math.max(1, Math.ceil(auditTotal / auditLimit));

  async function load() {
    try {
      const [u, c, s, setting, warehouseSetting, m, t, w, cds, vs, us, co, rs] = await Promise.all([
        configApi.units(),
        configApi.customers(),
        configApi.suppliers(),
        configApi.setting("purchase_quote_required").catch(() => ({ value: "false" })),
        configApi.setting("default_warehouse_id").catch(() => ({ value: "" })),
        configApi.paymentMethods(),
        configApi.paymentTerms(),
        stockApi.warehouses().catch(() => []),
        configApi.centers().catch(() => []),
        configApi.vehicles().catch(() => []),
        identityApi.users().catch(() => []),
        configApi.company().catch(() => null),
        rolesApi.list().catch(() => []),
      ]);
      setUnits(u);
      setCustomers(c);
      setSuppliers(s);
      setQuoteRequired(setting.value === "true");
      setDefaultWarehouse(warehouseSetting.value || "");
      setMethods(m);
      setTerms(t);
      setWarehouses(w);
      setCenters(cds);
      setVehicles(vs);
      setUsers(us);
      if (co) setCompanyDraft(co);
      setRoles(rs);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    setFormOpen(false);
    setListOpen(true);
    setTermFormOpen(false);
    setError("");
  }, [page]);

  async function saveUnit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const body = { code: f.get("code"), name: f.get("name"), symbol: f.get("symbol") };
    try {
      if (editingUnit) await configApi.updateUnit(editingUnit.id, body);
      else await configApi.createUnit(body);
      setEditingUnit(null);
      form.reset();
      setFormOpen(false);
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function saveCustomer(body: unknown) {
    if (editingCustomer) await configApi.updateCustomer(editingCustomer.id, body);
    else await configApi.createCustomer(body);
    setEditingCustomer(null);
    setFormOpen(false);
    await load();
  }

  async function removeCustomer(id: string) {
    setError("");
    try {
      await configApi.deleteCustomer(id);
      if (editingCustomer?.id === id) setEditingCustomer(null);
      await load();
    } catch (err: any) {
      setError(err.message === "cannot delete: record is in use"
        ? "Cliente em uso."
        : err.message);
    }
  }

  async function saveSupplier(body: unknown) {
    if (editingSupplier) await configApi.updateSupplier(editingSupplier.id, body);
    else await configApi.createSupplier(body);
    setEditingSupplier(null);
    setFormOpen(false);
    await load();
  }

  async function removeSupplier(id: string) {
    setError("");
    try {
      await configApi.deleteSupplier(id);
      if (editingSupplier?.id === id) setEditingSupplier(null);
      await load();
    } catch (err: any) {
      setError(err.message === "cannot delete: record is in use"
        ? "Fornecedor em uso."
        : err.message);
    }
  }

  async function saveMethod(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const body = {
      code: f.get("code"),
      name: f.get("name"),
      fee_percent: Number(f.get("fee_percent") || 0),
      fee_fixed: Number(f.get("fee_fixed") || 0),
      active: true,
    };
    try {
      if (editingMethod) await configApi.updatePaymentMethod(editingMethod.id, body);
      else await configApi.createPaymentMethod(body);
      setEditingMethod(null);
      form.reset();
      setFormOpen(false);
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function saveTerm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const sum = installments.reduce((s, i) => s + Number(i.percent || 0), 0);
    if (Math.abs(sum - 100) > 0.05) {
      setError(`A soma dos percentuais é ${sum.toFixed(2)}%, deve ser 100%.`);
      return;
    }
    const body = { code: f.get("code"), name: f.get("name"), installments, active: true };
    try {
      if (editingTerm) await configApi.updatePaymentTerm(editingTerm.id, body);
      else await configApi.createPaymentTerm(body);
      setEditingTerm(null);
      setInstallments([{ days: 0, percent: 100 }]);
      form.reset();
      setTermFormOpen(false);
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  function openCenter(c?: any) {
    setEditingCenter(c || null);
    setCenterDraft(c ? { ...c } : { warehouse_id: "", lat: 0, lng: 0, zip: "", street: "", number: "", complement: "", district: "", city: "", state: "" });
    setFormOpen(true);
  }

  async function saveCenter(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = {
      ...centerDraft,
      code: f.get("code"),
      name: f.get("name"),
      warehouse_id: centerDraft?.warehouse_id,
      zip: f.get("zip"),
      street: f.get("street"),
      number: f.get("number"),
      complement: f.get("complement"),
      district: f.get("district"),
      city: f.get("city"),
      state: String(f.get("state") || "").toUpperCase(),
      lat: Number(centerDraft?.lat || 0),
      lng: Number(centerDraft?.lng || 0),
      active: true,
    };
    try {
      if (editingCenter) await configApi.updateCenter(editingCenter.id, body);
      else await configApi.createCenter(body);
      setEditingCenter(null);
      setCenterDraft(null);
      setFormOpen(false);
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function onMapClick(lat: number, lng: number) {
    setCenterDraft((d: any) => ({ ...d, lat, lng }));
    try {
      const a = await configApi.lookupGeo(lat, lng);
      setCenterDraft((d: any) => ({
        ...d, lat, lng,
        zip: a.zip || d.zip,
        street: a.street || d.street,
        number: a.number || d.number,
        district: a.district || d.district,
        city: a.city || d.city,
        state: a.state || d.state,
      }));
    } catch {
      /* keep coords */
    }
  }

  async function searchCenterCep(zip?: string) {
    const cep = String(zip ?? centerDraft?.zip ?? "").replace(/\D/g, "");
    if (cep.length !== 8) {
      setError("CEP inválido");
      return;
    }
    setError("");
    setCenterBusy("cep");
    try {
      const a = await configApi.lookupCep(cep);
      const next = {
        zip: a.zip || cep,
        street: a.street || "",
        complement: a.complement || "",
        district: a.district || "",
        city: a.city || "",
        state: a.state || "",
      };
      setCenterDraft((d: any) => ({ ...d, ...next }));
      const q = [next.street, next.district, next.city, next.state, next.zip, "Brasil"].filter(Boolean).join(", ");
      try {
        const g = await configApi.searchGeo(q);
        if (g.lat != null && g.lng != null) {
          setCenterDraft((d: any) => ({ ...d, ...next, lat: g.lat, lng: g.lng, zip: g.zip || next.zip, street: g.street || next.street, district: g.district || next.district, city: g.city || next.city, state: g.state || next.state }));
        }
      } catch {
        /* address filled, map still needs a click */
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCenterBusy("");
    }
  }

  // Inverso de "Buscar endereço": descobre o CEP a partir de logradouro + cidade + UF (bairro refina).
  function applyFoundCep(target: "center" | "company", a: any) {
    const set = target === "center" ? setCenterDraft : setCompanyDraft;
    set((d: any) => ({
      ...d,
      zip: a.zip || d.zip,
      street: a.street || d.street,
      district: a.district || d.district,
      city: a.city || d.city,
      state: a.state || d.state,
    }));
    setCepResults(null);
  }

  async function findCep(target: "center" | "company") {
    const draft = target === "center" ? centerDraft : companyDraft;
    const setBusy = target === "center" ? setCenterBusy : setCompanyBusy;
    setError("");
    setBusy("findcep");
    try {
      const list = await searchCepByAddress(draft);
      if (list.length === 1) applyFoundCep(target, list[0]);
      else setCepResults({ target, list });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function searchCompanyCep(zip?: string) {
    const cep = String(zip ?? companyDraft?.zip ?? "").replace(/\D/g, "");
    if (cep.length !== 8) {
      setError("CEP inválido");
      return;
    }
    setError("");
    setCompanyBusy("cep");
    try {
      const a = await configApi.lookupCep(cep);
      setCompanyDraft((d: any) => ({
        ...d,
        zip: a.zip || cep,
        street: a.street || "",
        complement: a.complement || "",
        district: a.district || "",
        city: a.city || "",
        state: a.state || "",
      }));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCompanyBusy("");
    }
  }

  async function onLogoChange(file: File | undefined) {
    if (!file) return;
    setError("");
    try {
      const { dataUrl, width, height } = await readLogoFile(file);
      setCompanyDraft((d: any) => ({ ...d, logo: dataUrl, logo_width: width, logo_height: height }));
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function saveCompany(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = {
      ...companyDraft,
      name: f.get("name"),
      document: f.get("document"),
      phone: f.get("phone"),
      email: f.get("email"),
      zip: f.get("zip"),
      street: f.get("street"),
      number: f.get("number"),
      complement: f.get("complement"),
      district: f.get("district"),
      city: f.get("city"),
      state: String(f.get("state") || "").toUpperCase(),
    };
    setCompanyBusy("save");
    try {
      const saved = await configApi.updateCompany(body);
      setCompanyDraft(saved);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCompanyBusy("");
    }
  }

  async function saveVehicle(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const body = {
      code: f.get("code"),
      name: f.get("name"),
      capacity_m3: Number(f.get("capacity_m3")),
      capacity_kg: Number(f.get("capacity_kg")),
      active: true,
    };
    try {
      if (editingVehicle) await configApi.updateVehicle(editingVehicle.id, body);
      else await configApi.createVehicle(body);
      setEditingVehicle(null);
      form.reset();
      setFormOpen(false);
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function removeUser(id: string) {
    try {
      await identityApi.deleteUser(id);
      if (editingUser?.id === id) { setEditingUser(null); setFormOpen(false); }
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function removeRole(id: string) {
    try {
      await rolesApi.delete(id);
      if (editingRole?.id === id) { setEditingRole(null); setFormOpen(false); }
      await load();
    } catch (err: any) {
      setError(err.message === "cannot delete: role is assigned to a user"
        ? "Perfil em uso por um ou mais usuários."
        : err.message);
    }
  }

  async function saveUser(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const password = String(f.get("password") || "");
    const body: Record<string, string> = {
      name: String(f.get("name") || ""),
      email: String(f.get("email") || ""),
      role_id: String(f.get("role_id") || ""),
    };
    if (password) body.password = password;
    try {
      const saved = editingUser
        ? await identityApi.updateUser(editingUser.id, body)
        : await identityApi.createUser({ ...body, password });
      const token = getToken();
      const me = getUser();
      if (token && me?.id === saved.id) setSession(token, saved);
      setEditingUser(null);
      form.reset();
      setFormOpen(false);
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function saveRole(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = { code: String(f.get("code") || ""), name: String(f.get("name") || "") };
    try {
      const saved = editingRole ? await rolesApi.update(editingRole.id, body) : await rolesApi.create(body);
      setEditingRole(saved);
      setFormOpen(true);
      await load();
      await loadMatrix(saved.id);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function loadMatrix(roleId: string) {
    try {
      const { modules, menus } = await rolesApi.permissions(roleId);
      setModuleMatrix(Object.fromEntries(modules.map((m) => [m.module, m.level])));
      setMenuMatrix(Object.fromEntries(menus.map((m) => [m.menu_key, m.level])));
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function savePermissions() {
    if (!editingRole) return;
    try {
      await rolesApi.setPermissions(editingRole.id, {
        modules: MODULES.filter((m) => moduleMatrix[m] > 0).map((m) => ({ module: m, level: moduleMatrix[m] })),
        menus: Object.entries(menuMatrix).filter(([, l]) => l > 0).map(([menu_key, level]) => ({ menu_key, level })),
      });
    } catch (err: any) {
      setError(err.message);
    }
  }

  const unitColumns: DataTableColumn<any>[] = [
    { key: "code", label: "Código" },
    { key: "name", label: "Nome" },
    { key: "symbol", label: "Símbolo" },
    {
      key: "actions", label: "", sortable: false, filterable: false,
      render: (u) => <button className="secondary" onClick={() => { setEditingUnit(u); setFormOpen(true); }}>Editar</button>,
    },
  ];

  const customerColumns: DataTableColumn<any>[] = [
    { key: "kind", label: "Tipo" },
    { key: "document", label: "Documento" },
    { key: "name", label: "Nome", value: (c) => personName(c) },
    { key: "phone", label: "Telefone" },
    {
      key: "actions", label: "", sortable: false, filterable: false,
      render: (c) => (
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <button className="secondary" onClick={() => { setEditingCustomer(c); setFormOpen(true); }}>Editar</button>
          <button className="secondary" onClick={() => removeCustomer(c.id)}>Excluir</button>
        </div>
      ),
    },
  ];

  const supplierColumns: DataTableColumn<any>[] = [
    { key: "kind", label: "Tipo" },
    { key: "document", label: "Documento" },
    { key: "name", label: "Nome", value: (s) => personName(s) },
    { key: "phone", label: "Telefone" },
    {
      key: "actions", label: "", sortable: false, filterable: false,
      render: (s) => (
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <button className="secondary" onClick={() => { setEditingSupplier(s); setFormOpen(true); }}>Editar</button>
          <button className="secondary" onClick={() => removeSupplier(s.id)}>Excluir</button>
        </div>
      ),
    },
  ];

  const methodColumns: DataTableColumn<any>[] = [
    { key: "code", label: "Código" },
    { key: "name", label: "Nome" },
    {
      key: "fee", label: "Taxa",
      value: (m) => Number(m.fee_percent || 0),
      render: (m) => (
        <span className="muted">
          {[m.fee_percent ? `${Number(m.fee_percent).toLocaleString("pt-BR")}%` : "", m.fee_fixed ? `R$ ${Number(m.fee_fixed).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : ""]
            .filter(Boolean)
            .join(" + ") || "—"}
        </span>
      ),
    },
    {
      key: "actions", label: "", sortable: false, filterable: false,
      render: (m) => <button className="secondary" onClick={() => { setEditingMethod(m); setFormOpen(true); }}>Editar</button>,
    },
  ];

  const termColumns: DataTableColumn<any>[] = [
    { key: "code", label: "Código" },
    { key: "name", label: "Nome" },
    {
      key: "installments", label: "Parcelas",
      value: (t) => (t.installments || []).map((i: any) => `${i.percent}% em ${i.days}d`).join(" · "),
      render: (t) => <span className="muted">{(t.installments || []).map((i: any) => `${i.percent}% em ${i.days}d`).join(" · ")}</span>,
    },
    {
      key: "actions", label: "", sortable: false, filterable: false,
      render: (t) => (
        <button className="secondary" onClick={() => { setEditingTerm(t); setInstallments((t.installments || []).map((i: any) => ({ days: i.days, percent: i.percent }))); setTermFormOpen(true); }}>Editar</button>
      ),
    },
  ];

  const centerColumns: DataTableColumn<any>[] = [
    { key: "code", label: "Código" },
    { key: "name", label: "Nome" },
    { key: "city", label: "Cidade", value: (c) => [c.city, c.state].filter(Boolean).join("/"), render: (c) => <span className="muted">{[c.city, c.state].filter(Boolean).join("/")}</span> },
    {
      key: "warehouse", label: "Almoxarifado",
      value: (c) => warehouses.find((w) => w.id === c.warehouse_id)?.name || c.warehouse_id,
      render: (c) => <span className="muted">{warehouses.find((w) => w.id === c.warehouse_id)?.name || c.warehouse_id}</span>,
    },
    {
      key: "actions", label: "", sortable: false, filterable: false,
      render: (c) => <button className="secondary" onClick={() => openCenter(c)}>Editar</button>,
    },
  ];

  const vehicleColumns: DataTableColumn<any>[] = [
    { key: "code", label: "Código" },
    { key: "name", label: "Nome" },
    { key: "capacity_m3", label: "m³", value: (v) => Number(v.capacity_m3 || 0) },
    { key: "capacity_kg", label: "kg", value: (v) => Number(v.capacity_kg || 0) },
    {
      key: "actions", label: "", sortable: false, filterable: false,
      render: (v) => <button className="secondary" onClick={() => { setEditingVehicle(v); setFormOpen(true); }}>Editar</button>,
    },
  ];

  const usersPerm = usePermission("/config/cadastros/usuarios");
  const perfisPerm = usePermission("/config/cadastros/perfis");

  const userColumns: DataTableColumn<any>[] = [
    { key: "name", label: "Nome" },
    { key: "email", label: "E-mail" },
    { key: "role_name", label: "Perfil", value: (u) => u.role_name },
    ...(usersPerm.canEdit ? [{
      key: "actions", label: "", sortable: false, filterable: false,
      render: (u: any) => (
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <button className="secondary" onClick={() => { setEditingUser(u); setFormOpen(true); }}>Editar</button>
          <button className="danger" onClick={() => removeUser(u.id)}>Excluir</button>
        </div>
      ),
    } as DataTableColumn<any>] : []),
  ];

  const roleColumns: DataTableColumn<any>[] = [
    { key: "name", label: "Nome" },
    { key: "code", label: "Código" },
    ...(perfisPerm.canEdit ? [{
      key: "actions", label: "", sortable: false, filterable: false,
      render: (r: any) => (
        <div className="row">
          <button className="secondary" onClick={() => { setEditingRole(r); setFormOpen(true); loadMatrix(r.id); }}>Editar</button>
          {!r.is_master && !r.is_system && (
            <button className="secondary" onClick={() => removeRole(r.id)}>Excluir</button>
          )}
        </div>
      ),
    } as DataTableColumn<any>] : []),
  ];

  return (
    <div>
      <h1>{titles[page] || "Cadastros"}</h1>
      {error && <p className="error">{error}</p>}
      {loading ? <Loading /> : (
        <>
      {page === "unidades" && (
        <CadastroLayout
          formOpen={formOpen}
          listOpen={listOpen}
          onFormOpen={setFormOpen}
          onListOpen={setListOpen}
          form={
            <form className="row" key={editingUnit?.id ?? "new"} onSubmit={saveUnit}>
              <CodeInput defaultValue={editingUnit?.code ?? ""} required={!!editingUnit} />
              <div className="field"><label>Nome</label><input name="name" placeholder="Saca" required defaultValue={editingUnit?.name ?? ""} /></div>
              <div className="field"><label>Símbolo</label><input name="symbol" placeholder="sc" defaultValue={editingUnit?.symbol ?? ""} /></div>
              <button>{editingUnit ? "Salvar" : "Adicionar"}</button>
              {editingUnit && <button type="button" className="secondary" onClick={() => { setEditingUnit(null); setFormOpen(false); }}>Cancelar</button>}
            </form>
          }
          list={
            <DataTable columns={unitColumns} rows={units} rowKey={(u) => u.id} emptyMessage="Nenhuma unidade cadastrada." />
          }
        />
      )}
      {page === "clientes" && (
        <CadastroLayout
          formOpen={formOpen}
          listOpen={listOpen}
          onFormOpen={setFormOpen}
          onListOpen={setListOpen}
          form={
            <PersonForm
              key={editingCustomer?.id ?? "new"}
              editing={editingCustomer}
              onCancel={() => { setEditingCustomer(null); setFormOpen(false); }}
              onSave={saveCustomer}
            />
          }
          list={
            <DataTable columns={customerColumns} rows={customers} rowKey={(c) => c.id} emptyMessage="Nenhum cliente cadastrado." />
          }
        />
      )}
      {page === "fornecedores" && (
        <CadastroLayout
          formOpen={formOpen}
          listOpen={listOpen}
          onFormOpen={setFormOpen}
          onListOpen={setListOpen}
          form={
            <PersonForm
              key={editingSupplier?.id ?? "new"}
              editing={editingSupplier}
              onCancel={() => { setEditingSupplier(null); setFormOpen(false); }}
              onSave={saveSupplier}
            />
          }
          list={
            <DataTable columns={supplierColumns} rows={suppliers} rowKey={(s) => s.id} emptyMessage="Nenhum fornecedor cadastrado." />
          }
        />
      )}
      {page === "pagamento" && (
        <>
          <CadastroLayout
            formTitle="Formas de pagamento"
            formOpen={formOpen}
            listOpen={listOpen}
            onFormOpen={setFormOpen}
            onListOpen={setListOpen}
            form={
              <>
                <p className="muted">Taxa cobrada pela operadora/adquirente para receber por esta forma — não é repassada ao cliente, só informativa para o cálculo de margem.</p>
                <form className="row" key={editingMethod?.id ?? "new"} onSubmit={saveMethod}>
                <CodeInput defaultValue={editingMethod?.code ?? ""} required={!!editingMethod} />
                <div className="field"><label>Nome</label><input name="name" required defaultValue={editingMethod?.name ?? ""} /></div>
                <div className="field field-narrow">
                  <label>Taxa (%)</label>
                  <input name="fee_percent" type="number" step="0.001" min="0" defaultValue={editingMethod?.fee_percent ?? 0} />
                </div>
                <div className="field field-narrow">
                  <label>Taxa fixa (R$)</label>
                  <input name="fee_fixed" type="number" step="0.01" min="0" defaultValue={editingMethod?.fee_fixed ?? 0} />
                </div>
                <button>{editingMethod ? "Salvar" : "Adicionar"}</button>
                {editingMethod && <button type="button" className="secondary" onClick={() => { setEditingMethod(null); setFormOpen(false); }}>Cancelar</button>}
                </form>
              </>
            }
            list={
              <DataTable columns={methodColumns} rows={methods} rowKey={(m) => m.id} emptyMessage="Nenhuma forma de pagamento cadastrada." />
            }
          />
          <CadastroLayout
            formTitle="Condições de pagamento"
            listTitle="Listagem"
            formOpen={termFormOpen}
            listOpen={listOpen}
            onFormOpen={setTermFormOpen}
            form={
              <>
                <p className="muted">Parcelas em dias a partir do pedido. A soma dos percentuais deve ser 100. À vista = 0 dias.</p>
                <form key={editingTerm?.id ?? "new"} onSubmit={saveTerm}>
                  <div className="row">
                    <CodeInput defaultValue={editingTerm?.code ?? ""} required={!!editingTerm} />
                    <div className="field"><label>Nome</label><input name="name" required defaultValue={editingTerm?.name ?? ""} /></div>
                  </div>
                  {installments.map((it, i) => (
                    <div className="row" key={i} style={{ marginTop: 8 }}>
                      <div className="field"><label>Dias</label><input type="number" min="0" value={it.days} onChange={(e) => {
                        const next = [...installments];
                        next[i] = { ...it, days: Number(e.target.value) };
                        setInstallments(next);
                      }} required /></div>
                      <div className="field"><label>%</label><input type="number" min="0.01" step="0.01" value={it.percent} onChange={(e) => {
                        const next = [...installments];
                        next[i] = { ...it, percent: Number(e.target.value) };
                        setInstallments(next);
                      }} required /></div>
                      <button type="button" className="secondary" onClick={() => setInstallments(installments.filter((_, j) => j !== i))}>Remover</button>
                    </div>
                  ))}
                  {(() => {
                    const sum = installments.reduce((s, i) => s + Number(i.percent || 0), 0);
                    const ok = Math.abs(sum - 100) <= 0.05;
                    return <p className={ok ? "muted" : "error"} style={{ marginTop: 8 }}>Soma dos percentuais: {sum.toFixed(2)}%{!ok ? " (deve ser 100%)" : ""}</p>;
                  })()}
                  <div className="row" style={{ marginTop: 12 }}>
                    <button type="button" className="secondary" onClick={() => setInstallments([...installments, { days: 30, percent: 0 }])}>Adicionar parcela</button>
                    <button>{editingTerm ? "Salvar condição" : "Adicionar condição"}</button>
                    {editingTerm && <button type="button" className="secondary" onClick={() => { setEditingTerm(null); setInstallments([{ days: 0, percent: 100 }]); setTermFormOpen(false); }}>Cancelar</button>}
                  </div>
                </form>
              </>
            }
            list={
              <DataTable columns={termColumns} rows={terms} rowKey={(t) => t.id} emptyMessage="Nenhuma condição de pagamento cadastrada." />
            }
          />
        </>
      )}
      {page === "centros" && (
        <CadastroLayout
          formOpen={formOpen}
          listOpen={listOpen}
          onFormOpen={(open) => { if (open) openCenter(); else { setFormOpen(false); setEditingCenter(null); setCenterDraft(null); } }}
          onListOpen={setListOpen}
          form={centerDraft && (
            <form key={editingCenter?.id ?? "new"} onSubmit={saveCenter}>
              <div className="row">
                <CodeInput defaultValue={editingCenter?.code ?? ""} required={!!editingCenter} />
                <div className="field"><label>Nome</label><input name="name" required defaultValue={editingCenter?.name ?? ""} /></div>
                <div className="field">
                  <label>Almoxarifado</label>
                  <Autocomplete
                    required
                    value={centerDraft.warehouse_id || ""}
                    options={warehouses.map((w) => ({ value: w.id, code: w.code, description: w.name }))}
                    createLabel="Cadastrar almoxarifado"
                    onCreate={() => setWarehouseModal(true)}
                    onChange={(id) => setCenterDraft((d: any) => ({ ...d, warehouse_id: id }))}
                  />
                </div>
              </div>
              <div className="row">
                <div className="field"><label>CEP</label><input name="zip" value={centerDraft.zip ?? ""} onChange={(e) => {
                  const zip = e.target.value;
                  setCenterDraft((d: any) => ({ ...d, zip }));
                  if (zip.replace(/\D/g, "").length === 8) searchCenterCep(zip);
                }} /></div>
                <button type="button" className="secondary" disabled={centerBusy !== ""} onClick={() => searchCenterCep()}>{centerBusy === "cep" ? "Buscando..." : "Buscar endereço"}</button>
                <button type="button" className="secondary" disabled={centerBusy !== ""} onClick={() => findCep("center")}>{centerBusy === "findcep" ? "Buscando..." : "Buscar CEP"}</button>
                <div className="field"><label>Logradouro</label><input name="street" value={centerDraft.street ?? ""} onChange={(e) => setCenterDraft((d: any) => ({ ...d, street: e.target.value }))} /></div>
                <div className="field"><label>Número</label><input name="number" value={centerDraft.number ?? ""} onChange={(e) => setCenterDraft((d: any) => ({ ...d, number: e.target.value }))} /></div>
              </div>
              <div className="row">
                <div className="field"><label>Complemento</label><input name="complement" value={centerDraft.complement ?? ""} onChange={(e) => setCenterDraft((d: any) => ({ ...d, complement: e.target.value }))} /></div>
                <div className="field"><label>Bairro</label><input name="district" value={centerDraft.district ?? ""} onChange={(e) => setCenterDraft((d: any) => ({ ...d, district: e.target.value }))} /></div>
                <div className="field"><label>Cidade</label><input name="city" value={centerDraft.city ?? ""} onChange={(e) => setCenterDraft((d: any) => ({ ...d, city: e.target.value }))} /></div>
                <div className="field"><label>UF</label><input name="state" maxLength={2} value={centerDraft.state ?? ""} onChange={(e) => setCenterDraft((d: any) => ({ ...d, state: e.target.value }))} /></div>
              </div>
              <p className="muted">Clique no mapa para definir o ponto. Lat {centerDraft.lat?.toFixed?.(5) || "—"} · Lng {centerDraft.lng?.toFixed?.(5) || "—"}</p>
              <MapPicker lat={centerDraft.lat || undefined} lng={centerDraft.lng || undefined} onChange={onMapClick} />
              <div className="row" style={{ marginTop: 12 }}>
                <button>{editingCenter ? "Salvar" : "Adicionar"}</button>
                {editingCenter && <button type="button" className="secondary" onClick={() => { setEditingCenter(null); setCenterDraft(null); setFormOpen(false); }}>Cancelar</button>}
              </div>
            </form>
          )}
          list={
            <DataTable columns={centerColumns} rows={centers} rowKey={(c) => c.id} emptyMessage="Nenhum centro de distribuição cadastrado." />
          }
        />
      )}
      {page === "veiculos" && (
        <CadastroLayout
          formOpen={formOpen}
          listOpen={listOpen}
          onFormOpen={setFormOpen}
          onListOpen={setListOpen}
          form={
            <form className="row" key={editingVehicle?.id ?? "new"} onSubmit={saveVehicle}>
              <CodeInput defaultValue={editingVehicle?.code ?? ""} required={!!editingVehicle} />
              <div className="field"><label>Nome / placa</label><input name="name" required defaultValue={editingVehicle?.name ?? ""} /></div>
              <div className="field"><label>Capacidade m³</label><input name="capacity_m3" type="number" min="0.0001" step="0.0001" required defaultValue={editingVehicle?.capacity_m3 ?? ""} /></div>
              <div className="field"><label>Capacidade kg</label><input name="capacity_kg" type="number" min="0.001" step="0.001" required defaultValue={editingVehicle?.capacity_kg ?? ""} /></div>
              <button>{editingVehicle ? "Salvar" : "Adicionar"}</button>
              {editingVehicle && <button type="button" className="secondary" onClick={() => { setEditingVehicle(null); setFormOpen(false); }}>Cancelar</button>}
            </form>
          }
          list={
            <DataTable columns={vehicleColumns} rows={vehicles} rowKey={(v) => v.id} emptyMessage="Nenhum veículo cadastrado." />
          }
        />
      )}
      {page === "usuarios" && (
        <CadastroLayout
          formOpen={formOpen}
          listOpen={listOpen}
          onFormOpen={setFormOpen}
          onListOpen={setListOpen}
          form={
            usersPerm.canEdit ? (
              <form className="row" key={editingUser?.id ?? "new"} onSubmit={saveUser}>
                <div className="field"><label>Nome</label><input name="name" required defaultValue={editingUser?.name ?? ""} /></div>
                <div className="field"><label>E-mail</label><input name="email" type="email" required defaultValue={editingUser?.email ?? ""} /></div>
                <div className="field">
                  <label>Senha</label>
                  <input name="password" type="password" minLength={6} required={!editingUser} placeholder={editingUser ? "Em branco para manter" : ""} />
                </div>
                <div className="field">
                  <label>Perfil</label>
                  <select name="role_id" required defaultValue={editingUser?.role_id ?? ""}>
                    <option value="" disabled>Selecione…</option>
                    {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                <button>{editingUser ? "Salvar" : "Adicionar"}</button>
                {editingUser && <button type="button" className="secondary" onClick={() => { setEditingUser(null); setFormOpen(false); }}>Cancelar</button>}
              </form>
            ) : (
              <p className="muted">Somente leitura para o seu perfil.</p>
            )
          }
          list={
            <DataTable columns={userColumns} rows={users} rowKey={(u) => u.id} emptyMessage="Nenhum usuário cadastrado." />
          }
        />
      )}
      {page === "perfis" && (
        <CadastroLayout
          formTitle="Perfil"
          listTitle="Perfis cadastrados"
          formOpen={formOpen}
          listOpen={listOpen}
          onFormOpen={setFormOpen}
          onListOpen={setListOpen}
          form={
            !perfisPerm.canEdit ? (
              <p className="muted">Somente leitura para o seu perfil.</p>
            ) : (
              <div>
                <form className="row" key={editingRole?.id ?? "new"} onSubmit={saveRole}>
                  <CodeInput defaultValue={editingRole?.code ?? ""} required={!editingRole} disabled={!!editingRole} />
                  <div className="field"><label>Nome</label><input name="name" required defaultValue={editingRole?.name ?? ""} /></div>
                  <button>{editingRole ? "Salvar" : "Adicionar"}</button>
                  {editingRole && <button type="button" className="secondary" onClick={() => { setEditingRole(null); setFormOpen(false); }}>Cancelar</button>}
                </form>
                {editingRole && editingRole.is_master && (
                  <p className="muted" style={{ marginTop: 16 }}>O perfil Master sempre tem acesso completo e não pode ser restringido.</p>
                )}
                {editingRole && !editingRole.is_master && (
                  <div style={{ marginTop: 16 }}>
                    <p className="muted">
                      Acesso por módulo controla o que a API realmente permite. Acesso por tela controla apenas o
                      que aparece no menu — mantenha o nível de tela igual ou menor que o do módulo correspondente
                      para evitar botões que resultam em erro de permissão.
                    </p>
                    <h3>Acesso por módulo</h3>
                    <div className="table-wrap">
                      <table>
                        <tbody>
                          {MODULES.map((m) => (
                            <tr key={m}>
                              <td>{MODULE_LABELS[m]}</td>
                              <td><LevelSelect value={moduleMatrix[m] ?? 0} onChange={(v) => setModuleMatrix((s) => ({ ...s, [m]: v }))} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <h3 style={{ marginTop: 16 }}>Acesso por tela</h3>
                    {MENU.map((section) => (
                      <div className="nav-group active" key={section.title}>
                        <button
                          type="button"
                          className="collapse-head"
                          onClick={() => setOpenSections((s) => ({ ...s, [section.title]: !s[section.title] }))}
                        >
                          <span>{section.title}</span>
                          <span className="muted">{openSections[section.title] ? "ocultar" : "mostrar"}</span>
                        </button>
                        {openSections[section.title] && (
                          <div className="table-wrap">
                            <table>
                              <tbody>
                                {flattenLeaves(section).map((leaf) => (
                                  <tr key={leaf.to}>
                                    <td>{leaf.label}</td>
                                    <td><LevelSelect value={menuMatrix[leaf.to] ?? 0} onChange={(v) => setMenuMatrix((s) => ({ ...s, [leaf.to]: v }))} /></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    ))}
                    <div className="row" style={{ marginTop: 12 }}>
                      <button type="button" onClick={savePermissions}>Salvar permissões</button>
                    </div>
                  </div>
                )}
              </div>
            )
          }
          list={<DataTable columns={roleColumns} rows={roles} rowKey={(r) => r.id} emptyMessage="Nenhum perfil cadastrado." />}
        />
      )}
      {page === "regras" && (
        <div className="card">
          <h2>Compras</h2>
          <label className="check">
            <input
              type="checkbox"
              checked={quoteRequired}
              onChange={(e) => {
                const checked = e.target.checked;
                setQuoteRequired(checked);
                configApi.putSetting("purchase_quote_required", checked ? "true" : "false").catch((err) => {
                  setQuoteRequired(!checked);
                  setError(err.message);
                });
              }}
            />
            Exigir orçamento antes do pedido de compra
          </label>
          <p className="muted">Se ativo, o pedido só é gerado a partir de um orçamento.</p>
          <h2 style={{ marginTop: 24 }}>Estoque</h2>
          <div className="field" style={{ maxWidth: 420 }}>
            <label>Almoxarifado padrão</label>
            <Autocomplete
              value={defaultWarehouse}
              allowEmpty
              emptyLabel="Nenhum"
              options={warehouses.map((w) => ({ value: w.id, code: w.code, description: w.name }))}
              createLabel="Cadastrar almoxarifado"
              onCreate={() => setWarehouseModal(true)}
              onChange={(id) => {
                setDefaultWarehouse(id);
                configApi.putSetting("default_warehouse_id", id).catch((err) => setError(err.message));
              }}
            />
          </div>
          <p className="muted">Usado no recebimento de compra e na separação de venda. Se vazio, informe o almoxarifado na confirmação.</p>
        </div>
      )}
      {page === "empresa" && companyDraft && (
        <div className="card">
          <p className="muted">Estes dados aparecem no cabeçalho de orçamentos, pedidos, rotas, etiquetas e relatórios impressos.</p>
          <form onSubmit={saveCompany}>
            <div className="row">
              <div className="field"><label>Nome / razão social</label><input name="name" defaultValue={companyDraft.name ?? ""} /></div>
              <div className="field"><label>CNPJ</label><input name="document" defaultValue={companyDraft.document ?? ""} /></div>
            </div>
            <div className="row">
              <div className="field"><label>Telefone</label><input name="phone" defaultValue={companyDraft.phone ?? ""} /></div>
              <div className="field"><label>E-mail</label><input name="email" type="email" defaultValue={companyDraft.email ?? ""} /></div>
            </div>
            <div className="row">
              <div className="field"><label>CEP</label><input name="zip" value={companyDraft.zip ?? ""} onChange={(e) => {
                const zip = e.target.value;
                setCompanyDraft((d: any) => ({ ...d, zip }));
                if (zip.replace(/\D/g, "").length === 8) searchCompanyCep(zip);
              }} /></div>
              <button type="button" className="secondary" disabled={companyBusy !== ""} onClick={() => searchCompanyCep()}>{companyBusy === "cep" ? "Buscando..." : "Buscar endereço"}</button>
              <button type="button" className="secondary" disabled={companyBusy !== ""} onClick={() => findCep("company")}>{companyBusy === "findcep" ? "Buscando..." : "Buscar CEP"}</button>
              <div className="field"><label>Logradouro</label><input name="street" value={companyDraft.street ?? ""} onChange={(e) => setCompanyDraft((d: any) => ({ ...d, street: e.target.value }))} /></div>
              <div className="field"><label>Número</label><input name="number" value={companyDraft.number ?? ""} onChange={(e) => setCompanyDraft((d: any) => ({ ...d, number: e.target.value }))} /></div>
            </div>
            <div className="row">
              <div className="field"><label>Complemento</label><input name="complement" value={companyDraft.complement ?? ""} onChange={(e) => setCompanyDraft((d: any) => ({ ...d, complement: e.target.value }))} /></div>
              <div className="field"><label>Bairro</label><input name="district" value={companyDraft.district ?? ""} onChange={(e) => setCompanyDraft((d: any) => ({ ...d, district: e.target.value }))} /></div>
              <div className="field"><label>Cidade</label><input name="city" value={companyDraft.city ?? ""} onChange={(e) => setCompanyDraft((d: any) => ({ ...d, city: e.target.value }))} /></div>
              <div className="field"><label>UF</label><input name="state" maxLength={2} value={companyDraft.state ?? ""} onChange={(e) => setCompanyDraft((d: any) => ({ ...d, state: e.target.value }))} /></div>
            </div>
            <div className="row" style={{ alignItems: "flex-end" }}>
              <div className="field">
                <label>Logo</label>
                <input type="file" accept="image/*" onChange={(e) => onLogoChange(e.target.files?.[0])} />
              </div>
              {companyDraft.logo && <img src={companyDraft.logo} alt="Logo" style={{ maxHeight: 60, maxWidth: 160, background: "#fff", borderRadius: 4 }} />}
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <button disabled={companyBusy === "save"}>{companyBusy === "save" ? "Salvando..." : "Salvar"}</button>
            </div>
          </form>
        </div>
      )}
      {page === "auditoria" && (
        <div className="card">
          <p className="muted">
            Toda exclusão e atualização feita no sistema (por qualquer módulo), com quem fez, quando e o que foi
            enviado. Leituras e criações não aparecem aqui — o foco é rastrear o que foi apagado ou alterado.
          </p>
          <div className="row" style={{ alignItems: "flex-end" }}>
            <div className="field">
              <label>Módulo</label>
              <Autocomplete
                value={auditModule}
                allowEmpty
                emptyLabel="Todos"
                options={MODULES.filter((m) => m !== "audit").map((m) => ({ value: m, code: m, description: MODULE_LABELS[m] }))}
                onChange={setAuditModule}
              />
            </div>
            <div className="field">
              <label>Ação</label>
              <Autocomplete
                value={auditMethod}
                allowEmpty
                emptyLabel="Todas"
                options={[
                  { value: "DELETE", code: "DELETE", description: "Exclusão" },
                  { value: "PUT", code: "PUT", description: "Atualização (PUT)" },
                  { value: "PATCH", code: "PATCH", description: "Atualização (PATCH)" },
                ]}
                onChange={setAuditMethod}
              />
            </div>
            <div className="field">
              <label>Usuário (e-mail)</label>
              <input value={auditEmail} onChange={(e) => setAuditEmail(e.target.value)} placeholder="nome@empresa.com" />
            </div>
            <div className="field field-narrow">
              <label>Por página</label>
              <select value={auditLimit} onChange={(e) => setAuditLimit(Number(e.target.value))}>
                {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <button type="button" onClick={() => loadAuditLogs(1)} disabled={auditLoading}>{auditLoading ? "Carregando..." : "Filtrar"}</button>
          </div>
          <DataTable
            columns={[
              { key: "at", label: "Quando", value: (e) => new Date(e.at), render: (e) => new Date(e.at).toLocaleString("pt-BR") },
              { key: "user_email", label: "Usuário", value: (e) => e.user_email, render: (e) => <>{e.user_email}<span className="muted"> · {e.user_role}</span></> },
              { key: "method", label: "Ação", value: (e) => e.method },
              { key: "module", label: "Módulo", value: (e) => MODULE_LABELS[e.module] || e.module },
              { key: "path", label: "Recurso", value: (e) => e.path },
              {
                key: "status_code",
                label: "Status",
                value: (e) => e.status_code,
                render: (e) => <span className={e.status_code >= 400 ? "error" : ""}>{e.status_code}</span>,
              },
              {
                key: "body",
                label: "Dados enviados",
                sortable: false,
                value: (e) => e.body || "",
                render: (e) => e.body ? <span className="muted" title={e.body}>{e.body.length > 60 ? `${e.body.slice(0, 60)}…` : e.body}</span> : "—",
              },
            ] as DataTableColumn<AuditLogEntry>[]}
            rows={auditLogs}
            rowKey={(e) => e.id}
            emptyMessage={auditLoading ? "Carregando..." : "Nenhum registro encontrado."}
          />
          <div className="row" style={{ marginTop: 12, alignItems: "center" }}>
            <button type="button" className="secondary" disabled={auditLoading || auditPage <= 1} onClick={() => loadAuditLogs(auditPage - 1)}>Anterior</button>
            <span className="muted">Página {auditPage} de {auditTotalPages} · {auditTotal} registro(s)</span>
            <button type="button" className="secondary" disabled={auditLoading || auditPage >= auditTotalPages} onClick={() => loadAuditLogs(auditPage + 1)}>Próxima</button>
          </div>
        </div>
      )}
      {warehouseModal && (
        <WarehouseCreateModal
          onClose={() => setWarehouseModal(false)}
          onCreated={(w) => {
            setDefaultWarehouse(w.id);
            configApi.putSetting("default_warehouse_id", w.id).catch((err) => setError(err.message));
            load();
          }}
        />
      )}
        </>
      )}
      {cepResults && <CepPicker results={cepResults.list} onPick={(a) => applyFoundCep(cepResults.target, a)} onClose={() => setCepResults(null)} />}
    </div>
  );
}
