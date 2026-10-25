/**
 * URLs de imágenes de Data Dragon / Community Dragon. Sin dependencias de
 * servidor para poder usarse también desde componentes de cliente.
 */
export const DDRAGON = "https://ddragon.leagueoflegends.com";
export const CDRAGON = "https://raw.communitydragon.org/latest";

export const img = {
  champion: (v: string, id: string) => `${DDRAGON}/cdn/${v}/img/champion/${id}.png`,
  splash: (id: string, num = 0) => `${DDRAGON}/cdn/img/champion/splash/${id}_${num}.jpg`,
  loading: (id: string, num = 0) => `${DDRAGON}/cdn/img/champion/loading/${id}_${num}.jpg`,
  item: (v: string, id: string | number) => `${DDRAGON}/cdn/${v}/img/item/${id}.png`,
  spell: (v: string, file: string) => `${DDRAGON}/cdn/${v}/img/spell/${file}`,
  passive: (v: string, file: string) => `${DDRAGON}/cdn/${v}/img/passive/${file}`,
  profileIcon: (v: string, id: number) => `${DDRAGON}/cdn/${v}/img/profileicon/${id}.png`,
  rune: (icon: string) => `${DDRAGON}/cdn/img/${icon}`,
  role: (role: string) =>
    `${CDRAGON}/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-${ROLE_ICON[role] ?? "fill"}.png`,
  rankCrest: (tier: string) =>
    `${CDRAGON}/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-mini-crests/${tier.toLowerCase()}.svg`,
  /** Emblema de maestría del cliente; del nivel 10 en adelante es el mismo. */
  masteryCrest: (level: number) =>
    `${CDRAGON}/plugins/rcp-fe-lol-shared-components/global/default/mastery-${Math.min(Math.max(level, 1), 10)}.png`,
  rankEmblem: (tier: string) =>
    `${CDRAGON}/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-emblem/emblem-${tier.toLowerCase()}.png`,
};

const ROLE_ICON: Record<string, string> = {
  TOP: "top",
  JUNGLE: "jungle",
  MIDDLE: "middle",
  BOTTOM: "bottom",
  UTILITY: "utility",
};

/** Quita etiquetas HTML de las descripciones de Data Dragon. */
export function stripTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
