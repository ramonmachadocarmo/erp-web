export type Geo = { lat: number; lng: number };

export type AddressLike = {
  street?: string;
  number?: string;
  complement?: string;
  district?: string;
  city?: string;
  state?: string;
  zip?: string;
};

// Formatada como um geocoder postal espera (sem apelido/complemento, sem os separadores "·" da UI)
// — deixa o próprio Google Maps/Waze resolverem a coordenada em vez de confiar no lat/lng salvo no
// endereço, que vem de um geocode automático (rota resolveGeo, sales-service) e pode ficar impreciso
// pra sempre depois de um acerto ruim inicial. Endereço do depósito/centro não passa por isso — é
// cadastrado com coordenada curada direto, não tem esse problema.
export function addressQuery(a?: AddressLike): string {
  if (!a) return "";
  const line1 = [a.street, a.number].filter(Boolean).join(", ");
  const cityState = a.city && a.state ? `${a.city} - ${a.state}` : a.city || a.state || "";
  return [line1, a.district, cityState, a.zip, "Brasil"].filter(Boolean).join(", ");
}

export function mapsDirUrl(origin: Geo | undefined, stopAddresses: string[]) {
  const pts = stopAddresses.filter(Boolean);
  if (!pts.length) return "";
  const segs = [origin && origin.lat ? `${origin.lat},${origin.lng}` : undefined, ...pts.map(encodeURIComponent)].filter(Boolean);
  return `https://www.google.com/maps/dir/${segs.join("/")}`;
}

export function mapsStopUrl(address: string) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}&travelmode=driving`;
}

export function wazeNavUrl(address: string) {
  return `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`;
}
