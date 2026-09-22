import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Autocomplete, DataTable, DataTableColumn, Loading, MapRoute, StatusBadge, configApi, salesApi } from "@erp/shared";
import { addrLabel, fmtDate, km, mins, personName } from "./helpers";

export function RoutesPlanner({ customers }: { customers: any[] }) {
  const navigate = useNavigate();
  const [candidates, setCandidates] = useState<any[]>([]);
  const [centers, setCenters] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [centerId, setCenterId] = useState("");
  const [vehicleIds, setVehicleIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState<any>(null);
  const [active, setActive] = useState<any>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
    const [choice, setChoice] = useState(0);
  // "" = todas as datas, "none" = pedidos sem data, senão YYYY-MM-DD
  const [dateFilter, setDateFilter] = useState("");


  async function load() {
    try {
      const [cands, cds, vs, pl] = await Promise.all([
        salesApi.deliveryCandidates(),
        configApi.centers(),
        configApi.vehicles(),
        salesApi.deliveryPlans(),
      ]);
      setCandidates(cands);
      setCenters(cds);
      setVehicles(vs.filter((v: any) => v.active !== false));
      setPlans(pl);
      if (!centerId && cds[0]) setCenterId(cds[0].id);
      if (vehicleIds.length === 0 && vs[0]) setVehicleIds([vs[0].id]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    setChoice(0);
  }, [active?.id]);

  async function build() {
    const orderIds = Object.keys(selected).filter((id) => selected[id]);
    if (!centerId || vehicleIds.length === 0 || orderIds.length === 0) {
      setError("Selecione CD, veículos e entregas");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const out = await salesApi.createDeliveryPlans({ center_id: centerId, vehicle_ids: vehicleIds, order_ids: orderIds });
      setResult(out);
      setActive(out.plans?.[0] || null);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!active?.id) return;
    setBusy(true);
    setError("");
    try {
      const p = await salesApi.confirmDeliveryPlan(active.id, {
        distance_m: viewDist,
        duration_s: viewDur,
        geometry: viewGeom,
        stops: viewStops,
      });
      navigate(`/logistica/rotas/${p.id}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

    // Rotas são montadas por data de entrega (o backend nunca mistura datas numa rota); o filtro só
  // facilita escolher o dia. Trocar o filtro limpa a seleção para não enviar pedidos escondidos.
  const dates = Array.from(new Set(candidates.map((c) => c.delivery_date || ""))).sort((a, b) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)));
  const open = candidates.filter((c) => !dateFilter || (dateFilter === "none" ? !c.delivery_date : c.delivery_date === dateFilter));
  const shown = result?.plans?.length ? result.plans : active ? [active] : [];
  const cd = centers.find((c) => c.id === (shown[0]?.center_id || centerId));
  const opt = active?.options?.[choice];
  const viewStops = opt?.stops || active?.stops || [];
  const viewGeom = opt?.geometry || active?.geometry || [];
  const viewDist = Number(opt?.distance_m ?? active?.distance_m ?? 0);
  const viewDur = Number(opt?.duration_s ?? active?.duration_s ?? 0);
  const legsDist = viewStops.reduce((n: number, s: any) => n + Number(s.distance_m || 0), 0);
  const legsDur = viewStops.reduce((n: number, s: any) => n + Number(s.duration_s || 0), 0);
  const retDist = Math.max(0, viewDist - legsDist);
  const retDur = Math.max(0, viewDur - legsDur);
  const allSelected = open.length > 0 && open.every((c) => selected[c.id]);
  const stopByOrder: Record<string, any> = {};
  for (const s of viewStops) stopByOrder[s.sales_order_id] = s;
  const routeOf: Record<string, string> = {};
  for (const p of shown) {
    for (const s of p.stops || []) {
      routeOf[s.sales_order_id] = `${p.vehicle_code || ""} ${p.vehicle_name || ""}`.trim();
    }
  }

  const candidateColumns: DataTableColumn<any>[] = [
    {
      key: "select",
      label: "",
      sortable: false,
      filterable: false,
      render: (c) => (
        <input type="checkbox" checked={!!selected[c.id]} onChange={(e) => setSelected((s) => ({ ...s, [c.id]: e.target.checked }))} />
      ),
    },
    { key: "seq", label: "#", value: (c) => stopByOrder[c.id]?.seq ?? null, render: (c) => stopByOrder[c.id]?.seq ?? "—" },
        { key: "delivery_date", label: "Entrega", value: (c) => c.delivery_date || "", render: (c) => fmtDate(c.delivery_date) },
    { key: "customer", label: "Cliente", value: (c) => personName(customers, c.customer_id) },
    { key: "address", label: "Endereço", value: (c) => addrLabel(c.address), render: (c) => <span className="muted">{addrLabel(c.address)}</span> },
    { key: "weight_kg", label: "kg", value: (c) => Number(c.weight_kg || 0), render: (c) => Number(c.weight_kg || 0).toFixed(1) },
    { key: "volume_m3", label: "m³", value: (c) => Number(c.volume_m3 || 0), render: (c) => Number(c.volume_m3 || 0).toFixed(3) },
    {
      key: "has_geo",
      label: "Geo",
      value: (c) => (c.has_geo ? "OK" : "Sem coordenada"),
      render: (c) => (c.has_geo ? <span className="badge ok">OK</span> : <span className="badge warn">Sem coordenada</span>),
    },
    {
      key: "leg",
      label: "Trecho",
      value: (c) => stopByOrder[c.id]?.distance_m ?? null,
      render: (c) => {
        const st = stopByOrder[c.id];
        return <span className="muted">{st ? `${km(st.distance_m)} · ${mins(st.duration_s)}` : "—"}</span>;
      },
    },
    {
      key: "route",
      label: "Rota",
      value: (c) => routeOf[c.id] || (c.planned ? "Na rota" : ""),
      render: (c) => routeOf[c.id] || (c.planned ? <span className="badge">Na rota</span> : "—"),
    },
  ];

  const planColumns: DataTableColumn<any>[] = [
        { key: "delivery_date", label: "Entrega", value: (p) => p.delivery_date || "", render: (p) => fmtDate(p.delivery_date) },
    { key: "vehicle", label: "Veículo", value: (p) => `${p.vehicle_code || ""} ${p.vehicle_name || ""}`.trim() },
    { key: "status", label: "Status", value: (p) => p.status, render: (p) => <StatusBadge status={p.status} /> },
    { key: "stops", label: "Paradas", value: (p) => p.stops?.length || 0 },
    { key: "distance_m", label: "km", value: (p) => Number(p.distance_m || 0), render: (p) => km(p.distance_m) },
    {
      key: "actions",
      label: "",
      sortable: false,
      filterable: false,
      render: (p) => (
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <button type="button" className="secondary" onClick={() => {
            const next: Record<string, boolean> = {};
            for (const s of p.stops || []) next[s.sales_order_id] = true;
            setSelected(next);
            setActive(p);
            setResult(null);
          }}>Ver</button>
          {p.status !== "PLANNED" && (
            <button type="button" className="secondary" onClick={() => navigate(`/logistica/rotas/${p.id}`)}>Relatório</button>
          )}
        </div>
      ),
    },
  ];

  function toggleAll() {
    if (allSelected) {
      setSelected({});
      return;
    }
    const next: Record<string, boolean> = {};
    for (const c of open) next[c.id] = true;
    setSelected(next);
  }

  return (
    <div>
      {error && <p className="error">{error}</p>}
      {loading || busy ? (
        <Loading label={busy ? "Aguarde..." : undefined} />
      ) : (
        <>
      <div className="card">
        <div className="row">
          <div className="field">
            <label>Centro de distribuição</label>
            <Autocomplete
              required
              value={centerId}
              options={centers.map((c) => ({ value: c.id, code: c.code, description: c.name }))}
              onChange={setCenterId}
            />
          </div>
        </div>
                <div className="row" style={{ marginTop: 12 }}>
          <div className="field">
            <label>Data de entrega</label>
            <select value={dateFilter} onChange={(e) => { setDateFilter(e.target.value); setSelected({}); }}>
              <option value="">Todas as datas</option>
              {dates.map((d) => (
                <option key={d || "none"} value={d || "none"}>{d ? fmtDate(d) : "Sem data"}</option>
              ))}
            </select>
          </div>
        </div>
        <p className="muted">Veículos</p>
        <div className="row">
          {vehicles.map((v) => (
            <label className="check" key={v.id}>
              <input
                type="checkbox"
                checked={vehicleIds.includes(v.id)}
                onChange={(e) => setVehicleIds(e.target.checked ? [...vehicleIds, v.id] : vehicleIds.filter((id) => id !== v.id))}
              />
              {v.code} {v.name} ({v.capacity_kg} kg · {v.capacity_m3} m³)
            </label>
          ))}
        </div>
        <p className="muted">As rotas são montadas por data de entrega: pedidos de datas diferentes nunca vão na mesma rota. Marque N veículos para separar em N rotas. Desmarque entregas e monte de novo para otimizar.</p>
        <div className="row" style={{ marginTop: 12 }}>
          <button type="button" className="secondary" disabled={open.length === 0} onClick={toggleAll}>
            {allSelected ? "Limpar seleção" : "Selecionar todos"}
          </button>
          <button type="button" disabled={busy} onClick={build}>{result?.plans?.length ? "Remontar rotas" : "Montar rotas"}</button>
        </div>
      </div>
      {result?.skipped?.length > 0 && (
        <p className="error">Fora da rota: {result.skipped.map((s: any) => `${(s.order_id || "").slice(0, 8)} (${s.reason})`).join(" · ")}</p>
      )}
      {shown.length > 0 && (
        <div className="row" style={{ marginTop: 12, alignItems: "stretch" }}>
          {shown.map((p: any) => (
            <div className="card" key={p.id} style={{ cursor: "pointer", outline: active?.id === p.id ? "2px solid var(--accent)" : undefined }} onClick={() => setActive(p)}>
              <h2>{p.vehicle_code} {p.vehicle_name}{p.delivery_date ? ` · ${fmtDate(p.delivery_date)}` : ""}</h2>
              <p className="muted">{p.stops?.length || 0} paradas · {km(p.distance_m)} · {mins(p.duration_s)}</p>
              <p>Ocupação {Number(p.occupancy_pct || 0).toFixed(0)}% · {Number(p.weight_kg || 0).toFixed(1)} kg · {Number(p.volume_m3 || 0).toFixed(3)} m³</p>
            </div>
          ))}
        </div>
      )}
      {active && (
        <div className="card" style={{ marginTop: 12 }}>
          {(active.options || []).length > 1 && (
            <div className="row" style={{ marginBottom: 12 }}>
              {active.options.map((o: any, i: number) => (
                <button
                  key={o.label + i}
                  type="button"
                  className={choice === i ? "" : "secondary"}
                  onClick={() => setChoice(i)}
                >
                  {o.label}{o.selected ? " · em uso" : ""} · {km(o.distance_m)} · {mins(o.duration_s)}
                </button>
              ))}
            </div>
          )}
          <p className="muted" style={{ marginBottom: 8 }}>
            Total {viewStops.length} paradas · {km(viewDist)} · {mins(viewDur)} · retorno {km(retDist)} · {mins(retDur)}
          </p>
          <div className="row" style={{ marginBottom: 12 }}>
            {(active.status === "PLANNED" || !active.status) && (
              <button type="button" onClick={confirm}>Confirmar rota</button>
            )}
            {active.status && active.status !== "PLANNED" && (
              <button type="button" onClick={() => navigate(`/logistica/rotas/${active.id}`)}>Relatório</button>
            )}
          </div>
          <MapRoute
            key={`${active.id}-${choice}`}
            geometry={viewGeom}
            depot={cd ? { lat: cd.lat, lng: cd.lng } : undefined}
            stops={viewStops.filter((s: any) => s.lat && s.lng && selected[s.sales_order_id] !== false).map((s: any) => ({
              lat: s.lat, lng: s.lng, label: String(s.seq),
            }))}
          />
        </div>
      )}
      <div className="card" style={{ marginTop: 12 }}>
        <DataTable columns={candidateColumns} rows={open} rowKey={(c) => c.id} emptyMessage="Nenhuma entrega separada (status PICKED)." />
        {active && (
          <p className="muted" style={{ marginTop: 8 }}>
            Retorno ao CD: {km(retDist)} · {mins(retDur)} — Total: {km(viewDist)} · {mins(viewDur)}
          </p>
        )}
      </div>
      {plans.length > 0 && !result?.plans?.length && (
        <div className="card" style={{ marginTop: 12 }}>
          <h2>Planos</h2>
          <DataTable columns={planColumns} rows={plans} rowKey={(p) => p.id} emptyMessage="Nenhum plano gerado ainda." />
        </div>
      )}
        </>
      )}
    </div>
  );
}
