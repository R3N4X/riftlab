import type { NextRequest } from "next/server";
import { isPlatform } from "@/lib/constants";
import { getFrequentMates } from "@/lib/frequent";
import { RiotApiError, hasRiotKey } from "@/lib/riot";

/** Compañeros frecuentes de un jugador (para avisar cuando entran a partida). */
export async function GET(req: NextRequest) {
  const platform = req.nextUrl.searchParams.get("platform") ?? "";
  const puuid = req.nextUrl.searchParams.get("puuid") ?? "";
  if (!isPlatform(platform) || !/^[\w-]{20,100}$/.test(puuid)) return Response.json({ error: "Datos no válidos" }, { status: 400 });
  if (!hasRiotKey()) return Response.json({ error: "Falta la clave de la API de Riot" }, { status: 503 });
  try {
    return Response.json(await getFrequentMates(platform, puuid));
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Error desconocido" },
      { status: err instanceof RiotApiError ? err.status : 500 },
    );
  }
}
