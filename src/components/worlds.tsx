"use client";

import { useState, useSyncExternalStore } from "react";
import {
  MATCHES,
  STAGES,
  TEAMS,
  swissPools,
  swissStandings,
  teamLogo,
  type StageId,
  type TeamCode,
  type WorldsMatch,
} from "@/lib/worlds";

/*
 * Todo lo que depende de la hora va en el cliente: la página se arma en el servidor y ahí no se
 * sabe la zona horaria de quien mira. Se redondea al minuto para que el valor sea estable.
 */
function subscribeMinute(onChange: () => void) {
  const t = setInterval(onChange, 30_000);
  return () => clearInterval(t);
}
const currentMinute = () => Math.floor(Date.now() / 60_000) * 60_000;

function useNow(): number | null {
  return useSyncExternalStore(subscribeMinute, currentMinute, () => null);
}

const dayKey = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" });
const dayLabel = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long" });
const shortDay = new Intl.DateTimeFormat("es-MX", { weekday: "short", day: "numeric", month: "short" });
const timeLabel = new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false });

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const when = (iso: string) => `${shortDay.format(Date.parse(iso)).replace(/\./g, "")} · ${timeLabel.format(Date.parse(iso))}`;

/** Una serie al mejor de N dura cerca de una hora por mapa; sirve para saber si puede estar en juego. */
const seriesHours = (bestOf: WorldsMatch["bestOf"]) => (bestOf === 1 ? 1 : bestOf === 3 ? 3 : 5);

function isLive(match: WorldsMatch, now: number) {
  const start = Date.parse(match.start);
  return !match.score && now >= start && now < start + seriesHours(match.bestOf) * 3_600_000;
}

type StageState = "hecha" | "ahora" | "proxima";

function stageState(id: StageId, now: number): StageState {
  const stage = STAGES.find((s) => s.id === id)!;
  const matches = MATCHES.filter((m) => m.stage === id);
  if (matches.every((m) => m.score)) return "hecha";
  const first = Math.min(...matches.map((m) => Date.parse(m.start)));
  return now >= first || dayKey.format(now) >= stage.start ? "ahora" : "proxima";
}

export function WorldsSchedule() {
  const now = useNow();
  if (now === null) return <div className="h-96 animate-pulse rounded-lg bg-surface" aria-hidden="true" />;

  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = dayKey.format(now);
  const days = new Map<string, WorldsMatch[]>();
  for (const match of MATCHES) {
    const key = dayKey.format(Date.parse(match.start));
    days.set(key, [...(days.get(key) ?? []), match]);
  }
  const upcoming = [...days].filter(([key, list]) => key >= today || list.some((m) => !m.score));
  const played = [...days].filter(([key, list]) => key < today && list.every((m) => m.score)).reverse();
  const next = MATCHES.find((m) => !m.score && (isLive(m, now) || Date.parse(m.start) > now));

  return (
    <div className="space-y-10">
      {next && <NextMatch match={next} now={now} />}

      <Brackets now={now} />

      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="font-display text-2xl font-semibold">Próximas fechas</h2>
          <p className="text-sm text-dim">Horas en tu zona horaria ({zone.replace(/_/g, " ")})</p>
        </div>
        <div className="space-y-4">
          {upcoming.map(([key, list]) => (
            <Day key={key} date={list[0].start} matches={list} now={now} today={key === today} />
          ))}
        </div>
        <p className="mt-3 text-sm text-dim">
          La primera serie de cada día empieza a la hora indicada; las siguientes pueden atrasarse si las anteriores se alargan.
        </p>
      </section>

      {played.length > 0 && (
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-2 font-display text-2xl font-semibold marker:hidden">
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5 text-muted transition-transform group-open:rotate-90"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m9 6 6 6-6 6" />
            </svg>
            Resultados por día
            <span className="font-sans text-sm font-normal text-dim">{played.length} días</span>
          </summary>
          <div className="mt-3 space-y-4">
            {played.map(([key, list]) => (
              <Day key={key} date={list[0].start} matches={list} now={now} today={false} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function Logo({ code, size = 20, faded = false }: { code: TeamCode | null; size?: number; faded?: boolean }) {
  if (!code) {
    return <span className="shrink-0 rounded-full border border-dashed border-line" style={{ width: size, height: size }} aria-hidden="true" />;
  }
  return (
    <img
      src={teamLogo(code, size > 32 ? 128 : 64)}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      className={`shrink-0 object-contain ${faded ? "opacity-35 grayscale" : ""}`}
      style={{ width: size, height: size }}
    />
  );
}

function NextMatch({ match, now }: { match: WorldsMatch; now: number }) {
  const start = Date.parse(match.start);
  const live = isLive(match, now);
  const hours = (start - now) / 3_600_000;
  const label = live
    ? "Puede estar en juego ahora"
    : hours < 1
      ? `Empieza en ${Math.max(1, Math.round(hours * 60))} min`
      : hours < 24
        ? `Empieza en ${Math.round(hours)} h`
        : `${capitalize(dayLabel.format(start))}, ${timeLabel.format(start)}`;
  const [a, b] = match.teams;

  return (
    <section className="rounded-lg border border-gold/50 bg-gradient-to-br from-gold/15 to-transparent p-5" aria-label="Próxima serie">
      <p className="text-sm text-gold-soft">
        Próxima serie · {match.round} · al mejor de {match.bestOf}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="flex items-center gap-3">
          <Logo code={a} size={44} />
          <span className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{a ?? "Por definir"}</span>
        </span>
        <span className="font-display text-xl text-muted">vs</span>
        <span className="flex items-center gap-3">
          <span className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{b ?? "Por definir"}</span>
          <Logo code={b} size={44} />
        </span>
      </div>
      <p className="mt-2 flex items-center gap-2 text-ink">
        {live && <span className="h-2 w-2 shrink-0 rounded-full bg-loss motion-safe:animate-pulse" aria-hidden="true" />}
        {label}
      </p>
      <a
        href="https://lolesports.com/"
        target="_blank"
        rel="noreferrer"
        className="mt-4 inline-block rounded-md bg-gold px-4 py-2 text-sm font-semibold text-night hover:bg-gold-soft"
      >
        Ver en lolesports.com
      </a>
    </section>
  );
}

/* ---------- Cuadros: cómo va cada etapa de un vistazo ---------- */

type View = "playin" | "swiss" | "eliminatorias";

const VIEWS: { id: View; label: string; stages: StageId[] }[] = [
  { id: "playin", label: "Play-In", stages: ["playin"] },
  { id: "swiss", label: "Fase suiza", stages: ["swiss"] },
  { id: "eliminatorias", label: "Eliminatorias", stages: ["cuartos", "semis", "final"] },
];

function Brackets({ now }: { now: number }) {
  // Abre en la etapa que se está jugando (o la próxima, si hoy es día libre).
  const current = VIEWS.find((v) => v.stages.some((s) => stageState(s, now) !== "hecha"))?.id ?? "eliminatorias";
  const [picked, setPicked] = useState<View | null>(null);
  const view = picked ?? current;

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-display text-2xl font-semibold">Cómo va el torneo</h2>
        <div role="tablist" aria-label="Etapa" className="flex rounded-md border border-line bg-surface p-0.5">
          {VIEWS.map((v) => {
            const state = v.stages.map((s) => stageState(s, now));
            const done = state.every((s) => s === "hecha");
            const active = state.includes("ahora");
            return (
              <button
                key={v.id}
                type="button"
                role="tab"
                aria-selected={view === v.id}
                onClick={() => setPicked(v.id)}
                className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm transition-colors ${
                  view === v.id ? "bg-raised text-gold-soft" : "text-muted hover:text-ink"
                }`}
              >
                {v.label}
                {active && <span className="h-1.5 w-1.5 rounded-full bg-gold" aria-label="en curso" />}
                {done && <span className="text-xs text-dim">✓</span>}
              </button>
            );
          })}
        </div>
      </div>

      <p className="mb-2 text-xs text-dim lg:hidden">Desliza el cuadro hacia el costado para ver todas las rondas.</p>
      <div className="overflow-x-auto rounded-lg border border-line bg-surface/60 p-4">
        {view === "swiss" && <SwissBracket now={now} />}
        {view === "eliminatorias" && <KnockoutBracket now={now} />}
        {view === "playin" && <PlayInBracket now={now} />}
      </div>
    </section>
  );
}

/** Una serie en el cuadro: dos filas con logo, sigla y mapas ganados. */
function MatchBox({ match, now }: { match: WorldsMatch; now: number }) {
  const winner = match.score ? (match.score[0] > match.score[1] ? 0 : 1) : null;
  const live = isLive(match, now);
  return (
    <div
      className={`w-full rounded-md border bg-night/70 ${live ? "border-loss/70" : "border-line"}`}
      title={match.teams.every(Boolean) ? match.teams.map((t) => TEAMS[t!].name).join(" vs ") : undefined}
    >
      {match.teams.map((team, i) => {
        const lost = winner !== null && winner !== i;
        return (
          <div key={i} className={`flex items-center gap-2 px-2 py-1 ${i === 0 ? "border-b border-line/70" : ""}`}>
            <Logo code={team} size={18} faded={lost} />
            <span className={`min-w-0 flex-1 truncate font-display text-[15px] font-semibold ${team ? (lost ? "text-dim" : "text-ink") : "text-dim"}`}>
              {team ?? "Por definir"}
            </span>
            {match.score && (
              <span className={`font-display text-[15px] font-semibold tabular-nums ${winner === i ? "text-gold-soft" : "text-dim"}`}>
                {match.score[i]}
              </span>
            )}
          </div>
        );
      })}
      {!match.score && (
        <p className={`border-t border-line/70 px-2 py-0.5 text-[11px] ${live ? "text-loss" : "text-dim"}`}>
          {live ? "En juego" : when(match.start)} · Bo{match.bestOf}
        </p>
      )}
    </div>
  );
}

/** Equipos que ya terminaron la fase suiza con un récord dado (3-0, 0-3...). */
function OutcomeBox({ wins, losses, slots }: { wins: number; losses: number; slots: number }) {
  const advanced = wins === 3;
  const teams = swissStandings().filter((r) => r.wins === wins && r.losses === losses);
  return (
    <div className={`rounded-md border p-2 ${advanced ? "border-win/50 bg-win/10" : "border-loss/40 bg-loss/10"}`}>
      <p className={`mb-1.5 flex items-baseline justify-between text-xs font-semibold ${advanced ? "text-win" : "text-loss"}`}>
        <span>
          {wins}-{losses}
        </span>
        <span className="font-normal">{advanced ? "a cuartos" : "eliminados"}</span>
      </p>
      <div className="space-y-1">
        {Array.from({ length: slots }, (_, i) => {
          const r = teams[i];
          return (
            <div key={i} className="flex items-center gap-2">
              <Logo code={r?.team ?? null} size={18} />
              <span className={`font-display text-[15px] font-semibold ${r ? "text-ink" : "text-dim"}`}>{r?.team ?? "—"}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Pool({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 inline-block rounded bg-raised px-1.5 py-0.5 font-display text-xs font-semibold text-gold-soft tabular-nums">{label}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Column({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex w-40 shrink-0 flex-col">
      <p className="mb-3 text-center text-sm font-semibold text-muted">{title}</p>
      <div className="flex flex-1 flex-col justify-center gap-4">{children}</div>
    </div>
  );
}

function SwissBracket({ now }: { now: number }) {
  const pools = swissPools();
  const inPool = (round: string, pool: string) => MATCHES.filter((m) => m.stage === "swiss" && m.round === round && pools.get(m) === pool);
  const rounds: { title: string; round: string; pools: string[] }[] = [
    { title: "Ronda 1", round: "Ronda 1", pools: ["0-0"] },
    { title: "Ronda 2", round: "Ronda 2", pools: ["1-0", "0-1"] },
    { title: "Ronda 3", round: "Ronda 3", pools: ["2-0", "1-1", "0-2"] },
    { title: "Ronda 4", round: "Ronda 4", pools: ["2-1", "1-2"] },
    { title: "Ronda 5", round: "Ronda 5", pools: ["2-2"] },
  ];

  return (
    <div>
      <p className="mb-4 text-sm text-muted">
        Cada equipo juega contra rivales con su mismo récord. Con 3 victorias pasa a cuartos; con 3 derrotas queda eliminado.
      </p>
      <div className="flex min-w-max gap-3">
        {rounds.map((r) => (
          <Column key={r.round} title={r.title}>
            {r.round === "Ronda 4" && <OutcomeBox wins={3} losses={0} slots={2} />}
            {r.round === "Ronda 5" && <OutcomeBox wins={3} losses={1} slots={3} />}
            {r.pools.map((pool) => (
              <Pool key={pool} label={pool}>
                {inPool(r.round, pool).map((m) => (
                  <MatchBox key={m.start} match={m} now={now} />
                ))}
              </Pool>
            ))}
            {r.round === "Ronda 4" && <OutcomeBox wins={0} losses={3} slots={2} />}
            {r.round === "Ronda 5" && <OutcomeBox wins={1} losses={3} slots={3} />}
          </Column>
        ))}
        <Column title="Final de la fase">
          <OutcomeBox wins={3} losses={2} slots={3} />
          <OutcomeBox wins={2} losses={3} slots={3} />
        </Column>
      </div>
    </div>
  );
}

/*
 * Llave con líneas: cada par de series de una ronda se une con un corchete que apunta a la serie
 * de la ronda siguiente. Las series de un par ocupan la mitad del alto cada una, así que el
 * corchete va del 25 % al 75 % y la línea de salida queda justo al medio.
 */
function BracketPair({ children }: { children: [React.ReactNode, React.ReactNode] }) {
  return (
    <div className="relative flex flex-1 flex-col">
      <div className="flex flex-1 items-center">{children[0]}</div>
      <div className="flex flex-1 items-center">{children[1]}</div>
      <span className="pointer-events-none absolute top-1/4 -right-4 bottom-1/4 w-4 rounded-r border-y border-r border-line" aria-hidden="true" />
      <span className="pointer-events-none absolute top-1/2 -right-8 w-4 border-t border-line" aria-hidden="true" />
    </div>
  );
}

function KnockoutBracket({ now }: { now: number }) {
  const of = (stage: StageId) => MATCHES.filter((m) => m.stage === stage);
  const [q1, q2, q3, q4] = of("cuartos");
  const [s1, s2] = of("semis");
  const [final] = of("final");
  const box = (m: WorldsMatch) => <MatchBox match={m} now={now} />;
  const undecided = of("cuartos").every((m) => m.teams.every((t) => !t));

  return (
    <div>
      {undecided && (
        <p className="mb-4 text-sm text-muted">
          Los cruces se sortean al terminar la fase suiza, el 31 de octubre: los equipos que pasan 3-0 enfrentan a los que pasan 3-2.
        </p>
      )}
      <div className="flex min-w-max gap-8">
        <div className="flex w-44 flex-col">
          <p className="mb-3 text-center text-sm font-semibold text-muted">Cuartos de final</p>
          <div className="flex h-[26rem] flex-col">
            <BracketPair>{[box(q1), box(q2)]}</BracketPair>
            <BracketPair>{[box(q3), box(q4)]}</BracketPair>
          </div>
        </div>
        <div className="flex w-44 flex-col">
          <p className="mb-3 text-center text-sm font-semibold text-muted">Semifinales</p>
          <div className="flex h-[26rem] flex-col">
            <BracketPair>{[box(s1), box(s2)]}</BracketPair>
          </div>
        </div>
        <div className="flex w-48 flex-col">
          <p className="mb-3 text-center text-sm font-semibold text-gold-soft">Final · Nueva York</p>
          <div className="flex h-[26rem] items-center">
            <div className="w-full rounded-lg border border-gold/50 p-1">{box(final)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlayInBracket({ now }: { now: number }) {
  const of = (round: string) => MATCHES.filter((m) => m.stage === "playin" && m.round === round);
  const qualifier = of("Clasificación")[0];
  const winner = qualifier?.score ? qualifier.teams[qualifier.score[0] > qualifier.score[1] ? 0 : 1] : null;
  const columns: { title: string; pools: { label: string; matches: WorldsMatch[] }[] }[] = [
    { title: "Primera ronda", pools: [{ label: "Apertura", matches: of("Ronda 1") }] },
    {
      title: "Segunda ronda",
      pools: [
        { label: "Ganadores", matches: of("Llave de ganadores") },
        { label: "Perdedores", matches: of("Llave de perdedores").slice(0, 1) },
      ],
    },
    { title: "Repechaje", pools: [{ label: "Perdedores", matches: of("Llave de perdedores").slice(1) }] },
    { title: "Clasificación", pools: [{ label: "Final", matches: of("Clasificación") }] },
  ];

  return (
    <div>
      <p className="mb-4 text-sm text-muted">Cuatro equipos y doble eliminación: un solo lugar para la fase suiza.</p>
      <div className="flex min-w-max gap-3">
        {columns.map((c) => (
          <Column key={c.title} title={c.title}>
            {c.pools.map((p) => (
              <Pool key={p.label} label={p.label}>
                {p.matches.map((m) => (
                  <MatchBox key={m.start} match={m} now={now} />
                ))}
              </Pool>
            ))}
          </Column>
        ))}
        {winner && (
          <Column title="Clasificado">
            <div className="rounded-md border border-win/50 bg-win/10 p-2">
              <div className="flex items-center gap-2">
                <Logo code={winner} size={22} />
                <span className="font-display text-base font-semibold">{winner}</span>
              </div>
              <p className="mt-1 text-xs text-win">a la fase suiza</p>
            </div>
          </Column>
        )}
      </div>
    </div>
  );
}

/* ---------- Calendario por día ---------- */

function Day({ date, matches, now, today }: { date: string; matches: WorldsMatch[]; now: number; today: boolean }) {
  const start = Date.parse(date);
  const stage = STAGES.find((s) => s.id === matches[0].stage)!;
  const rounds = [...new Set(matches.map((m) => m.round))].join(" y ");
  return (
    <div className={`rounded-lg border bg-surface ${today ? "border-gold/60" : "border-line"}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-line px-4 py-2.5">
        <h3 className="font-display text-lg font-semibold">
          {capitalize(dayLabel.format(start))}
          {today && <span className="ml-2 text-sm font-normal text-gold">hoy</span>}
        </h3>
        <p className="text-sm text-muted">
          {stage.label === rounds ? stage.label : `${stage.label}, ${rounds.toLowerCase()}`}
        </p>
      </div>
      <ul className="divide-y divide-line/60">
        {matches.map((match) => (
          <MatchRow key={match.start} match={match} now={now} />
        ))}
      </ul>
    </div>
  );
}

function MatchRow({ match, now }: { match: WorldsMatch; now: number }) {
  const [a, b] = match.teams;
  const winner = match.score ? (match.score[0] > match.score[1] ? 0 : 1) : null;
  const live = isLive(match, now);
  return (
    <li className="grid grid-cols-[3.25rem_1fr_auto_1fr_2.75rem] items-center gap-2 px-4 py-2.5 sm:gap-3">
      <span className="text-sm text-muted tabular-nums">{timeLabel.format(Date.parse(match.start))}</span>
      <Team code={a} align="right" dim={winner === 1} />
      <span className="min-w-12 text-center font-display text-lg font-semibold tabular-nums">
        {match.score ? (
          <>
            <span className={winner === 0 ? "text-ink" : "text-dim"}>{match.score[0]}</span>
            <span className="text-dim"> – </span>
            <span className={winner === 1 ? "text-ink" : "text-dim"}>{match.score[1]}</span>
          </>
        ) : live ? (
          <span className="text-sm text-loss">en juego</span>
        ) : (
          <span className="text-sm text-dim">vs</span>
        )}
      </span>
      <Team code={b} align="left" dim={winner === 0} />
      <span className="text-right text-xs text-dim">Bo{match.bestOf}</span>
    </li>
  );
}

function Team({ code, align, dim }: { code: TeamCode | null; align: "left" | "right"; dim: boolean }) {
  if (!code) return <span className={`text-sm text-dim ${align === "right" ? "text-right" : ""}`}>Por definir</span>;
  const team = TEAMS[code];
  return (
    <span
      className={`flex min-w-0 items-center gap-2 ${align === "right" ? "flex-row-reverse text-right" : ""}`}
      title={`${team.name} (${team.region})`}
    >
      <Logo code={code} size={22} faded={dim} />
      <span className={`font-display text-lg font-semibold ${dim ? "text-dim" : "text-ink"}`}>{code}</span>
      <span className="hidden truncate text-xs text-dim md:inline">{team.region}</span>
    </span>
  );
}
