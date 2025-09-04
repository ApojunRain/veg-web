// src/utils/geo.ts
export type LatLng = { lat: number; lng: number };

export function haversineKm(a: LatLng, b: LatLng) {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// 先用等速近似（之後 Sprint2 會換成等時圈/路徑 ETA）
export function etaSec(distKm: number, mode: 'walk' | 'bike' = 'walk') {
  const v = mode === 'walk' ? 4.5 : 15; // km/h
  return Math.max(60, Math.round((distKm / v) * 3600));
}

export function formatEta(sec: number) {
  const m = Math.round(sec / 60);
  return m <= 1 ? '1 分鐘內' : `${m} 分`;
}
