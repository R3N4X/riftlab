/*
 * Puntajes de 0 a 5 para la selección de campeones. Un winrate se lee mal de un vistazo (48 % y
 * 52 % parecen casi iguales); en esta escala 2,5 es una partida pareja y cada punto porcentual de
 * winrate mueve el puntaje 0,25, así que ±10 puntos llegan a los extremos.
 */

const clamp = (n: number) => Math.min(5, Math.max(0, n));

/** Winrate (0-1) → puntaje de 0 a 5. */
export function scoreOf(winRate: number): number {
  return clamp(2.5 + (winRate - 0.5) * 25);
}

/** Diferencia de oro al minuto 15 contra el rival de línea → puntaje: ±500 de oro llega a los extremos. */
export function goldScore(gold15: number): number {
  return clamp(2.5 + gold15 / 200);
}

export const formatScore = (score: number) => score.toFixed(1);

/** Color del puntaje: verde desde 3 (ventaja clara), rojo bajo 2 (desventaja clara). */
export function scoreClass(score: number): string {
  return score >= 3 ? "text-win" : score < 2 ? "text-loss" : "text-gold-soft";
}

export const SCORE_HINT = "De 0 a 5: 2.5 es una partida pareja (50 % de victorias); desde 3 es ventaja y bajo 2, desventaja.";
