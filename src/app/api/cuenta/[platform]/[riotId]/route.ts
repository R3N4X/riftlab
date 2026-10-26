import type { NextRequest } from "next/server";
import { isPlatform } from "@/lib/constants";
import { getLatestVersion, img } from "@/lib/ddragon";
import { RiotApiError, getAccountByRiotId, getSummonerByPuuid, hasRiotKey, slugToRiotId } from "@/lib/riot";

/**
 * Confirma que un Riot ID existe y devuelve cómo lo escribe Riot (mayúsculas
 * incluidas), con su ícono y nivel. Lo usa Ajustes para vincular una cuenta a mano y para
 * mostrar el ícono de la cuenta vinculada.
 */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/cuenta/[platform]/[riotId]">) {
  const { platform, riotId } = await ctx.params;
  const id = slugToRiotId(riotId);
  if (!isPlatform(platform) || !id) return Response.json({ error: "Riot ID no válido" }, { status: 400 });
  if (!hasRiotKey()) return Response.json({ error: "Falta la clave de la API de Riot" }, { status: 503 });

  try {
    const account = await getAccountByRiotId(platform, id.gameName, id.tagLine);
    const [summoner, version] = await Promise.all([getSummonerByPuuid(platform, account.puuid).catch(() => null), getLatestVersion()]);
    return Response.json({
      gameName: account.gameName,
      tagLine: account.tagLine,
      platform,
      icon: summoner ? img.profileIcon(version, summoner.profileIconId) : null,
      level: summoner?.summonerLevel ?? null,
    });
  } catch (err) {
    const status = err instanceof RiotApiError ? err.status : 500;
    const message = status === 404 ? "No existe una cuenta con ese Riot ID" : err instanceof Error ? err.message : "Error desconocido";
    return Response.json({ error: message }, { status });
  }
}
