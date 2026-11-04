import type { NextRequest } from "next/server";
import { DEFAULT_RANK, isRole } from "@/lib/constants";
import { getChampionsByKey, getItems } from "@/lib/ddragon";
import { getChampionStats } from "@/lib/stats";
import { autoBuildPayload } from "@/app/en-vivo/build-payload";

/**
 * Build Top 1 para importar sola al cliente (la misma que muestra En vivo). La pide la
 * importación automática, que funciona en cualquier página de la app, no solo en En vivo.
 * ?yo=<campeón>&rol=<línea>&rivales=<campeones separados por coma>
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const key = sp.get("yo") ?? "";
  const role = sp.get("rol");
  if (!/^\d+$/.test(key)) return Response.json({ error: "Campeón no válido" }, { status: 400 });

  const [champs, items, stats] = await Promise.all([getChampionsByKey(), getItems(), getChampionStats(key, DEFAULT_RANK, isRole(role) ? role : undefined)]);
  const me = champs[key];
  if (!me || !stats) return Response.json({ error: "Sin datos de este campeón" }, { status: 404 });
  const enemies = (sp.get("rivales") ?? "")
    .split(",")
    .map((part) => champs[part.split("-")[0]])
    .filter(Boolean);
  const build = autoBuildPayload(me, stats, enemies, items);
  if (!build) return Response.json({ error: "Sin builds suficientes" }, { status: 404 });
  return Response.json(build);
}
