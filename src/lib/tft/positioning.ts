/**
 * Ubicación base de una comp en el tablero (4 filas x 7 columnas, la fila 0
 * es la que da al rival). La API de Riot no informa dónde estaba cada unidad,
 * así que se arma con una regla fija por unidad: los tanques adelante, el
 * carry cuerpo a cuerpo detrás de ellos y los de rango atrás, con el carry en
 * una esquina. No mira la partida (reglas de Riot para TFT).
 */
import type { TftUnit } from "./data";

export const BOARD_ROWS = 4;
export const BOARD_COLS = 7;

export interface BoardSlot {
  id: string;
  row: number;
  col: number;
}

/** Del centro hacia afuera: así la línea de adelante queda junta. */
const CENTER_OUT = [3, 2, 4, 1, 5, 0, 6];
/** Esquinas primero: el carry de rango va lejos del centro. */
const CORNERS_IN = [0, 6, 1, 5, 2, 4, 3];

const isTank = (u: TftUnit) => u.range <= 2 && (u.armor >= 50 || u.hp >= 1000);

export function suggestPositions(ids: string[], units: Record<string, TftUnit>, carry: string, itemized: Set<string>): BoardSlot[] {
  const list = ids.map((id) => units[id]).filter((u): u is TftUnit => Boolean(u));
  const taken = new Set<string>();
  const out: BoardSlot[] = [];
  const place = (id: string, rows: number[], cols: number[]) => {
    for (const row of rows) {
      for (const col of cols) {
        const key = `${row}:${col}`;
        if (taken.has(key)) continue;
        taken.add(key);
        out.push({ id, row, col });
        return;
      }
    }
  };

  const melee = list.filter((u) => u.range <= 2);
  const ranged = list.filter((u) => u.range > 2);
  // Carries cuerpo a cuerpo (llevan objetos y no son tanques puros) van detrás de la primera línea.
  const meleeCarries = melee.filter((u) => itemized.has(u.id) && (u.id === carry || !isTank(u)));
  const front = melee.filter((u) => !meleeCarries.includes(u)).sort((a, b) => b.hp * (1 + b.armor / 100) - a.hp * (1 + a.armor / 100));

  for (const u of front) place(u.id, [0, 1], CENTER_OUT);
  for (const u of meleeCarries.sort((a, b) => Number(b.id === carry) - Number(a.id === carry))) place(u.id, [1, 0, 2], CENTER_OUT);
  // Atrás: el carry y los que llevan objetos primero, en las esquinas.
  const back = ranged.sort(
    (a, b) => Number(b.id === carry) - Number(a.id === carry) || Number(itemized.has(b.id)) - Number(itemized.has(a.id)),
  );
  for (const u of back) place(u.id, [3, 2], CORNERS_IN);
  return out;
}
