import type { Role } from "../constants";

/** Clave estable para un par de aliados: "keyA:ROL-keyB:ROL" en orden alfabético. */
export function pairKey(keyA: string, roleA: Role, keyB: string, roleB: Role): string {
  const a = `${keyA}:${roleA}`;
  const b = `${keyB}:${roleB}`;
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}
