"use client";

import { useSyncExternalStore } from "react";
import {
  MATCHES,
  STAGES,
  TEAMS,
  swissStandings,
  type StageId,
  type SwissRecord,
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
const timeLabel = new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false });

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Una serie al mejor de N dura cerca de una hora por mapa; sirve para saber si puede estar en juego. */
const seriesHours = (bestOf: WorldsMatch["bestOf"]) => (bestOf === 1 ? 1 : bestOf === 3 ? 3 : 5);

function isLive(match: WorldsMatch, now: number) {
  const start = Date.parse(match.start);
  return !match.score && now >= start && now < start + seriesHours(match.bestOf) * 3_600_000;
}

function stageState(id: StageId, now: number): "hecha" | "ahora" | "proxima" {
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

      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label="Etapas del torneo">
        {STAGES.map((stage) => {
          const state = stageState(stage.id, now);
          return (
            <li
              key={stage.id}
              className={`rounded-md border px-3 py-2 ${
                state === "ahora" ? "border-gold/70 bg-gold/10" : state === "hecha" ? "border-line bg-surface/50" : "border-line bg-surface"
              }`}
            >
              <p className={`font-display text-lg font-semibold ${state === "hecha" ? "text-muted" : state === "ahora" ? "text-gold-soft" : "text-ink"}`}>
                {stage.label}
              </p>
              <p className="text-sm text-muted">{stage.dates}</p>
              <p className="text-xs text-dim">
                {stage.place}
                {state === "ahora" && <span className="text-gold"> · en curso</span>}
                {state === "hecha" && " · terminada"}
              </p>
            </li>
          );
        })}
      </ol>

      <Standings rows={swissStandings()} />

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
        <section>
          <h2 className="mb-3 font-display text-2xl font-semibold">Resultados</h2>
          <div className="space-y-4">
            {played.map(([key, list]) => (
              <Day key={key} date={list[0].start} matches={list} now={now} today={false} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function NextMatch({ match, now }: { match: WorldsMatch; now: number }) {
  const start = Date.parse(match.start);
  const live = isLive(match, now);
  const hours = (start - now) / 3_600_000;
  const when = live
    ? "Puede estar en juego ahora"
    : hours < 1
      ? `Empieza en ${Math.max(1, Math.round(hours * 60))} min`
      : hours < 24
        ? `Empieza en ${Math.round(hours)} h`
        : `${capitalize(dayLabel.format(start))}, ${timeLabel.format(start)}`;

  return (
    <section className="rounded-lg border border-gold/50 bg-gradient-to-br from-gold/15 to-transparent p-5" aria-label="Próxima serie">
      <p className="text-sm text-gold-soft">
        Próxima serie · {match.round} · al mejor de {match.bestOf}
      </p>
      <p className="mt-1 font-display text-3xl font-bold tracking-tight sm:text-4xl">
        {teamCode(match.teams[0])} <span className="text-muted">vs</span> {teamCode(match.teams[1])}
      </p>
      <p className="mt-1 flex items-center gap-2 text-ink">
        {live && <span className="h-2 w-2 shrink-0 rounded-full bg-loss motion-safe:animate-pulse" aria-hidden="true" />}
        {when}
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

const teamCode = (code: TeamCode | null) => code ?? "Por definir";

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
    <span className={`min-w-0 ${align === "right" ? "text-right" : ""}`} title={`${team.name} (${team.region})`}>
      <span className={`font-display text-lg font-semibold ${dim ? "text-dim" : "text-ink"}`}>{code}</span>
      <span className="ml-1.5 hidden truncate text-xs text-dim md:inline">{team.region}</span>
    </span>
  );
}

const BUCKETS: { label: string; test: (r: SwissRecord) => boolean; tone: string }[] = [
  { label: "Clasificados", test: (r) => r.wins >= 3, tone: "text-win" },
  { label: "En juego", test: (r) => r.wins < 3 && r.losses < 3, tone: "text-ink" },
  { label: "Eliminados", test: (r) => r.losses >= 3, tone: "text-loss" },
];

function Standings({ rows }: { rows: SwissRecord[] }) {
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-display text-2xl font-semibold">Fase suiza</h2>
        <p className="text-sm text-dim">Con 3 victorias pasa a cuartos; con 3 derrotas queda eliminado.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {BUCKETS.map((bucket) => {
          const teams = rows.filter(bucket.test).sort((x, y) => y.wins - x.wins || x.losses - y.losses || x.team.localeCompare(y.team));
          return (
            <div key={bucket.label} className="rounded-lg border border-line bg-surface p-3">
              <p className={`mb-2 font-display text-lg font-semibold ${bucket.tone}`}>
                {bucket.label} <span className="text-sm font-normal text-dim">{teams.length}</span>
              </p>
              {teams.length === 0 ? (
                <p className="text-sm text-dim">Todavía nadie.</p>
              ) : (
                <ul className="space-y-1">
                  {teams.map((r) => (
                    <li key={r.team} className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate">
                        <span className="font-semibold text-ink">{r.team}</span>
                        {/* T1 y LYON se llaman igual que su sigla: no repetirla. */}
                        {TEAMS[r.team].name !== r.team && <span className="text-muted"> {TEAMS[r.team].name}</span>}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted">
                        {r.wins}–{r.losses}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
