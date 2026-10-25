/**
 * Sugerencias de jugadores para los buscadores: /api/buscar?q=ryn&platform=la2.
 * Busca en el índice local (no gasta consultas de la API de Riot).
 */
import { TIER_LABEL, isPlatform, type Tier } from "@/lib/constants";
import { getLatestVersion, img } from "@/lib/ddragon";
import { searchPlayers } from "@/lib/players";

export interface PlayerSuggestionView {
  gameName: string;
  tagLine: string;
  icon: string;
  /** "Platino I · 32 LP" o "Nivel 587". */
  detail: string;
  href: string;
}

const APEX = new Set(["MASTER", "GRANDMASTER", "CHALLENGER"]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 40);
  const platform = url.searchParams.get("platform") ?? "";
  if (!isPlatform(platform) || q.length < 2) return Response.json({ players: [] });

  const [found, version] = await Promise.all([searchPlayers(platform, q), getLatestVersion()]);
  const players: PlayerSuggestionView[] = found.map((p) => ({
    gameName: p.gameName,
    tagLine: p.tagLine,
    icon: img.profileIcon(version, p.icon || 29),
    detail: p.tier
      ? `${TIER_LABEL[p.tier as Tier] ?? p.tier}${APEX.has(p.tier) || !p.rank ? "" : ` ${p.rank}`}${p.lp !== null ? ` · ${p.lp} LP` : ""}`
      : p.level
        ? `Nivel ${p.level}`
        : "Jugador",
    href: `/invocador/${platform}/${encodeURIComponent(`${p.gameName}-${p.tagLine}`)}`,
  }));
  return Response.json({ players });
}
