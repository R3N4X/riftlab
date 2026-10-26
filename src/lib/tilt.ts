/**
 * Aviso de tilt: mira la sesión actual (partidas seguidas con menos de 90 minutos entre una y
 * otra) y avisa si viene mal: derrotas seguidas, nota por debajo de lo normal del jugador, más
 * muertes que de costumbre o una sesión larga perdiendo. Si la última partida terminó hace más
 * de 3 horas no avisa: ya hubo pausa.
 */
import { gameAxes, ratioToScore } from "./performance";
import type { Match, MatchParticipant } from "./riot";

const SESSION_GAP_MS = 90 * 60_000;
const RESTED_MS = 3 * 60 * 60_000;

export interface TiltNotice {
  level: "aviso" | "alto";
  title: string;
  reasons: string[];
  tip: string;
}

interface Game {
  m: Match;
  me: MatchParticipant;
  end: number;
  score: number | null;
}

const average = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

/** Nota de 0 a 100 de una partida: el promedio de sus ejes (la misma del resumen post-partida). */
function gameScore(m: Match, me: MatchParticipant): number | null {
  const axes = gameAxes(m, me);
  return axes.length ? Math.round(average(axes.map((a) => ratioToScore(a.ratio)))) : null;
}

export function tiltCheck(matches: Match[], puuid: string, now: number): TiltNotice | null {
  const games: Game[] = matches
    // Las rehechas antes de los 5 minutos no cuentan.
    .filter((m) => m.info.gameDuration >= 300)
    .flatMap((m) => {
      const me = m.info.participants.find((p) => p.puuid === puuid);
      if (!me) return [];
      const end = m.info.gameEndTimestamp ?? m.info.gameCreation + m.info.gameDuration * 1000;
      return [{ m, me, end, score: gameScore(m, me) }];
    })
    .sort((a, b) => b.end - a.end);
  if (!games.length || now - games[0].end > RESTED_MS) return null;

  const session = [games[0]];
  for (let i = 1; i < games.length; i++) {
    if (games[i - 1].m.info.gameCreation - games[i].end > SESSION_GAP_MS) break;
    session.push(games[i]);
  }
  // Si ganó la última, la racha se cortó: no se avisa aunque la nota venga baja.
  if (session[0].me.win) return null;

  let streak = 0;
  for (const g of session) {
    if (g.me.win) break;
    streak++;
  }
  const losses = session.filter((g) => !g.me.win).length;

  const recent = session.slice(0, 3);
  const rest = games.slice(recent.length);
  const reasons: string[] = [];
  let points = 0;

  if (streak >= 3) {
    reasons.push(`${streak} derrotas seguidas en esta sesión.`);
    points += streak >= 4 ? 2 : 1;
  }

  const recentScores = recent.flatMap((g) => (g.score === null ? [] : [g.score]));
  const restScores = rest.flatMap((g) => (g.score === null ? [] : [g.score]));
  if (recentScores.length >= 2 && restScores.length >= 4) {
    const now3 = Math.round(average(recentScores));
    const usual = Math.round(average(restScores));
    if (usual - now3 >= 10) {
      reasons.push(`Nota de las últimas ${recentScores.length} partidas: ${now3}, cuando lo habitual es ${usual}.`);
      points++;
    }
  }

  if (recent.length >= 2 && rest.length >= 4) {
    const deathsNow = average(recent.map((g) => g.me.deaths));
    const deathsUsual = average(rest.map((g) => g.me.deaths));
    if (deathsNow >= 6 && deathsNow >= deathsUsual * 1.5) {
      reasons.push(`${deathsNow.toFixed(1)} muertes por partida, cuando lo habitual es ${deathsUsual.toFixed(1)}.`);
      points++;
    }
  }

  if (session.length >= 6 && losses > session.length / 2) {
    reasons.push(`${session.length} partidas seguidas sin pausa larga, ${losses} perdidas.`);
    points++;
  }

  if (!points) return null;
  const high = points >= 3 || streak >= 4;
  return {
    level: high ? "alto" : "aviso",
    title: high ? "Buen momento para una pausa" : "Ojo con la racha",
    reasons,
    tip: high
      ? "Una pausa de 15 a 20 minutos (agua, estirarse, lejos de la pantalla) corta una mala racha mejor que la siguiente partida."
      : "Si la próxima también sale mal, conviene una pausa corta antes de seguir.",
  };
}
