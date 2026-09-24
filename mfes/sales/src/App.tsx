import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { CompanyHeaderInfo, Loading, companyHeaderInfo, configApi, salesApi, stockApi } from "@erp/shared";
import { RouteReport } from "./RouteReport";
import { RoutesPlanner } from "./RoutesPlanner";
import { Weighing } from "./Weighing";
import { OrderWeighing } from "./OrderWeighing";
import { Orders } from "./Orders";
import { Picking } from "./Picking";
import { Delivery } from "./Delivery";

export default function App() {
  const segs = useLocation().pathname.split("/").filter(Boolean);
  const isPdv = segs[0] === "pdv";
  const planId = segs[0] === "logistica" && segs[1] === "rotas" && segs[2] ? segs[2] : "";
  const page = planId ? "relatorio" : segs.pop() || "pedidos";
  const [customers, setCustomers] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [assemblies, setAssemblies] = useState<any[]>([]);
  const [balances, setBalances] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [methods, setMethods] = useState<any[]>([]);
  const [terms, setTerms] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [defaultWarehouse, setDefaultWarehouse] = useState("");
  const [company, setCompany] = useState<CompanyHeaderInfo | undefined>(undefined);

  async function load() {
    try {
      const [c, o, p, w, m, t, defWh, salePrices, b, asm, co] = await Promise.all([
        configApi.customers(),
        salesApi.orders(),
        stockApi.products(),
        stockApi.warehouses(),
        configApi.paymentMethods(),
        configApi.paymentTerms(),
        configApi.setting("default_warehouse_id").catch(() => ({ value: "" })),
        stockApi.salePrices().catch(() => []),
        stockApi.balances().catch(() => []),
        stockApi.assemblies().catch(() => []),
        configApi.company().catch(() => null),
      ]);
      setCompany(companyHeaderInfo(co));
      setCustomers(c);
      setOrders(o);
      const latest: Record<string, number> = {};
      for (const h of salePrices) {
        if (latest[h.product_id] == null) latest[h.product_id] = Number(h.new_price);
      }
      setProducts(p.map((x: any) => ({ ...x, sale_price: latest[x.id] ?? x.sale_price })));
      setAssemblies(asm);
      setBalances(b);
      setWarehouses(w);
      setMethods(m);
      setTerms(t);
      setDefaultWarehouse(defWh.value || "");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
    const refresh = () => stockApi.balances().then(setBalances).catch(() => {});
    const onVis = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    const id = window.setInterval(refresh, 8000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(id);
    };
  }, []);

  return (
    <div>
      <h1>{page === "entrega" ? "Entrega" : page === "separacao" ? "Separação" : page === "pesagem" ? "Pesagem" : page === "pesagem-pedidos" ? "Pesagem de pedidos" : page === "rotas" ? "Rotas" : page === "relatorio" ? "Relatório de rota" : isPdv ? "PDV — Pedidos" : "Pedidos de venda"}</h1>
      {error && <p className="error">{error}</p>}
      {page === "relatorio" && planId ? (
        <RouteReport planId={planId} customers={customers} company={company} />
      ) : page === "rotas" ? (
        <RoutesPlanner customers={customers} />
      ) : loading ? (
        <Loading />
      ) : page === "separacao" ? (
        <Picking
          orders={orders}
          assemblies={assemblies}
          products={products}
          warehouses={warehouses}
          customers={customers}
          balances={balances}
          defaultWarehouse={defaultWarehouse}
          error={error}
          onReload={load}
          onError={setError}
          company={company}
        />
      ) : page === "pesagem" ? (
        <Weighing products={products} company={company} />
      ) : page === "pesagem-pedidos" ? (
        <OrderWeighing orders={orders} products={products} assemblies={assemblies} customers={customers} company={company} />
      ) : page === "entrega" ? (
        <Delivery orders={orders} products={products} customers={customers} onReload={load} onError={setError} company={company} />
      ) : (
        <Orders
          customers={customers}
          products={products}
          assemblies={assemblies}
          methods={methods}
          terms={terms}
          orders={orders}
          balances={balances}
          onReload={load}
          onError={setError}
          pdv={isPdv}
        />
      )}
    </div>
  );
}
