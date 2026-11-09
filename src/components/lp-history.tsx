"use client";

/**
 * Evolución de LP de una cola, con las clasificatorias que la app registró (lp.json de la app de
 * escritorio). Riot no entrega el historial de LP, así que solo hay datos desde que se usa RiftLab
 * y en el perfil de la cuenta que jugó.
 */
import { signed, useLpChanges } from "@/components/match-lp";
import { TIER_LABEL, TIERS, type Tier } from "@/lib/constants";
import type { LpChange } from "@/lib/live";
import { row, tip, warn } from "@/lib/tip";

const DIVISIONS = ["IV", "III", "II", "I"];
/** Desde Maestro los LP siguen corriendo sin divisiones. */
const APEX_BASE = TIERS.indexOf("MASTER") * 400;

/** Posición en la escalera: 100 por división, así subir de división no corta la línea. */
function ladder(tier: string, division: string, lp: number): number {
  const t = TIERS.indexOf(tier as Tier);
  if (t < 0) return NaN;
  if (t * 400 >= APEX_BASE) return APEX_BASE + lp;
  return t * 400 + Math.max(0, DIVISIONS.indexOf(division)) * 100 + lp;
}

/** "Diamante III 55 LP" a partir de la posición; en la cima usa el rango que se conoce. */
function rankName(value: number, apexTier = "MASTER"): string {
  if (value >= APEX_BASE) return `${TIER_LABEL[apexTier as Tier] ?? apexTier} ${value - APEX_BASE} LP`;
  const t = Math.floor(value / 400);
  const d = Math.floor((value % 400) / 100);
  return `${TIER_LABEL[TIERS[t]]} ${DIVISIONS[d]} ${value % 100} LP`;
}

/** Nombre corto de una línea guía: "Diamante III" o "Maestro 200". */
function lineName(value: number): string {
  if (value >= APEX_BASE) return `${TIER_LABEL.MASTER} ${value - APEX_BASE}`;
  return `${TIER_LABEL[TIERS[Math.floor(value / 400)]]} ${DIVISIONS[Math.floor((value % 400) / 100)]}`;
}

const when = (at: number) =>
  new Date(at).toLocaleString("es-CL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
const day = (at: number) => new Date(at).toLocaleDateString("es-CL", { day: "numeric", month: "short" });

interface Point {
  value: number;
  kind: "start" | "win" | "loss" | "now";
  label: string;
}

export function LpHistory({
  riotId,
  queueId,
  current,
}: {
  riotId: string;
  queueId: number;
  current?: { tier: string; rank: string; leaguePoints: number };
}) {
  const all = useLpChanges();
  const games: (LpChange & { value: number })[] = Object.values(all)
    .filter((c) => c.queueId === queueId && c.riotId.toLowerCase() === riotId.toLowerCase())
    .map((c) => ({ ...c, value: ladder(c.tier, c.division, c.lp) }))
    .filter((c) => Number.isFinite(c.value))
    .sort((a, b) => a.at - b.at);
  if (!games.length) return null;

  const first = games[0];
  const last = games.at(-1)!;
  const points: Point[] = [
    {
      value: first.value - first.delta,
      kind: "start",
      label: tip("Antes de la primera registrada", row("Rango", rankName(first.value - first.delta, first.tier))),
    },
    ...games.map(
      (g): Point => ({
        value: g.value,
        kind: g.delta >= 0 ? "win" : "loss",
        label: tip(when(g.at), row("Resultado", `${signed(g.delta)} LP`), row("Quedaste en", rankName(g.value, g.tier))),
      }),
    ),
  ];
  const now = current ? ladder(current.tier, current.rank, current.leaguePoints) : NaN;
  if (Number.isFinite(now) && now !== last.value) {
    points.push({
      value: now,
      kind: "now",
      label: tip(
        "Ahora, según Riot",
        row("Rango", rankName(now, current!.tier)),
        row("Desde la última registrada", `${signed(now - last.value)} LP`),
        warn("Jugaste clasificatorias con RiftLab cerrada; esas no aparecen una por una."),
      ),
    });
  }

  const values = points.map((p) => p.value);
  const lo = Math.floor((Math.min(...values) - 10) / 100) * 100;
  const hi = Math.max(lo + 100, Math.ceil((Math.max(...values) + 10) / 100) * 100);
  const steps = (hi - lo) / 100;
  const every = steps > 5 ? 400 : 100;
  const guides = Array.from({ length: steps + 1 }, (_, i) => lo + i * 100).filter((v) => v % every === 0 || v === lo || v === hi);
  // Las divisiones se nombran en el medio de su franja (la línea es donde empieza); en la cima,
  // donde no hay divisiones, se nombran las líneas de LP.
  const labels: { at: number; text: string }[] = [];
  for (let v = lo; v <= hi; v += 100) {
    if (v >= APEX_BASE) {
      if (v % every === 0 || v === lo) labels.push({ at: v, text: lineName(v) });
    } else if (v < hi && steps <= 5) {
      labels.push({ at: v + 50, text: lineName(v) });
    } else if (v < hi && (v % 400 === 0 || v === lo)) {
      const end = Math.min(hi, APEX_BASE, (Math.floor(v / 400) + 1) * 400);
      labels.push({ at: (v + end) / 2, text: TIER_LABEL[TIERS[Math.floor(v / 400)]] });
    }
  }
  const x = (i: number) => (points.length > 1 ? (i / (points.length - 1)) * 100 : 50);
  const y = (v: number) => ((hi - v) / (hi - lo)) * 100;
  const recorded = points.filter((p) => p.kind !== "now");
  const line = recorded.map((p, i) => `${x(i)},${y(p.value)}`).join(" ");
  const peak = games.reduce((a, b) => (b.value > a.value ? b : a));
  const net = (points.at(-1)!.value - points[0].value) | 0;
  const small = points.length > 30;

  return (
    <figure className="mt-4 border-t border-line pt-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm text-muted">Evolución de LP</h3>
        <span className={`font-display text-base font-semibold ${net >= 0 ? "text-win" : "text-loss"}`}>{signed(net)} LP</span>
      </div>

      <div className="mt-2 grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-2" aria-hidden="true">
        <div className="relative h-28 text-[10px] text-dim">
          {labels.map((l) => (
            <span key={l.at} className="absolute right-0 -translate-y-1/2 whitespace-nowrap" style={{ top: `${y(l.at)}%` }}>
              {l.text}
            </span>
          ))}
        </div>
        <div className="relative mx-2 h-28">
          {guides.map((v) => (
            <div
              key={v}
              className={`absolute -inset-x-2 border-t ${v % 400 === 0 ? "border-line" : "border-dashed border-line/60"}`}
              style={{ top: `${y(v)}%` }}
            />
          ))}
          <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polyline
              points={line}
              fill="none"
              stroke="var(--color-gold)"
              strokeWidth={2}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            {points.at(-1)!.kind === "now" && (
              <line
                x1={x(recorded.length - 1)}
                y1={y(last.value)}
                x2={100}
                y2={y(now)}
                stroke="var(--color-dim)"
                strokeWidth={2}
                strokeDasharray="4 4"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>
          {points.map((p, i) => (
            <span
              key={i}
              title={p.label}
              className="absolute grid h-5 w-5 -translate-x-1/2 -translate-y-1/2 cursor-help place-items-center rounded-full hover:bg-raised"
              style={{ left: `${x(i)}%`, top: `${y(p.value)}%` }}
            >
              <span
                className={`rounded-full ring-2 ring-surface ${small ? "h-1.5 w-1.5" : "h-2.5 w-2.5"} ${
                  p.kind === "win" ? "bg-win" : p.kind === "loss" ? "bg-loss" : p.kind === "now" ? "bg-ink" : "bg-dim"
                }`}
              />
            </span>
          ))}
        </div>
        <span />
        <div className="mx-2 mt-1 flex justify-between text-[11px] text-dim">
          <span>{day(first.at)}</span>
          <span>{points.at(-1)!.kind === "now" ? "Ahora" : day(last.at)}</span>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-xs text-muted">Mejor registrado</dt>
          <dd className="font-semibold">{rankName(peak.value, peak.tier)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Partidas registradas</dt>
          <dd className="font-semibold">
            <span className="text-win">{games.filter((g) => g.delta >= 0).length}V</span>{" "}
            <span className="text-loss">{games.filter((g) => g.delta < 0).length}D</span>
          </dd>
        </div>
      </dl>

      <ol className="sr-only">
        {points.map((p, i) => (
          <li key={i}>{p.label.split("\t").join(": ").split("\n").join(". ")}</li>
        ))}
      </ol>

      <figcaption className="mt-2 text-xs text-dim">Se registran las clasificatorias que juegas con RiftLab abierta.</figcaption>
    </figure>
  );
}
