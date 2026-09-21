import { lazy, Suspense, useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { clearSession, filterMenu, getToken, getUser, hasRouteAccess, identityApi, Loading, MENU, MenuGroup } from "@erp/shared";

const ConfigApp = lazy(() => import("config/App"));
const AuthApp = lazy(() => import("auth/App"));
const StockApp = lazy(() => import("stock/App"));
const SalesApp = lazy(() => import("sales/App"));
const PurchasingApp = lazy(() => import("purchasing/App"));
const AssetsApp = lazy(() => import("assets/App"));
const CashflowApp = lazy(() => import("cashflow/App"));
const InvoicingApp = lazy(() => import("invoicing/App"));
const BiApp = lazy(() => import("bi/App"));
const ReportsApp = lazy(() => import("reports/App"));

function Guard({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  if (!getToken()) return <Navigate to="/login" replace />;
  if (!hasRouteAccess(location.pathname)) {
    return (
      <Layout>
        <div className="card">
          <h2>Acesso negado</h2>
          <p className="muted">Você não tem permissão para acessar esta página.</p>
        </div>
      </Layout>
    );
  }
  return <>{children}</>;
}

function sectionActive(items: { to: string }[] | undefined, groups: MenuGroup[] | undefined, pathname: string): boolean {
  if (items?.some((i) => pathname === i.to || pathname.startsWith(i.to + "/"))) return true;
  return groups?.some((g) => sectionActive(g.items, g.groups, pathname)) ?? false;
}

function NavGroup({ title, items = [], groups = [], onNavigate }: MenuGroup & { onNavigate: () => void }) {
  const loc = useLocation();
  const childActive = sectionActive(items, groups, loc.pathname);
  const [open, setOpen] = useState(childActive);
  useEffect(() => {
    if (childActive) setOpen(true);
  }, [childActive]);
  return (
    <div className={`nav-group${childActive ? " active" : ""}`}>
      <button type="button" className="nav-group-toggle" onClick={() => setOpen((v) => !v)}>
        {title}
        <span className="muted">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="nav-sub">
          {groups.map((g) => (
            <NavGroup key={g.title} title={g.title} items={g.items} groups={g.groups} onNavigate={onNavigate} />
          ))}
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} onClick={onNavigate}>{i.label}</NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  const nav = useNavigate();
  const user = getUser();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    if (open) window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={open ? "shell nav-open" : "shell"}>
      {open && <button type="button" className="nav-overlay" aria-label="Fechar menu" onClick={close} />}
      <aside className="sidebar">
        <div className="sidebar-head">
          <p className="brand">ERP</p>
          <button type="button" className="icon-btn menu-close" aria-label="Fechar menu" onClick={close}>×</button>
        </div>
        <nav className="nav">
          {filterMenu(MENU).map((g) => (
            <NavGroup key={g.title} title={g.title} items={g.items} groups={g.groups} onNavigate={close} />
          ))}
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="topbar-start">
            <button type="button" className="icon-btn menu-toggle" aria-label="Menu" onClick={() => setOpen(true)}>☰</button>
            <span className="brand-mobile">ERP</span>
            <span className="muted user-name">{user?.name}</span>
          </div>
          <button className="secondary" onClick={async () => {
            try { await identityApi.logout(); } catch { /* best-effort */ }
            clearSession();
            nav("/login");
          }}>Sair</button>
        </header>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}

function Screen({ El }: { El: React.ComponentType }) {
  return (
    <Guard>
      <Layout>
        <El />
      </Layout>
    </Guard>
  );
}

export default function App() {
  return (
    <Suspense fallback={<div className="content"><Loading /></div>}>
      <Routes>
        <Route path="/login" element={<AuthApp />} />
        <Route path="/config/cadastros/unidades" element={<Screen El={ConfigApp} />} />
        <Route path="/config/cadastros/clientes" element={<Screen El={ConfigApp} />} />
        <Route path="/config/cadastros/fornecedores" element={<Screen El={ConfigApp} />} />
        <Route path="/config/cadastros/centros" element={<Screen El={ConfigApp} />} />
        <Route path="/config/cadastros/veiculos" element={<Screen El={ConfigApp} />} />
        <Route path="/config/cadastros/pagamento" element={<Screen El={ConfigApp} />} />
        <Route path="/config/cadastros/usuarios" element={<Screen El={ConfigApp} />} />
        <Route path="/config/cadastros/perfis" element={<Screen El={ConfigApp} />} />
        <Route path="/producao/produtos" element={<Screen El={StockApp} />} />
        <Route path="/producao/categorias" element={<Screen El={StockApp} />} />
        <Route path="/producao/montagem" element={<Screen El={StockApp} />} />
        <Route path="/producao/pesagem" element={<Screen El={SalesApp} />} />
        <Route path="/pdv/pesagem" element={<Screen El={SalesApp} />} />
        <Route path="/pdv/pedidos" element={<Screen El={SalesApp} />} />
        <Route path="/estoque/almoxarifados" element={<Screen El={StockApp} />} />
        <Route path="/estoque/saldos" element={<Screen El={StockApp} />} />
        <Route path="/estoque/movimentos" element={<Screen El={StockApp} />} />
        <Route path="/estoque/pesagem-kits" element={<Screen El={SalesApp} />} />
        <Route path="/vendas/precos" element={<Screen El={StockApp} />} />
        <Route path="/config/regras" element={<Screen El={ConfigApp} />} />
        <Route path="/config/empresa" element={<Screen El={ConfigApp} />} />
        <Route path="/config/auditoria" element={<Screen El={ConfigApp} />} />
        <Route path="/vendas/pedidos" element={<Screen El={SalesApp} />} />
        <Route path="/vendas/separacao" element={<Navigate to="/logistica/separacao" replace />} />
        <Route path="/vendas/entrega" element={<Navigate to="/logistica/entrega" replace />} />
        <Route path="/compras/orcamentos" element={<Screen El={PurchasingApp} />} />
        <Route path="/compras/pedidos" element={<Screen El={PurchasingApp} />} />
        <Route path="/compras/historico" element={<Screen El={PurchasingApp} />} />
        <Route path="/logistica/entrada" element={<Screen El={PurchasingApp} />} />
        <Route path="/logistica/conferencia" element={<Screen El={PurchasingApp} />} />
        <Route path="/logistica/pesagem" element={<Navigate to="/producao/pesagem" replace />} />
        <Route path="/logistica/separacao" element={<Screen El={SalesApp} />} />
        <Route path="/logistica/rotas/:id" element={<Screen El={SalesApp} />} />
        <Route path="/logistica/rotas" element={<Screen El={SalesApp} />} />
        <Route path="/logistica/entrega" element={<Screen El={SalesApp} />} />
        <Route path="/logistica" element={<Navigate to="/logistica/entrada" replace />} />
        <Route path="/ativos/bens" element={<Screen El={AssetsApp} />} />
        <Route path="/ativos/movimentos" element={<Screen El={AssetsApp} />} />
        <Route path="/caixa/resumo" element={<Screen El={CashflowApp} />} />
        <Route path="/caixa/lancamentos" element={<Screen El={CashflowApp} />} />
        <Route path="/caixa/novo" element={<Screen El={CashflowApp} />} />
        <Route path="/fiscal/saida" element={<Screen El={InvoicingApp} />} />
        <Route path="/fiscal/entrada" element={<Screen El={InvoicingApp} />} />
        <Route path="/bi/simulacao" element={<Screen El={BiApp} />} />
        <Route path="/bi/previsao" element={<Screen El={BiApp} />} />
        <Route path="/bi/estoque" element={<Screen El={BiApp} />} />
        <Route path="/bi/orcamentos" element={<Screen El={BiApp} />} />
        <Route path="/bi/precos" element={<Screen El={BiApp} />} />
        <Route path="/bi/financeiro" element={<Screen El={BiApp} />} />
        <Route path="/bi/agendamentos" element={<Screen El={BiApp} />} />
        <Route path="/relatorios/kits" element={<Screen El={ReportsApp} />} />
        <Route path="/relatorios/estoque" element={<Screen El={ReportsApp} />} />
        <Route path="/relatorios/vendas" element={<Screen El={ReportsApp} />} />
        <Route path="/relatorios/compras" element={<Screen El={ReportsApp} />} />
        <Route path="/relatorios/previsao" element={<Screen El={ReportsApp} />} />
        <Route path="/cadastros/unidades" element={<Navigate to="/config/cadastros/unidades" replace />} />
        <Route path="/cadastros/clientes" element={<Navigate to="/config/cadastros/clientes" replace />} />
        <Route path="/cadastros/fornecedores" element={<Navigate to="/config/cadastros/fornecedores" replace />} />
        <Route path="/cadastros/pagamento" element={<Navigate to="/config/cadastros/pagamento" replace />} />
        <Route path="/cadastros/produtos" element={<Navigate to="/producao/produtos" replace />} />
        <Route path="/cadastros/categorias" element={<Navigate to="/producao/categorias" replace />} />
        <Route path="/cadastros/montagem" element={<Navigate to="/producao/montagem" replace />} />
        <Route path="/cadastros/almoxarifados" element={<Navigate to="/estoque/almoxarifados" replace />} />
        <Route path="/estoque/precos" element={<Navigate to="/vendas/precos" replace />} />
        <Route path="/config/cadastros" element={<Navigate to="/config/cadastros/unidades" replace />} />
        <Route path="/config" element={<Navigate to="/config/cadastros/unidades" replace />} />
        <Route path="/producao" element={<Navigate to="/producao/produtos" replace />} />
        <Route path="/estoque" element={<Navigate to="/estoque/saldos" replace />} />
        <Route path="/vendas" element={<Navigate to="/vendas/pedidos" replace />} />
        <Route path="/compras" element={<Navigate to="/compras/orcamentos" replace />} />
        <Route path="/ativos" element={<Navigate to="/ativos/bens" replace />} />
        <Route path="/caixa" element={<Navigate to="/caixa/resumo" replace />} />
        <Route path="/fiscal" element={<Navigate to="/fiscal/saida" replace />} />
        <Route path="/bi" element={<Navigate to="/bi/previsao" replace />} />
        <Route path="/relatorios" element={<Navigate to="/relatorios/kits" replace />} />
        <Route path="/" element={<Navigate to="/producao/produtos" replace />} />
      </Routes>
    </Suspense>
  );
}
