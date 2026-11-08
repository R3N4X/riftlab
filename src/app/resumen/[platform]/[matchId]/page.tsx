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
import { tip, row } from "@/lib/tip";
import { RiotApiError, apiPuuid, errorMessage, getMatch, getMatchIds, hasRiotKey, isRiotBusy, riotIdToSlug, type Match } from "@/lib/riot";
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
  // "yo" es un puuid o un Riot ID (Nombre#TAG): la app de escritorio manda el Riot ID, porque el
  // puuid del cliente de League no coincide con el de la API.
  const yo = parseString(sp, "yo") ?? "";
  // Los Riot ID se comparan sin mayúsculas ni espacios ("Ryna T1#Eli" = "rynat1#eli").
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
  const find = (id: string) =>
    match.info.participants.find((p) => norm(p.puuid) === norm(id) || norm(`${p.riotIdGameName}#${p.riotIdTagline}`) === norm(id));
  // Si el Riot ID no coincide (por ejemplo, porque se cambió el nombre), se busca por su puuid de la API.
  const me = yo ? (find(yo) ?? (yo.includes("#") ? find(await apiPuuid(platform, yo, "")) : undefined)) : undefined;

  // El resumen es siempre el tuyo: no se ofrece ver el de los demás jugadores.
  if (!me) {
    return (
      <Wrap>
        <ErrorNote title="Tu cuenta no aparece en esta partida">
          El resumen se arma con la cuenta con la que jugaste. Si cambiaste de cuenta en el cliente, abre la partida desde tu perfil.
        </ErrorNote>
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
        <div className="flex flex-col items-center" title={tip("Nota de la partida", row("Nota", `${review.score} de 100`), "50 es lo normal en tu rol; la letra resume la nota.")}>
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

const EVENT_ROWS = [
  { kind: "kill", label: "Asesinatos", tipLabel: "Mataste a", dot: "bg-win" },
  { kind: "assist", label: "Asistencias", tipLabel: "Asistencias", dot: "bg-hex" },
  { kind: "death", label: "Muertes", tipLabel: "Te mató", dot: "bg-loss" },
] as const;

/** Alto de cada fila del gráfico, en píxeles. */
const ROW_H = 28;

/** "Yasuo", "Yasuo y Malphite", "Yasuo (2), Malphite y Nami". */
function joinNames(names: string[]): string {
  const counted = new Map<string, number>();
  for (const n of names) counted.set(n, (counted.get(n) ?? 0) + 1);
  const parts = [...counted].map(([n, c]) => (c > 1 ? `${n} (${c})` : n));
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} y ${parts.at(-1)}` : (parts[0] ?? "");
}

/**
 * Línea del tiempo de la partida: una fila para asesinatos, asistencias y muertes. Lo que pasó en
 * el mismo minuto se junta en una sola columna (con la cantidad dentro del punto) y el hover de la
 * columna cuenta todo lo de ese minuto.
 */
function EventsStrip({
  events,
  minutes,
  champsByKey,
}: {
  events: ReviewEvent[];
  minutes: number;
  champsByKey: Record<string, ChampionSummary>;
}) {
  const total = Math.max(1, Math.ceil(minutes));
  const at = (m: number) => `${(m / total) * 100}%`;
  const ticks = Array.from({ length: Math.floor(minutes / 5) + 1 }, (_, i) => i * 5);
  const counts = { kill: 0, assist: 0, death: 0 };
  const byMinute = new Map<number, ReviewEvent[]>();
  for (const e of events) {
    counts[e.kind]++;
    byMinute.set(e.minute, [...(byMinute.get(e.minute) ?? []), e]);
  }
  const nameOf = (e: ReviewEvent) =>
    (e.other !== null ? champsByKey[e.other]?.name : null) ?? (e.kind === "death" ? "Torre o monstruo" : "Un rival");
  const columns = [...byMinute].sort((a, b) => a[0] - b[0]);
  const describe = (minute: number, list: ReviewEvent[]) =>
    tip(
      `Minuto ${minute}`,
      ...EVENT_ROWS.map((r) => {
        const names = list.filter((e) => e.kind === r.kind).map(nameOf);
        return names.length > 0 && row(r.tipLabel, joinNames(names));
      }),
    );

  return (
    <figure className="mt-4">
      <div className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4">
        <ul className="text-xs text-muted" aria-hidden="true">
          {EVENT_ROWS.map((r) => (
            <li key={r.kind} className="flex items-center gap-1.5 whitespace-nowrap" style={{ height: ROW_H }}>
              <span className={`h-2 w-2 rounded-full ${r.dot}`} />
              {r.label}
              <span className="font-semibold text-ink tabular-nums">{counts[r.kind]}</span>
            </li>
          ))}
        </ul>

        <div className="relative" style={{ height: ROW_H * EVENT_ROWS.length }}>
          {/* Fase de líneas (hasta el 15) de fondo. */}
          <div className="absolute inset-y-0 left-0 rounded-md bg-raised/40" style={{ width: at(Math.min(15, minutes)) }} />
          {EVENT_ROWS.map((r, i) => (
            <div key={r.kind} className="absolute inset-x-0 border-t border-line/80" style={{ top: ROW_H * i + ROW_H / 2 }} />
          ))}
          {ticks.map((t) => (
            <div key={t} className="absolute inset-y-0 border-l border-dashed border-line/50" style={{ left: at(t) }} />
          ))}

          {columns.map(([minute, list]) => (
            <div
              key={minute}
              data-tip={describe(minute, list)}
              className="absolute inset-y-0 -translate-x-1/2 cursor-help rounded-md hover:bg-raised"
              style={{ left: at(minute + 0.5), width: `max(${100 / total}%, 14px)` }}
            >
              {EVENT_ROWS.map((r, i) => {
                const n = list.filter((e) => e.kind === r.kind).length;
                if (!n) return null;
                return (
                  <span
                    key={r.kind}
                    className={`absolute left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full ring-2 ring-surface ${r.dot} ${
                      n > 1 ? "h-4 w-4 text-[10px] leading-none font-bold text-night" : r.kind === "assist" ? "h-2.5 w-2.5" : "h-3 w-3"
                    }`}
                    style={{ top: ROW_H * i + ROW_H / 2 }}
                  >
                    {n > 1 ? n : null}
                  </span>
                );
              })}
            </div>
          ))}
        </div>

        <span />
        <div className="relative mt-1 h-4 text-[11px] text-dim" aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} className="absolute -translate-x-1/2 tabular-nums" style={{ left: at(t) }}>
              {t}
            </span>
          ))}
          <span className="absolute right-0 translate-x-full pl-1">min</span>
        </div>
      </div>

      <ul className="sr-only">
        {columns.map(([minute, list]) => (
          <li key={minute}>{describe(minute, list).replace(/\t/g, ": ").replace(/\n/g, ". ")}</li>
        ))}
      </ul>

      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-dim">
        <span>
          <span className="mr-1 inline-block h-2 w-3 rounded-sm bg-raised" aria-hidden="true" />
          Fase de líneas (hasta el minuto 15)
        </span>
        <span>Los números dentro de un punto son varias jugadas en el mismo minuto. Pasa el mouse para ver contra quién.</span>
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
