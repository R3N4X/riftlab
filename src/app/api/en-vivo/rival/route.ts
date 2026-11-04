import type { NextRequest } from "next/server";
import { DEFAULT_RANK, isRole } from "@/lib/constants";
import { getChampion, getChampionsByKey, getItems } from "@/lib/ddragon";
import { getChampionStats } from "@/lib/stats";

/**
 * Lo justo sobre tu rival de línea para la pantalla de carga: consejos para jugarle (de Riot, en
 * Data Dragon) y la build que más arma en esa línea.
 * ?champ=<key>&rol=<línea>
 */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("champ") ?? "";
  const role = req.nextUrl.searchParams.get("rol");
  if (!/^\d+$/.test(key)) return Response.json({ error: "Campeón no válido" }, { status: 400 });
  const champs = await getChampionsByKey();
  const champ = champs[key];
  if (!champ) return Response.json({ error: "Campeón no encontrado" }, { status: 404 });

  const [detail, stats, items] = await Promise.all([
    getChampion(champ.id),
    getChampionStats(key, DEFAULT_RANK, isRole(role) ? role : undefined),
    getItems(),
  ]);
  // Botas y objetos principales de la build más jugada, en orden de compra.
  const core = stats?.core[0]?.key.split("-") ?? [];
  const boots = stats?.boots[0]?.key;
  const build = [...new Set([core[0], boots, ...core.slice(1)].filter((id): id is string => Boolean(id && items[id])))].slice(0, 4);
  return Response.json({
    tips: detail?.enemytips.slice(0, 3) ?? [],
    items: build.map((id) => ({ id, name: items[id].name })),
  });
}
