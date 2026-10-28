/**
 * Línea de cada jugador en una partida en curso. La API de espectador no la trae: se deduce del
 * campeón (en qué rol se juega más, según las partidas agregadas) y de Aplastar, que casi siempre
 * es de la jungla. Se prueba cada reparto posible de las 5 líneas y se queda el más probable.
 */
import { ROLES, type Role } from "./constants";

const SMITE = 11;

interface LanePlayer {
  championId: number;
  spell1Id: number;
  spell2Id: number;
}

/** Todas las formas de ordenar los 5 roles (120). */
const PERMUTATIONS: Role[][] = (function permute(rest: Role[]): Role[][] {
  if (rest.length <= 1) return [rest];
  return rest.flatMap((r, i) => permute([...rest.slice(0, i), ...rest.slice(i + 1)]).map((p) => [r, ...p]));
})([...ROLES]);

function logChance(p: LanePlayer, role: Role, roleGames: Record<string, Partial<Record<Role, number>>>): number {
  const games = roleGames[String(p.championId)] ?? {};
  const total = Object.values(games).reduce((s, g) => s + (g ?? 0), 0);
  // Suavizado: un campeón sin datos queda parejo entre los 5 roles.
  let chance = ((games[role] ?? 0) + 1) / (total + ROLES.length);
  const smite = p.spell1Id === SMITE || p.spell2Id === SMITE;
  if (role === "JUNGLE") chance *= smite ? 50 : 0.02;
  return Math.log(chance);
}

/** Rol de cada jugador del equipo (mismo orden), o null si el equipo no tiene 5 jugadores. */
export function assignLanes(team: LanePlayer[], roleGames: Record<string, Partial<Record<Role, number>>>): Role[] | null {
  if (team.length !== ROLES.length) return null;
  const scores = team.map((p) => Object.fromEntries(ROLES.map((r) => [r, logChance(p, r, roleGames)])) as Record<Role, number>);
  let best = PERMUTATIONS[0];
  let bestScore = -Infinity;
  for (const perm of PERMUTATIONS) {
    const score = perm.reduce((s, role, i) => s + scores[i][role], 0);
    if (score > bestScore) {
      bestScore = score;
      best = perm;
    }
  }
  return best;
}

/** El equipo ordenado de Superior a Soporte, con el rol de cada uno (sin reordenar si no son 5). */
export function sortByLane<T extends LanePlayer>(
  team: T[],
  roleGames: Record<string, Partial<Record<Role, number>>>,
): { player: T; role: Role | null }[] {
  const roles = assignLanes(team, roleGames);
  if (!roles) return team.map((player) => ({ player, role: null }));
  return team
    .map((player, i) => ({ player, role: roles[i] }))
    .sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role));
}
