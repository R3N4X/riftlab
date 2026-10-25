/**
 * Agregador de estadísticas con datos REALES de la API de Riot.
 *
 * Es el mismo enfoque que usan op.gg, u.gg, Blitz y compañía: muestrear
 * jugadores de cada división, bajar sus partidas clasificatorias del parche
 * actual y contar victorias, objetos, runas, enfrentamientos y sinergias.
 * El resultado se guarda en data/meta.json y la web lo usa en lugar del
 * dataset de demostración.
 *
 *   npm run aggregate -- --platform all --players 30 --matches 15
 *
 * Opciones:
 *   --platform all          Servidores a muestrear: "all" (todos) o una lista
 *                           como la1,la2,euw1 (por defecto all)
 *   --tiers GOLD,EMERALD    Divisiones (por defecto todas)
 *   --players 10            Jugadores muestreados por división
 *   --matches 8             Partidas por jugador
 *   --no-timeline           No pide la línea de tiempo (la mitad de llamadas,
 *                           pero sin orden de compra ni orden de habilidades)
 *   --rate 20:1,100:120     Límites de la API key en cada región (los de una
 *                           Development Key)
 *   --reserve la2           En la región de este servidor el agregador usa solo
 *                           el 30 % del límite (30 cada 2 min), para que la app pueda abrir
 *                           perfiles con la misma clave (por defecto la2)
 *   --reset                 Ignora data/meta.json y empieza de cero
 *
 * Riot aplica los límites por separado en cada región (americas, europe,
 * asia, sea y cada servidor), así que todas se recorren EN PARALELO: con una
 * Development Key rinde ~90 partidas por minuto con timeline entre las cuatro.
 * Para volumen de producción hace falta una Production Key.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PLATFORMS, ROLES, TIERS, isPlatform, type Platform, type Role, type Tier } from "../src/lib/constants";
import { pairKey } from "../src/lib/stats/keys";
import { loadEnv, requestCount, riot, setRateLimits } from "./riot-client";
import type { CountMap, GameLength, MetaDataset, RoleAgg } from "../src/lib/stats/types";
import { upsertPlayer, type PlayerIndex } from "../src/lib/player-index";

/* ---------- Argumentos ---------- */

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (name: string) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const platformArg = get("platform") ?? "all";
  const platforms = platformArg === "all" ? (Object.keys(PLATFORMS) as Platform[]) : platformArg.split(",").filter(isPlatform);
  const tiers = (get("tiers") ?? TIERS.join(",")).split(",").filter((t): t is Tier => (TIERS as readonly string[]).includes(t));
  const rate = (get("rate") ?? "20:1,100:120").split(",").map((p) => {
    const [n, s] = p.split(":").map(Number);
    return { limit: n, windowMs: s * 1000 };
  });
  const reserve = get("reserve") ?? "la2";
  return {
    platforms: platforms.length ? platforms : (Object.keys(PLATFORMS) as Platform[]),
    tiers,
    players: Number(get("players") ?? 10),
    matches: Number(get("matches") ?? 8),
    timeline: !args.includes("--no-timeline"),
    reset: args.includes("--reset"),
    rate,
    reserve: isPlatform(reserve) ? reserve : null,
  };
}

/* ---------- Tipos mínimos de la API ---------- */

interface LeagueEntry {
  puuid: string;
  tier?: string;
  rank?: string;
  leaguePoints?: number;
}
interface Participant {
  puuid: string;
  riotIdGameName?: string;
  riotIdTagline?: string;
  profileIcon?: number;
  summonerLevel?: number;
  participantId: number;
  championId: number;
  teamId: number;
  teamPosition: string;
  win: boolean;
  summoner1Id: number;
  summoner2Id: number;
  item0: number;
  item1: number;
  item2: number;
  item3: number;
  item4: number;
  item5: number;
  perks: { styles: { style: number; selections: { perk: number }[] }[]; statPerks: { offense: number; flex: number; defense: number } };
}
interface Match {
  metadata: { matchId: string };
  info: {
    gameVersion: string;
    gameDuration: number;
    queueId: number;
    participants: Participant[];
    teams: { bans: { championId: number }[] }[];
  };
}
interface Timeline {
  info: {
    frames: {
      timestamp: number;
      participantFrames?: Record<string, { totalGold: number }>;
      events: {
        type: string;
        participantId?: number;
        itemId?: number;
        beforeId?: number;
        skillSlot?: number;
        levelUpType?: string;
        killerId?: number;
        victimId?: number;
        timestamp: number;
      }[];
    }[];
  };
}
interface DDItem {
  gold: { total: number; purchasable: boolean };
  tags: string[];
  into?: string[];
  from?: string[];
  depth?: number;
  maps: Record<string, boolean>;
}

/* ---------- Dataset ---------- */

const DATA_DIR = join(process.cwd(), "data");
const DATA_FILE = join(DATA_DIR, "meta.json");
const STATE_FILE = join(DATA_DIR, "crawl-state.json");
const ARCHIVE_DIR = join(DATA_DIR, "patches");
/** Jugadores vistos, para las sugerencias del buscador (un archivo por servidor). */
const PLAYERS_DIR = join(DATA_DIR, "players");

/** Guarda una copia del dataset de un parche en data/patches/<parche>.json. */
function archive(prev: MetaDataset) {
  mkdirSync(ARCHIVE_DIR, { recursive: true });
  let file = join(ARCHIVE_DIR, `${prev.patch}.json`);
  // Si ya hay un archivo de ese parche (p. ej. tras un --reset), no se pisa.
  if (existsSync(file)) file = join(ARCHIVE_DIR, `${prev.patch}-${Date.now()}.json`);
  writeFileSync(file, JSON.stringify(prev));
  const total = Object.values(prev.matches).reduce((a, b) => a + (b ?? 0), 0);
  console.log(`Parche ${prev.patch} archivado en data/patches (${total} partidas)`);
}

function emptyRole(): RoleAgg {
  return { byTier: {}, core: {}, late: {}, boots: {}, starters: {}, runes: {}, spells: {}, skills: {}, matchups: {} };
}

function lengthBucket(seconds: number): GameLength {
  const minutes = seconds / 60;
  return minutes < 26 ? "early" : minutes < 33 ? "mid" : "late";
}

function inc(map: CountMap, key: string, win: boolean) {
  const c = (map[key] ??= { games: 0, wins: 0 });
  c.games++;
  if (win) c.wins++;
}

const SKILL = ["", "Q", "W", "E", "R"];
const TRINKETS = new Set([3340, 3363, 3364]);
/** Mejoras finales del objeto de soporte (Recompensa Mundial → una de estas). */
const SUPPORT_UPGRADES = new Set([3869, 3870, 3871, 3876, 3877]);

async function main() {
  loadEnv();
  if (!process.env.RIOT_API_KEY) {
    console.error("Falta RIOT_API_KEY. Crea .env.local con RIOT_API_KEY=RGAPI-... (https://developer.riotgames.com)");
    process.exit(1);
  }
  const opts = parseArgs();
  const reservedHosts = opts.reserve ? new Set<string>([opts.reserve, PLATFORMS[opts.reserve].region]) : new Set<string>();
  setRateLimits((host) =>
    reservedHosts.has(host) ? opts.rate.map((l) => ({ ...l, limit: Math.max(1, Math.floor(l.limit * 0.3)) })) : opts.rate,
  );

  // Parche actual y catálogo de objetos desde Data Dragon.
  const versions = (await (await fetch("https://ddragon.leagueoflegends.com/api/versions.json")).json()) as string[];
  const version = versions[0];
  const [major, minor] = version.split(".").map(Number);
  const patch = `${major >= 15 ? major + 10 : major}.${minor}`;
  const versionPrefix = `${major}.${minor}.`;
  const items = (
    (await (await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/item.json`)).json()) as {
      data: Record<string, DDItem>;
    }
  ).data;

  const isBoots = (id: number) => {
    const it = items[id];
    return !!it && it.tags.includes("Boots") && (it.from?.length ?? 0) > 0;
  };
  const isCompleted = (id: number) => {
    const it = items[id];
    if (!it || !it.maps["11"] || it.tags.includes("Boots") || it.tags.includes("Consumable")) return false;
    return it.gold.total >= 2000 && (!it.into || (it.depth ?? 0) >= 3);
  };

  // Cargar dataset previo del mismo parche para acumular. Si es de otro
  // parche (o se pidió --reset), se archiva antes de empezar uno nuevo.
  mkdirSync(DATA_DIR, { recursive: true });
  let ds: MetaDataset | null = null;
  if (existsSync(DATA_FILE)) {
    const prev = JSON.parse(readFileSync(DATA_FILE, "utf8")) as MetaDataset;
    if (!opts.reset && prev.patch === patch && prev.source === "riot") ds = prev;
    else if (prev.source === "riot") archive(prev);
  }
  ds ??= { version: 1, source: "riot", patch, generatedAt: "", platforms: [], matches: {}, champions: {}, duos: {}, teammates: {} };
  ds.enemies ??= {};
  const seen = new Set<string>();
  if (!opts.reset && existsSync(STATE_FILE)) {
    const state = JSON.parse(readFileSync(STATE_FILE, "utf8")) as { patch: string; seen: string[] };
    if (state.patch === patch) state.seen.forEach((id) => seen.add(id));
  }

  // Índice de jugadores por servidor: se carga el que había y se va sumando.
  mkdirSync(PLAYERS_DIR, { recursive: true });
  const players = new Map<Platform, PlayerIndex>();
  const playersOf = (platform: Platform) => {
    let index = players.get(platform);
    if (!index) {
      const file = join(PLAYERS_DIR, `${platform}.json`);
      try {
        index = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as PlayerIndex) : {};
      } catch {
        index = {};
      }
      players.set(platform, index);
    }
    return index;
  };
  /** Rango de los jugadores semilla (league-v4 lo trae; las partidas no). */
  const seedRank = new Map<string, { tier: string; rank: string | null; lp: number }>();

  const save = () => {
    for (const [platform, index] of players) writeFileSync(join(PLAYERS_DIR, `${platform}.json`), JSON.stringify(index));
    ds!.generatedAt = new Date().toISOString();
    ds!.platforms = [...new Set([...ds!.platforms, ...opts.platforms])];
    writeFileSync(DATA_FILE, JSON.stringify(ds));
    writeFileSync(STATE_FILE, JSON.stringify({ patch, seen: [...seen] }));
  };

  console.log(
    `Parche ${patch} · servidores ${opts.platforms.join(", ")} · ${opts.players} jugadores x ${opts.matches} partidas por división`,
  );

  function ingest(match: Match, timeline: Timeline | null, tier: Tier) {
    const parts = match.info.participants;
    ds!.matches[tier] = (ds!.matches[tier] ?? 0) + 1;

    // Bloqueos (una vez por partida).
    const banned = new Set(match.info.teams.flatMap((t) => t.bans.map((b) => b.championId)).filter((id) => id > 0));
    for (const id of banned) {
      const c = (ds!.champions[id] ??= { bans: {}, roles: {} });
      c.bans[tier] = (c.bans[tier] ?? 0) + 1;
    }

    // Eventos de la línea de tiempo por participante.
    const purchases = new Map<number, { id: number; t: number }[]>();
    const skills = new Map<number, string[]>();
    const earlyKills: { killer: number; victim: number }[] = [];
    if (timeline) {
      for (const frame of timeline.info.frames) {
        for (const ev of frame.events) {
          if (ev.type === "CHAMPION_KILL" && ev.killerId && ev.victimId && ev.timestamp < 15 * 60_000) {
            earlyKills.push({ killer: ev.killerId, victim: ev.victimId });
          }
          if (!ev.participantId) continue;
          if (ev.type === "ITEM_PURCHASED" && ev.itemId) {
            const list = purchases.get(ev.participantId) ?? [];
            list.push({ id: ev.itemId, t: ev.timestamp });
            purchases.set(ev.participantId, list);
          } else if (ev.type === "ITEM_UNDO" && ev.beforeId) {
            const list = purchases.get(ev.participantId) ?? [];
            const idx = list.map((p) => p.id).lastIndexOf(ev.beforeId);
            if (idx >= 0) list.splice(idx, 1);
          } else if (ev.type === "SKILL_LEVEL_UP" && ev.skillSlot && ev.levelUpType === "NORMAL") {
            const list = skills.get(ev.participantId) ?? [];
            list.push(SKILL[ev.skillSlot]);
            skills.set(ev.participantId, list);
          }
        }
      }
    }

    for (const p of parts) {
      const role = p.teamPosition as Role;
      if (!ROLES.includes(role)) continue;
      const champ = (ds!.champions[p.championId] ??= { bans: {}, roles: {} });
      const agg = (champ.roles[role] ??= emptyRole());
      const win = p.win;

      const t = (agg.byTier[tier] ??= { games: 0, wins: 0 });
      t.games++;
      if (win) t.wins++;

      // Según cuánto duró la partida: muestra si el campeón rinde más temprano o tarde.
      const l = ((agg.byLength ??= {})[lengthBucket(match.info.gameDuration)] ??= { games: 0, wins: 0 });
      l.games++;
      if (win) l.wins++;

      // Objetos
      const bought = purchases.get(p.participantId);
      let completed: number[];
      if (bought) {
        completed = [...new Set(bought.filter((b) => isCompleted(b.id)).map((b) => b.id))];
        const starters = bought
          .filter((b) => b.t < 75_000 && !TRINKETS.has(b.id))
          .map((b) => b.id)
          .sort((a, b) => a - b);
        if (starters.length) inc(agg.starters, [...new Set(starters)].join("-"), win);
        const boots = bought.find((b) => isBoots(b.id));
        if (boots) inc(agg.boots, String(boots.id), win);
      } else {
        const inv = [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5];
        completed = inv.filter(isCompleted);
        const boots = inv.find(isBoots);
        if (boots) inc(agg.boots, String(boots), win);
      }
      if (completed.length >= 3) inc(agg.core, completed.slice(0, 3).join("-"), win);
      // El objeto de soporte no cuenta como completo (cuesta 400): se guarda aparte la mejora que eligió.
      if (role === "UTILITY") {
        const upgrade = [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5].find((id) => SUPPORT_UPGRADES.has(id));
        if (upgrade) inc((agg.support ??= {}), String(upgrade), win);
      }
      for (const id of completed.slice(3, 6)) inc(agg.late, String(id), win);

      // Runas, hechizos y habilidades
      const [prim, sec] = p.perks.styles;
      const s = p.perks.statPerks;
      inc(
        agg.runes,
        `${prim.style}:${prim.selections.map((x) => x.perk).join(",")}|${sec.style}:${sec.selections.map((x) => x.perk).join(",")}|${s.offense},${s.flex},${s.defense}`,
        win,
      );
      inc(agg.spells, [p.summoner1Id, p.summoner2Id].sort((a, b) => a - b).join("-"), win);
      const seq = skills.get(p.participantId);
      if (seq && seq.length >= 15) inc(agg.skills, seq.slice(0, 15).join(""), win);

      // Enfrentamiento directo
      const opp = parts.find((o) => o.teamId !== p.teamId && o.teamPosition === p.teamPosition);
      if (opp) {
        inc(agg.matchups, String(opp.championId), win);
        // Build contra este rival: primeros 4 objetos completos y runa clave.
        const vs = ((agg.vs ??= {})[opp.championId] ??= { games: 0, wins: 0, items: {}, keystones: {} });
        vs.games++;
        if (win) vs.wins++;
        for (const id of completed.slice(0, 4)) inc(vs.items, String(id), win);
        if (prim.selections[0]) inc(vs.keystones, String(prim.selections[0].perk), win);
        // Fase de líneas: oro al minuto 15 y asesinatos entre ambos (de ahí sale el "por qué").
        const frame15 = timeline?.info.frames[15]?.participantFrames;
        if (frame15) {
          const d = ((agg.lane ??= {})[opp.championId] ??= { games: 0, gold15: 0, kills: 0, deaths: 0 });
          d.games++;
          d.gold15 += (frame15[p.participantId]?.totalGold ?? 0) - (frame15[opp.participantId]?.totalGold ?? 0);
          d.kills += earlyKills.filter((k) => k.killer === p.participantId && k.victim === opp.participantId).length;
          d.deaths += earlyKills.filter((k) => k.killer === opp.participantId && k.victim === p.participantId).length;
        }
      }
    }

    // Sinergias por equipo
    for (const teamId of [100, 200]) {
      const team = parts.filter((p) => p.teamId === teamId && ROLES.includes(p.teamPosition as Role));
      const win = team[0]?.win ?? false;
      const adc = team.find((p) => p.teamPosition === "BOTTOM");
      const sup = team.find((p) => p.teamPosition === "UTILITY");
      if (adc && sup) {
        const byTier = (ds!.duos[`${adc.championId}-${sup.championId}`] ??= {});
        const c = (byTier[tier] ??= { games: 0, wins: 0 });
        c.games++;
        if (win) c.wins++;
      }
      for (let i = 0; i < team.length; i++) {
        for (let j = i + 1; j < team.length; j++) {
          const a = team[i];
          const b = team[j];
          inc(ds!.teammates, pairKey(String(a.championId), a.teamPosition as Role, String(b.championId), b.teamPosition as Role), win);
        }
      }
    }

    // Enfrentamientos contra rivales de todas las líneas (no solo la propia).
    const blue = parts.filter((p) => p.teamId === 100 && ROLES.includes(p.teamPosition as Role));
    const red = parts.filter((p) => p.teamId === 200 && ROLES.includes(p.teamPosition as Role));
    for (const a of blue) {
      for (const b of red) {
        const ka = `${a.championId}:${a.teamPosition}`;
        const kb = `${b.championId}:${b.teamPosition}`;
        // La victoria se anota para el primero de la clave en orden alfabético.
        const firstWon = ka < kb ? a.win : b.win;
        inc(ds!.enemies!, pairKey(String(a.championId), a.teamPosition as Role, String(b.championId), b.teamPosition as Role), firstWon);
      }
    }
  }

  async function seedsFor(platform: Platform, tier: Tier): Promise<string[]> {
    if (tier === "MASTER" || tier === "GRANDMASTER" || tier === "CHALLENGER") {
      const name = tier === "MASTER" ? "masterleagues" : tier === "GRANDMASTER" ? "grandmasterleagues" : "challengerleagues";
      const league = await riot<{ entries: LeagueEntry[] }>(platform, `/lol/league/v4/${name}/by-queue/RANKED_SOLO_5x5`);
      for (const e of league?.entries ?? []) seedRank.set(e.puuid, { tier, rank: null, lp: e.leaguePoints ?? 0 });
      return (league?.entries ?? []).map((e) => e.puuid);
    }
    const division = ["I", "II", "III", "IV"][Math.floor(Math.random() * 4)];
    const page = 1 + Math.floor(Math.random() * 3);
    const entries = await riot<LeagueEntry[]>(platform, `/lol/league/v4/entries/RANKED_SOLO_5x5/${tier}/${division}?page=${page}`);
    for (const e of entries ?? []) seedRank.set(e.puuid, { tier, rank: e.rank ?? division, lp: e.leaguePoints ?? 0 });
    return (entries ?? []).map((e) => e.puuid);
  }

  const startTime = Math.floor(Date.now() / 1000) - 21 * 24 * 3600;
  let processed = 0;

  const perPlatform: Partial<Record<Platform, number>> = {};
  let lastSave = 0;

  async function crawl(platform: Platform) {
    const region = PLATFORMS[platform].region;

    // Primero los jugadores de todas las divisiones; después se recorren por
    // turnos (uno de cada división) para que, si la corrida se corta, el
    // dataset ya tenga partidas de todos los rangos y no solo de Hierro.
    const queues: { tier: Tier; seeds: string[] }[] = [];
    for (const tier of opts.tiers) {
      const seeds = (await seedsFor(platform, tier)).sort(() => Math.random() - 0.5).slice(0, opts.players);
      queues.push({ tier, seeds });
    }
    console.log(`[${PLATFORMS[platform].label}] ${queues.reduce((n, q) => n + q.seeds.length, 0)} jugadores para muestrear`);

    while (queues.some((q) => q.seeds.length)) {
      for (const q of queues) {
        const puuid = q.seeds.shift();
        if (!puuid) continue;
        const ids =
          (await riot<string[]>(
            region,
            `/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=420&type=ranked&startTime=${startTime}&count=${opts.matches}`,
          )) ?? [];
        for (const id of ids) {
          if (seen.has(id)) continue;
          seen.add(id);
          const match = await riot<Match>(region, `/lol/match/v5/matches/${id}`);
          if (!match) continue;
          // Los ids vienen de la más nueva a la más vieja: al llegar a un parche
          // anterior, el resto del historial de este jugador tampoco sirve.
          if (!match.info.gameVersion.startsWith(versionPrefix)) break;
          if (match.info.gameDuration < 300) continue; // remakes
          const timeline = opts.timeline ? await riot<Timeline>(region, `/lol/match/v5/matches/${id}/timeline`) : null;
          ingest(match, timeline, q.tier);
          const index = playersOf(platform);
          for (const p of match.info.participants) {
            const r = seedRank.get(p.puuid);
            upsertPlayer(index, {
              puuid: p.puuid,
              gameName: p.riotIdGameName ?? "",
              tagLine: p.riotIdTagline ?? "",
              icon: p.profileIcon,
              level: p.summonerLevel,
              ...(r ? { tier: r.tier, rank: r.rank, lp: r.lp } : {}),
            });
          }
          processed++;
          perPlatform[platform] = (perPlatform[platform] ?? 0) + 1;
          // Guardar cada ~50 partidas: el archivo crece y se reescribe completo.
          if (processed - lastSave >= 50) {
            lastSave = processed;
            save();
            const detail = Object.entries(perPlatform)
              .map(([p, n]) => `${PLATFORMS[p as Platform].label} ${n}`)
              .join(", ");
            console.log(`  ${processed} partidas nuevas · ${requestCount()} llamadas · ${detail}`);
          }
        }
      }
    }
    console.log(`[${PLATFORMS[platform].label}] terminado: ${perPlatform[platform] ?? 0} partidas`);
  }

  // Todos los servidores en paralelo; los limitadores por host cuidan los
  // topes de cada región. Si la clave vence a mitad de camino, se guarda igual.
  try {
    await Promise.all(opts.platforms.map((p) => crawl(p)));
  } finally {
    save();
  }

  const total = Object.values(ds.matches).reduce((a, b) => a + (b ?? 0), 0);
  console.log(`\nListo: +${processed} partidas nuevas, ${total} en total para el parche ${patch}. Guardado en data/meta.json`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
