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
              <PlayerCard key={p.puuid} p={p} champs={champs} spells={spells} version={version} ally={i === 0} platform={platform!} />
            ))}
          </ul>
        </div>
      ))}
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

function PlayerCard({
  p,
  champs,
  spells,
  version,
  ally,
  platform,
}: {
  p: LivePlayerInfo;
  champs: Champs;
  spells: Spells;
  version: string;
  ally: boolean;
  platform: string;
}) {
  const champ = champs[p.championId];
  const games = p.rank ? p.rank.wins + p.rank.losses : 0;
  const wr = p.rank ? p.rank.wins / Math.max(1, games) : 0;
  const flags = flagsFor(p, champ?.name ?? "el campeón");
  const main = p.mainRole;
  // Autofill: juega una línea distinta de la que más juega, y esa línea es clara (al menos la mitad de su juego).
  const autofill = Boolean(p.role && main && main.role !== p.role && main.share >= 0.5);
  return (
    <li
      className={`flex flex-col overflow-hidden rounded-lg border bg-surface ${p.isMe ? "border-gold/70" : ally ? "border-hex/30" : "border-loss/30"}`}
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
            title={`Línea en esta partida: ${ROLE_LABEL[p.role]}`}
          >
            <RoleIcon role={p.role} size={14} />
          </span>
        )}
        <p className="absolute bottom-1 left-2.5 font-display text-lg font-semibold drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
          {champ?.name}
        </p>
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
            <dd className="flex items-center gap-1 truncate text-ink" title={main ? `${Math.round(main.share * 100)} % de su juego` : undefined}>
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
                  title={`${g.win ? "Victoria" : "Derrota"} con ${champs[g.championId]?.name ?? "otro campeón"}${g.role ? ` (${ROLE_LABEL[g.role]})` : ""}, ${g.kills}/${g.deaths}/${g.assists}`}
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
