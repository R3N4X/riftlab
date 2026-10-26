import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ChampIcon, ItemIcon, RuneIcon } from "@/components/icons";
import { PlaystyleRadar } from "@/components/profile-highlights";
import { AutoRetry } from "@/components/refresh-profile";
import { ErrorNote, Panel, Skeleton } from "@/components/ui";
import { QUEUES, ROLE_LABEL, isPlatform, type Platform } from "@/lib/constants";
import { getChampionsByKey, getItems, getLatestVersion, getRuneIndex, type ChampionSummary } from "@/lib/ddragon";
import { duration, kda } from "@/lib/format";
import { getGameReview, type GameReview, type LaneReview, type ReviewEvent } from "@/lib/game-review";
import { parseString } from "@/lib/params";
import { RiotApiError, errorMessage, getMatch, getMatchIds, hasRiotKey, isRiotBusy, riotIdToSlug, type Match } from "@/lib/riot";
import { tiltCheck } from "@/lib/tilt";
import { TiltBanner } from "@/components/tilt-notice";

export const metadata: Metadata = { title: "Resumen de la partida" };

export default function ReviewPage({ params, searchParams }: PageProps<"/resumen/[platform]/[matchId]">) {
  return (
    <Suspense fallback={<Skeleton rows={10} />}>
      <ReviewContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const GRADE_CLASS: Record<GameReview["grade"], string> = {
  S: "text-tier-splus border-tier-splus/60",
  A: "text-win border-win/60",
  B: "text-hex border-hex/60",
  C: "text-muted border-line",
  D: "text-loss border-loss/60",
};

async function ReviewContent({ params, searchParams }: Pick<PageProps<"/resumen/[platform]/[matchId]">, "params" | "searchParams">) {
  await connection();
  const { platform, matchId } = await params;
  const sp = await searchParams;
  if (!isPlatform(platform) || !/^[A-Z0-9]+_\d+$/.test(matchId)) notFound();
  if (!hasRiotKey()) return <Wrap>{<ErrorNote title="Falta la clave de la API de Riot">Configúrala en Ajustes.</ErrorNote>}</Wrap>;

  const loaded = await loadMatch(platform, matchId);
  if (!loaded.ok) {
    // Recién terminada, Riot tarda uno o dos minutos en publicar la partida.
    return (
      <Wrap>
        <ErrorNote title={loaded.status === 404 ? "Riot todavía está procesando la partida" : "No se pudo cargar la partida"}>
          {loaded.status === 404
            ? "La partida aparece en la API uno o dos minutos después de terminar. El resumen se carga solo apenas esté."
            : loaded.message}
          <AutoRetry
            key={loaded.failedAt}
            seconds={loaded.status === 429 ? Math.min(120, loaded.retryAfter ?? 60) : 20}
            what="la partida"
          />
        </ErrorNote>
      </Wrap>
    );
  }
  const match = loaded.match;

  const [version, champsByKey, items, runes] = await Promise.all([getLatestVersion(), getChampionsByKey(), getItems(), getRuneIndex()]);
  const puuid = parseString(sp, "yo");
  const me = puuid ? match.info.participants.find((p) => p.puuid === puuid) : undefined;

  if (!me) {
    return (
      <Wrap>
        <Panel className="p-5">
          <h1 className="font-display text-2xl font-semibold">¿De quién quieres ver el resumen?</h1>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {match.info.participants.map((p) => {
              const c = champsByKey[p.championId];
              return (
                <li key={p.puuid}>
                  <Link
                    href={`/resumen/${platform}/${matchId}?yo=${p.puuid}`}
                    className="flex items-center gap-3 rounded-md border border-line px-3 py-2 hover:border-gold"
                  >
                    {c && <ChampIcon version={version} id={c.id} name={c.name} size={32} />}
                    <span className="truncate">
                      {p.riotIdGameName}
                      <span className="text-dim">#{p.riotIdTagline}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Panel>
      </Wrap>
    );
  }

  if (match.info.gameDuration < 300) {
    return (
      <Wrap>
        <Panel className="p-5 text-muted">Esta partida se rehízo antes de los 5 minutos: no hay nada que analizar.</Panel>
      </Wrap>
    );
  }

  const review = await getGameReview(platform, match, me.puuid);
  if (!review) notFound();
  const champ = champsByKey[me.championId];
  const profileHref = `/invocador/${platform}/${riotIdToSlug(me.riotIdGameName, me.riotIdTagline)}`;
  const keystone = review.keystone ? runes[review.keystone] : undefined;
  const topKeystone = review.topKeystone ? runes[review.topKeystone] : undefined;

  return (
    <Wrap>
      {/* Cabecera: resultado, campeón y nota de la partida. */}
      <Panel className={`flex flex-wrap items-center gap-5 border-l-4 p-5 ${me.win ? "border-l-win" : "border-l-loss"}`}>
        {champ && <ChampIcon version={version} id={champ.id} name={champ.name} size={72} className="rounded-xl" />}
        <div className="min-w-0 flex-1">
          <p className={`font-display text-3xl font-semibold ${me.win ? "text-win" : "text-loss"}`}>
            {me.win ? "Victoria" : "Derrota"} con {champ?.name ?? me.championName}
          </p>
          <p className="text-muted">
            {QUEUES[match.info.queueId] ?? match.info.gameMode}
            {review.role !== "ANY" && <> · {ROLE_LABEL[review.role]}</>} · {duration(match.info.gameDuration)} ·{" "}
            <Link href={profileHref} className="hover:text-gold-soft">
              {me.riotIdGameName}#{me.riotIdTagline}
            </Link>
          </p>
          <p className="mt-1 font-display text-xl">
            {me.kills} / <span className="text-loss">{me.deaths}</span> / {me.assists}{" "}
            <span className="text-base text-muted">{kda(me.kills, me.deaths, me.assists)} KDA</span>
          </p>
        </div>
        <div className="flex flex-col items-center" title={`Nota ${review.score} de 100 comparada con lo normal en su rol`}>
          <span
            className={`grid h-20 w-20 place-items-center rounded-full border-2 font-display text-5xl font-bold ${GRADE_CLASS[review.grade]}`}
          >
            {review.grade}
          </span>
          <span className="mt-1 text-xs text-dim">Nota {review.score} / 100</span>
        </div>
      </Panel>

      <Suspense fallback={null}>
        <SessionTilt platform={platform} puuid={me.puuid} match={match} />
      </Suspense>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <Panel className="p-5">
          <h2 className="font-display text-xl font-semibold">Cómo te fue</h2>
          <p className="text-xs text-dim">Cada eje compara esta partida con lo normal en tu rol.</p>
          <div className="mt-2 flex justify-center">
            <PlaystyleRadar axes={review.axes} score={review.score} />
          </div>
          {review.placings.length > 0 && (
            <ul className="mt-3 space-y-1.5 border-t border-line/60 pt-3 text-sm">
              {review.placings.map((p) => (
                <li key={p.label} className="flex items-center justify-between gap-3">
                  <span className="text-muted">{p.label}</span>
                  <span>
                    <span className="text-dim">{p.value}</span>{" "}
                    <span className={`ml-1 font-semibold ${p.place <= 2 ? "text-win" : p.place >= 9 ? "text-loss" : ""}`}>
                      {p.place}.º de 10
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel className="p-5">
          <h2 className="font-display text-xl font-semibold">Qué mejorar y qué repetir</h2>
          {review.tips.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Una partida pareja: nada se alejó mucho de lo normal en tu rol.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {review.tips.map((t) => (
                <li
                  key={t.title}
                  className={`rounded-md border-l-2 bg-night/40 py-2 pr-3 pl-3 ${t.good ? "border-l-win" : "border-l-loss"}`}
                >
                  <p className={`font-semibold ${t.good ? "text-win" : "text-loss"}`}>{t.title}</p>
                  <p className="text-sm text-muted">{t.text}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel className="p-5">
          {review.lane ? (
            <LanePanel lane={review.lane} champsByKey={champsByKey} version={version} />
          ) : (
            <>
              <h2 className="font-display text-xl font-semibold">Fase de líneas</h2>
              <p className="mt-2 text-sm text-muted">
                {review.noTimeline
                  ? "Riot no entregó la línea de tiempo de esta partida."
                  : "En esta partida no hubo un rival directo de línea."}
              </p>
            </>
          )}
        </Panel>

        <Panel className="p-5">
          <h2 className="font-display text-xl font-semibold">Tu build y la más usada</h2>
          <p className="text-xs text-dim">Objetos completos en el orden en que los compraste; en dorado, los que coinciden con la Top 1.</p>
          <div className="mt-3 space-y-3 text-sm">
            <div>
              <p className="mb-1.5 text-muted">Tu build</p>
              <div className="flex flex-wrap gap-1.5">
                {review.build.length ? (
                  review.build.map((id) => (
                    <ItemIcon
                      key={id}
                      version={version}
                      id={id}
                      name={items[id]?.name}
                      size={36}
                      className={review.topBuild?.items.includes(String(id)) ? "ring-2 ring-gold" : ""}
                    />
                  ))
                ) : (
                  <span className="text-dim">No llegaste a completar objetos.</span>
                )}
                {keystone && (
                  <span className="ml-2 border-l border-line pl-3">
                    <RuneIcon icon={keystone.icon} name={keystone.name} size={36} />
                  </span>
                )}
              </div>
            </div>
            {review.topBuild ? (
              <div>
                <p className="mb-1.5 text-muted">
                  Top 1 de {champ?.name}{" "}
                  <span className="text-dim">
                    ({Math.round(review.topBuild.winRate * 100)} % de victorias en {review.topBuild.games} partidas)
                  </span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {review.topBuild.items.map((id) => (
                    <ItemIcon key={id} version={version} id={id} name={items[id]?.name} size={36} />
                  ))}
                  {topKeystone && (
                    <span className="ml-2 border-l border-line pl-3">
                      <RuneIcon icon={topKeystone.icon} name={topKeystone.name} size={36} />
                    </span>
                  )}
                </div>
                {champ && (
                  <Link
                    href={`/campeones/${champ.id}${review.role !== "ANY" ? `?role=${review.role}` : ""}`}
                    className="mt-2 inline-block text-xs text-gold-soft hover:underline"
                  >
                    Ver la build completa de {champ.name}
                  </Link>
                )}
              </div>
            ) : (
              <p className="text-dim">Todavía no hay datos de builds de {champ?.name} en este rol.</p>
            )}
          </div>
        </Panel>
      </div>

      {review.events.length > 0 && (
        <Panel className="p-5">
          <h2 className="font-display text-xl font-semibold">Asesinatos y muertes en el tiempo</h2>
          <EventsStrip events={review.events} minutes={match.info.gameDuration / 60} champsByKey={champsByKey} />
        </Panel>
      )}
    </Wrap>
  );
}

async function loadMatch(platform: Platform, matchId: string) {
  try {
    return { ok: true as const, match: await getMatch(platform, matchId) };
  } catch (err) {
    return {
      ok: false as const,
      status: err instanceof RiotApiError ? err.status : 500,
      message: errorMessage(err),
      retryAfter: err instanceof RiotApiError ? err.retryAfter : undefined,
      // Cada intento fallido reinicia la cuenta regresiva.
      failedAt: Date.now(),
    };
  }
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <div className="max-w-6xl space-y-6 px-4 py-6 sm:px-8">{children}</div>;
}

function signed(v: number) {
  return `${v > 0 ? "+" : ""}${v.toLocaleString("es-CL")}`;
}

function LanePanel({ lane, champsByKey, version }: { lane: LaneReview; champsByKey: Record<string, ChampionSummary>; version: string }) {
  const opp = champsByKey[lane.opponent.championId];
  const tone = (v: number) => (v > 0 ? "text-win" : v < 0 ? "text-loss" : "text-muted");
  return (
    <>
      <h2 className="flex items-center gap-2 font-display text-xl font-semibold">
        Fase de líneas contra
        {opp && <ChampIcon version={version} id={opp.id} name={opp.name} size={24} />}
        {opp?.name ?? lane.opponent.championName}
      </h2>
      <p className="text-xs text-dim">Diferencia con tu rival directo (positivo = a tu favor).</p>
      {lane.diffs.length ? (
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-1 font-normal">Minuto</th>
              <th className="py-1 text-right font-normal">Oro</th>
              <th className="py-1 text-right font-normal">Súbditos</th>
              <th className="py-1 text-right font-normal">Experiencia</th>
            </tr>
          </thead>
          <tbody>
            {lane.diffs.map((d) => (
              <tr key={d.minute} className="border-t border-line/60">
                <td className="py-1.5">{d.minute}</td>
                <td className={`py-1.5 text-right font-semibold ${tone(d.gold)}`}>{signed(d.gold)}</td>
                <td className={`py-1.5 text-right ${tone(d.cs)}`}>{signed(d.cs)}</td>
                <td className={`py-1.5 text-right ${tone(d.xp)}`}>{signed(d.xp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="mt-2 text-sm text-muted">La partida terminó antes del minuto 10.</p>
      )}
      <p className="mt-3 text-sm text-muted">
        Antes del 15: lo mataste {lane.killsBefore15} {lane.killsBefore15 === 1 ? "vez" : "veces"} y te mató {lane.deathsBefore15}{" "}
        {lane.deathsBefore15 === 1 ? "vez" : "veces"}.
        {lane.typicalGold15 !== null && (
          <> En promedio este enfrentamiento queda {signed(lane.typicalGold15)} de oro al 15 para tu campeón.</>
        )}
      </p>
    </>
  );
}

const EVENT_STYLE: Record<ReviewEvent["kind"], { y: number; r: number; className: string; label: string }> = {
  kill: { y: 18, r: 6, className: "fill-win", label: "Mataste a" },
  assist: { y: 34, r: 4, className: "fill-hex", label: "Asistencia contra" },
  death: { y: 50, r: 6, className: "fill-loss", label: "Te mató" },
};

/** Línea del tiempo de la partida: asesinatos arriba, asistencias al medio y muertes abajo. */
function EventsStrip({
  events,
  minutes,
  champsByKey,
}: {
  events: ReviewEvent[];
  minutes: number;
  champsByKey: Record<string, ChampionSummary>;
}) {
  const W = 1000;
  const x = (m: number) => 30 + (m / Math.max(1, minutes)) * (W - 60);
  const ticks = Array.from({ length: Math.floor(minutes / 5) + 1 }, (_, i) => i * 5);
  const counts = { kill: 0, assist: 0, death: 0 };
  for (const e of events) counts[e.kind]++;
  return (
    <figure className="mt-3">
      <svg viewBox={`0 0 ${W} 78`} className="w-full" role="img" aria-label="Asesinatos, asistencias y muertes por minuto">
        <rect x={x(0)} y={4} width={x(Math.min(15, minutes)) - x(0)} height={56} className="fill-raised/50" />
        <text x={x(0) + 4} y={14} className="fill-dim text-[10px]">
          Fase de líneas
        </text>
        {(["kill", "assist", "death"] as const).map((k) => (
          <line key={k} x1={x(0)} x2={x(minutes)} y1={EVENT_STYLE[k].y} y2={EVENT_STYLE[k].y} className="stroke-line" strokeWidth={1} />
        ))}
        {ticks.map((t) => (
          <text key={t} x={x(t)} y={74} textAnchor="middle" className="fill-dim text-[11px]">
            {t}
          </text>
        ))}
        {events.map((e, i) => {
          const s = EVENT_STYLE[e.kind];
          const other = e.other !== null ? champsByKey[e.other]?.name : null;
          return (
            <circle key={i} cx={x(e.minute + 0.5)} cy={s.y} r={s.r} className={`${s.className} stroke-surface`} strokeWidth={2}>
              <title>{`Minuto ${e.minute}: ${s.label} ${other ?? (e.kind === "death" ? "una torre o un monstruo" : "un rival")}`}</title>
            </circle>
          );
        })}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-4 text-xs text-muted">
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-win" aria-hidden="true" />
          {counts.kill} asesinatos
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-hex" aria-hidden="true" />
          {counts.assist} asistencias
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-loss" aria-hidden="true" />
          {counts.death} muertes
        </span>
        <span className="text-dim">Pasa el mouse por un punto para ver contra quién.</span>
      </figcaption>
    </figure>
  );
}

/** Aviso de tilt con las partidas recientes del jugador; si Riot está ocupado, no se muestra. */
async function SessionTilt({ platform, puuid, match }: { platform: Platform; puuid: string; match: Match }) {
  const notice = await loadSessionTilt(platform, puuid, match);
  return notice ? <TiltBanner notice={notice} /> : null;
}

async function loadSessionTilt(platform: Platform, puuid: string, match: Match) {
  if (isRiotBusy(platform, 45, true)) return null;
  try {
    const ids = await getMatchIds(platform, puuid, { count: 10 });
    const others = await Promise.all(
      ids.filter((id) => id !== match.metadata.matchId).map((id) => getMatch(platform, id).catch(() => null)),
    );
    return tiltCheck([match, ...others.filter((m): m is Match => m !== null)], puuid, Date.now());
  } catch {
    return null;
  }
}
