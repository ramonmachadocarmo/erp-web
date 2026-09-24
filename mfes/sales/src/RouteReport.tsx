import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CompanyHeaderInfo, Loading, MapRoute, StatusBadge, addressQuery, mapsDirUrl, mapsStopUrl, openRoutePdf, salesApi, wazeNavUrl } from "@erp/shared";
import { addrLabel, km, mins, personName } from "./helpers";

export function RouteReport({ planId, customers, company }: { planId: string; customers: any[]; company?: CompanyHeaderInfo }) {
  const navigate = useNavigate();
  const [plan, setPlan] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    salesApi.getDeliveryPlan(planId)
      .then(setPlan)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [planId]);

  if (loading) return <Loading />;
  if (error) return <p className="error">{error}</p>;
  if (!plan) return <p className="muted">Rota não encontrada</p>;

  const stops = plan.stops || [];
  const legsDist = stops.reduce((n: number, s: any) => n + Number(s.distance_m || 0), 0);
  const legsDur = stops.reduce((n: number, s: any) => n + Number(s.duration_s || 0), 0);
  const retDist = Math.max(0, Number(plan.distance_m || 0) - legsDist);
  const retDur = Math.max(0, Number(plan.duration_s || 0) - legsDur);
  const depot = plan.center_lat ? { lat: plan.center_lat, lng: plan.center_lng } : undefined;
  // Links pro Maps/Waze vão pelo endereço em texto, não pelo lat/lng salvo — deixa o app de
  // navegação geocodificar, mais confiável que a coordenada cacheada (ver maps.ts).
  const addressedStops = stops.filter((s: any) => s.address && (s.address.street || s.address.zip));
  const mapsUrl = mapsDirUrl(depot, addressedStops.map((s: any) => addressQuery(s.address)));
  const first = addressedStops[0];

  function pdf() {
    openRoutePdf({
      title: "Relatorio de rota",
      vehicle: `${plan.vehicle_code || ""} ${plan.vehicle_name || ""}`.trim(),
      center: plan.center_name || "",
      status: plan.status,
      totals: `${stops.length} paradas · ${km(plan.distance_m)} · ${mins(plan.duration_s)} · retorno ${km(retDist)}`,
      stops: stops.map((s: any) => ({
        seq: s.seq,
        customer: personName(customers, s.customer_id),
        address: addrLabel(s.address),
        leg: `${km(s.distance_m)} · ${mins(s.duration_s)}`,
      })),
      company,
    }, `rota-${(plan.id || "").slice(0, 8)}.pdf`);
  }

  return (
    <div className="card">
      <div className="row">
        <button type="button" className="secondary" onClick={() => navigate("/logistica/rotas")}>Voltar</button>
        <button type="button" className="secondary" onClick={pdf}>PDF</button>
        {mapsUrl && <button type="button" className="secondary" onClick={() => window.open(mapsUrl, "_blank")}>Google Maps</button>}
        {first && <button type="button" className="secondary" onClick={() => window.open(wazeNavUrl(addressQuery(first.address)), "_blank")}>Waze (1ª parada)</button>}
      </div>
      <p style={{ marginTop: 12 }}>
        {plan.vehicle_code} {plan.vehicle_name} · {plan.center_name} · <StatusBadge status={plan.status} />
      </p>
      <p className="muted">
        {stops.length} paradas · {km(plan.distance_m)} · {mins(plan.duration_s)} · retorno {km(retDist)} · {mins(retDur)}
      </p>
      <MapRoute
        geometry={plan.geometry || []}
        depot={depot}
        stops={stops.filter((s: any) => s.lat && s.lng).map((s: any) => ({ lat: s.lat, lng: s.lng, label: String(s.seq) }))}
      />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Cliente</th>
              <th>Endereço</th>
              <th>Trecho</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {stops.map((s: any) => (
              <tr key={s.seq}>
                <td>{s.seq}</td>
                <td>{personName(customers, s.customer_id)}</td>
                <td className="muted">{addrLabel(s.address)}</td>
                <td className="muted">{km(s.distance_m)} · {mins(s.duration_s)}</td>
                <td className="row">
                  {s.address && (s.address.street || s.address.zip) && (
                    <>
                      <button type="button" className="secondary" onClick={() => window.open(mapsStopUrl(addressQuery(s.address)), "_blank")}>Maps</button>
                      <button type="button" className="secondary" onClick={() => window.open(wazeNavUrl(addressQuery(s.address)), "_blank")}>Waze</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>Retorno ao CD</td>
              <td className="muted">{km(retDist)} · {mins(retDur)}</td>
              <td></td>
            </tr>
            <tr>
              <th colSpan={3}>Total</th>
              <th>{km(plan.distance_m)} · {mins(plan.duration_s)}</th>
              <th></th>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
