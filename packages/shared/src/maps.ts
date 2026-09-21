export type Geo = { lat: number; lng: number };

export function mapsDirUrl(origin: Geo | undefined, stops: Geo[]) {
  const pts = stops.filter((s) => s.lat && s.lng);
  if (!pts.length) return "";
  const path = [origin && origin.lat ? origin : undefined, ...pts].filter(Boolean) as Geo[];
  return `https://www.google.com/maps/dir/${path.map((p) => `${p.lat},${p.lng}`).join("/")}`;
}

export function mapsStopUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
}

export function wazeNavUrl(lat: number, lng: number) {
  return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
}
