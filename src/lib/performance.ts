/**
 * Rendimiento de un jugador en una partida, medido contra valores típicos de su
 * rol. Lo usan el perfil de juego del perfil (promedio de varias partidas) y el
 * resumen de cada partida. Los valores de referencia son aproximados (partidas
 * clasificatorias de todas las divisiones): el agregador no guarda promedios de
 * oro, daño o visión por rol.
 */
import { ROLES, type Role } from "./constants";
import type { Match, MatchParticipant } from "./riot";

export type AxisId = "combate" | "dano" | "oro" | "objetivos" | "supervivencia" | "vision";
export type BenchRole = Role | "ANY";

export const AXIS_LABEL: Record<AxisId, string> = {
  combate: "Peleas",
  dano: "Daño",
  oro: "Oro",
  objetivos: "Objetivos",
  supervivencia: "Supervivencia",
  vision: "Visión",
};

export const AXIS_ORDER: AxisId[] = ["combate", "dano", "oro", "objetivos", "supervivencia", "vision"];

/** Valores típicos por rol. "ANY" se usa en ARAM y otros modos sin rol (sin visión). */
export const BENCH: Record<BenchRole, Record<AxisId, number>> = {
  TOP: { combate: 0.45, dano: 0.23, oro: 410, objetivos: 0.22, supervivencia: 5.5, vision: 0.65 },
  JUNGLE: { combate: 0.58, dano: 0.18, oro: 390, objetivos: 0.38, supervivencia: 5.5, vision: 1.05 },
  MIDDLE: { combate: 0.53, dano: 0.26, oro: 410, objetivos: 0.15, supervivencia: 5.5, vision: 0.75 },
  BOTTOM: { combate: 0.52, dano: 0.27, oro: 430, objetivos: 0.18, supervivencia: 5.5, vision: 0.7 },
  UTILITY: { combate: 0.62, dano: 0.1, oro: 270, objetivos: 0.06, supervivencia: 6, vision: 2.3 },
  ANY: { combate: 0.55, dano: 0.2, oro: 400, objetivos: 0.2, supervivencia: 7, vision: 0 },
};

/** Súbditos (y monstruos) por minuto típicos de cada rol. */
export const CS_BENCH: Record<BenchRole, number> = { TOP: 7, JUNGLE: 6, MIDDLE: 7.5, BOTTOM: 8, UTILITY: 1.2, ANY: 0 };

/** Guardianes de control por partida típicos de cada rol. */
export const CONTROL_WARDS_BENCH: Record<BenchRole, number> = { TOP: 1, JUNGLE: 2.5, MIDDLE: 1.2, BOTTOM: 1, UTILITY: 4, ANY: 0 };

export const AXIS_FMT: Record<AxisId, (v: number) => string> = {
  combate: (v) => `${Math.round(v * 100)} % de participación en asesinatos`,
  dano: (v) => `${Math.round(v * 100)} % del daño de su equipo`,
  oro: (v) => `${Math.round(v)} de oro por minuto`,
  objetivos: (v) => `${Math.round(v * 100)} % del daño de su equipo a objetivos`,
  supervivencia: (v) => `${v.toFixed(1)} muertes cada 30 minutos`,
  vision: (v) => `${v.toFixed(2)} de visión por minuto`,
};

export const AXIS_SHORT: Record<AxisId, (v: number) => string> = {
  combate: (v) => `${Math.round(v * 100)} %`,
  dano: (v) => `${Math.round(v * 100)} %`,
  oro: (v) => `${Math.round(v)}`,
  objetivos: (v) => `${Math.round(v * 100)} %`,
  supervivencia: (v) => v.toFixed(1),
  vision: (v) => v.toFixed(2),
};

export interface AxisSample {
  id: AxisId;
  value: number;
  bench: number;
  /** value / bench (al revés en supervivencia: morir menos es mejor). */
  ratio: number;
}

export function benchRole(p: MatchParticipant): BenchRole {
  return ROLES.includes(p.teamPosition as Role) ? (p.teamPosition as Role) : "ANY";
}

/** 50 = lo normal en su rol; cada vez que la proporción se duplica suma ~35. */
export function ratioToScore(ratio: number): number {
  return Math.round(Math.min(99, Math.max(3, 50 + 35 * Math.log2(ratio))));
}

/** Los ejes medibles de un jugador en una partida (los que no aplican no vienen). */
export function gameAxes(m: Match, me: MatchParticipant): AxisSample[] {
  const minutes = m.info.gameDuration / 60;
  const role = benchRole(me);
  const b = BENCH[role];
  const team = m.info.participants.filter((p) => p.teamId === me.teamId);
  const teamKills = team.reduce((s, p) => s + p.kills, 0);
  const teamDamage = team.reduce((s, p) => s + p.totalDamageDealtToChampions, 0);
  const teamObjectives = team.reduce((s, p) => s + (p.damageDealtToObjectives ?? 0), 0);

  const out: AxisSample[] = [];
  const add = (id: AxisId, value: number, bench: number, inverse = false) => {
    if (!bench || !Number.isFinite(value)) return;
    out.push({ id, value, bench, ratio: inverse ? bench / Math.max(value, 0.75) : value / bench });
  };
  if (teamKills) add("combate", (me.kills + me.assists) / teamKills, b.combate);
  if (teamDamage) add("dano", me.totalDamageDealtToChampions / teamDamage, b.dano);
  add("oro", me.goldEarned / minutes, b.oro);
  if (teamObjectives) add("objetivos", (me.damageDealtToObjectives ?? 0) / teamObjectives, b.objetivos);
  // Muertes llevadas a una partida de 30 minutos, para no castigar las partidas largas.
  add("supervivencia", (me.deaths * 30) / minutes, b.supervivencia, true);
  if (role !== "ANY") add("vision", me.visionScore / minutes, b.vision);
  return out;
}
