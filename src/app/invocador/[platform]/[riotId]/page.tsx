import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ChampIcon, RankCrest, RoleIcon, SpellIcon } from "@/components/icons";
import { MatchCard, type MatchCardData } from "@/components/match-card";
import { ProfileHighlights, RecentForm } from "@/components/profile-highlights";
import { AutoRetry, RefreshProfile } from "@/components/refresh-profile";
import { SummonerSearch } from "@/components/summoner-search";
import { ErrorNote, Panel, Section, Skeleton } from "@/components/ui";
import { PLATFORMS, QUEUES, ROLE_LABEL, ROLES, TIER_LABEL, isPlatform, type Platform, type Role, type Tier } from "@/lib/constants";
import { getChampionsByKey, getItems, getLatestVersion, getRuneIndex, getSummonerSpells, img } from "@/lib/ddragon";
import { rememberPlayers } from "@/lib/players";
import { kda, pct, timeAgo, wrClass } from "@/lib/format";
import { parseString } from "@/lib/params";
import {
  RiotApiError,
  getAccountByRiotId,
  getActiveGame,
  getLeagueEntries,
  getMatch,
  getMatchIds,
  getSummonerByPuuid,
  getTopMasteries,
  hasRiotKey,
  riotIdToSlug,
  slugToRiotId,
  type ActiveGame,
  type LeagueEntry,
  type Match,
} from "@/lib/riot";

export async function generateMetadata({ params }: PageProps<"/invocador/[platform]/[riotId]">): Promise<Metadata> {
  const { riotId } = await params;
  const id = slugToRiotId(riotId);
  return { title: id ? `${id.gameName}#${id.tagLine}` : "Invocador" };
}

export default function SummonerPage({ params, searchParams }: PageProps<"/invocador/[platform]/[riotId]">) {
  return (
    <Suspense fallback={<Skeleton rows={10} />}>
      <SummonerContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const QUEUE_FILTERS = [
  { id: "todas", label: "Todas", queue: undefined },
  { id: "solo", label: "Solo/Dúo", queue: 420 },
  { id: "flex", label: "Flexible", queue: 440 },
  { id: "aram", label: "ARAM", queue: 450 },
] as const;

async function SummonerContent({ params, searchParams }: Pick<PageProps<"/invocador/[platform]/[riotId]">, "params" | "searchParams">) {
  await connection();
  const { platform, riotId } = await params;
  const sp = await searchParams;
  if (!isPlatform(platform)) notFound();
  const id = slugToRiotId(riotId);
  if (!id) notFound();

  const header = (
    <div className="border-b border-line px-4 py-4 sm:px-8">
      <div className="max-w-xl">
        <SummonerSearch size="sm" defaultPlatform={platform} />
      </div>
    </div>
  );

  if (!hasRiotKey()) {
    return (
      <>
        {header}
        <div className="px-4 py-8 sm:px-8">
          <MissingKey />
        </div>
      </>
    );
  }

  const queueFilter = QUEUE_FILTERS.find((q) => q.id === parseString(sp, "cola")) ?? QUEUE_FILTERS[0];
  const count = Math.min(60, Math.max(10, Number(parseString(sp, "n")) || 10));

  const profile = await loadProfile(platform, id.gameName, id.tagLine, count, queueFilter.queue);

  if (!profile.ok) {
    return (
      <>
        {header}
        <div className="px-4 py-8 sm:px-8">
          {profile.status === 404 ? (
            <ErrorNote title={`No encontramos a ${id.gameName}#${id.tagLine} en ${PLATFORMS[platform].label}`}>
              Revisa que el tag esté bien escrito y que el servidor sea el correcto.
            </ErrorNote>
          ) : (
            <ErrorNote title={profile.status === 429 ? "Riot pidió esperar un momento" : "La API de Riot no respondió"}>
              {profile.message}
              {profile.status === 429 && " Pasa cuando la app y el recolector de datos usan muchas consultas seguidas."}
              <AutoRetry key={profile.failedAt} seconds={profile.status === 429 ? Math.min(120, profile.retryAfter ?? 30) : 10} />
            </ErrorNote>
          )}
        </div>
      </>
    );
  }

  {
    const { account, summoner, entries, masteries, matchIds, live, matches, data } = profile;
    const { version, champsByKey } = data;
    const solo = entries.find((e) => e.queueType === "RANKED_SOLO_5x5");
    const flex = entries.find((e) => e.queueType === "RANKED_FLEX_SR");
    const recent = summarize(matches, account.puuid);
    const lastPlayed = matches[0]
      ? (matches[0].info.gameEndTimestamp ?? matches[0].info.gameCreation + matches[0].info.gameDuration * 1000)
      : null;

    return (
      <>
        {header}
        <section className="flex flex-col gap-6 border-b border-line px-4 py-8 sm:px-8 md:flex-row md:items-center">
          <div className="relative w-fit">
            <img
              src={img.profileIcon(version, summoner.profileIconId)}
              alt=""
              width={96}
              height={96}
              className="h-24 w-24 rounded-2xl ring-2 ring-gold/60"
            />
            <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-gold/60 bg-night px-2 text-xs">
              {summoner.summonerLevel}
            </span>
          </div>
          <div className="shrink-0">
            <h1 className="font-display text-5xl font-bold tracking-tight">
              {account.gameName}
              <span className="text-3xl text-dim">#{account.tagLine}</span>
            </h1>
            <p className="mt-1 text-muted">
              {PLATFORMS[platform].label}
              {lastPlayed && <span className="text-dim"> · última partida {timeAgo(lastPlayed, data.now)}</span>}
            </p>
          </div>
          <div className="flex min-w-0 flex-1 md:border-l md:border-line md:pl-8">
            <ProfileHighlights matches={matches} puuid={account.puuid} live={live} data={data} />
          </div>
          <div className="flex flex-col gap-2 md:items-end">
            <RefreshProfile matchIds={matchIds} lp={solo?.leaguePoints ?? null} renderedAt={data.now} />
            <Link
              href={`/comparar?a=${encodeURIComponent(`${platform}:${account.gameName}-${account.tagLine}`)}`}
              className="w-fit rounded-md border border-line px-4 py-1.5 text-sm text-muted hover:border-gold hover:text-ink"
            >
              Comparar con otro jugador
            </Link>
          </div>
        </section>

        <div className="grid gap-6 px-4 py-6 sm:px-8 xl:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="space-y-6">
            <RankedCard title="Clasificatoria Solo/Dúo" entry={solo} />
            <RankedCard title="Clasificatoria Flexible" entry={flex} />

            {recent.games > 0 && (
              <Panel className="p-4">
                <h2 className="mb-3 font-display text-xl font-semibold">Campeones recientes</h2>
                <ul className="space-y-2">
                  {recent.champions.slice(0, 7).map((c) => {
                    const champ = champsByKey[c.championId];
                    if (!champ) return null;
                    return (
                      <li key={c.championId} className="flex items-center gap-3 text-sm">
                        <ChampIcon version={version} id={champ.id} name={champ.name} size={32} />
                        <span className="flex-1 truncate">{champ.name}</span>
                        <span className="w-16 text-right text-muted">{kda(c.kills, c.deaths, c.assists)}</span>
                        <span className={`w-20 text-right ${wrClass(c.wins / c.games)}`}>
                          {pct(c.wins / c.games, 0)} <span className="text-dim">({c.games})</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </Panel>
            )}

            {masteries.length > 0 && (
              <Panel className="p-4">
                <h2 className="mb-3 font-display text-xl font-semibold">Maestría</h2>
                <ul className="grid grid-cols-4 gap-3">
                  {masteries.map((m) => {
                    const champ = champsByKey[m.championId];
                    if (!champ) return null;
                    return (
                      <li key={m.championId} className="flex min-w-0 flex-col items-center text-center">
                        <Link href={`/campeones/${champ.id}`} className="inline-block">
                          <ChampIcon version={version} id={champ.id} name={champ.name} size={48} />
                        </Link>
                        {/* Emblema de maestría montado sobre el borde del ícono, con el nivel encima, como en el cliente. */}
                        <div className="relative -mt-3 flex flex-col items-center" title={`Maestría nivel ${m.championLevel}`}>
                          <span className="relative z-10 rounded bg-night/90 px-1 text-[11px] leading-tight font-semibold text-ink">
                            {m.championLevel}
                          </span>
                          <img src={img.masteryCrest(m.championLevel)} alt="" width={40} height={45} className="-mt-2 h-11 w-auto" />
                        </div>
                        <p className="mt-1 w-full truncate text-sm font-semibold">{champ.name}</p>
                        <p className="text-xs whitespace-nowrap text-dim">{m.championPoints.toLocaleString("es-CL")} p.</p>
                      </li>
                    );
                  })}
                </ul>
              </Panel>
            )}

            {recent.teammates.length > 0 && (
              <Panel className="p-4">
                <h2 className="mb-3 font-display text-xl font-semibold">Juega seguido con</h2>
                <ul className="space-y-2 text-sm">
                  {recent.teammates.slice(0, 6).map((t) => (
                    <li key={t.puuid} className="flex items-center justify-between gap-3">
                      <Link
                        href={`/invocador/${platform}/${riotIdToSlug(t.name, t.tag)}`}
                        className="flex min-w-0 items-center gap-2.5 hover:text-gold-soft"
                      >
                        {t.icon !== undefined ? (
                          <img
                            src={img.profileIcon(version, t.icon)}
                            alt=""
                            width={28}
                            height={28}
                            loading="lazy"
                            className="h-7 w-7 shrink-0 rounded-md ring-1 ring-line"
                          />
                        ) : (
                          <span className="h-7 w-7 shrink-0 rounded-md bg-raised" aria-hidden="true" />
                        )}
                        <span className="truncate">
                          {t.name}
                          <span className="text-dim">#{t.tag}</span>
                        </span>
                      </Link>
                      <span className="shrink-0 text-muted">
                        {t.games} partidas, <span className={wrClass(t.wins / t.games)}>{pct(t.wins / t.games, 0)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
          </aside>

          <div className="min-w-0 space-y-6">
            {live && (
              <div id="partida-en-curso" className="scroll-mt-12">
                <LiveGame game={live} data={data} />
              </div>
            )}

            {recent.games > 0 && (
              <Panel className="grid gap-6 p-5 sm:grid-cols-[auto_1fr_auto]">
                <div>
                  <p className="text-sm text-muted">Últimas {recent.games} partidas</p>
                  <p className="font-display text-3xl font-semibold">
                    <span className="text-win">{recent.wins}V</span> <span className="text-loss">{recent.games - recent.wins}D</span>
                  </p>
                  <p className={wrClass(recent.wins / recent.games)}>{pct(recent.wins / recent.games, 0)} de victorias</p>
                  <RecentForm matches={matches} puuid={account.puuid} data={data} />
                </div>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                  <Metric label="KDA">{kda(recent.kills, recent.deaths, recent.assists)}</Metric>
                  <Metric label="Promedio">
                    {(recent.kills / recent.games).toFixed(1)} / {(recent.deaths / recent.games).toFixed(1)} /{" "}
                    {(recent.assists / recent.games).toFixed(1)}
                  </Metric>
                  <Metric label="Part. en asesinatos">{pct(recent.kp / recent.games, 0)}</Metric>
                  <Metric label="CS por minuto">{(recent.cs / recent.minutes).toFixed(1)}</Metric>
                  <Metric label="Daño por minuto">{Math.round(recent.damage / recent.minutes)}</Metric>
                  <Metric label="Visión por minuto">{(recent.vision / recent.minutes).toFixed(2)}</Metric>
                  <Metric label="Oro por minuto">{Math.round(recent.gold / recent.minutes)}</Metric>
                  <Metric label="Asesinatos en solitario">{recent.soloKills}</Metric>
                </dl>
                <div>
                  <p className="mb-2 text-sm text-muted">Posiciones</p>
                  <ul className="flex items-end gap-2">
                    {ROLES.map((r) => {
                      const n = recent.roles[r] ?? 0;
                      const h = recent.games ? Math.max(4, (n / recent.games) * 64) : 4;
                      return (
                        <li key={r} className="flex flex-col items-center gap-1" title={`${ROLE_LABEL[r]}: ${n}`}>
                          <span className="w-4 rounded-sm bg-hex/70" style={{ height: h }} />
                          <RoleIcon role={r} size={16} className={n ? "" : "opacity-30"} />
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </Panel>
            )}

            <Section
              title="Historial de partidas"
              aside={
                <div className="flex gap-1">
                  {QUEUE_FILTERS.map((q) => (
                    <Link
                      key={q.id}
                      href={`/invocador/${platform}/${riotIdToSlug(account.gameName, account.tagLine)}?cola=${q.id}`}
                      aria-current={q.id === queueFilter.id ? "true" : undefined}
                      className={`rounded-md px-3 py-1 ${q.id === queueFilter.id ? "bg-raised text-ink" : "hover:text-ink"}`}
                    >
                      {q.label}
                    </Link>
                  ))}
                </div>
              }
            >
              {matches.length === 0 ? (
                <Panel className="p-6 text-muted">No hay partidas recientes en esta cola.</Panel>
              ) : (
                <ul className="space-y-2">
                  {matches.map((m) => (
                    <MatchCard key={m.metadata.matchId} match={m} puuid={account.puuid} data={data} />
                  ))}
                </ul>
              )}
              {matchIds.length === count && count < 60 && (
                <Link
                  href={`/invocador/${platform}/${riotIdToSlug(account.gameName, account.tagLine)}?cola=${queueFilter.id}&n=${count + 10}`}
                  className="mt-4 block rounded-lg border border-line py-3 text-center text-sm text-muted hover:border-gold hover:text-ink"
                  scroll={false}
                >
                  Cargar 10 partidas más
                </Link>
              )}
            </Section>
          </div>
        </div>
      </>
    );
  }
}

async function loadProfile(platform: Platform, gameName: string, tagLine: string, count: number, queue?: number) {
  try {
    const account = await getAccountByRiotId(platform, gameName, tagLine);
    const [summoner, entries, masteries, matchIds, live, version, champsByKey, items, spells, runes] = await Promise.all([
      getSummonerByPuuid(platform, account.puuid),
      getLeagueEntries(platform, account.puuid),
      getTopMasteries(platform, account.puuid, 8),
      getMatchIds(platform, account.puuid, { count, queue }),
      getActiveGame(platform, account.puuid).catch(() => null),
      getLatestVersion(),
      getChampionsByKey(),
      getItems(),
      getSummonerSpells(),
      getRuneIndex(),
    ]);
    const matches = (await Promise.all(matchIds.map((m) => getMatch(platform, m).catch(() => null)))).filter((m): m is Match => m !== null);
    const data: MatchCardData = { version, champsByKey, items, spells, runes, platform, now: Date.now() };
    // Para las sugerencias del buscador: este jugador (con su rango) y los de sus partidas.
    const solo = entries.find((e) => e.queueType === "RANKED_SOLO_5x5");
    void rememberPlayers(platform, [
      {
        puuid: account.puuid,
        gameName: account.gameName,
        tagLine: account.tagLine,
        icon: summoner.profileIconId,
        level: summoner.summonerLevel,
        tier: solo?.tier ?? null,
        rank: solo?.rank ?? null,
        lp: solo?.leaguePoints ?? null,
      },
      ...matches.flatMap((m) =>
        m.info.participants
          .filter((p) => p.puuid !== account.puuid)
          .map((p) => ({
            puuid: p.puuid,
            gameName: p.riotIdGameName,
            tagLine: p.riotIdTagline,
            icon: p.profileIcon,
            level: p.summonerLevel,
          })),
      ),
    ]);
    return { ok: true as const, account, summoner, entries, masteries, matchIds, live, matches, data };
  } catch (err) {
    return {
      ok: false as const,
      status: err instanceof RiotApiError ? err.status : 500,
      message: err instanceof Error ? err.message : "Error desconocido",
      retryAfter: err instanceof RiotApiError ? err.retryAfter : undefined,
      // Cada intento fallido reinicia la cuenta regresiva.
      failedAt: Date.now(),
    };
  }
}

function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="font-display text-lg font-semibold">{children}</dd>
    </div>
  );
}

function RankedCard({ title, entry }: { title: string; entry?: LeagueEntry }) {
  return (
    <Panel className="p-4">
      <h2 className="mb-3 text-sm text-muted">{title}</h2>
      {entry ? (
        <div className="flex items-center gap-4">
          <RankCrest tier={entry.tier} size={56} />
          <div className="flex-1">
            <p className="font-display text-2xl font-semibold">
              {TIER_LABEL[entry.tier as Tier] ?? entry.tier}{" "}
              {["MASTER", "GRANDMASTER", "CHALLENGER"].includes(entry.tier) ? "" : entry.rank}
            </p>
            <p className="text-sm text-muted">{entry.leaguePoints} LP</p>
          </div>
          <div className="text-right text-sm">
            <p>
              {entry.wins}V {entry.losses}D
            </p>
            <p className={wrClass(entry.wins / (entry.wins + entry.losses))}>{pct(entry.wins / (entry.wins + entry.losses), 0)}</p>
            {entry.hotStreak && <p className="text-xs text-gold-soft">En racha</p>}
          </div>
        </div>
      ) : (
        <p className="font-display text-xl text-dim">Sin clasificar</p>
      )}
    </Panel>
  );
}

function LiveGame({ game, data }: { game: ActiveGame; data: MatchCardData }) {
  const { version, champsByKey, spells, platform } = data;
  const minutes = Math.floor(game.gameLength / 60);
  return (
    <Panel className="border-win/40 p-5">
      <h2 className="mb-4 font-display text-2xl font-semibold">
        Partida en curso{" "}
        <span className="text-base font-normal text-muted">
          {QUEUES[game.gameQueueConfigId] ?? game.gameMode}, minuto {Math.max(0, minutes)}
        </span>
      </h2>
      <div className="grid gap-4 md:grid-cols-2">
        {[100, 200].map((teamId) => (
          <ul key={teamId} className="space-y-1.5">
            <li className={`text-sm ${teamId === 100 ? "text-hex" : "text-loss"}`}>{teamId === 100 ? "Equipo azul" : "Equipo rojo"}</li>
            {game.participants
              .filter((p) => p.teamId === teamId)
              .map((p) => {
                const champ = champsByKey[p.championId];
                const [name, tag] = (p.riotId ?? "").split("#");
                return (
                  <li key={p.puuid} className="flex items-center gap-2 text-sm">
                    {champ && <ChampIcon version={version} id={champ.id} name={champ.name} size={32} />}
                    <span className="flex flex-col gap-0.5">
                      {[p.spell1Id, p.spell2Id].map((s) =>
                        spells[s] ? (
                          <SpellIcon key={s} version={version} file={spells[s].image.full} name={spells[s].name} size={14} />
                        ) : null,
                      )}
                    </span>
                    {name && tag ? (
                      <Link href={`/invocador/${platform}/${riotIdToSlug(name, tag)}`} className="truncate hover:text-gold-soft">
                        {name}
                      </Link>
                    ) : (
                      <span className="text-muted">{champ?.name}</span>
                    )}
                  </li>
                );
              })}
          </ul>
        ))}
      </div>
    </Panel>
  );
}

function MissingKey() {
  return (
    <Panel className="max-w-2xl p-6">
      <h1 className="font-display text-3xl font-bold">Falta conectar la API de Riot</h1>
      <p className="mt-2 text-muted">
        Los perfiles se leen en vivo desde la API oficial de Riot Games, que exige una clave personal. Configurarla toma dos minutos:
      </p>
      <ol className="mt-4 list-decimal space-y-2 pl-5 text-muted">
        <li>
          Entra a{" "}
          <a
            href="https://developer.riotgames.com"
            target="_blank"
            rel="noreferrer"
            className="text-gold-soft underline-offset-4 hover:underline"
          >
            developer.riotgames.com
          </a>{" "}
          con tu cuenta de Riot y copia la Development API Key.
        </li>
        <li>
          En la app de escritorio, pégala en{" "}
          <Link href="/ajustes" className="text-gold-soft underline-offset-4 hover:underline">
            Ajustes → Clave de la API de Riot
          </Link>
          . La app se reinicia sola y queda lista.
        </li>
        <li>
          Desde el proyecto también sirve el archivo <code className="rounded bg-night px-1">.env.local</code> con{" "}
          <code className="rounded bg-night px-1">RIOT_API_KEY=RGAPI-...</code>
        </li>
      </ol>
      <p className="mt-4 text-sm text-dim">
        La clave de desarrollo vence cada 24 horas. Para publicar la app hay que solicitar una Production Key.
      </p>
    </Panel>
  );
}

/* ---------- Resumen de las partidas recientes ---------- */

function summarize(matches: Match[], puuid: string) {
  const out = {
    games: 0,
    wins: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    kp: 0,
    cs: 0,
    minutes: 0,
    damage: 0,
    vision: 0,
    gold: 0,
    soloKills: 0,
    roles: {} as Partial<Record<Role, number>>,
    champions: [] as { championId: number; games: number; wins: number; kills: number; deaths: number; assists: number }[],
    teammates: [] as { puuid: string; name: string; tag: string; icon?: number; games: number; wins: number }[],
  };
  const champs = new Map<number, (typeof out.champions)[number]>();
  const mates = new Map<string, (typeof out.teammates)[number]>();

  for (const m of matches) {
    const me = m.info.participants.find((p) => p.puuid === puuid);
    if (!me || m.info.gameDuration < 300) continue;
    const minutes = m.info.gameDuration / 60;
    const team = m.info.participants.filter((p) => p.teamId === me.teamId);
    const teamKills = team.reduce((s, p) => s + p.kills, 0);

    out.games++;
    if (me.win) out.wins++;
    out.kills += me.kills;
    out.deaths += me.deaths;
    out.assists += me.assists;
    out.kp += teamKills ? (me.kills + me.assists) / teamKills : 0;
    out.cs += me.totalMinionsKilled + me.neutralMinionsKilled;
    out.minutes += minutes;
    out.damage += me.totalDamageDealtToChampions;
    out.vision += me.visionScore;
    out.gold += me.goldEarned;
    out.soloKills += me.challenges?.soloKills ?? 0;
    if (ROLES.includes(me.teamPosition as Role)) out.roles[me.teamPosition as Role] = (out.roles[me.teamPosition as Role] ?? 0) + 1;

    const c = champs.get(me.championId) ?? { championId: me.championId, games: 0, wins: 0, kills: 0, deaths: 0, assists: 0 };
    c.games++;
    if (me.win) c.wins++;
    c.kills += me.kills;
    c.deaths += me.deaths;
    c.assists += me.assists;
    champs.set(me.championId, c);

    for (const p of team) {
      if (p.puuid === puuid || !p.riotIdGameName) continue;
      const t = mates.get(p.puuid) ?? {
        puuid: p.puuid,
        name: p.riotIdGameName,
        tag: p.riotIdTagline,
        icon: p.profileIcon,
        games: 0,
        wins: 0,
      };
      t.games++;
      if (p.win) t.wins++;
      mates.set(p.puuid, t);
    }
  }

  out.champions = [...champs.values()].sort((a, b) => b.games - a.games);
  out.teammates = [...mates.values()].filter((t) => t.games >= 2).sort((a, b) => b.games - a.games);
  return out;
}
