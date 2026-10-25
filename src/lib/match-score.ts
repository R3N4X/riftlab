/**
 * Puntuación RiftLab (0 a 10) de cada jugador en una partida, al estilo del
 * "OP Score". Compara a los 10 jugadores entre sí con lo que más pesa en el
 * resultado: participación en asesinatos, daño, KDA, visión, oro y farmeo.
 * El mejor del equipo ganador es MVP y el mejor del perdedor es ACE.
 */
import type { Match, MatchParticipant } from "./riot";

export interface PlayerScore {
  score: number;
  /** Puesto entre los 10 (1 = mejor). */
  rank: number;
  badge: "MVP" | "ACE" | null;
}

const WEIGHTS = { kp: 2.4, damage: 2.4, kda: 1.6, vision: 1.2, gold: 1.2, cs: 1.2 };

export function scoreMatch(match: Match): Map<string, PlayerScore> {
  const parts = match.info.participants;
  const minutes = Math.max(1, match.info.gameDuration / 60);
  const teamKills = (p: MatchParticipant) => parts.filter((o) => o.teamId === p.teamId).reduce((s, o) => s + o.kills, 0) || 1;

  const raw = parts.map((p) => ({
    p,
    kp: (p.kills + p.assists) / teamKills(p),
    damage: p.totalDamageDealtToChampions,
    kda: Math.min(10, (p.kills + p.assists) / Math.max(1, p.deaths)),
    vision: p.visionScore / minutes,
    gold: p.goldEarned,
    cs: (p.totalMinionsKilled + p.neutralMinionsKilled) / minutes,
  }));

  const keys = Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[];
  const max = Object.fromEntries(keys.map((k) => [k, Math.max(...raw.map((r) => r[k]), 0.0001)])) as Record<keyof typeof WEIGHTS, number>;
  const total = keys.reduce((s, k) => s + WEIGHTS[k], 0);

  const scored = raw.map((r) => {
    const base = keys.reduce((s, k) => s + WEIGHTS[k] * (r[k] / max[k]), 0) / total; // 0..1
    // Ganar suma un poco: el mismo rendimiento vale más si terminó en victoria.
    const score = Math.min(10, Math.max(0, base * 9.2 + (r.p.win ? 0.8 : 0)));
    return { puuid: r.p.puuid, win: r.p.win, score: Math.round(score * 10) / 10 };
  });

  const ordered = [...scored].sort((a, b) => b.score - a.score);
  const mvp = ordered.find((s) => s.win)?.puuid;
  const ace = ordered.find((s) => !s.win)?.puuid;

  return new Map(
    ordered.map((s, i) => [s.puuid, { score: s.score, rank: i + 1, badge: s.puuid === mvp ? "MVP" : s.puuid === ace ? "ACE" : null }]),
  );
}
