export function pct(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function num(value: number): string {
  return value.toLocaleString("es-MX");
}

export function compact(value: number): string {
  return value.toLocaleString("es-MX", { notation: "compact", maximumFractionDigits: 1 });
}

/** Clase de color según winrate: verde arriba de 51 %, rosa abajo de 49 %. */
export function wrClass(wr: number): string {
  if (wr >= 0.53) return "text-win font-semibold";
  if (wr >= 0.51) return "text-win";
  if (wr <= 0.47) return "text-loss font-semibold";
  if (wr <= 0.49) return "text-loss";
  return "text-ink";
}

export function kda(k: number, d: number, a: number): string {
  return d === 0 ? "Perfecto" : ((k + a) / d).toFixed(2);
}

export function duration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function timeAgo(timestamp: number, now: number): string {
  const diff = Math.max(0, now - timestamp) / 1000;
  if (diff < 3600) return `hace ${Math.max(1, Math.round(diff / 60))} min`;
  if (diff < 86400) return `hace ${Math.round(diff / 3600)} h`;
  const days = Math.round(diff / 86400);
  return days === 1 ? "ayer" : `hace ${days} días`;
}

export function dateLabel(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
}
