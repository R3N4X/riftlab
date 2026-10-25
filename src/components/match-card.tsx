import Link from "next/link";
import type { Platform } from "@/lib/constants";
import { QUEUES } from "@/lib/constants";
import type { ChampionSummary, Item, Rune, SummonerSpell } from "@/lib/ddragon";
import { compact, duration, kda, timeAgo } from "@/lib/format";
import { scoreMatch, type PlayerScore } from "@/lib/match-score";
import { riotIdToSlug, type Match, type MatchParticipant } from "@/lib/riot";
import { SHARDS } from "./build";
import { Expandable } from "./expandable";
import { MatchRank, PlayerRank } from "./match-rank";
import { MatchTimeline } from "./match-timeline";
import { ChampIcon, ItemIcon, RuneIcon, SpellIcon } from "./icons";

export interface MatchCardData {
  version: string;
  champsByKey: Record<string, ChampionSummary>;
  items: Record<string, Item>;
  spells: Record<string, SummonerSpell>;
  runes: Record<number, Rune>;
  platform: Platform;
  now: number;
}

export function MatchCard({ match, puuid, data }: { match: Match; puuid: string; data: MatchCardData }) {
  const me = match.info.participants.find((p) => p.puuid === puuid);
  if (!me) return null;
  const { version, champsByKey, items, spells, runes, platform, now } = data;
  const champ = champsByKey[me.championId];
  const remake = me.gameEndedInEarlySurrender && match.info.gameDuration < 300;
  const result = remake ? "Nueva partida" : me.win ? "Victoria" : "Derrota";
  const tone = remake ? "border-l-dim" : me.win ? "border-l-win" : "border-l-loss";
  const bg = remake ? "" : me.win ? "bg-win/[0.06]" : "bg-loss/[0.06]";
  const keystone = runes[me.perks.styles[0]?.selections[0]?.perk];
  const subStyle = runes[me.perks.styles[1]?.style];
  const multikill = me.pentaKills
    ? "Pentakill"
    : me.quadraKills
      ? "Quadrakill"
      : me.tripleKills
        ? "Triple kill"
        : me.doubleKills
          ? "Doble kill"
          : null;
  const finished = match.info.gameEndTimestamp ?? match.info.gameCreation + match.info.gameDuration * 1000;
  const isFiveVsFive = match.info.participants.length === 10;
  const teams = isFiveVsFive ? [100, 200].map((t) => match.info.participants.filter((p) => p.teamId === t)) : null;
  const scores = isFiveVsFive && !remake ? scoreMatch(match) : null;
  const myScore = scores?.get(me.puuid);

  const summary = (
    <div className="grid gap-x-6 gap-y-3 p-3 md:grid-cols-[150px_minmax(0,1fr)_220px]">
      <div className="text-sm">
        <p className={`font-semibold ${remake ? "text-muted" : me.win ? "text-win" : "text-loss"}`}>{result}</p>
        <p className="text-muted">{QUEUES[match.info.queueId] ?? match.info.gameMode}</p>
        <p className="text-dim">
          {duration(match.info.gameDuration)}, {timeAgo(finished, now)}
        </p>
        {!remake && <MatchRank platform={platform} matchId={match.metadata.matchId} />}
      </div>

      {/* Campeón, resultado y objetos en un solo bloque, centrado en la altura de la tarjeta. */}
      <div className="flex flex-col justify-center gap-2.5">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="relative">
              {champ && <ChampIcon version={version} id={champ.id} name={champ.name} size={52} />}
              <span className="absolute -right-1 -bottom-1 rounded bg-night px-1 text-[11px] text-muted">{me.champLevel}</span>
            </div>
            <div className="grid grid-cols-2 gap-0.5">
              {[me.summoner1Id, me.summoner2Id].map((id) =>
                spells[id] ? (
                  <SpellIcon key={id} version={version} file={spells[id].image.full} name={spells[id].name} size={24} />
                ) : (
                  <span key={id} />
                ),
              )}
              {keystone && <RuneIcon icon={keystone.icon} name={keystone.name} size={24} />}
              {subStyle && (
                <span className="flex h-6 w-6 items-center justify-center">
                  <RuneIcon icon={subStyle.icon} name={subStyle.name} size={18} />
                </span>
              )}
            </div>
          </div>

          <div className="min-w-0">
            <p className="font-display text-xl leading-tight font-semibold">
              {me.kills} <span className="text-dim">/</span> <span className="text-loss">{me.deaths}</span>{" "}
              <span className="text-dim">/</span> {me.assists}
              <span className="ml-2 font-sans text-sm font-normal text-muted">{kda(me.kills, me.deaths, me.assists)} KDA</span>
            </p>
            <div className="mt-1 flex flex-wrap gap-1">
              {myScore && <ScoreBadge score={myScore} />}
              {multikill && <span className="rounded bg-gold/20 px-1.5 text-xs text-gold-soft">{multikill}</span>}
            </div>
          </div>
        </div>

        <div className="flex gap-0.5">
          {[me.item0, me.item1, me.item2, me.item3, me.item4, me.item5, me.item6].map((id, i) => (
            <ItemIcon key={i} version={version} id={id} name={items[id]?.name} size={30} className={i === 6 ? "ml-1.5" : ""} />
          ))}
        </div>
      </div>

      <div className="hidden flex-col gap-3 md:flex">
        {teams && (
          <div className="mt-1.5 grid grid-cols-2 gap-x-2 text-xs">
            {teams.map((team, ti) => (
              <ul key={ti} className="space-y-0.5">
                {team.map((p) => {
                  const c = champsByKey[p.championId];
                  return (
                    <li key={p.puuid} className="flex min-w-0 items-center gap-1">
                      {c && <ChampIcon version={version} id={c.id} name={c.name} size={16} className="rounded-sm" />}
                      <PlayerName p={p} platform={platform} highlight={p.puuid === me.puuid} />
                    </li>
                  );
                })}
              </ul>
            ))}
          </div>
        )}
        <RuneStrip p={me} runes={runes} />
      </div>
    </div>
  );

  return (
    <Expandable
      label={`la partida de ${champ?.name ?? "campeón"} (${result.toLowerCase()})`}
      className={`overflow-hidden rounded-lg border border-line border-l-4 ${tone} ${bg} bg-surface`}
      summary={summary}
      details={
        teams ? (
          <MatchDetails match={match} me={me} teams={teams} scores={scores} data={data} />
        ) : (
          <p className="p-4 text-sm text-muted">El detalle está disponible para partidas de 5 contra 5.</p>
        )
      }
    />
  );
}

/** Página de runas usada en la partida, en una sola fila: principal | secundaria | fragmentos. */
function RuneStrip({ p, runes }: { p: MatchParticipant; runes: MatchCardData["runes"] }) {
  const [primary, secondary] = p.perks.styles;
  if (!primary || !secondary) return null;
  const pick = (id: number) => runes[id];
  const shards = [p.perks.statPerks.offense, p.perks.statPerks.flex, p.perks.statPerks.defense].map((id) => SHARDS[String(id)]);
  const [keystone, ...minor] = primary.selections.map((s) => pick(s.perk));

  return (
    <div className="mt-auto flex w-full items-center justify-center gap-2 rounded-md bg-night/50 px-1.5 py-1.5" aria-label="Runas">
      <div className="flex items-center gap-0.5">
        {keystone && <RuneIcon icon={keystone.icon} name={keystone.name} size={24} />}
        {minor.map((r, i) => (r ? <RuneSlot key={i} icon={r.icon} name={r.name} /> : null))}
      </div>
      <span className="h-6 w-px bg-line" aria-hidden="true" />
      <div className="flex items-center gap-0.5">
        {secondary.selections.map((s, i) => {
          const r = pick(s.perk);
          return r ? <RuneSlot key={i} icon={r.icon} name={r.name} /> : null;
        })}
      </div>
      <span className="h-6 w-px bg-line" aria-hidden="true" />
      <div className="flex items-center gap-0.5">
        {shards.map((sh, i) => (sh ? <RuneSlot key={i} icon={sh.icon} name={sh.name} small /> : null))}
      </div>
    </div>
  );
}

/** Casilla de tamaño fijo: así runas y fragmentos quedan alineados aunque sus íconos midan distinto. */
function RuneSlot({ icon, name, small = false }: { icon: string; name: string; small?: boolean }) {
  return (
    <span className={`flex items-center justify-center ${small ? "h-3.5 w-3.5" : "h-[18px] w-[18px]"}`}>
      <RuneIcon icon={icon} name={name} size={small ? 14 : 18} />
    </span>
  );
}

/* ---------- Detalle desplegado ---------- */

const OBJECTIVES: { key: string; label: string }[] = [
  { key: "tower", label: "Torres" },
  { key: "dragon", label: "Dragones" },
  { key: "horde", label: "Larvas" },
  { key: "riftHerald", label: "Heraldo" },
  { key: "baron", label: "Barón" },
  { key: "atakhan", label: "Atakhan" },
  { key: "inhibitor", label: "Inhibidores" },
];

function MatchDetails({
  match,
  me,
  teams,
  scores,
  data,
}: {
  match: Match;
  me: MatchParticipant;
  teams: MatchParticipant[][];
  scores: Map<string, PlayerScore> | null;
  data: MatchCardData;
}) {
  const minutes = Math.max(1, match.info.gameDuration / 60);
  const maxDamage = Math.max(...match.info.participants.map((p) => p.totalDamageDealtToChampions), 1);
  const maxTaken = Math.max(...match.info.participants.map((p) => p.totalDamageTaken), 1);
  const opponent = match.info.participants.find((p) => p.teamId !== me.teamId && p.teamPosition && p.teamPosition === me.teamPosition);
  const teamInfo = (teamId: number) => match.info.teams.find((t) => t.teamId === teamId);
  const totals = teams.map((t) => ({
    kills: t.reduce((s, p) => s + p.kills, 0),
    gold: t.reduce((s, p) => s + p.goldEarned, 0),
    damage: t.reduce((s, p) => s + p.totalDamageDealtToChampions, 0),
  }));
  // El equipo del jugador buscado va primero.
  const order = teams[0][0]?.teamId === me.teamId ? [0, 1] : [1, 0];

  return (
    <div className="space-y-5 border-t border-line/60 bg-night/40 p-4">
      {/* Tablas de ambos equipos: lo primero que se busca al desplegar */}
      {order.map((i) => {
        const team = teams[i];
        const won = team[0]?.win;
        const ally = team[0]?.teamId === me.teamId;
        return (
          <div key={i}>
            <h4 className={`mb-2 text-sm font-semibold ${won ? "text-win" : "text-loss"}`}>
              {ally ? "Tu equipo" : "Equipo rival"}: {won ? "Victoria" : "Derrota"}
              <span className="ml-2 font-normal text-dim">{team[0]?.teamId === 100 ? "lado azul" : "lado rojo"}</span>
            </h4>
            {/* Anchos fijos por columna: la tabla cabe en la tarjeta sin barra de desplazamiento. En
                pantallas angostas sí se desplaza, porque achicarla más dejaría los nombres ilegibles. */}
            <div className="overflow-x-auto md:overflow-visible">
              <table className="w-full min-w-[640px] table-fixed text-sm md:min-w-0">
                <colgroup>
                  <col />
                  {/* Cabe "7.9 MVP", la nota más ancha */}
                  <col className="w-[72px]" />
                  <col className="w-28" />
                  <col className="w-24" />
                  <col className="w-[72px]" />
                  <col className="w-12" />
                  <col className="w-[148px]" />
                </colgroup>
                <thead>
                  <tr className="text-left text-xs text-dim">
                    <th className="py-1 pr-2 font-medium">Jugador</th>
                    <th className="px-1.5 py-1 text-center font-medium" title="Puntuación RiftLab de 0 a 10 comparando a los 10 jugadores">
                      Nota
                    </th>
                    <th className="px-1.5 py-1 font-medium">KDA</th>
                    <th className="px-1.5 py-1 font-medium" title="Barra roja: daño a campeones. Barra gris: daño recibido">
                      Daño
                    </th>
                    <th className="px-1.5 py-1 text-right font-medium">Oro y CS</th>
                    <th className="px-1.5 py-1 text-right font-medium">Visión</th>
                    <th className="py-1 pl-2 font-medium">Objetos</th>
                  </tr>
                </thead>
                <tbody>
                  {team.map((p) => (
                    <PlayerRow
                      key={p.puuid}
                      p={p}
                      matchId={match.metadata.matchId}
                      highlight={p.puuid === me.puuid}
                      score={scores?.get(p.puuid)}
                      teamKills={totals[i].kills}
                      maxDamage={maxDamage}
                      maxTaken={maxTaken}
                      minutes={minutes}
                      data={data}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {/* Comparación de equipos */}
      <div className="grid gap-x-6 gap-y-2 text-sm lg:grid-cols-2">
        <CompareBar label="Asesinatos" a={totals[order[0]].kills} b={totals[order[1]].kills} />
        <CompareBar label="Oro total" a={totals[order[0]].gold} b={totals[order[1]].gold} format={compact} />
        <CompareBar label="Daño a campeones" a={totals[order[0]].damage} b={totals[order[1]].damage} format={compact} />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          {OBJECTIVES.map((o) => {
            const a = teamInfo(teams[order[0]][0].teamId)?.objectives[o.key]?.kills;
            const b = teamInfo(teams[order[1]][0].teamId)?.objectives[o.key]?.kills;
            if (a === undefined && b === undefined) return null;
            if (!a && !b) return null;
            return (
              <span key={o.key}>
                {o.label} <span className="text-hex">{a ?? 0}</span>
                <span className="text-dim"> a </span>
                <span className="text-loss">{b ?? 0}</span>
              </span>
            );
          })}
        </div>
      </div>

      {/* Duelo de línea del jugador buscado */}
      {opponent && <LaneDuel me={me} opp={opponent} minutes={minutes} data={data} />}

      <Link
        href={`/resumen/${data.platform}/${match.metadata.matchId}?yo=${me.puuid}`}
        className="flex w-fit items-center gap-2 rounded-md border border-gold/50 bg-gold/10 px-3 py-1.5 text-sm text-gold-soft hover:bg-gold/20"
      >
        Ver análisis de la partida: nota, qué mejorar y tu build contra la Top 1
      </Link>

      {/* Evolución de la partida: se pide a Riot recién al desplegar */}
      <MatchTimeline
        platform={data.platform}
        matchId={match.metadata.matchId}
        puuid={me.puuid}
        opponentPuuid={opponent?.puuid ?? null}
        version={data.version}
      />
    </div>
  );
}

function PlayerRow({
  p,
  matchId,
  highlight,
  score,
  teamKills,
  maxDamage,
  maxTaken,
  minutes,
  data,
}: {
  p: MatchParticipant;
  matchId: string;
  highlight: boolean;
  score?: PlayerScore;
  teamKills: number;
  maxDamage: number;
  maxTaken: number;
  minutes: number;
  data: MatchCardData;
}) {
  const { version, champsByKey, items, spells, runes, platform } = data;
  const c = champsByKey[p.championId];
  const cs = p.totalMinionsKilled + p.neutralMinionsKilled;
  const kp = teamKills ? Math.round(((p.kills + p.assists) / teamKills) * 100) : 0;
  const keystone = runes[p.perks.styles[0]?.selections[0]?.perk];
  const subStyle = runes[p.perks.styles[1]?.style];
  return (
    <tr className={`border-t border-line/40 ${highlight ? "bg-gold/10" : ""}`}>
      <td className="py-1.5 pr-2">
        <div className="flex items-center gap-1.5">
          <div className="relative">
            {c && <ChampIcon version={version} id={c.id} name={c.name} size={30} />}
            <span className="absolute -right-1 -bottom-1 rounded bg-night px-0.5 text-[10px] text-muted">{p.champLevel}</span>
          </div>
          {/* Hechizos a la izquierda y runas a la derecha, en 2×2: ocupa menos que en fila y deja lugar al nombre. */}
          <div className="grid shrink-0 grid-flow-col grid-rows-2 gap-0.5">
            {[p.summoner1Id, p.summoner2Id].map((id) =>
              spells[id] ? (
                <SpellIcon key={id} version={version} file={spells[id].image.full} name={spells[id].name} size={15} />
              ) : (
                <span key={id} />
              ),
            )}
            {keystone && <RuneIcon icon={keystone.icon} name={keystone.name} size={15} />}
            {subStyle && <RuneIcon icon={subStyle.icon} name={subStyle.name} size={15} />}
          </div>
          <span className="min-w-0 flex-1">
            <PlayerName p={p} platform={platform} highlight={highlight} />
            <PlayerRank platform={platform} matchId={matchId} puuid={p.puuid} fallback={c?.name} />
          </span>
        </div>
      </td>
      <td className="px-1.5 py-1.5 text-center">{score && <ScoreBadge score={score} compact />}</td>
      <td className="px-1.5 py-1.5 whitespace-nowrap">
        <span className="font-medium">
          {p.kills}/<span className="text-loss">{p.deaths}</span>/{p.assists}
        </span>
        <span className="block text-xs text-dim">
          {kda(p.kills, p.deaths, p.assists)} KDA, {kp}% PA
        </span>
      </td>
      <td className="px-1.5 py-1.5">
        <Bar value={p.totalDamageDealtToChampions} max={maxDamage} color="bg-loss" />
        <Bar value={p.totalDamageTaken} max={maxTaken} color="bg-dim" />
      </td>
      <td className="px-1.5 py-1.5 text-right whitespace-nowrap text-muted">
        {compact(p.goldEarned)}
        <span className="block text-xs text-dim">
          {cs} CS ({(cs / minutes).toFixed(1)})
        </span>
      </td>
      <td className="px-1.5 py-1.5 text-right text-muted" title={`${p.wardsPlaced} guardianes puestos, ${p.wardsKilled} destruidos`}>
        {p.visionScore}
        <span className="block text-xs text-dim">
          {p.wardsPlaced}/{p.wardsKilled}
        </span>
      </td>
      <td className="py-1.5 pl-2">
        <div className="flex gap-0.5">
          {[p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6].map((id, i) => (
            <ItemIcon key={i} version={version} id={id} name={items[id]?.name} size={18} />
          ))}
        </div>
      </td>
    </tr>
  );
}

/** Comparación directa con el rival de la misma línea: lo más fácil de leer de una partida. */
function LaneDuel({ me, opp, minutes, data }: { me: MatchParticipant; opp: MatchParticipant; minutes: number; data: MatchCardData }) {
  const { version, champsByKey } = data;
  const a = champsByKey[me.championId];
  const b = champsByKey[opp.championId];
  const csA = me.totalMinionsKilled + me.neutralMinionsKilled;
  const csB = opp.totalMinionsKilled + opp.neutralMinionsKilled;
  const rows = [
    { label: "Daño a campeones", a: me.totalDamageDealtToChampions, b: opp.totalDamageDealtToChampions, format: compact },
    { label: "Oro", a: me.goldEarned, b: opp.goldEarned, format: compact },
    { label: "CS por minuto", a: csA / minutes, b: csB / minutes, format: (n: number) => n.toFixed(1) },
    { label: "Visión", a: me.visionScore, b: opp.visionScore },
    { label: "Asesinatos + asistencias", a: me.kills + me.assists, b: opp.kills + opp.assists },
    { label: "Muertes", a: me.deaths, b: opp.deaths, lowerIsBetter: true },
  ];
  const wins = rows.filter((r) => (r.lowerIsBetter ? r.a < r.b : r.a > r.b)).length;

  return (
    <div className="rounded-md border border-line bg-surface p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {a && <ChampIcon version={version} id={a.id} name={a.name} size={28} />}
          <span className="text-sm font-semibold">{a?.name}</span>
        </div>
        <span className="text-xs text-muted">
          Tu duelo de línea: ganas {wins} de {rows.length}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{b?.name}</span>
          {b && <ChampIcon version={version} id={b.id} name={b.name} size={28} />}
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {rows.map((r) => (
          <CompareBar key={r.label} label={r.label} a={r.a} b={r.b} format={r.format} lowerIsBetter={r.lowerIsBetter} />
        ))}
      </div>
    </div>
  );
}

/* ---------- Piezas ---------- */

function CompareBar({
  label,
  a,
  b,
  format = (n: number) => String(Math.round(n)),
  lowerIsBetter = false,
}: {
  label: string;
  a: number;
  b: number;
  format?: (n: number) => string;
  lowerIsBetter?: boolean;
}) {
  const total = a + b || 1;
  const aBetter = lowerIsBetter ? a < b : a > b;
  return (
    <div>
      <div className="mb-0.5 flex justify-between text-xs">
        <span className={aBetter ? "font-semibold text-hex" : "text-muted"}>{format(a)}</span>
        <span className="text-dim">{label}</span>
        <span className={!aBetter && a !== b ? "font-semibold text-loss" : "text-muted"}>{format(b)}</span>
      </div>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-raised">
        <div className="bg-hex" style={{ width: `${(a / total) * 100}%` }} />
        <div className="bg-loss/80" style={{ width: `${(b / total) * 100}%` }} />
      </div>
    </div>
  );
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-10 overflow-hidden rounded-full bg-raised">
        <div className={`h-full ${color}`} style={{ width: `${(value / max) * 100}%` }} />
      </div>
      <span className="w-9 text-xs text-muted">{compact(value)}</span>
    </div>
  );
}

function ScoreBadge({ score, compact: small = false }: { score: PlayerScore; compact?: boolean }) {
  const style =
    score.badge === "MVP"
      ? "bg-gold text-night"
      : score.badge === "ACE"
        ? "bg-hex text-night"
        : score.rank <= 3
          ? "bg-raised text-ink"
          : "bg-raised/60 text-muted";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 text-xs font-semibold whitespace-nowrap ${style}`}
      title={`Puesto ${score.rank} de 10`}
    >
      {score.score.toFixed(1)}
      {score.badge ? <span>{score.badge}</span> : !small && <span className="font-normal">{score.rank}.º</span>}
    </span>
  );
}

function PlayerName({ p, platform, highlight }: { p: MatchParticipant; platform: Platform; highlight: boolean }) {
  const name = p.riotIdGameName || "Invocador";
  const cls = `block truncate ${highlight ? "font-semibold text-ink" : "text-muted hover:text-ink hover:underline"}`;
  if (!p.riotIdGameName) return <span className={cls}>{name}</span>;
  return (
    <Link
      href={`/invocador/${platform}/${riotIdToSlug(p.riotIdGameName, p.riotIdTagline)}`}
      className={cls}
      // En la tabla los nombres largos se cortan: el completo queda al pasar el mouse.
      title={`${p.riotIdGameName}#${p.riotIdTagline}`}
    >
      {name}
    </Link>
  );
}
