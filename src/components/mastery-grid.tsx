"use client";

/** Todos los campeones con maestría de un jugador, con orden y búsqueda. */
import Link from "next/link";
import { useMemo, useState } from "react";
import { img } from "@/lib/assets";
import { timeAgo } from "@/lib/format";
import { ChampIcon } from "./icons";

export interface MasteryRow {
  key: string;
  id: string;
  name: string;
  level: number;
  points: number;
  /** Puntos dentro del nivel actual y los que faltan para el siguiente. */
  since: number;
  until: number;
  lastPlayTime: number;
}

const SORTS = {
  puntos: { label: "Puntos", by: (a: MasteryRow, b: MasteryRow) => b.points - a.points },
  nivel: { label: "Nivel", by: (a: MasteryRow, b: MasteryRow) => b.level - a.level || b.points - a.points },
  reciente: { label: "Jugado hace poco", by: (a: MasteryRow, b: MasteryRow) => b.lastPlayTime - a.lastPlayTime },
  nombre: { label: "Nombre", by: (a: MasteryRow, b: MasteryRow) => a.name.localeCompare(b.name, "es") },
} as const;

type SortId = keyof typeof SORTS;

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export function MasteryGrid({ rows, version, now }: { rows: MasteryRow[]; version: string; now: number }) {
  const [sort, setSort] = useState<SortId>("puntos");
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const q = fold(query.trim());
    return rows.filter((r) => !q || fold(r.name).includes(q)).sort(SORTS[sort].by);
  }, [rows, sort, query]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="maestria-buscar">
          Buscar campeón
        </label>
        <input
          id="maestria-buscar"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar campeón"
          autoComplete="off"
          className="h-9 w-full rounded-md border border-line bg-night px-3 text-sm outline-none placeholder:text-dim focus:border-gold sm:w-56"
        />
        <div className="flex flex-wrap gap-1" role="group" aria-label="Ordenar por">
          {(Object.keys(SORTS) as SortId[]).map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={sort === id}
              onClick={() => setSort(id)}
              className={`h-9 rounded-md px-3 text-sm transition-colors ${
                sort === id ? "bg-raised text-gold-soft" : "text-muted hover:bg-raised/60 hover:text-ink"
              }`}
            >
              {SORTS[id].label}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-muted">Ningún campeón coincide con “{query}”.</p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-3">
          {shown.map((r) => {
            const span = r.since + r.until;
            const progress = span > 0 ? r.since / span : 1;
            return (
              <li key={r.key} className="flex flex-col items-center rounded-lg border border-line bg-surface px-2 pt-3 pb-2.5 text-center">
                <Link href={`/campeones/${r.id}`} className="inline-block">
                  <ChampIcon version={version} id={r.id} name={r.name} size={56} />
                </Link>
                {/* Emblema montado sobre el borde del ícono, con el nivel encima, como en el perfil. */}
                <div className="relative -mt-3 flex flex-col items-center" title={`Maestría nivel ${r.level}`}>
                  <span className="relative z-10 rounded bg-night/90 px-1 text-[11px] leading-tight font-semibold text-ink">{r.level}</span>
                  <img src={img.masteryCrest(r.level)} alt="" width={40} height={45} loading="lazy" className="-mt-2 h-11 w-auto" />
                </div>
                <p className="mt-1 w-full truncate text-sm font-semibold">{r.name}</p>
                <p className="text-xs text-muted">{r.points.toLocaleString("es-CL")} p.</p>
                <div
                  className="mt-2 h-1 w-full overflow-hidden rounded-full bg-raised"
                  role="progressbar"
                  aria-label={`Progreso al nivel ${r.level + 1}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(progress * 100)}
                  title={r.until > 0 ? `Faltan ${r.until.toLocaleString("es-CL")} p. para el nivel ${r.level + 1}` : undefined}
                >
                  <div className="h-full rounded-full bg-gold/80" style={{ width: `${Math.round(progress * 100)}%` }} />
                </div>
                <p className="mt-1.5 text-[11px] text-dim">{r.lastPlayTime ? timeAgo(r.lastPlayTime, now) : "—"}</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
