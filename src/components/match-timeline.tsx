"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { compact } from "@/lib/format";
import type { ObjectiveType, TimelineObjective, TimelineSummary } from "@/lib/timeline";
import { SkillOrder } from "./build";
import { ItemIcon } from "./icons";

/**
 * Se monta solo al desplegar una partida: recién ahí pide la línea de tiempo
 * (una consulta a Riot por partida, cacheada en el servidor).
 */
export function MatchTimeline({
  platform,
  matchId,
  puuid,
  opponentPuuid,
  version,
}: {
  platform: string;
  matchId: string;
  puuid: string;
  opponentPuuid: string | null;
  version: string;
}) {
  const [data, setData] = useState<TimelineSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"team" | "lane">("team");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/partidas/${platform}/${matchId}/timeline`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "No se pudo cargar la línea de tiempo");
        return body as TimelineSummary;
      })
      .then((d) => !cancelled && setData(d))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [platform, matchId]);

  const myTeam = data?.teams[puuid];

  const series = useMemo(() => {
    if (!data || !myTeam) return [];
    if (mode === "lane" && opponentPuuid && data.gold[opponentPuuid]) {
      const mine = data.gold[puuid] ?? [];
      const theirs = data.gold[opponentPuuid];
      return mine.map((g, i) => g - (theirs[i] ?? 0));
    }
    const length = Math.max(...Object.values(data.gold).map((g) => g.length));
    return Array.from({ length }, (_, i) =>
      Object.entries(data.gold).reduce((sum, [p, g]) => sum + (data.teams[p] === myTeam ? 1 : -1) * (g[i] ?? 0), 0),
    );
  }, [data, mode, myTeam, puuid, opponentPuuid]);

  if (error) {
    return <p className="rounded-md border border-line bg-surface p-3 text-sm text-muted">No se pudo cargar la evolución de la partida: {error}</p>;
  }
  if (!data || myTeam === undefined) {
    return <div className="h-48 animate-pulse rounded-md bg-surface" aria-busy="true" aria-label="Cargando la evolución de la partida" />;
  }

  const visits = data.purchases[puuid] ?? [];
  const skills = data.skills[puuid] ?? "";

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-line bg-surface p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-semibold">{mode === "team" ? "Diferencia de oro entre equipos" : "Diferencia de oro con tu rival de línea"}</h4>
          <div className="flex gap-1 rounded-md border border-line p-0.5 text-xs">
            {(
              [
                ["team", "Equipos"],
                ["lane", "Tu línea"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                disabled={id === "lane" && !opponentPuuid}
                aria-pressed={mode === id}
                className={`rounded px-2 py-0.5 disabled:opacity-40 ${mode === id ? "bg-raised text-ink" : "text-muted hover:text-ink"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <GoldChart series={series} objectives={mode === "team" ? data.objectives : []} myTeam={myTeam} subject={mode === "team" ? "tu equipo" : "ti"} />
      </div>

      {visits.length > 0 && (
        <div className="rounded-md border border-line bg-surface p-3">
          <h4 className="mb-2 text-sm font-semibold">Orden de compra</h4>
          <ol className="flex flex-wrap items-start gap-x-1 gap-y-3">
            {visits.map((v, i) => (
              <li key={i} className="flex items-start gap-1">
                {i > 0 && (
                  <svg viewBox="0 0 12 12" className="mt-2 h-3 w-3 text-dim" aria-hidden="true">
                    <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                )}
                <div className="rounded bg-raised/50 px-1.5 py-1">
                  <div className="flex gap-0.5">
                    {v.items.map((id, j) => (
                      <ItemIcon key={j} version={version} id={id} name={data.itemNames[id]} size={24} />
                    ))}
                  </div>
                  <p className="mt-0.5 text-center text-[11px] text-dim">min {v.minute}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {skills.length >= 3 && (
        <div className="rounded-md border border-line bg-surface p-3">
          <h4 className="mb-2 text-sm font-semibold">Orden de habilidades</h4>
          <SkillOrder sequence={skills.slice(0, 18)} abilityNames={{}} />
        </div>
      )}
    </div>
  );
}

/* ---------- Gráfico ---------- */

const OBJECTIVE_LABEL: Record<ObjectiveType, { letter: string; name: string }> = {
  DRAGON: { letter: "D", name: "Dragón" },
  BARON: { letter: "B", name: "Barón Nashor" },
  HERALD: { letter: "H", name: "Heraldo" },
  HORDE: { letter: "L", name: "Larvas del Vacío" },
  ATAKHAN: { letter: "A", name: "Atakhan" },
  TOWER: { letter: "T", name: "Torre" },
  INHIBITOR: { letter: "I", name: "Inhibidor" },
};

const H = 200;
const M = { top: 12, right: 52, bottom: 46, left: 44 };

function niceMax(value: number) {
  const v = Math.max(1000, value);
  const step = v > 8000 ? 4000 : v > 4000 ? 2000 : 1000;
  return Math.ceil(v / step) * step;
}

const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${compact(Math.abs(n))}`;

function GoldChart({
  series,
  objectives,
  myTeam,
  subject,
}: {
  series: number[];
  objectives: TimelineObjective[];
  myTeam: number;
  subject: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  // useId trae caracteres que no sirven dentro de url(#...).
  const clipId = `gold${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(280, entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (series.length < 2) return <p className="text-sm text-muted">La partida fue demasiado corta para graficarla.</p>;

  const max = niceMax(Math.max(...series.map(Math.abs)));
  const innerW = width - M.left - M.right;
  const innerH = H - M.top - M.bottom;
  const x = (i: number) => M.left + (i / (series.length - 1)) * innerW;
  const y = (v: number) => M.top + ((max - v) / (2 * max)) * innerH;
  const y0 = y(0);
  const line = series.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const area = `${line}L${x(series.length - 1)},${y0}L${x(0)},${y0}Z`;
  const last = series[series.length - 1];
  const ticks = series.map((_, i) => i).filter((i) => i % 5 === 0);
  const markerY = H - 12;

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    setHover(Math.round(Math.min(1, Math.max(0, ratio)) * (series.length - 1)));
  }

  const hv = hover !== null ? series[hover] : null;

  return (
    <div ref={ref} className="relative">
      <svg
        width={width}
        height={H}
        role="img"
        aria-label={`Diferencia de oro minuto a minuto. Al final: ${signed(last)} para ${subject}.`}
        className="block"
      >
        <defs>
          <clipPath id={`${clipId}-up`}>
            <rect x={0} y={0} width={width} height={y0} />
          </clipPath>
          <clipPath id={`${clipId}-down`}>
            <rect x={0} y={y0} width={width} height={H - y0} />
          </clipPath>
        </defs>

        {/* Grilla y ejes */}
        {[max, max / 2, -max / 2, -max].map((v) => (
          <g key={v}>
            <line x1={M.left} x2={M.left + innerW} y1={y(v)} y2={y(v)} stroke="var(--color-line)" strokeDasharray="2 4" />
            <text x={M.left - 6} y={y(v)} textAnchor="end" dominantBaseline="middle" fontSize="11" fill="var(--color-dim)">
              {signed(v)}
            </text>
          </g>
        ))}
        <line x1={M.left} x2={M.left + innerW} y1={y0} y2={y0} stroke="var(--color-muted)" strokeWidth="1" />
        <text x={M.left - 6} y={y0} textAnchor="end" dominantBaseline="middle" fontSize="11" fill="var(--color-muted)">
          0
        </text>
        {ticks.map((i) => (
          <text key={i} x={x(i)} y={H - M.bottom + 14} textAnchor="middle" fontSize="11" fill="var(--color-dim)">
            {i}
          </text>
        ))}
        <text x={M.left + innerW} y={H - M.bottom + 14} textAnchor="end" fontSize="11" fill="var(--color-dim)" dx="22">
          min
        </text>

        {/* Ventaja (arriba, azul) y desventaja (abajo, rosa) */}
        <path d={area} fill="var(--chart-ahead)" fillOpacity="0.22" clipPath={`url(#${clipId}-up)`} />
        <path d={area} fill="var(--chart-behind)" fillOpacity="0.22" clipPath={`url(#${clipId}-down)`} />
        <path d={line} fill="none" stroke="var(--chart-ahead)" strokeWidth="2" strokeLinejoin="round" clipPath={`url(#${clipId}-up)`} />
        <path d={line} fill="none" stroke="var(--chart-behind)" strokeWidth="2" strokeLinejoin="round" clipPath={`url(#${clipId}-down)`} />

        {/* Valor final, rotulado directo */}
        <text x={x(series.length - 1) + 6} y={y(last)} dominantBaseline="middle" fontSize="12" fontWeight="600" fill="var(--color-ink)">
          {signed(last)}
        </text>

        {/* Objetivos en la fila inferior */}
        {objectives.map((o, i) => {
          const mine = o.teamId === myTeam;
          const label = OBJECTIVE_LABEL[o.type];
          const cx = x(Math.min(o.minute, series.length - 1));
          return (
            <g key={i}>
              <title>{`Min ${o.minute}: ${label.name} para ${mine ? "tu equipo" : "el rival"}`}</title>
              <circle cx={cx} cy={markerY} r={7} fill={mine ? "var(--chart-ahead)" : "var(--chart-behind)"} stroke="var(--color-surface)" strokeWidth="2" />
              <text x={cx} y={markerY} textAnchor="middle" dominantBaseline="central" fontSize="8" fontWeight="700" fill="var(--color-night)">
                {label.letter}
              </text>
            </g>
          );
        })}

        {/* Capa de lectura al pasar el mouse */}
        {hover !== null && hv !== null && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={M.top} y2={M.top + innerH} stroke="var(--color-muted)" strokeWidth="1" />
            <circle cx={x(hover)} cy={y(hv)} r={4.5} fill={hv >= 0 ? "var(--chart-ahead)" : "var(--chart-behind)"} stroke="var(--color-surface)" strokeWidth="2" />
          </g>
        )}
        <rect
          x={M.left}
          y={M.top}
          width={innerW}
          height={innerH}
          fill="transparent"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        />
      </svg>

      {hover !== null && hv !== null && (
        <div
          className="pointer-events-none absolute top-1 rounded-md border border-line bg-night px-2 py-1 text-xs shadow"
          style={{ left: Math.min(width - 150, Math.max(0, x(hover) + 10)) }}
        >
          <p className="text-muted">Minuto {hover}</p>
          <p className="font-semibold text-ink">
            {hv === 0 ? "Oro parejo" : `${compact(Math.abs(hv))} de oro a favor de ${hv > 0 ? subject : "el rival"}`}
          </p>
        </div>
      )}

      <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-dim">
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-[var(--chart-ahead)]" />
          Ventaja de {subject}
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-[var(--chart-behind)]" />
          Ventaja del rival
        </span>
        {objectives.length > 0 && <span>Letras: D dragón, H heraldo, L larvas, B barón, A Atakhan, T torre, I inhibidor</span>}
      </p>

      <table className="sr-only">
        <caption>Diferencia de oro cada 5 minutos</caption>
        <tbody>
          {ticks.map((i) => (
            <tr key={i}>
              <th>Minuto {i}</th>
              <td>{signed(series[i])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
