import type { NextRequest } from "next/server";
import { isPlatform } from "@/lib/constants";
import { RiotApiError, getAccountByRiotId, hasRiotKey, slugToRiotId } from "@/lib/riot";

/**
 * Confirma que un Riot ID existe y devuelve cómo lo escribe Riot (mayúsculas
 * incluidas). Lo usa Ajustes antes de vincular una cuenta a mano.
 */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/cuenta/[platform]/[riotId]">) {
  const { platform, riotId } = await ctx.params;
  const id = slugToRiotId(riotId);
  if (!isPlatform(platform) || !id) return Response.json({ error: "Riot ID no válido" }, { status: 400 });
  if (!hasRiotKey()) return Response.json({ error: "Falta la clave de la API de Riot" }, { status: 503 });

  try {
    const account = await getAccountByRiotId(platform, id.gameName, id.tagLine);
    return Response.json({ gameName: account.gameName, tagLine: account.tagLine, platform });
  } catch (err) {
    const status = err instanceof RiotApiError ? err.status : 500;
    const message = status === 404 ? "No existe una cuenta con ese Riot ID" : err instanceof Error ? err.message : "Error desconocido";
    return Response.json({ error: message }, { status });
  }
}
