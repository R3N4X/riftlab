/**
 * Análisis de una partida terminada para un jugador: rendimiento contra lo
 * normal en su rol, fase de líneas contra su rival directo, muertes, build
 * comparada con la Top 1 de su campeón y consejos concretos. Usa la partida
 * (en caché por días), su línea de tiempo (una consulta, también en caché) y
 * las estadísticas agregadas; no gasta más consultas a Riot.
 */
import { DEFAULT_RANK, ROLE_LABEL, type Platform, type Role } from "./constants";
import { getItems, type Item } from "./ddragon";
import {
  AXIS_FMT,
  AXIS_LABEL,
  AXIS_ORDER,
  AXIS_SHORT,
  CONTROL_WARDS_BENCH,
  CS_BENCH,
  benchRole,
  gameAxes,
  ratioToScore,
  type AxisId,
  type BenchRole,
} from "./performance";
import type { Match, MatchParticipant } from "./riot";
import { getChampionStats } from "./stats";
import { getTimelineSummary, type TimelineSummary } from "./timeline";

export interface ReviewAxis {
  id: AxisId;
  label: string;
  score: number | null;
  why: string;
}

export interface LaneSnapshot {
  minute: number;
  gold: number;
  cs: number;
  xp: number;
}

export interface LaneReview {
  opponent: MatchParticipant;
  /** Diferencias (tuyo menos el del rival) a los 10 y 15 minutos, si la partida duró eso. */
  diffs: LaneSnapshot[];
  /** Diferencia de oro al 15 que suele tener tu campeón contra ese rival (datos agregados). */
  typicalGold15: number | null;
  killsBefore15: number;
  deathsBefore15: number;
}

export interface ReviewEvent {
  minute: number;
  kind: "kill" | "death" | "assist";
  /** Campeón del otro lado (key numérica), si se sabe. */
  other: number | null;
}

export interface Tip {
  good: boolean;
  title: string;
  text: string;
}

export interface Placing {
  label: string;
  place: number;
  value: string;
}

export interface GameReview {
  me: MatchParticipant;
  role: BenchRole;
  axes: ReviewAxis[];
  score: number;
  grade: "S" | "A" | "B" | "C" | "D";
  placings: Placing[];
  lane: LaneReview | null;
  events: ReviewEvent[];
  /** Objetos completos en el orden en que los compró. */
  build: number[];
  /** Núcleo de 3 objetos más usado por su campeón en ese rol, con su winrate. */
  topBuild: { items: string[]; winRate: number; games: number } | null;
  keystone: number | null;
  topKeystone: number | null;
  tips: Tip[];
  /** La línea de tiempo no estaba disponible (sin fase de líneas ni muertes). */
  noTimeline: boolean;
}

function isCompleted(items: Record<string, Item>, id: number): boolean {
  const it = items[id];
  if (!it || !it.maps["11"] || it.tags.includes("Boots") || it.tags.includes("Consumable")) return false;
  return it.gold.total >= 2000 && (!it.into || (it.depth ?? 0) >= 3);
}

const at = (list: number[] | undefined, minute: number) => (list && list.length > minute ? list[minute] : null);

function gradeOf(score: number): GameReview["grade"] {
  return score >= 68 ? "S" : score >= 58 ? "A" : score >= 48 ? "B" : score >= 38 ? "C" : "D";
}

export async function getGameReview(platform: Platform, match: Match, puuid: string): Promise<GameReview | null> {
  const me = match.info.participants.find((p) => p.puuid === puuid);
  if (!me) return null;
  const role = benchRole(me);
  const minutes = match.info.gameDuration / 60;
  const fiveVsFive = match.info.participants.length === 10;

  const [timeline, items, stats] = await Promise.all([
    getTimelineSummary(platform, match.metadata.matchId).catch(() => null as TimelineSummary | null),
    getItems(),
    role === "ANY" ? null : getChampionStats(String(me.championId), DEFAULT_RANK, role as Role).catch(() => null),
  ]);

  // Rendimiento por eje (una sola partida).
  const samples = new Map(gameAxes(match, me).map((x) => [x.id, x]));
  const axes: ReviewAxis[] = AXIS_ORDER.map((id) => {
    const x = samples.get(id);
    if (!x) return { id, label: AXIS_LABEL[id], score: null, why: `${AXIS_LABEL[id]}: no aplica en esta partida` };
    const score = ratioToScore(x.ratio);
    return {
      id,
      label: AXIS_LABEL[id],
      score,
      why: `${AXIS_LABEL[id]} ${score}: ${AXIS_FMT[id](x.value)}; lo normal en el rol es ${AXIS_SHORT[id](x.bench)}`,
    };
  });
  const scored = axes.filter((a): a is ReviewAxis & { score: number } => a.score !== null);
  const score = Math.round(scored.reduce((s, a) => s + a.score, 0) / Math.max(1, scored.length));

  // Puesto entre los 10 jugadores.
  const everyone = match.info.participants;
  const placeBy = (label: string, f: (p: MatchParticipant) => number, fmt: (v: number) => string): Placing => ({
    label,
    place: everyone.filter((p) => f(p) > f(me)).length + 1,
    value: fmt(f(me)),
  });
  const placings = fiveVsFive
    ? [
        placeBy(
          "Daño a campeones",
          (p) => p.totalDamageDealtToChampions,
          (v) => v.toLocaleString("es-CL"),
        ),
        placeBy(
          "Oro",
          (p) => p.goldEarned,
          (v) => v.toLocaleString("es-CL"),
        ),
        // A un soporte no se le mide el farm.
        ...(role === "UTILITY"
          ? []
          : [
              placeBy(
                "Súbditos",
                (p) => p.totalMinionsKilled + p.neutralMinionsKilled,
                (v) => String(v),
              ),
            ]),
        placeBy(
          "Visión",
          (p) => p.visionScore,
          (v) => String(v),
        ),
        placeBy(
          "Daño recibido",
          (p) => p.totalDamageTaken,
          (v) => v.toLocaleString("es-CL"),
        ),
      ]
    : [];

  // Fase de líneas contra el rival directo.
  const opponent =
    role !== "ANY" ? everyone.find((p) => p.teamId !== me.teamId && p.teamPosition === me.teamPosition && p.teamPosition) : undefined;
  let lane: LaneReview | null = null;
  if (opponent && timeline) {
    const diffs: LaneSnapshot[] = [];
    for (const minute of [10, 15]) {
      const g = [at(timeline.gold[me.puuid], minute), at(timeline.gold[opponent.puuid], minute)];
      const c = [at(timeline.cs[me.puuid], minute), at(timeline.cs[opponent.puuid], minute)];
      const x = [at(timeline.xp[me.puuid], minute), at(timeline.xp[opponent.puuid], minute)];
      if (g[0] === null || g[1] === null) continue;
      diffs.push({ minute, gold: g[0] - g[1], cs: (c[0] ?? 0) - (c[1] ?? 0), xp: (x[0] ?? 0) - (x[1] ?? 0) });
    }
    const matchup = [...(stats?.strongAgainst ?? []), ...(stats?.weakAgainst ?? [])].find((m) => m.key === String(opponent.championId));
    const early = timeline.kills.filter((k) => k.minute < 15);
    lane = {
      opponent,
      diffs,
      typicalGold15: matchup?.lane ? Math.round(matchup.lane.gold15) : null,
      killsBefore15: early.filter((k) => k.killer === me.puuid && k.victim === opponent.puuid).length,
      deathsBefore15: early.filter((k) => k.victim === me.puuid && k.killer === opponent.puuid).length,
    };
  }

  // Asesinatos, muertes y asistencias en el tiempo.
  const champOf = (id: string | null) => (id ? (everyone.find((p) => p.puuid === id)?.championId ?? null) : null);
  const events: ReviewEvent[] = (timeline?.kills ?? []).flatMap((k): ReviewEvent[] => {
    if (k.victim === me.puuid) return [{ minute: k.minute, kind: "death", other: champOf(k.killer) }];
    if (k.killer === me.puuid) return [{ minute: k.minute, kind: "kill", other: champOf(k.victim) }];
    if (k.assists.includes(me.puuid)) return [{ minute: k.minute, kind: "assist", other: champOf(k.victim) }];
    return [];
  });

  // Build: objetos completos en orden de compra (o el inventario final si no hay línea de tiempo).
  const bought = timeline?.purchases[me.puuid]?.flatMap((v) => v.items) ?? [];
  const inventory = [me.item0, me.item1, me.item2, me.item3, me.item4, me.item5];
  const build = [...new Set((bought.length ? bought : inventory).filter((id) => isCompleted(items, id)))].slice(0, 6);
  const top = stats?.core[0];
  const topBuild = top ? { items: top.key.split("-"), winRate: top.winRate, games: top.games } : null;
  const keystone = me.perks.styles[0]?.selections[0]?.perk ?? null;
  const topRune = stats?.runes[0]?.key;
  const topKeystone = topRune ? Number(topRune.split("|")[0].split(":")[1]?.split(",")[0]) || null : null;

  const tips = buildTips({ match, me, role, minutes, samples, lane, events, build, topBuild, items, timeline });

  return {
    me,
    role,
    axes,
    score,
    grade: gradeOf(score),
    placings,
    lane,
    events,
    build,
    topBuild,
    keystone,
    topKeystone,
    tips,
    noTimeline: !timeline,
  };
}

function buildTips(ctx: {
  match: Match;
  me: MatchParticipant;
  role: BenchRole;
  minutes: number;
  samples: Map<AxisId, { value: number; bench: number; ratio: number }>;
  lane: LaneReview | null;
  events: ReviewEvent[];
  build: number[];
  topBuild: GameReview["topBuild"];
  items: Record<string, Item>;
  timeline: TimelineSummary | null;
}): Tip[] {
  const { me, role, minutes, samples, lane, events, build, topBuild, items, timeline } = ctx;
  const tips: (Tip & { weight: number })[] = [];
  const roleName = role === "ANY" ? "este modo" : ROLE_LABEL[role].toLowerCase();
  const pct = (v: number) => `${Math.round(v * 100)} %`;

  // Farm (no aplica a soporte ni a modos sin rol).
  if (role !== "ANY" && role !== "UTILITY") {
    const cs = (me.totalMinionsKilled + me.neutralMinionsKilled) / minutes;
    const bench = CS_BENCH[role];
    const cs10 = at(timeline?.cs[me.puuid], 10);
    const at10 = cs10 !== null ? ` A los 10 minutos llevabas ${cs10}; lo ideal ronda ${Math.round(bench * 10 * 0.85)}.` : "";
    if (cs < bench * 0.85)
      tips.push({
        good: false,
        weight: 1 - cs / bench,
        title: "Te faltó farm",
        text: `Sacaste ${cs.toFixed(1)} súbditos por minuto; en ${roleName} lo normal es ${bench}.${at10}`,
      });
    else if (cs > bench * 1.1)
      tips.push({
        good: true,
        weight: cs / bench - 1,
        title: "Buen farm",
        text: `${cs.toFixed(1)} súbditos por minuto, sobre los ${bench} normales en ${roleName}.`,
      });
  }

  // Muertes tempranas.
  const early = events.filter((e) => e.kind === "death" && e.minute < 15);
  if (early.length >= 3)
    tips.push({
      good: false,
      weight: 0.4 + early.length * 0.1,
      title: `Moriste ${early.length} veces antes del minuto 15`,
      text: "Cada muerte temprana le regala oro y presión de mapa al rival. Juega más atrás cuando no tengas visión de su jungla o cuando te supere en nivel.",
    });
  const surv = samples.get("supervivencia");
  if (surv && early.length < 3 && surv.ratio < 0.7)
    tips.push({
      good: false,
      weight: 1 - surv.ratio,
      title: "Muchas muertes",
      text: `${me.deaths} muertes (${surv.value.toFixed(1)} cada 30 minutos; lo normal en ${roleName} es ${surv.bench}). Fíjate en cuáles fueron por pelear en desventaja.`,
    });
  else if (surv && surv.ratio > 1.6 && me.deaths <= 3)
    tips.push({ good: true, weight: 0.3, title: "Moriste poco", text: `Solo ${me.deaths} muertes en ${Math.round(minutes)} minutos.` });

  // Visión.
  const vision = samples.get("vision");
  if (vision && vision.ratio < 0.7) {
    const control = me.controlWardsPlaced ?? null;
    const controlBench = CONTROL_WARDS_BENCH[role];
    tips.push({
      good: false,
      weight: 1 - vision.ratio,
      title: "Poca visión",
      text: `${vision.value.toFixed(2)} de visión por minuto; en ${roleName} lo normal es ${vision.bench}.${
        control !== null && control < controlBench
          ? ` Pusiste ${control} guardianes de control; en tu rol se usan unos ${controlBench} por partida.`
          : ""
      }`,
    });
  } else if (vision && vision.ratio > 1.3)
    tips.push({
      good: true,
      weight: vision.ratio - 1,
      title: "Gran visión",
      text: `${vision.value.toFixed(2)} de visión por minuto, sobre lo normal en ${roleName}.`,
    });

  // Participación en asesinatos.
  const kp = samples.get("combate");
  if (kp && kp.ratio < 0.75)
    tips.push({
      good: false,
      weight: 1 - kp.ratio,
      title: "Poco presente en las peleas",
      text: `Participaste en el ${pct(kp.value)} de los asesinatos de tu equipo; en ${roleName} lo normal es ${pct(kp.bench)}. Acércate a los objetivos cuando tu equipo se agrupa.`,
    });
  else if (kp && kp.ratio > 1.25)
    tips.push({
      good: true,
      weight: kp.ratio - 1,
      title: "Siempre en las peleas",
      text: `Estuviste en el ${pct(kp.value)} de los asesinatos de tu equipo.`,
    });

  // Daño.
  const dmg = samples.get("dano");
  if (dmg && role !== "UTILITY" && dmg.ratio < 0.7)
    tips.push({
      good: false,
      weight: 1 - dmg.ratio,
      title: "Poco daño a campeones",
      text: `Hiciste el ${pct(dmg.value)} del daño de tu equipo; en ${roleName} lo normal es ${pct(dmg.bench)}.`,
    });
  else if (dmg && dmg.ratio > 1.3)
    tips.push({ good: true, weight: dmg.ratio - 1, title: "Mucho daño", text: `Hiciste el ${pct(dmg.value)} del daño de tu equipo.` });

  // Objetivos.
  const obj = samples.get("objetivos");
  if (obj && obj.ratio < 0.5 && (role === "JUNGLE" || role === "TOP"))
    tips.push({
      good: false,
      weight: 0.6,
      title: "Lejos de los objetivos",
      text: `Hiciste el ${pct(obj.value)} del daño de tu equipo a torres, dragones y barones; en ${roleName} lo normal es ${pct(obj.bench)}.`,
    });

  // Fase de líneas.
  const d15 = lane?.diffs.find((d) => d.minute === 15);
  if (lane && d15) {
    const typical = lane.typicalGold15;
    const context =
      typical === null
        ? ""
        : typical < -300
          ? ` Este enfrentamiento suele ser difícil: en promedio se queda ${Math.abs(typical)} de oro abajo.`
          : typical > 300
            ? ` En promedio tu campeón saca ${typical} de oro de ventaja en este enfrentamiento, así que había margen.`
            : " En promedio este enfrentamiento es parejo.";
    if (d15.gold <= -700)
      tips.push({
        good: false,
        weight: Math.min(1, -d15.gold / 2000),
        title: "Perdiste la línea",
        text: `Al minuto 15 tenías ${Math.abs(d15.gold)} de oro menos que tu rival.${context}`,
      });
    else if (d15.gold >= 700)
      tips.push({
        good: true,
        weight: Math.min(1, d15.gold / 2000),
        title: "Ganaste la línea",
        text: `Al minuto 15 le sacabas ${d15.gold} de oro a tu rival.${context}`,
      });
  }

  // Build contra la Top 1.
  if (topBuild && build.length >= 2) {
    const shared = topBuild.items.filter((id) => build.slice(0, 4).includes(Number(id)));
    if (shared.length <= 1) {
      const names = topBuild.items.map((id) => items[id]?.name).filter(Boolean);
      tips.push({
        good: false,
        weight: 0.35,
        title: "Build distinta a la más usada",
        text: `La build Top 1 de tu campeón es ${names.join(", ")} (${pct(topBuild.winRate)} de victorias en ${topBuild.games} partidas). Puede convenir en tu próxima partida.`,
      });
    }
  }

  const bad = tips.filter((t) => !t.good).sort((a, b) => b.weight - a.weight);
  const good = tips.filter((t) => t.good).sort((a, b) => b.weight - a.weight);
  return [...bad.slice(0, 4), ...good.slice(0, 2)].map(({ good, title, text }) => ({ good, title, text }));
}
