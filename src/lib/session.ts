/**
 * Sesión del día: las partidas jugadas desde las 5:00 (así una sesión que pasa de medianoche
 * sigue contando como la misma noche), con el balance, la racha, el tiempo jugado y la nota de
 * cada partida comparada con la habitual del jugador.
 */
import type { Match, MatchParticipant } from "./riot";
import { gameScore } from "./tilt";

/** Hora local en que empieza el día de juego. */
export const DAY_START_HOUR = 5;

export function dayStart(now: number): number {
  const d = new Date(now);
  d.setHours(DAY_START_HOUR, 0, 0, 0);
  if (d.getTime() > now) d.setDate(d.getDate() - 1);
  return d.getTime();
}

export interface SessionGame {
  matchId: string;
  me: MatchParticipant;
  queueId: number;
  end: number;
  minutes: number;
  /** Nota de 0 a 100 (la del resumen post-partida); null en modos sin ejes medibles. */
  score: number | null;
}

export interface DaySession {
  /** De la más vieja a la más nueva. */
  games: SessionGame[];
  wins: number;
  losses: number;
  minutes: number;
  /** Partidas seguidas con el mismo resultado que la última. */
  streak: { win: boolean; count: number };
  score: number | null;
  /** Nota promedio de las partidas anteriores a hoy (con al menos 4). */
  usualScore: number | null;
}

const average = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const endOf = (m: Match) => m.info.gameEndTimestamp ?? m.info.gameCreation + m.info.gameDuration * 1000;

export function daySession(matches: Match[], puuid: string, now: number): DaySession | null {
  const start = dayStart(now);
  const seen = new Set<string>();
  const valid = matches
    .filter((m) => {
      if (seen.has(m.metadata.matchId)) return false;
      seen.add(m.metadata.matchId);
      // Las rehechas antes de los 5 minutos no cuentan.
      return m.info.gameDuration >= 300;
    })
    .flatMap((m) => {
      const me = m.info.participants.find((p) => p.puuid === puuid);
      return me ? [{ m, me }] : [];
    });

  const games: SessionGame[] = valid
    .filter(({ m }) => endOf(m) >= start)
    .map(({ m, me }) => ({
      matchId: m.metadata.matchId,
      me,
      queueId: m.info.queueId,
      end: endOf(m),
      minutes: m.info.gameDuration / 60,
      score: gameScore(m, me),
    }))
    .sort((a, b) => a.end - b.end);
  if (!games.length) return null;

  const wins = games.filter((g) => g.me.win).length;
  const last = games[games.length - 1];
  let count = 0;
  for (let i = games.length - 1; i >= 0 && games[i].me.win === last.me.win; i--) count++;

  const before = valid.filter(({ m }) => endOf(m) < start).flatMap(({ m, me }) => {
    const s = gameScore(m, me);
    return s === null ? [] : [s];
  });
  const today = games.flatMap((g) => (g.score === null ? [] : [g.score]));
  const score = average(today);
  const usual = before.length >= 4 ? average(before) : null;

  return {
    games,
    wins,
    losses: games.length - wins,
    minutes: games.reduce((s, g) => s + g.minutes, 0),
    streak: { win: last.me.win, count },
    score: score === null ? null : Math.round(score),
    usualScore: usual === null ? null : Math.round(usual),
  };
}

/** "2 h 15 min", "45 min". */
export function playTime(minutes: number): string {
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}
