/**
 * Resumen en la cabecera del perfil: partida en curso, perfil de juego (seis
 * ejes medidos contra el promedio de su rol, con un título según lo que más
 * destaca) y etiquetas al estilo Porofessor. Sale de lo que el perfil ya
 * cargó: no hace consultas extra.
 */
import { QUEUES, ROLE_LABEL, ROLES, type Role } from "@/lib/constants";
import { kda } from "@/lib/format";
import { AXIS_FMT, AXIS_LABEL, AXIS_ORDER, AXIS_SHORT, gameAxes, ratioToScore, type AxisId } from "@/lib/performance";
import type { ActiveGame, Match, MatchParticipant } from "@/lib/riot";
import { ChampIcon } from "./icons";
import type { MatchCardData } from "./match-card";

type Tone = "good" | "bad" | "neutral";

interface Tag {
  label: string;
  tone: Tone;
  /** Explicación al pasar el mouse (con el número detrás de la etiqueta). */
  why: string;
  /** Campeón (id de Data Dragon) cuyo ícono acompaña a la etiqueta. */
  champ?: string;
}

const TONE: Record<Tone, string> = {
  good: "border-win/50 bg-win/10 text-win",
  bad: "border-loss/50 bg-loss/10 text-loss",
  neutral: "border-line bg-raised/60 text-ink",
};

export function ProfileHighlights({
  matches,
  puuid,
  live,
  data,
}: {
  matches: Match[];
  puuid: string;
  live: ActiveGame | null;
  data: MatchCardData;
}) {
  const { version, champsByKey, now } = data;

  // Partidas válidas (sin las que se rehicieron), de la más nueva a la más vieja.
  const games = matches
    .map((m) => ({ m, me: m.info.participants.find((p) => p.puuid === puuid) }))
    .filter((g): g is Game => Boolean(g.me) && g.m.info.gameDuration >= 300)
    .slice(0, 10);

  // Las etiquetas solo dicen lo que el radar no muestra (visión, muertes y peleas ya están ahí).
  const tags: Tag[] = [];
  if (games.length >= 3) {
    const n = games.length;
    const sum = (f: (g: Game) => number) => games.reduce((s, g) => s + f(g), 0);
    const ratio =
      (sum((g) => g.me.kills) + sum((g) => g.me.assists)) /
      Math.max(
        1,
        sum((g) => g.me.deaths),
      );
    // El farm solo se mide en partidas de línea (soporte y jungla tienen otros números).
    const laneGames = games.filter((g) => ["TOP", "MIDDLE", "BOTTOM"].includes(g.me.teamPosition));
    const csMin =
      laneGames.reduce((s, g) => s + g.me.totalMinionsKilled + g.me.neutralMinionsKilled, 0) /
      Math.max(
        1,
        laneGames.reduce((s, g) => s + g.m.info.gameDuration / 60, 0),
      );
    const soloKills = sum((g) => g.me.challenges?.soloKills ?? 0) / n;
    const multis = sum((g) => g.me.tripleKills + g.me.quadraKills + g.me.pentaKills);

    // Campeón y rol más jugados.
    const byChamp = new Map<number, number>();
    const byRole = new Map<Role, number>();
    for (const g of games) {
      byChamp.set(g.me.championId, (byChamp.get(g.me.championId) ?? 0) + 1);
      if (ROLES.includes(g.me.teamPosition as Role))
        byRole.set(g.me.teamPosition as Role, (byRole.get(g.me.teamPosition as Role) ?? 0) + 1);
    }
    const [mainChamp, mainChampGames] = [...byChamp].sort((a, b) => b[1] - a[1])[0];
    const [mainRole, mainRoleGames] = [...byRole].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
    const champ = champsByKey[mainChamp];
    if (champ && mainChampGames >= 3 && mainChampGames / n >= 0.4)
      tags.push({ label: `Main ${champ.name}`, tone: "neutral", why: `${mainChampGames} de sus últimas ${n} partidas`, champ: champ.id });
    if (mainRole && mainRoleGames / n >= 0.6)
      tags.push({
        label: ROLE_LABEL[mainRole],
        tone: "neutral",
        why: `Juega de ${ROLE_LABEL[mainRole].toLowerCase()} en ${mainRoleGames} de ${n} partidas`,
      });
    else if (byRole.size >= 3)
      tags.push({ label: "Juega de todo", tone: "neutral", why: `${byRole.size} roles distintos en ${n} partidas` });

    const laner = laneGames.length >= 3;
    if (ratio >= 4.5) tags.push({ label: "KDA alto", tone: "good", why: `${ratio.toFixed(2)} de KDA` });
    if (laner && csMin >= 7.5) tags.push({ label: "Buen farm", tone: "good", why: `${csMin.toFixed(1)} súbditos por minuto` });
    else if (laner && csMin < 5.5) tags.push({ label: "Farm bajo", tone: "bad", why: `${csMin.toFixed(1)} súbditos por minuto` });
    if (soloKills >= 1.5)
      tags.push({ label: "Gana duelos", tone: "good", why: `${soloKills.toFixed(1)} asesinatos en solitario por partida` });
    if (multis >= 2) tags.push({ label: "Multikills", tone: "good", why: `${multis} triples o más en ${n} partidas` });
  }

  // Racha: partidas seguidas con el mismo resultado, desde la más nueva.
  let streak = 0;
  for (const g of games) {
    if (g.me.win !== games[0].me.win) break;
    streak++;
  }
  if (streak >= 3) {
    tags.unshift(
      games[0].me.win
        ? { label: `En racha: ${streak} victorias`, tone: "good", why: "Victorias seguidas en sus últimas partidas" }
        : { label: `Mala racha: ${streak} derrotas`, tone: "bad", why: "Derrotas seguidas en sus últimas partidas" },
    );
  }

  const style = games.length >= 3 ? playstyle(games) : null;

  const me = live?.participants.find((p) => p.puuid === puuid);
  const liveChamp = me ? champsByKey[me.championId] : undefined;
  const liveMinutes = live ? Math.max(0, Math.floor(live.gameStartTime ? (now - live.gameStartTime) / 60000 : live.gameLength / 60)) : 0;

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-8 gap-y-4">
      <div className="min-w-0 flex-1 basis-60 space-y-2.5">
        {live && (
          <a
            href="#partida-en-curso"
            className="inline-flex items-center gap-2.5 rounded-full border border-win/50 bg-win/10 py-1 pr-3.5 pl-1 text-sm text-win hover:bg-win/20"
          >
            {liveChamp ? (
              <ChampIcon version={version} id={liveChamp.id} name={liveChamp.name} size={24} className="rounded-full" />
            ) : (
              <span className="ml-2 h-2 w-2 rounded-full bg-win" aria-hidden="true" />
            )}
            <span>
              En partida ahora{liveChamp && <> con {liveChamp.name}</>}
              <span className="text-win/70">
                {" "}
                · {QUEUES[live.gameQueueConfigId] ?? live.gameMode} · {liveMinutes} min
              </span>
            </span>
          </a>
        )}

        {style ? (
          <div>
            <p className="text-xs text-dim">Perfil de juego en sus últimas {games.length} partidas</p>
            <p className="font-display text-3xl leading-tight font-semibold text-gold-soft">{style.title}</p>
            <p className="text-sm text-muted">{style.detail}</p>
          </div>
        ) : (
          <p className="text-sm text-muted">Con menos de 3 partidas recientes todavía no se puede armar su perfil de juego.</p>
        )}

        {tags.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Cómo juega">
            {tags.slice(0, 6).map((t) => (
              <li
                key={t.label}
                title={t.why}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${TONE[t.tone]} ${t.champ ? "pl-0.5" : ""}`}
              >
                {t.champ && <ChampIcon version={version} id={t.champ} name="" size={18} className="rounded-full" />}
                {t.label}
              </li>
            ))}
          </ul>
        )}
      </div>

      {style && <PlaystyleRadar axes={style.axes} score={style.score} />}
    </div>
  );
}

/* ---------- Perfil de juego: seis ejes medidos contra el promedio de su rol ---------- */

type Game = { m: Match; me: MatchParticipant };
export interface Axis {
  id: AxisId;
  label: string;
  /** 50 = promedio de su rol; cada vez que el valor se duplica suma ~35. */
  score: number | null;
  why: string;
}

const STYLE: Record<AxisId, { title: string; detail: string }> = {
  combate: { title: "Siempre en la pelea", detail: "Aparece en casi todos los asesinatos de su equipo" },
  dano: { title: "Máquina de daño", detail: "Hace más daño a campeones que lo normal en su rol" },
  oro: { title: "Acumula oro", detail: "Saca más oro por minuto que el promedio de su rol" },
  objetivos: { title: "Cazador de objetivos", detail: "Le pega a torres, dragones y barones más que el resto" },
  supervivencia: { title: "Difícil de matar", detail: "Muere bastante menos que el promedio de su rol" },
  vision: { title: "Controla el mapa", detail: "Su visión está muy por encima de lo normal en su rol" },
};

/** Cuando nada sobresale, el punto más bajo es lo que define cómo juega. */
const WEAK_STYLE: Record<AxisId, { title: string; detail: string }> = {
  combate: { title: "Lobo solitario", detail: "Participa poco en los asesinatos de su equipo" },
  dano: { title: "Daño contenido", detail: "Hace menos daño a campeones que lo normal en su rol" },
  oro: { title: "Corto de oro", detail: "Saca menos oro por minuto que el promedio de su rol" },
  objetivos: { title: "Lejos de los objetivos", detail: "Le pega poco a torres, dragones y barones" },
  supervivencia: { title: "Vive al límite", detail: "Muere más que el promedio de su rol" },
  vision: { title: "Juega a ciegas", detail: "Pone y quita menos visión que lo normal en su rol" },
};

/** Perfil de juego de las últimas 10 partidas válidas (null con menos de 3). */
export function profileStyle(matches: Match[], puuid: string) {
  const games = matches
    .map((m) => ({ m, me: m.info.participants.find((p) => p.puuid === puuid) }))
    .filter((g): g is Game => Boolean(g.me) && g.m.info.gameDuration >= 300)
    .slice(0, 10);
  return games.length >= 3 ? playstyle(games) : null;
}

function playstyle(games: Game[]) {
  const acc = Object.fromEntries(AXIS_ORDER.map((id) => [id, { ratio: 0, value: 0, bench: 0, n: 0 }])) as Record<
    AxisId,
    { ratio: number; value: number; bench: number; n: number }
  >;
  for (const { m, me } of games) {
    for (const x of gameAxes(m, me)) {
      const a = acc[x.id];
      a.ratio += x.ratio;
      a.value += x.value;
      a.bench += x.bench;
      a.n++;
    }
  }

  const axes: Axis[] = AXIS_ORDER.map((id) => {
    const a = acc[id];
    if (!a.n) return { id, label: AXIS_LABEL[id], score: null, why: `${AXIS_LABEL[id]}: sin datos en estas partidas` };
    const score = ratioToScore(a.ratio / a.n);
    return {
      id,
      label: AXIS_LABEL[id],
      score,
      why: `${AXIS_LABEL[id]} ${score}: ${AXIS_FMT[id](a.value / a.n)}; lo normal en su rol es ${AXIS_SHORT[id](a.bench / a.n)}`,
    };
  });

  const ranked = axes.filter((a): a is Axis & { score: number } => a.score !== null).sort((a, b) => b.score - a.score);
  const score = Math.round(ranked.reduce((s, a) => s + a.score, 0) / Math.max(1, ranked.length));
  const [top, second] = ranked;
  const weak = ranked[ranked.length - 1];

  let title: string;
  const notes: string[] = [];
  if (top && top.score >= 58) {
    title = STYLE[top.id].title;
    notes.push(STYLE[top.id].detail);
    if (second && second.score >= 58) notes.push(`también destaca en ${second.label.toLowerCase()}`);
  } else if (top && top.score < 45) {
    title = "Buscando su ritmo";
    notes.push("Sus últimas partidas quedan bajo el promedio de su rol en casi todo");
  } else if (weak && weak.score <= 35) {
    // Nada sobresale pero hay un punto claramente bajo: eso es lo que lo define.
    title = WEAK_STYLE[weak.id].title;
    notes.push(WEAK_STYLE[weak.id].detail);
    if (top.score >= 52) notes.push(`lo mejor que tiene: ${top.label.toLowerCase()}`);
  } else {
    title = "Jugador equilibrado";
    notes.push("Rinde parejo en todo, sin un punto que sobresalga");
  }
  const named = title === WEAK_STYLE[weak?.id ?? "combate"].title;
  const detail = `${notes.join("; ")}.${weak && weak !== top && weak.score <= 42 && !named ? ` A mejorar: ${weak.label.toLowerCase()}.` : ""}`;
  return { axes, score, title, detail };
}

export function scoreClass(score: number | null) {
  if (score === null) return "fill-dim";
  return score >= 58 ? "fill-win" : score <= 42 ? "fill-loss" : "fill-ink";
}

/** Hexágono con los seis ejes; el anillo punteado es el promedio de su rol (50). */
export function PlaystyleRadar({ axes, score }: { axes: Axis[]; score: number }) {
  const cx = 150;
  const cy = 86;
  const r = 56;
  const point = (i: number, v: number) => {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    return [cx + Math.cos(angle) * r * v, cy + Math.sin(angle) * r * v] as const;
  };
  const ring = (v: number) => axes.map((_, i) => point(i, v).join(",")).join(" ");
  const shape = axes.map((a, i) => point(i, (a.score ?? 0) / 100).join(",")).join(" ");

  return (
    <figure className="shrink-0">
      <svg viewBox="0 0 300 172" width={300} height={172} role="img" aria-label={`Perfil de juego, nota ${score} de 100`}>
        {[0.25, 0.75, 1].map((v) => (
          <polygon key={v} points={ring(v)} className="fill-none stroke-line" strokeWidth={1} />
        ))}
        <polygon points={ring(0.5)} className="fill-none stroke-muted/50" strokeWidth={1} strokeDasharray="3 3" />
        {axes.map((_, i) => {
          const [x, y] = point(i, 1);
          return <line key={i} x1={cx} y1={cy} x2={x} y2={y} className="stroke-line" strokeWidth={1} />;
        })}
        <polygon points={shape} className="fill-gold/20 stroke-gold" strokeWidth={2} strokeLinejoin="round" />
        {axes.map((a, i) => {
          const [x, y] = point(i, (a.score ?? 0) / 100);
          return a.score === null ? null : <circle key={a.id} cx={x} cy={y} r={3} className="fill-gold stroke-night" strokeWidth={1.5} />;
        })}
        <circle cx={cx} cy={cy} r={17} className="fill-night stroke-line" strokeWidth={1} />
        <text x={cx} y={cy + 6} textAnchor="middle" className={`font-display text-[17px] font-semibold ${scoreClass(score)}`}>
          {score}
        </text>
        {axes.map((a, i) => {
          const [x, y] = point(i, 1.2);
          const anchor = Math.abs(x - cx) < 4 ? "middle" : x > cx ? "start" : "end";
          return (
            <g key={a.id}>
              <title>{a.why}</title>
              <text x={x} y={y + 4} textAnchor={anchor} className="text-[11px]">
                <tspan className="fill-muted">{a.label} </tspan>
                <tspan className={`font-semibold ${scoreClass(a.score)}`}>{a.score ?? "—"}</tspan>
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="-mt-1 text-center text-[11px] text-dim">Línea punteada: promedio de su rol</figcaption>
    </figure>
  );
}

/** Fila V/D de las últimas partidas, de la más vieja a la más nueva (detalle al pasar el mouse). */
export function RecentForm({ matches, puuid, data }: { matches: Match[]; puuid: string; data: MatchCardData }) {
  const games = matches
    .map((m) => ({ m, p: m.info.participants.find((x) => x.puuid === puuid) }))
    .filter((g) => g.p && g.m.info.gameDuration >= 300)
    .slice(0, 10)
    .reverse();
  if (!games.length) return null;
  return (
    <ol className="mt-2 flex gap-0.5" aria-label={`Últimas ${games.length} partidas, de la más vieja a la más nueva`}>
      {games.map(({ m, p }) => {
        const champ = data.champsByKey[p!.championId];
        return (
          <li
            key={m.metadata.matchId}
            title={`${p!.win ? "Victoria" : "Derrota"} con ${champ?.name ?? "campeón"} · ${p!.kills}/${p!.deaths}/${p!.assists} (${kda(p!.kills, p!.deaths, p!.assists)} KDA)`}
            className={`h-2 w-3 rounded-sm ${p!.win ? "bg-win" : "bg-loss"}`}
          />
        );
      })}
    </ol>
  );
}
