import { useEffect, useRef } from "react";

type LeafletMap = {
  setView: (c: [number, number], z: number) => void;
  remove: () => void;
  on: (ev: string, fn: (e: { latlng: { lat: number; lng: number } }) => void) => void;
  invalidateSize: () => void;
};

type LeafletNS = {
  map: (el: HTMLElement, opts?: object) => LeafletMap;
  tileLayer: (url: string, opts?: object) => { addTo: (m: LeafletMap) => void };
  marker: (c: [number, number], opts?: object) => { addTo: (m: LeafletMap) => { setLatLng: (c: [number, number]) => void }; setLatLng: (c: [number, number]) => void };
  polyline: (latlngs: [number, number][], opts?: object) => { addTo: (m: LeafletMap) => { getBounds: () => unknown }; getBounds: () => unknown };
  divIcon: (opts: object) => unknown;
  featureGroup: (layers: unknown[]) => { getBounds: () => { pad: (n: number) => unknown } };
  Icon: { Default: { imagePath: string } };
};

declare global {
  interface Window {
    L?: LeafletNS;
  }
}

let leafletPromise: Promise<LeafletNS> | null = null;

export function loadLeaflet(): Promise<LeafletNS> {
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    if (!document.querySelector("link[data-leaflet]")) {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      css.setAttribute("data-leaflet", "1");
      document.head.appendChild(css);
    }
    const s = document.createElement("script");
    s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    s.onload = () => {
      const L = window.L!;
      L.Icon.Default.imagePath = "https://unpkg.com/leaflet@1.9.4/dist/images/";
      resolve(L);
    };
    s.onerror = () => reject(new Error("leaflet"));
    document.body.appendChild(s);
  });
  return leafletPromise;
}

type PickerProps = {
  lat?: number;
  lng?: number;
  onChange: (lat: number, lng: number) => void;
};

export function MapPicker({ lat, lng, onChange }: PickerProps) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<{ setLatLng: (c: [number, number]) => void } | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let dead = false;
    loadLeaflet().then((L) => {
      if (dead || !el.current || mapRef.current) return;
      const start: [number, number] = lat && lng ? [lat, lng] : [-15.78, -47.93];
      const map = L.map(el.current).setView(start, lat && lng ? 16 : 4);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
      }).addTo(map);
      if (lat && lng) markerRef.current = L.marker([lat, lng]).addTo(map);
      map.on("click", (e) => onChangeRef.current(e.latlng.lat, e.latlng.lng));
      mapRef.current = map;
      setTimeout(() => map.invalidateSize(), 80);
    });
    return () => {
      dead = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || lat == null || lng == null) return;
    loadLeaflet().then((L) => {
      const map = mapRef.current;
      if (!map) return;
      if (!markerRef.current) markerRef.current = L.marker([lat, lng]).addTo(map);
      else markerRef.current.setLatLng([lat, lng]);
      map.setView([lat, lng], 16);
    });
  }, [lat, lng]);

  return <div className="map-picker" ref={el} />;
}

type RouteProps = {
  geometry: number[][];
  stops: { lat: number; lng: number; label: string }[];
  depot?: { lat: number; lng: number };
};

export function MapRoute({ geometry, stops, depot }: RouteProps) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let map: LeafletMap | null = null;
    loadLeaflet().then((L) => {
      if (!el.current) return;
      const pts = (geometry || []).map((p) => [p[0], p[1]] as [number, number]);
      const start = depot ? [depot.lat, depot.lng] as [number, number] : pts[0] || [-15.78, -47.93];
      map = L.map(el.current).setView(start, 12);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
      }).addTo(map);
      const layers: unknown[] = [];
      if (pts.length) {
        const line = L.polyline(pts, { color: "#3d8bfd", weight: 4 });
        line.addTo(map);
        layers.push(line);
      }
      if (depot) {
        const m = L.marker([depot.lat, depot.lng], {
          icon: L.divIcon({ className: "map-stop depot", html: "CD", iconSize: [28, 28], iconAnchor: [14, 14] }),
        });
        m.addTo(map);
        layers.push(m);
      }
      stops.forEach((s, i) => {
        const m = L.marker([s.lat, s.lng], {
          icon: L.divIcon({ className: "map-stop", html: String(i + 1), iconSize: [28, 28], iconAnchor: [14, 14] }),
        });
        m.addTo(map);
        layers.push(m);
      });
      if (layers.length) map.invalidateSize();
      setTimeout(() => map?.invalidateSize(), 80);
    });
    return () => map?.remove();
  }, [geometry, stops, depot]);
  return <div className="map-picker map-route" ref={el} />;
}
