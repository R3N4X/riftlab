/*
 * Resultados de Worlds desde Leaguepedia (lol.fandom.com, contenido CC BY-SA). Se lee la página de
 * datos del evento principal con la API de MediaWiki, que es pública y no pide clave (la consulta
 * de tablas Cargo de la wiki limita mucho a quien no tiene cuenta, así que no se usa).
 *
 * La página de datos trae una plantilla {{MatchSchedule|...}} por serie, agrupadas por ronda. Se
 * toman solo los equipos y el marcador; las horas, el formato y las etapas siguen saliendo del
 * calendario de worlds.ts, y si la wiki no responde se muestra ese calendario tal cual.
 */
import { cacheLife } from "next/cache";
import { MATCHES, TEAMS, type TeamCode, type WorldsMatch } from "./worlds";

const API = "https://lol.fandom.com/api.php";
const DATA_PAGE = "Data:2026 Season World Championship/Main Event";
const UA = { "User-Agent": "RiftLab/0.2 (https://github.com/R3N4X/riftlab)" };

/** Nombres cortos de la wiki que no son la sigla que usamos. */
const WIKI_ALIASES: Record<string, TeamCode> = {
  "AL CN": "AL",
  KCORP: "KC",
  DPLUS: "DK",
  TSTW: "TSW",
  LYON24: "LYON",
};

/** Título de cada sección de la wiki → etapa y ronda de nuestro calendario. */
const SECTIONS: Record<string, { stage: WorldsMatch["stage"]; round?: string }> = {
  "Round 1": { stage: "swiss", round: "Ronda 1" },
  "Round 2": { stage: "swiss", round: "Ronda 2" },
  "Round 3": { stage: "swiss", round: "Ronda 3" },
  "Round 4": { stage: "swiss", round: "Ronda 4" },
  "Round 5": { stage: "swiss", round: "Ronda 5" },
  Quarterfinals: { stage: "cuartos" },
  Semifinals: { stage: "semis" },
  Finals: { stage: "final" },
};

export interface WorldsResults {
  matches: WorldsMatch[];
  /** Última edición de la página en la wiki (ISO), o null si no se pudo leer. */
  updated: string | null;
}

function teamCode(name: string): TeamCode | null {
  const clean = name.trim();
  if (!clean) return null;
  if (clean in WIKI_ALIASES) return WIKI_ALIASES[clean];
  if (clean in TEAMS) return clean as TeamCode;
  console.warn(`[worlds] Equipo de Leaguepedia sin sigla conocida: ${clean}`);
  return null;
}

const param = (block: string, name: string) => block.match(new RegExp(`\\|${name}=\\s*([^|\\n}]*)`))?.[1].trim() ?? "";

interface WikiSeries {
  teams: [TeamCode | null, TeamCode | null];
  score?: [number, number];
}

/** Series de cada sección, en el orden en que aparecen (que es el de sus horarios). */
function parseDataPage(text: string): Map<string, WikiSeries[]> {
  const sections = new Map<string, WikiSeries[]>();
  // Cada sección empieza con "==Título==" en su propia línea.
  const parts = text.split(/^==([^=\n]+)==\s*$/m);
  for (let i = 1; i < parts.length; i += 2) {
    const title = parts[i].trim();
    // "{{MatchSchedule|" abre una serie; "{{MatchSchedule/Start" y "/Game" son otras plantillas.
    const blocks = parts[i + 1].split("{{MatchSchedule|").slice(1);
    sections.set(
      title,
      blocks.map((block) => {
        const s1 = param(block, "team1score");
        const s2 = param(block, "team2score");
        // Con la serie en curso la wiki ya puede tener mapas sumados; cuenta como resultado
        // solo cuando hay ganador.
        const done = param(block, "winner") !== "" && s1 !== "" && s2 !== "";
        return {
          teams: [teamCode(param(block, "team1")), teamCode(param(block, "team2"))],
          score: done ? [Number(s1), Number(s2)] : undefined,
        };
      }),
    );
  }
  return sections;
}

/** Pone los equipos y marcadores de la wiki sobre el calendario propio, ronda por ronda. */
function merge(sections: Map<string, WikiSeries[]>): WorldsMatch[] {
  const merged = new Map<WorldsMatch, WorldsMatch>();
  for (const [title, series] of sections) {
    const target = SECTIONS[title];
    if (!target) continue;
    const ours = MATCHES.filter((m) => m.stage === target.stage && (!target.round || m.round === target.round)).sort(
      (a, b) => Date.parse(a.start) - Date.parse(b.start),
    );
    ours.forEach((match, i) => {
      const wiki = series[i];
      if (!wiki) return;
      merged.set(match, {
        ...match,
        teams: [wiki.teams[0] ?? match.teams[0], wiki.teams[1] ?? match.teams[1]],
        score: wiki.score ?? match.score,
      });
    });
  }
  return MATCHES.map((m) => merged.get(m) ?? m);
}

export async function getWorldsResults(): Promise<WorldsResults> {
  "use cache";
  cacheLife("minutes");
  try {
    const url = new URL(API);
    url.search = new URLSearchParams({
      action: "query",
      prop: "revisions",
      rvprop: "content|timestamp",
      rvslots: "main",
      titles: DATA_PAGE,
      format: "json",
      formatversion: "2",
    }).toString();
    const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`Leaguepedia respondió ${res.status}`);
    const data = (await res.json()) as {
      query?: { pages?: { revisions?: { timestamp: string; slots: { main: { content: string } } }[] }[] };
    };
    const revision = data.query?.pages?.[0]?.revisions?.[0];
    if (!revision) throw new Error("Leaguepedia no devolvió la página de datos");
    return { matches: merge(parseDataPage(revision.slots.main.content)), updated: revision.timestamp };
  } catch (err) {
    console.warn("[worlds] No se pudieron leer los resultados de Leaguepedia:", err);
    return { matches: MATCHES, updated: null };
  }
}
