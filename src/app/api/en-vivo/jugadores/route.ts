import type { NextRequest } from "next/server";
import { isPlatform } from "@/lib/constants";
import { getLiveGameInfo } from "@/lib/live-players";
import { RiotApiError, hasRiotKey } from "@/lib/riot";

/** Los 10 jugadores de la partida en curso de un jugador (pantalla de carga de En vivo). */
export async function GET(req: NextRequest) {
  const platform = req.nextUrl.searchParams.get("platform") ?? "";
  const puuid = req.nextUrl.searchParams.get("puuid") ?? "";
  if (!isPlatform(platform) || !/^[\w-]{20,100}$/.test(puuid)) return Response.json({ error: "Datos no válidos" }, { status: 400 });
  if (!hasRiotKey()) return Response.json({ error: "Falta la clave de la API de Riot" }, { status: 503 });

  try {
    const info = await getLiveGameInfo(platform, puuid);
    if (!info) return Response.json({ error: "Riot todavía no registra la partida" }, { status: 404 });
    return Response.json(info);
  } catch (err) {
    const status = err instanceof RiotApiError ? err.status : 500;
    return Response.json(
      {
        error: err instanceof Error ? err.message : "Error desconocido",
        retryAfter: err instanceof RiotApiError ? err.retryAfter : undefined,
      },
      { status },
    );
  }
}
