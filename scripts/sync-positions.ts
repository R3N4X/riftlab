/**
 * Descarga el mapa campeón → posiciones habituales desde Meraki Analytics
 * (dataset comunitario abierto) y lo guarda reducido en src/data/positions.json.
 *
 * Solo se usa como respaldo para el dataset de demostración: cuando hay datos
 * reales agregados desde la API de Riot, las posiciones salen de las partidas.
 *
 *   npm run sync:positions
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const MERAKI_URL =
  "https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/champions.json";

const ROLE_MAP: Record<string, string> = {
  TOP: "TOP",
  JUNGLE: "JUNGLE",
  MIDDLE: "MIDDLE",
  BOTTOM: "BOTTOM",
  SUPPORT: "UTILITY",
};

async function main() {
  const res = await fetch(MERAKI_URL);
  if (!res.ok) throw new Error(`Meraki respondió ${res.status}`);
  const data = (await res.json()) as Record<string, { positions?: string[] }>;

  const out: Record<string, string[]> = {};
  for (const [id, champ] of Object.entries(data)) {
    const roles = (champ.positions ?? []).map((p) => ROLE_MAP[p]).filter(Boolean);
    if (roles.length) out[id] = roles;
  }

  const file = join(process.cwd(), "src", "data", "positions.json");
  writeFileSync(file, JSON.stringify(out, null, 0));
  console.log(`positions.json actualizado: ${Object.keys(out).length} campeones`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
