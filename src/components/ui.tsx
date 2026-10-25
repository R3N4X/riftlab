import Link from "next/link";
import { PLATFORMS, RANK_FILTERS, ROLE_LABEL, ROLES, isPlatform, type RankFilter, type Role } from "@/lib/constants";
import { dateLabel, num } from "@/lib/format";
import { getDatasetInfo } from "@/lib/stats";
import { RoleIcon } from "./icons";

export function PageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <header className="border-b border-line px-4 pt-8 pb-6 sm:px-8">
      <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">{title}</h1>
      {children && <div className="mt-2 max-w-3xl text-muted">{children}</div>}
    </header>
  );
}

export function Section({ title, aside, children, className = "" }: { title: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={className}>
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 className="font-display text-2xl font-semibold">{title}</h2>
        {aside && <div className="text-sm text-muted">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

export function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-line bg-surface ${className}`}>{children}</div>;
}

/** Indica de dónde salen los números de la página. */
export async function DataSourceNote() {
  const info = await getDatasetInfo();
  const platformLabel = (list: string[]) =>
    list.length > 4 ? `${list.length} servidores` : list.map((p) => (isPlatform(p) ? PLATFORMS[p].label : p)).join(", ");

  if (info.collecting) {
    const { matches, needed, patch, platforms } = info.collecting;
    return (
      <div className="mx-4 mt-4 rounded-md border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-gold-soft sm:mx-8">
        <p>
          Juntando partidas reales del parche {patch} en {platformLabel(platforms)}: {num(matches)} de {num(needed)}.{" "}
          {info.source === "demo"
            ? "Mientras tanto ves estadísticas de demostración (campeones, objetos y runas reales; porcentajes inventados)."
            : `Mientras tanto ves las estadísticas del parche ${info.patch} (${num(info.totalMatches)} partidas).`}
        </p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-night/60" role="progressbar" aria-valuenow={matches} aria-valuemax={needed}>
          <div className="h-full bg-gold" style={{ width: `${Math.min(100, (matches / needed) * 100)}%` }} />
        </div>
      </div>
    );
  }
  if (info.source === "demo") {
    return (
      <div className="mx-4 mt-4 rounded-md border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-gold-soft sm:mx-8">
        Estás viendo estadísticas de demostración generadas sobre el parche {info.patch}. Campeones, objetos y runas son reales;
        los porcentajes no. Para usar partidas reales, agrega tu API key de Riot y ejecuta <code className="rounded bg-night/60 px-1">npm run aggregate</code>.
      </div>
    );
  }
  return (
    <p className="mx-4 mt-4 text-sm text-dim sm:mx-8">
      {num(info.totalMatches)} partidas clasificatorias del parche {info.patch} ({platformLabel(info.platforms)}), actualizado el{" "}
      {dateLabel(info.generatedAt)}.
    </p>
  );
}

type Query = Record<string, string | undefined>;

function href(base: string, query: Query): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v) params.set(k, v);
  const s = params.toString();
  return s ? `${base}?${s}` : base;
}

export function RoleTabs({ base, current, query, includeAll = true }: { base: string; current: Role | "ALL"; query: Query; includeAll?: boolean }) {
  const options: (Role | "ALL")[] = includeAll ? ["ALL", ...ROLES] : [...ROLES];
  return (
    <div className="flex flex-wrap gap-1 rounded-lg border border-line bg-surface p-1" role="tablist" aria-label="Línea">
      {options.map((r) => {
        const active = r === current;
        return (
          <Link
            key={r}
            href={href(base, { ...query, role: r === "ALL" ? undefined : r })}
            role="tab"
            aria-selected={active}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${active ? "bg-raised text-ink" : "text-muted hover:text-ink"}`}
          >
            {r !== "ALL" && <RoleIcon role={r} size={16} className={active ? "" : "opacity-60"} />}
            {r === "ALL" ? "Todas" : ROLE_LABEL[r]}
          </Link>
        );
      })}
    </div>
  );
}

export function RankTabs({ base, current, query }: { base: string; current: RankFilter; query: Query }) {
  const shown: RankFilter[] = ["ALL", "SILVER", "GOLD", "PLATINUM_PLUS", "EMERALD_PLUS", "DIAMOND_PLUS", "MASTER_PLUS"];
  return (
    <div className="flex flex-wrap gap-1 rounded-lg border border-line bg-surface p-1" aria-label="Rango">
      {shown.map((r) => (
        <Link
          key={r}
          href={href(base, { ...query, rank: r })}
          aria-current={r === current ? "true" : undefined}
          className={`rounded-md px-3 py-1.5 text-sm transition-colors ${r === current ? "bg-raised text-gold-soft" : "text-muted hover:text-ink"}`}
        >
          {RANK_FILTERS[r].label}
        </Link>
      ))}
    </div>
  );
}

export function Skeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-2 px-4 py-6 sm:px-8" aria-busy="true" aria-label="Cargando">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-11 animate-pulse rounded-md bg-surface" />
      ))}
    </div>
  );
}

export function ErrorNote({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-loss/40 bg-loss/10 px-5 py-4">
      <p className="font-semibold text-ink">{title}</p>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
    </div>
  );
}

/* ---------- Tablas ordenables ---------- */

export type SortDir = "asc" | "desc";

export function parseSort<K extends string>(sp: Record<string, string | string[] | undefined>, keys: readonly K[], fallback: K) {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const raw = first(sp.orden);
  const key = keys.includes(raw as K) ? (raw as K) : fallback;
  const dir: SortDir = first(sp.dir) === "asc" ? "asc" : "desc";
  return { key, dir };
}

/** Ordena una copia de la lista según la columna y dirección elegidas. */
export function sortRows<T>(rows: T[], value: (row: T) => number, dir: SortDir): T[] {
  return [...rows].sort((a, b) => (dir === "asc" ? value(a) - value(b) : value(b) - value(a)));
}

/**
 * Encabezado de columna clicable: el primer clic ordena de mayor a menor
 * (lo mejor arriba) y el segundo de menor a mayor (lo peor arriba).
 */
export function SortHeader({
  label,
  sortKey,
  current,
  dir,
  base,
  query,
  align = "right",
  title,
  className = "",
}: {
  label: string;
  sortKey: string;
  current: string;
  dir: SortDir;
  base: string;
  query: Query;
  align?: "left" | "right" | "center";
  title?: string;
  className?: string;
}) {
  const active = current === sortKey;
  const nextDir: SortDir = active && dir === "desc" ? "asc" : "desc";
  const justify = align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";
  return (
    <th
      scope="col"
      aria-sort={active ? (dir === "desc" ? "descending" : "ascending") : "none"}
      className={`px-2 py-3 font-medium ${className}`}
      title={title}
    >
      <Link
        href={href(base, { ...query, orden: sortKey, dir: nextDir })}
        scroll={false}
        className={`inline-flex w-full items-center gap-1 ${justify} ${active ? "text-gold-soft" : "hover:text-ink"}`}
      >
        {label}
        <svg viewBox="0 0 10 14" className={`h-3 w-2.5 shrink-0 ${active ? "" : "opacity-40"}`} aria-hidden="true">
          <path d="M5 1 1.5 5h7z" fill={active && dir === "asc" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1" />
          <path d="M5 13 1.5 9h7z" fill={active && dir === "desc" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1" />
        </svg>
        <span className="sr-only">{active ? (dir === "desc" ? ", de mayor a menor" : ", de menor a mayor") : ", ordenar"}</span>
      </Link>
    </th>
  );
}
