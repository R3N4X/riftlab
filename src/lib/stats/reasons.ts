/**
 * Explicación corta de POR QUÉ un campeón le gana (o le cuesta) a otro.
 * Se arma con datos, no con texto inventado: la fase de líneas registrada por
 * el agregador (oro al minuto 15 y duelos entre ambos) y las estadísticas
 * base de Data Dragon (alcance y clase del campeón).
 *
 * Se escribe en segunda persona: "tú" eres el campeón de la página.
 */
import type { ChampionSummary } from "../ddragon";
import type { LaneInfo } from "./index";

const CLASS: Record<string, string> = {
  Assassin: "asesino",
  Fighter: "luchador",
  Mage: "mago",
  Marksman: "tirador",
  Support: "soporte",
  Tank: "tanque",
};

function goldPhrase(lane: LaneInfo): string | null {
  const g = Math.round(lane.gold15 / 10) * 10;
  if (Math.abs(g) < 120) return null;
  return g > 0 ? `le sacas ${g} de oro al minuto 15` : `te saca ${-g} de oro al minuto 15`;
}

function duelPhrase(lane: LaneInfo): string | null {
  const events = lane.kills + lane.deaths;
  // Con menos de ~1 asesinato cada 5 partidas, el porcentaje no dice nada.
  if (events < 0.2) return null;
  const mine = lane.kills / events;
  if (mine >= 0.58) return `ganas el ${Math.round(mine * 100)}% de los duelos en línea`;
  if (mine <= 0.42) return `gana el ${Math.round((1 - mine) * 100)}% de los duelos en línea`;
  return null;
}

function rangePhrase(me: ChampionSummary, opp: ChampionSummary): string | null {
  const a = me.stats.attackrange;
  const b = opp.stats.attackrange;
  if (Math.abs(a - b) < 150) return null;
  return a > b ? `pegas desde más lejos (${a} vs ${b} de alcance)` : `pega desde más lejos (${b} vs ${a} de alcance)`;
}

function classPhrase(me: ChampionSummary, opp: ChampionSummary, opponentFavored: boolean): string | null {
  const mine = me.tags[0];
  const theirs = opp.tags[0];
  if (opponentFavored) {
    if (theirs === "Assassin" && ["Mage", "Marksman", "Support"].includes(mine)) return "es asesino: te puede eliminar en un solo combo";
    if (theirs === "Tank" && mine === "Assassin") return "es tanque: aguanta tu daño explosivo";
    if (theirs === "Fighter" && mine === "Tank") return "es luchador: gana los intercambios largos";
  } else {
    if (mine === "Assassin" && ["Mage", "Marksman", "Support"].includes(theirs)) return `es ${CLASS[theirs]} frágil: lo puedes eliminar en un combo`;
    if (mine === "Tank" && theirs === "Assassin") return "eres tanque: su daño explosivo no te alcanza";
  }
  return null;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Hasta dos motivos, del más fuerte al más débil. `opponentFavored` indica
 * si el rival es el que gana el enfrentamiento.
 */
export function counterReason(
  me: ChampionSummary,
  opp: ChampionSummary,
  lane: LaneInfo | null,
  opponentFavored: boolean,
): string | null {
  const phrases: string[] = [];

  if (lane) {
    const gold = goldPhrase(lane);
    const duel = duelPhrase(lane);
    // Solo se muestran los datos que apoyan el resultado (si no, confundiría).
    if (gold && gold.startsWith("te saca") === opponentFavored) phrases.push(gold);
    if (duel && duel.startsWith("gana ") === opponentFavored) phrases.push(duel);
  }
  const range = rangePhrase(me, opp);
  if (range && range.startsWith("pega ") === opponentFavored) phrases.push(range);
  if (phrases.length < 2) {
    const cls = classPhrase(me, opp, opponentFavored);
    if (cls) phrases.push(cls);
  }

  if (!phrases.length) return null;
  return capitalize(phrases.slice(0, 2).join(" y ")) + ".";
}
