"use client";

/**
 * Pantalla de carga al estilo Porofessor: los 10 jugadores de la partida en
 * curso con su rango, winrate de la temporada, maestría con el campeón y sus
 * últimas partidas, más avisos rápidos (primera vez con el campeón, rachas).
 * Se pide una sola vez por partida a /api/en-vivo/jugadores.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { img } from "@/lib/assets";
import { ROLE_LABEL, ROLES, TIER_LABEL, type Tier } from "@/lib/constants";
import { compact } from "@/lib/format";
import { tip, row, warn } from "@/lib/tip";
import type { LiveGameInfo, LivePlayerInfo } from "@/lib/live-players";
import { RankCrest, RoleIcon } from "./icons";
import { useLiveState } from "./live-client";

type Champs = Record<string, { id: string; name: string }>;
type Spells = Record<string, { file: string; name: string }>;

const IN_GAME = new Set(["GameStart", "InProgress", "Reconnect"]);

type Result = { key: string; info: LiveGameInfo } | { key: string; error: string; waiting: boolean };

export function LoadingScreen({
  champs,
  spells,
  version,
  preview,
  previewRiotId,
  teamLabel = "Tu equipo",
}: {
  champs: Champs;
  spells: Spells;
  version: string;
  preview?: string;
  /** Riot ID (Nombre#TAG) del jugador de `preview`, para traducir su puuid del cliente. */
  previewRiotId?: string;
  /** Título del equipo del jugador ("Equipo de X" al ver la partida de un amigo). */
  teamLabel?: string;
}) {
  const state = useLiveState();
  const live = state?.connected && IN_GAME.has(state.phase) && !state.tft && state.summoner?.platform ? state.summoner : null;
  // En el navegador (sin la app) se puede ver con ?jugadores=plataforma:puuid de alguien en partida.
  const [previewPlatform, previewPuuid] = preview?.split(":") ?? [];
  // La partida de otro jugador (amigo) manda sobre la propia.
  const platform = (preview ? previewPlatform : live?.platform) ?? null;
  const puuid = (preview ? previewPuuid : live?.puuid) ?? null;
  // El puuid del cliente no sirve para la API: el servidor lo traduce con el Riot ID.
  const riotId = preview ? previewRiotId : live ? `${live.gameName}#${live.tagLine}` : undefined;
  const key = platform && puuid ? `${platform}:${puuid}:${preview ? "" : (state?.lastGame?.gameId ?? "")}` : null;

  const [result, setResult] = useState<Result | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!key || !platform || !puuid) return;
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    fetch(`/api/en-vivo/jugadores?platform=${platform}&puuid=${encodeURIComponent(puuid)}${riotId ? `&riotId=${encodeURIComponent(riotId)}` : ""}`)
      .then(async (res) => {
        const body = await res.json();
        if (cancelled) return;
        if (res.ok) return setResult({ key, info: body as LiveGameInfo });
        // Al cargar la partida, Riot tarda unos segundos en registrarla: se vuelve a intentar.
        const waiting = res.status === 404 || res.status === 429;
        setResult({ key, error: body.error ?? "No se pudieron cargar los jugadores", waiting });
        if (waiting && attempt < 12) retry = setTimeout(() => setAttempt((a) => a + 1), Math.min(60, body.retryAfter ?? 15) * 1000);
      })
      .catch(() => !cancelled && setResult({ key, error: "No se pudieron cargar los jugadores", waiting: false }));
    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
    };
  }, [key, platform, puuid, riotId, attempt]);

  if (!key) return null;
  const current = result?.key === key ? result : null;

  if (!current || !("info" in current)) {
    return (
      <section className="rounded-lg border border-line bg-surface p-4 text-sm text-muted" aria-live="polite">
        {current && !current.waiting ? current.error : "Cargando a los 10 jugadores de la partida…"}
      </section>
    );
  }

  const { players } = current.info;
  const me = players.find((p) => p.isMe);
  const myTeam = me?.teamId ?? 100;
  // En tu propia partida el cliente sabe la línea real de tu equipo; la del rival es una estimación.
  const assigned = new Map(
    preview ? [] : (state?.game?.myTeam ?? []).filter((x) => x.position).map((x) => [x.championId, x.position!] as const),
  );
  const withLane = (p: LivePlayerInfo, ally: boolean): LivePlayerInfo => ({ ...p, role: (ally && assigned.get(p.championId)) || p.role });
  const byLane = (a: LivePlayerInfo, b: LivePlayerInfo) => (a.role && b.role ? ROLES.indexOf(a.role) - ROLES.indexOf(b.role) : 0);
  const teams = [
    players.filter((p) => p.teamId === myTeam).map((p) => withLane(p, true)).sort(byLane),
    players.filter((p) => p.teamId !== myTeam).map((p) => withLane(p, false)),
  ];
  // Tu rival de línea: el del otro equipo en tu misma línea (solo en tu partida, no al mirar la de un amigo).
  const myRole = teams[0].find((p) => p.isMe)?.role ?? null;
  const rival = !preview && myRole ? (teams[1].find((p) => p.role === myRole) ?? null) : null;

  return (
    <section className="space-y-3" aria-label="Jugadores de la partida">
      {teams.map((team, i) => (
        <div key={i}>
          <h2 className={`mb-1.5 font-display text-lg font-semibold ${i === 0 ? "text-hex" : "text-loss"}`}>
            {i === 0 ? teamLabel : "Equipo rival"}
            <TeamSummary players={team} />
          </h2>
          <ul className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
            {team.map((p) => (
              <PlayerCard
                key={`${p.teamId}-${p.championId}`}
                p={p}
                mates={p.premade ? team.filter((x) => x !== p && x.premade?.group === p.premade!.group).map((x) => x.gameName) : []}
                champs={champs}
                spells={spells}
                version={version}
                ally={i === 0}
                rival={p === rival}
                platform={platform!}
              />
            ))}
          </ul>
        </div>
      ))}
      {rival && champs[rival.championId] && (
        <LaneRival championKey={String(rival.championId)} role={rival.role!} champ={champs[rival.championId]} version={version} />
      )}
    </section>
  );
}

type RivalInfo = { tips: string[]; items: { id: string; name: string }[] };

/** Consejos para jugarle a tu rival de línea y la build que más arma (una consulta por partida). */
function LaneRival({ championKey, role, champ, version }: { championKey: string; role: string; champ: { id: string; name: string }; version: string }) {
  const [info, setInfo] = useState<{ key: string; data: RivalInfo } | null>(null);
  const key = `${championKey}:${role}`;
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/en-vivo/rival?champ=${championKey}&rol=${role}`)
      .then((res) => (res.ok ? (res.json() as Promise<RivalInfo>) : null))
      .then((data) => !cancelled && data && setInfo({ key, data }))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [championKey, role, key]);
  const data = info?.key === key ? info.data : null;
  if (!data || (!data.tips.length && !data.items.length)) return null;
  return (
    <section className="rounded-lg border border-loss/50 bg-surface p-3" aria-label="Tu rival de línea">
      <h2 className="mb-2 flex items-center gap-2 font-display text-lg font-semibold">
        <img src={img.champion(version, champ.id)} alt="" width={28} height={28} className="rounded-md ring-1 ring-loss/60" />
        Tu rival de línea: {champ.name}
      </h2>
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
        {data.tips.length > 0 && (
          <ul className="list-disc space-y-1 pl-4 text-sm text-muted">
            {data.tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        )}
        {data.items.length > 0 && (
          <div>
            <p className="mb-1 text-xs text-dim">Suele armar</p>
            <ul className="flex gap-1.5">
              {data.items.map((it) => (
                <li key={it.id}>
                  <img src={img.item(version, it.id)} alt={it.name} title={it.name} data-item={it.id} width={32} height={32} className="rounded" />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

const TIER_POINTS = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER"];
const DIVISION_POINTS: Record<string, number> = { IV: 0, III: 1, II: 2, I: 3, "": 3 };

/** Rango promedio del equipo, para comparar de un vistazo. */
function TeamSummary({ players }: { players: LivePlayerInfo[] }) {
  const ranked = players.filter((p) => p.rank);
  if (!ranked.length) return null;
  const avg = ranked.reduce((s, p) => s + TIER_POINTS.indexOf(p.rank!.tier) * 4 + DIVISION_POINTS[p.rank!.division], 0) / ranked.length;
  const tier = TIER_POINTS[Math.min(TIER_POINTS.length - 1, Math.floor(avg / 4))];
  const division = ["IV", "III", "II", "I"][Math.round(avg) % 4];
  return (
    <span className="ml-2 text-sm font-normal text-muted">
      promedio {TIER_LABEL[tier as Tier] ?? tier}
      {["MASTER", "GRANDMASTER", "CHALLENGER"].includes(tier) ? "" : ` ${division}`}
    </span>
  );
}

interface Flag {
  text: string;
  tone: "good" | "bad" | "info";
}

const FLAG_CLASS: Record<Flag["tone"], string> = {
  good: "border-win/50 text-win",
  bad: "border-loss/50 text-loss",
  info: "border-gold/50 text-gold-soft",
};

function flagsFor(p: LivePlayerInfo, champName: string): Flag[] {
  const flags: Flag[] = [];
  const points = p.mastery?.points ?? 0;
  if (points < 3000) flags.push({ text: `Primera vez con ${champName}`, tone: "bad" });
  else if (points < 20000) flags.push({ text: `Poca experiencia con ${champName}`, tone: "bad" });
  else if (points >= 250000) flags.push({ text: `Main ${champName}`, tone: "info" });

  const recent = p.recent ?? [];
  if (recent.length >= 3 && recent.every((g) => !g.win)) flags.push({ text: `${recent.length} derrotas seguidas`, tone: "bad" });
  else if ((recent.length >= 3 && recent.every((g) => g.win)) || p.rank?.hotStreak) flags.push({ text: "En racha", tone: "good" });

  if (p.rank) {
    const games = p.rank.wins + p.rank.losses;
    const wr = p.rank.wins / Math.max(1, games);
    if (games >= 40 && wr >= 0.58) flags.push({ text: "Winrate alto", tone: "good" });
    if (p.rank.freshBlood) flags.push({ text: "Recién subió de división", tone: "info" });
  }
  const daysSince = p.mastery ? (Date.now() - p.mastery.lastPlayTime) / 86_400_000 : null;
  if (points >= 3000 && daysSince !== null && daysSince > 45)
    flags.push({ text: `Hace ${Math.round(daysSince)} días no lo juega`, tone: "bad" });
  return flags.slice(0, 3);
}

/** Un color por grupo de premades, para reconocerlos de un vistazo (el texto dice con quién). */
const PREMADE_COLORS = ["#c9a45c", "#4fa3d9", "#b48ef0", "#e58fc4"];
const GROUP_NAME = ["", "", "Dúo", "Trío", "Grupo de 4", "Grupo de 5"];

/** "A", "A y B", "A, B y C". */
const joinNames = (names: string[]) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} y ${names.at(-1)}`);

function PremadeBadge({ group, games, mates }: { group: number; games: number; mates: string[] }) {
  const color = PREMADE_COLORS[(group - 1) % PREMADE_COLORS.length];
  const size = mates.length + 1;
  const sure = games >= 2;
  return (
    <p
      className="mx-2.5 mb-2 flex items-center gap-1.5 rounded-md border px-1.5 py-1 text-[11px] leading-tight"
      style={{ borderColor: `${color}80`, color, backgroundColor: `${color}14` }}
      title={tip(sure ? "Premade" : "Posible premade", row("Partidas juntos", games), !sure && warn("Con una sola partida juntos puede ser casualidad."))}
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
        <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
        <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
      </svg>
      <span className="min-w-0 truncate">
        {sure ? GROUP_NAME[size] ?? "Premade" : `Posible ${(GROUP_NAME[size] ?? "premade").toLowerCase()}`} con {joinNames(mates)}
      </span>
    </p>
  );
}

/** Ya te tocó en una de tus últimas partidas: con quién estuvo y cómo te fue. */
function MetBeforeBadge({ met, champ }: { met: NonNullable<LivePlayerInfo["metBefore"]>; champ?: string }) {
  const when = met.gamesAgo === 1 ? "en tu partida anterior" : `hace ${met.gamesAgo} partidas`;
  return (
    <p
      className="mx-2.5 mb-2 flex cursor-help items-center gap-1.5 rounded-md border border-line bg-raised/60 px-1.5 py-1 text-[11px] leading-tight text-ink"
      title={tip(
        met.ally ? "Ya jugó contigo" : "Ya jugó contra ti",
        row("Cuándo", met.gamesAgo === 1 ? "Tu partida anterior" : `Hace ${met.gamesAgo} partidas`),
        row("Era", met.ally ? "Tu aliado" : "Tu rival"),
        champ && row("Jugó con", champ),
        row("Resultado", met.win ? "Ganaste" : "Perdiste"),
        met.games > 1 && row("Veces en tus últimas 5", met.games),
      )}
    >
      <svg
        viewBox="0 0 24 24"
        className={`h-3.5 w-3.5 shrink-0 ${met.ally ? "text-hex" : "text-loss"}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
        <path d="M3 3v5h5" />
        <path d="M12 7v5l3 2" />
      </svg>
      <span className="min-w-0 truncate">
        {met.ally ? "Contigo" : "Contra ti"} {when}
        {met.games > 1 && ` (${met.games} veces)`}
      </span>
    </p>
  );
}

function PlayerCard({
  p,
  mates,
  champs,
  spells,
  version,
  ally,
  rival,
  platform,
}: {
  p: LivePlayerInfo;
  /** Nombres de los premades del mismo grupo (vacío si juega solo). */
  mates: string[];
  champs: Champs;
  spells: Spells;
  version: string;
  ally: boolean;
  /** Tu rival de línea: la tarjeta se marca. */
  rival: boolean;
  platform: string;
}) {
  const champ = champs[p.championId];
  const games = p.rank ? p.rank.wins + p.rank.losses : 0;
  const wr = p.rank ? p.rank.wins / Math.max(1, games) : 0;
  const flags = flagsFor(p, champ?.name ?? "el campeón");
  const main = p.mainRole;
  // Autofill: juega una línea distinta de la que más juega, y esa línea es clara (al menos la mitad de su juego).
  const autofill = Boolean(p.role && main && main.role !== p.role && main.share >= 0.5);
  const premadeColor = p.premade && mates.length ? PREMADE_COLORS[(p.premade.group - 1) % PREMADE_COLORS.length] : null;
  return (
    <li
      className={`flex flex-col overflow-hidden rounded-lg border bg-surface ${p.isMe ? "border-gold/70" : rival ? "border-loss ring-1 ring-loss/60" : ally ? "border-hex/30" : "border-loss/30"}`}
      // Franja arriba con el color del grupo: los premades se reconocen sin leer.
      style={premadeColor ? { boxShadow: `inset 0 3px 0 ${premadeColor}` } : undefined}
    >
      {/* Splash horizontal: la cara del campeón queda dentro del recuadro. */}
      <div className="relative h-28">
        {champ && <img src={img.splash(champ.id)} alt="" className="h-full w-full object-cover object-[50%_28%]" loading="lazy" />}
        <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/20 to-transparent" />
        <div className="absolute top-1.5 left-1.5 flex gap-0.5">
          {[p.spell1Id, p.spell2Id].map((s) =>
            spells[s] ? (
              <img
                key={s}
                src={img.spell(version, spells[s].file)}
                alt={spells[s].name}
                title={spells[s].name}
                width={22}
                height={22}
                className="rounded ring-1 ring-night/60"
              />
            ) : null,
          )}
        </div>
        {p.role && (
          <span
            className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-md bg-night/80 ring-1 ring-line"
            title={tip("Línea en esta partida", ROLE_LABEL[p.role])}
          >
            <RoleIcon role={p.role} size={14} />
          </span>
        )}
        <p className="absolute bottom-1 left-2.5 font-display text-lg font-semibold drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
          {champ?.name}
        </p>
        {rival && (
          <span className="absolute right-1.5 bottom-1.5 rounded bg-loss/90 px-1.5 py-px text-[11px] font-semibold text-night">Tu rival</span>
        )}
      </div>

      <div className="flex flex-1 flex-col text-xs">
        <Link
          href={`/invocador/${platform}/${encodeURIComponent(`${p.gameName}-${p.tagLine}`)}`}
          className={`block truncate px-2.5 pt-1 pb-2 text-sm hover:text-gold-soft ${p.isMe ? "text-gold-soft" : ""}`}
          title={`${p.gameName}#${p.tagLine}`}
        >
          {p.gameName}
          <span className="text-dim">#{p.tagLine}</span>
        </Link>
        {p.premade && mates.length > 0 && <PremadeBadge group={p.premade.group} games={p.premade.games} mates={mates} />}
        {p.metBefore && !p.isMe && <MetBeforeBadge met={p.metBefore} champ={champs[p.metBefore.championId]?.name} />}

        {/* Rango */}
        <div className="flex items-center gap-2 border-t border-line/60 px-2.5 py-2">
          {p.rank ? (
            <>
              <RankCrest tier={p.rank.tier} size={26} />
              <div className="min-w-0 leading-tight">
                <p className="truncate font-semibold text-ink">
                  {TIER_LABEL[p.rank.tier] ?? p.rank.tier} {p.rank.division} · {p.rank.lp} LP
                </p>
                <p className="text-muted">
                  <span className={wr >= 0.53 ? "text-win" : wr <= 0.47 ? "text-loss" : "text-ink"}>{Math.round(wr * 100)} %</span> en{" "}
                  {games} partidas
                </p>
              </div>
            </>
          ) : (
            <p className="text-dim">Sin clasificar</p>
          )}
        </div>

        {/* Línea habitual y maestría */}
        <dl className="grid grid-cols-2 gap-x-2 border-t border-line/60 px-2.5 py-2">
          <div className="min-w-0">
            <dt className="text-[11px] text-dim">Suele jugar</dt>
            <dd className="flex items-center gap-1 truncate text-ink" title={main ? tip("Suele jugar", row("Parte de sus partidas", `${Math.round(main.share * 100)} %`)) : undefined}>
              {main ? (
                <>
                  <RoleIcon role={main.role} size={13} />
                  {ROLE_LABEL[main.role]}
                  <span className="text-dim">{Math.round(main.share * 100)} %</span>
                </>
              ) : (
                <span className="text-dim">Sin datos</span>
              )}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[11px] text-dim">Maestría</dt>
            <dd className="truncate text-ink">
              {p.mastery ? `Nv. ${p.mastery.level} · ${compact(p.mastery.points)}` : <span className="text-dim">Nunca lo jugó</span>}
            </dd>
          </div>
        </dl>

        {/* Últimas partidas: línea jugada y resultado */}
        {p.recent && p.recent.length > 0 && (
          <div className="flex items-center gap-1.5 border-t border-line/60 px-2.5 py-2">
            <span className="text-[11px] text-dim">Últimas</span>
            <ul className="flex gap-1">
              {p.recent.map((g, i) => (
                <li
                  key={i}
                  className={`flex h-5 w-5 items-center justify-center rounded ${g.win ? "bg-win/25 ring-1 ring-win/60" : "bg-loss/25 ring-1 ring-loss/60"}`}
                  title={tip(g.win ? "Victoria" : "Derrota", row("Campeón", champs[g.championId]?.name ?? "Otro"), g.role && row("Línea", ROLE_LABEL[g.role]), row("KDA", `${g.kills}/${g.deaths}/${g.assists}`))}
                >
                  {g.role ? (
                    <RoleIcon role={g.role} size={11} />
                  ) : (
                    <span className={`h-1.5 w-1.5 rounded-full ${g.win ? "bg-win" : "bg-loss"}`} />
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {(autofill || flags.length > 0) && (
          <ul className="mt-auto flex flex-wrap gap-1 border-t border-line/60 px-2.5 py-2">
            {autofill && main && (
              <li className={`rounded-full border px-1.5 py-px text-[11px] ${FLAG_CLASS.bad}`}>
                Posible autofill: suele ir {ROLE_LABEL[main.role].toLowerCase()}
              </li>
            )}
            {flags.slice(0, autofill ? 2 : 3).map((f) => (
              <li key={f.text} className={`rounded-full border px-1.5 py-px text-[11px] ${FLAG_CLASS[f.tone]}`}>
                {f.text}
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}
