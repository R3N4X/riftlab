/**
 * Agregador de TFT con partidas REALES de la API de Riot: el mismo enfoque de
 * MetaTFT o tactics.tools. Toma jugadores de Retador, Gran Maestro y Maestro,
 * baja sus partidas clasificatorias recientes y agrupa cada tablero final en
 * una comp (carry + rasgo principal). Guarda los conteos en data/tft-meta.json.
 *
 *   npm run aggregate:tft -- --platform la2,euw1,kr --players 40 --matches 10
 *
 * Opciones:
 *   --platform la2,euw1     Servidores (por defecto uno por región: la2, euw1, kr, vn2)
 *   --players 40            Jugadores por servidor
 *   --matches 10            Partidas por jugador
 *   --days 4                Solo partidas de los últimos N días
 *   --rate 20:1,100:120     Límites de la API key (los de una Development Key)
 *   --reserve la2           En la región de este servidor usa el 30 % del límite
 *                           para que la app pueda seguir buscando perfiles
 *   --reset                 Empieza de cero
 *
 * Al cambiar el parche o el set el dataset se reinicia solo: las comps de un
 * parche viejo no sirven para el actual.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PLATFORMS, isPlatform, type Platform } from "../src/lib/constants";
import type { TftDataset, TftStat } from "../src/lib/tft/types";
import { loadEnv, requestCount, riot, setRateLimits } from "./riot-client";

const RANKED_TFT = 1100;
const APEX = ["challenger", "grandmaster", "master"] as const;

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (name: string) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const platforms = (get("platform") ?? "la2,euw1,kr,vn2").split(",").filter(isPlatform);
  const rate = (get("rate") ?? "20:1,100:120").split(",").map((p) => {
    const [n, s] = p.split(":").map(Number);
    return { limit: n, windowMs: s * 1000 };
  });
  const reserve = get("reserve") ?? "la2";
  return {
    platforms,
    players: Number(get("players") ?? 40),
    matches: Number(get("matches") ?? 10),
    days: Number(get("days") ?? 4),
    rate,
    reserve: isPlatform(reserve) ? reserve : null,
    reset: args.includes("--reset"),
  };
}

/* ---------- Tipos mínimos de la API ---------- */

interface LeagueList {
  entries: { puuid: string; leaguePoints: number }[];
}
interface Unit {
  character_id: string;
  itemNames: string[];
  rarity: number;
  tier: number;
}
interface Trait {
  name: string;
  num_units: number;
  style: number;
  tier_current: number;
  tier_total: number;
}
interface Participant {
  placement: number;
  level: number;
  units: Unit[];
  traits: Trait[];
}
interface Match {
  metadata: { match_id: string };
  info: { queue_id: number; tft_set_number: number; game_datetime: number; participants: Participant[] };
}

/* ---------- Dataset ---------- */

const DATA_DIR = join(process.cwd(), "data");
const DATA_FILE = join(DATA_DIR, "tft-meta.json");
const STATE_FILE = join(DATA_DIR, "tft-crawl-state.json");

const emptyStat = (): TftStat => ({ games: 0, placeSum: 0, top4: 0, wins: 0 });

function add(stat: TftStat, placement: number) {
  stat.games++;
  stat.placeSum += placement;
  if (placement <= 4) stat.top4++;
  if (placement === 1) stat.wins++;
}

/**
 * La unidad que se arma: la que lleva más objetos (los emblemas no cuentan,
 * solo cambian rasgos). A igualdad, la más cara y con más estrellas.
 */
function carryOf(units: Unit[]): Unit | null {
  let best: Unit | null = null;
  let bestScore = -1;
  for (const u of units) {
    const items = u.itemNames.filter((i) => !/Emblem/i.test(i)).length;
    if (items < 2) continue;
    const score = items * 100 + u.rarity * 10 + u.tier;
    if (score > bestScore) {
      best = u;
      bestScore = score;
    }
  }
  return best;
}

/** El rasgo con el nivel más alto; los rasgos únicos (un solo escalón) no definen la comp. */
function mainTrait(traits: Trait[]): Trait | null {
  return (
    traits
      .filter((t) => t.tier_current > 0 && t.tier_total > 1)
      .sort((a, b) => b.style - a.style || b.num_units - a.num_units || a.name.localeCompare(b.name))[0] ?? null
  );
}

async function main() {
  loadEnv();
  // Riot registra cada clave para un juego: la de LoL responde 403 en las APIs de TFT.
  if (process.env.RIOT_TFT_API_KEY) process.env.RIOT_API_KEY = process.env.RIOT_TFT_API_KEY;
  if (!process.env.RIOT_API_KEY) {
    console.error("Falta RIOT_API_KEY. Crea .env.local con RIOT_API_KEY=RGAPI-... (https://developer.riotgames.com)");
    process.exit(1);
  }
  const opts = parseArgs();
  if (!opts.platforms.length) {
    console.error("Ningún servidor válido en --platform.");
    process.exit(1);
  }
  const reservedHosts = opts.reserve ? new Set<string>([opts.reserve, PLATFORMS[opts.reserve].region]) : new Set<string>();
  setRateLimits((host) =>
    reservedHosts.has(host) ? opts.rate.map((l) => ({ ...l, limit: Math.max(1, Math.floor(l.limit * 0.3)) })) : opts.rate,
  );

  // Sin acceso a TFT, cada consulta devolvía nada y el recolector terminaba "listo" sin juntar partidas.
  const probe = await fetch(`https://${opts.platforms[0]}.api.riotgames.com/tft/league/v1/challenger?queue=RANKED_TFT`, {
    headers: { "X-Riot-Token": process.env.RIOT_API_KEY! },
  });
  if (probe.status === 401 || probe.status === 403) {
    console.error(
      "La clave de Riot no tiene acceso a las APIs de TFT (cada clave se registra para un juego). " +
        "Registra un producto con Game Focus Teamfight Tactics en developer.riotgames.com y pon su clave en .env.local como RIOT_TFT_API_KEY.",
    );
    // exitCode y no exit(): cortar con la conexión de la prueba abierta hacía fallar a node en Windows.
    process.exitCode = 2;
    return;
  }

  const versions = (await (await fetch("https://ddragon.leagueoflegends.com/api/versions.json")).json()) as string[];
  const [major, minor] = versions[0].split(".").map(Number);
  const patch = `${major >= 15 ? major + 10 : major}.${minor}`;

  mkdirSync(DATA_DIR, { recursive: true });
  let ds: TftDataset | null = null;
  if (!opts.reset && existsSync(DATA_FILE)) {
    const prev = JSON.parse(readFileSync(DATA_FILE, "utf8")) as TftDataset;
    if (prev.patch === patch) ds = prev;
  }
  ds ??= { version: 1, set: 0, patch, generatedAt: "", platforms: [], matches: 0, boards: 0, comps: {}, units: {}, items: {}, traits: {} };
  const seen = new Set<string>();
  if (ds.matches > 0 && existsSync(STATE_FILE)) {
    const state = JSON.parse(readFileSync(STATE_FILE, "utf8")) as { patch: string; seen: string[] };
    if (state.patch === patch) state.seen.forEach((id) => seen.add(id));
  }

  const save = () => {
    ds!.generatedAt = new Date().toISOString();
    ds!.platforms = [...new Set([...ds!.platforms, ...opts.platforms])];
    writeFileSync(DATA_FILE, JSON.stringify(ds));
    writeFileSync(STATE_FILE, JSON.stringify({ patch, seen: [...seen] }));
  };

  function ingest(match: Match) {
    const info = match.info;
    if (info.tft_set_number > ds!.set) {
      // Set nuevo: lo juntado del anterior ya no sirve.
      if (ds!.set) console.log(`Set ${info.tft_set_number} detectado: se descartan las comps del set ${ds!.set}`);
      ds = { ...ds!, set: info.tft_set_number, matches: 0, boards: 0, comps: {}, units: {}, items: {}, traits: {} };
    }
    if (info.tft_set_number < ds!.set) return;
    ds!.matches++;
    for (const p of info.participants) {
      ds!.boards++;
      const place = p.placement;
      for (const u of p.units) {
        const agg = (ds!.units[u.character_id] ??= { stat: emptyStat(), items: {} });
        add(agg.stat, place);
        for (const item of new Set(u.itemNames)) {
          add((agg.items[item] ??= emptyStat()), place);
          add((ds!.items[item] ??= emptyStat()), place);
        }
      }
      for (const t of p.traits) {
        if (t.style > 0) add((ds!.traits[`${t.name}:${t.style}`] ??= emptyStat()), place);
      }

      const carry = carryOf(p.units);
      const trait = mainTrait(p.traits);
      if (!carry || !trait) continue;
      const key = `${carry.character_id}|${trait.name}`;
      const comp = (ds!.comps[key] ??= { carry: carry.character_id, trait: trait.name, stat: emptyStat(), levelSum: 0, units: {}, traits: {} });
      add(comp.stat, place);
      comp.levelSum += p.level;
      for (const u of p.units) {
        const cu = (comp.units[u.character_id] ??= { games: 0, starSum: 0, items: {} });
        cu.games++;
        cu.starSum += u.tier;
        for (const item of u.itemNames) cu.items[item] = (cu.items[item] ?? 0) + 1;
      }
      for (const t of p.traits) {
        if (t.style > 0) comp.traits[`${t.name}:${t.style}`] = (comp.traits[`${t.name}:${t.style}`] ?? 0) + 1;
      }
    }
  }

  const startTime = Math.floor(Date.now() / 1000) - opts.days * 86_400;
  console.log(`Parche ${patch} · ${opts.platforms.join(", ")} · ${opts.players} jugadores x ${opts.matches} partidas`);

  // Cada servidor en paralelo: Riot cuenta los límites por región.
  let processed = 0;
  await Promise.all(
    opts.platforms.map(async (platform: Platform) => {
      const region = PLATFORMS[platform].region;
      const players: string[] = [];
      for (const tier of APEX) {
        if (players.length >= opts.players) break;
        const list = await riot<LeagueList>(platform, `/tft/league/v1/${tier}?queue=RANKED_TFT`);
        const ranked = (list?.entries ?? []).sort((a, b) => b.leaguePoints - a.leaguePoints);
        players.push(...ranked.slice(0, opts.players - players.length).map((e) => e.puuid));
      }
      for (const puuid of players) {
        const ids =
          (await riot<string[]>(region, `/tft/match/v1/matches/by-puuid/${puuid}/ids?startTime=${startTime}&count=${opts.matches}`)) ?? [];
        for (const id of ids) {
          if (seen.has(id)) continue;
          seen.add(id);
          const match = await riot<Match>(region, `/tft/match/v1/matches/${id}`);
          if (!match || match.info.queue_id !== RANKED_TFT) continue;
          ingest(match);
          processed++;
          if (processed % 25 === 0) {
            save();
            console.log(`  ${processed} partidas nuevas · ${requestCount()} llamadas · ${Object.keys(ds!.comps).length} comps`);
          }
        }
      }
      console.log(`${PLATFORMS[platform].label}: listo`);
    }),
  );
  save();
  console.log(`Listo: ${ds!.matches} partidas (${ds!.boards} tableros) del set ${ds!.set} en data/tft-meta.json`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
