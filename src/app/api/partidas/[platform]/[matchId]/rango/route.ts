import type { NextRequest } from "next/server";
import { isPlatform } from "@/lib/constants";
import { getMatchRanks } from "@/lib/match-rank";
import { RiotApiError, hasRiotKey } from "@/lib/riot";

/** Rango de cada jugador y promedio de una partida; la tarjeta lo pide recién cuando aparece en pantalla. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/partidas/[platform]/[matchId]/rango">) {
  const { platform, matchId } = await ctx.params;
  if (!isPlatform(platform) || !/^[A-Z0-9]+_\d+$/.test(matchId)) {
    return Response.json({ error: "Partida no válida" }, { status: 400 });
  }
  if (!hasRiotKey()) return Response.json({ error: "Falta RIOT_API_KEY en .env.local" }, { status: 503 });

  try {
    return Response.json(await getMatchRanks(platform, matchId));
  } catch (err) {
    const status = err instanceof RiotApiError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Error desconocido";
    return Response.json({ error: message }, { status });
  }
}
