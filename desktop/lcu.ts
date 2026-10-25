/**
 * Conexión con el cliente de League que está abierto en este equipo (LCU).
 *
 * El cliente expone una API local en https://127.0.0.1:<puerto> protegida con
 * usuario "riot" y una contraseña que cambia en cada inicio. Ambos datos salen
 * de la línea de comandos de LeagueClientUx.exe (o del archivo lockfile de la
 * instalación). No usa la API key de Riot ni gasta consultas: todo es local.
 */
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import https from "node:https";
import { join } from "node:path";
import { ROLES, type Platform, type Role } from "../src/lib/constants";
import type {
  ActionResult,
  BuildPayload,
  TftPlanPayload,
  LiveChampSelect,
  LiveFriend,
  LivePlayer,
  LiveState,
  RunePagePayload,
} from "../src/lib/live";

interface Credentials {
  port: number;
  password: string;
}

const DEFAULT_INSTALL = "C:\\Riot Games\\League of Legends";

/** Lee puerto y contraseña desde el proceso del cliente; si no se puede, desde el lockfile. */
function findCredentials(): Promise<Credentials | null> {
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        "(Get-CimInstance Win32_Process -Filter \"Name='LeagueClientUx.exe'\" | Select-Object -First 1).CommandLine",
      ],
      { windowsHide: true, timeout: 8000 },
      (err, stdout) => {
        const cmd = err ? "" : stdout;
        const port = cmd.match(/--app-port=(\d+)/)?.[1];
        const password = cmd.match(/--remoting-auth-token=([\w-]+)/)?.[1];
        if (port && password) return resolve({ port: Number(port), password });

        const install = cmd.match(/--install-directory=([^"]+?)"/)?.[1] ?? DEFAULT_INSTALL;
        const lockfile = join(install, "lockfile");
        if (!existsSync(lockfile)) return resolve(null);
        // Formato: LeagueClient:pid:puerto:contraseña:https
        const parts = readFileSync(lockfile, "utf8").split(":");
        resolve(parts.length >= 5 ? { port: Number(parts[2]), password: parts[3] } : null);
      },
    );
  });
}

// El cliente usa un certificado propio de Riot: se acepta solo para 127.0.0.1.
const agent = new https.Agent({ rejectUnauthorized: false });

function request<T>(creds: Credentials, method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = https.request(
      {
        host: "127.0.0.1",
        port: creds.port,
        path,
        method,
        agent,
        timeout: 5000,
        headers: {
          Authorization: `Basic ${Buffer.from(`riot:${creds.password}`).toString("base64")}`,
          Accept: "application/json",
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          let data: unknown = null;
          try {
            data = raw ? JSON.parse(raw) : null;
          } catch {
            data = raw;
          }
          resolve({ status: res.statusCode ?? 0, data: data as T });
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/* ---------- Traducción de las respuestas del cliente ---------- */

const REGION_TO_PLATFORM: Record<string, Platform> = {
  NA: "na1",
  NA1: "na1",
  EUW: "euw1",
  EUW1: "euw1",
  EUNE: "eun1",
  EUN1: "eun1",
  BR: "br1",
  BR1: "br1",
  LA1: "la1",
  LA2: "la2",
  LAN: "la1",
  LAS: "la2",
  KR: "kr",
  JP: "jp1",
  JP1: "jp1",
  TR: "tr1",
  TR1: "tr1",
  RU: "ru",
  OC1: "oc1",
  OCE: "oc1",
  ME1: "me1",
  SG2: "sg2",
  TW2: "tw2",
  VN2: "vn2",
};

interface RawPlayer {
  cellId: number;
  championId: number;
  championPickIntent: number;
  assignedPosition: string;
  gameName?: string;
  tagLine?: string;
  spell1Id: number;
  spell2Id: number;
}

interface RawSession {
  localPlayerCellId: number;
  myTeam: RawPlayer[];
  theirTeam: RawPlayer[];
  actions: { actorCellId: number; type: string; completed: boolean; championId: number }[][];
  bans?: { myTeamBans: number[]; theirTeamBans: number[] };
  timer?: { phase?: string };
  queueId?: number;
}

function toRole(position: string): Role | null {
  const p = position?.toUpperCase();
  return (ROLES as readonly string[]).includes(p) ? (p as Role) : null;
}

function parseSession(s: RawSession): LiveChampSelect {
  const actions = s.actions.flat();
  const lockedCells = new Set(actions.filter((a) => a.type === "pick" && a.completed).map((a) => a.actorCellId));
  const myCells = new Set(s.myTeam.map((p) => p.cellId));
  const banned = actions.filter((a) => a.type === "ban" && a.completed && a.championId > 0);
  const bansOf = (mine: boolean, fromSession: number[] | undefined) =>
    [...new Set([...banned.filter((a) => myCells.has(a.actorCellId) === mine).map((a) => a.championId), ...(fromSession ?? [])])].filter(
      (id) => id > 0,
    );
  const map = (p: RawPlayer): LivePlayer => ({
    cellId: p.cellId,
    championId: p.championId || p.championPickIntent || 0,
    locked: lockedCells.has(p.cellId) && p.championId > 0,
    position: toRole(p.assignedPosition),
    isMe: p.cellId === s.localPlayerCellId,
    gameName: p.gameName || null,
    tagLine: p.tagLine || null,
    spell1Id: p.spell1Id,
    spell2Id: p.spell2Id,
  });
  return {
    myTeam: s.myTeam.map(map),
    theirTeam: s.theirTeam.map(map),
    bans: { mine: bansOf(true, s.bans?.myTeamBans), theirs: bansOf(false, s.bans?.theirTeamBans) },
    timerPhase: s.timer?.phase ?? null,
    queueId: s.queueId ?? null,
  };
}

interface RawGamePlayer {
  championId: number;
  puuid: string;
  selectedPosition?: string;
  summonerName?: string;
}

interface RawGameSession {
  map?: { gameMode?: string };
  gameData?: {
    gameId?: number;
    teamOne?: RawGamePlayer[];
    teamTwo?: RawGamePlayer[];
    queue?: { id?: number; gameMode?: string };
    playerChampionSelections?: { puuid: string; spell1Id: number; spell2Id: number }[];
  };
}

const IN_GAME = new Set(["GameStart", "InProgress", "Reconnect"]);

/** Equipos de la partida en curso, con el jugador conectado en "myTeam". */
function parseGame(s: RawGameSession, puuid: string): LiveChampSelect | null {
  const one = s.gameData?.teamOne ?? [];
  const two = s.gameData?.teamTwo ?? [];
  if (!one.length && !two.length) return null;
  const mineIsOne = one.some((p) => p.puuid === puuid) || !two.some((p) => p.puuid === puuid);
  const spells = new Map((s.gameData?.playerChampionSelections ?? []).map((x) => [x.puuid, x]));
  const map = (p: RawGamePlayer, i: number): LivePlayer => ({
    cellId: i,
    championId: p.championId,
    locked: true,
    position: toRole(p.selectedPosition ?? ""),
    isMe: p.puuid === puuid,
    gameName: p.summonerName || null,
    tagLine: null,
    spell1Id: spells.get(p.puuid)?.spell1Id ?? 0,
    spell2Id: spells.get(p.puuid)?.spell2Id ?? 0,
  });
  return {
    myTeam: (mineIsOne ? one : two).map(map),
    theirTeam: (mineIsOne ? two : one).map(map),
    bans: { mine: [], theirs: [] },
    timerPhase: null,
    queueId: s.gameData?.queue?.id ?? null,
  };
}

/* ---------- Amigos ---------- */

interface RawFriend {
  puuid?: string;
  gameName?: string;
  gameTag?: string;
  icon?: number;
  availability?: string;
  product?: string;
  lol?: { gameStatus?: string; championId?: string; gameQueueType?: string; timeStamp?: string };
}

const FRIEND_ORDER: Record<LiveFriend["status"], number> = { inGame: 0, champSelect: 1, queue: 2, online: 3, away: 4 };

function parseFriends(raw: RawFriend[]): LiveFriend[] {
  const out: LiveFriend[] = [];
  for (const f of raw) {
    if (!f.puuid || !f.gameName || f.availability === "offline" || f.availability === "mobile") continue;
    if (f.product && f.product !== "league_of_legends") continue;
    const gs = f.lol?.gameStatus ?? "";
    const status: LiveFriend["status"] =
      gs === "inGame"
        ? "inGame"
        : gs === "championSelect"
          ? "champSelect"
          : gs === "inQueue"
            ? "queue"
            : f.availability === "away"
              ? "away"
              : "online";
    const champ = Number(f.lol?.championId);
    const since = Number(f.lol?.timeStamp);
    out.push({
      puuid: f.puuid,
      gameName: f.gameName,
      tagLine: f.gameTag ?? "",
      icon: typeof f.icon === "number" ? f.icon : null,
      status,
      championId: status === "inGame" && champ > 0 ? champ : null,
      queue: f.lol?.gameQueueType || null,
      since: status === "inGame" && since > 0 ? since : null,
    });
  }
  return out.sort((a, b) => FRIEND_ORDER[a.status] - FRIEND_ORDER[b.status] || a.gameName.localeCompare(b.gameName));
}

/* ---------- Observador ---------- */

export class LeagueClient {
  private creds: Credentials | null = null;
  private timer: NodeJS.Timeout | null = null;
  private lastJson = "";
  state: LiveState = {
    connected: false,
    phase: "None",
    summoner: null,
    champSelect: null,
    game: null,
    tft: false,
    mastery: null,
    lastGame: null,
    friends: null,
    updatedAt: 0,
  };
  private friendsAt = 0;

  constructor(private onChange: (state: LiveState) => void) {}

  start() {
    const tick = async () => {
      await this.poll().catch(() => this.disconnect());
      // Más seguido durante la selección de campeones, más espaciado sin cliente.
      const delay = !this.state.connected ? 4000 : this.state.phase === "ChampSelect" ? 1000 : 2000;
      this.timer = setTimeout(tick, delay);
    };
    void tick();
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
  }

  private disconnect() {
    this.creds = null;
    this.publish({
      connected: false,
      phase: "None",
      summoner: null,
      champSelect: null,
      game: null,
      tft: false,
      mastery: null,
      lastGame: this.state.lastGame,
      friends: null,
    });
  }

  private publish(next: Omit<LiveState, "updatedAt">) {
    const json = JSON.stringify(next);
    if (json === this.lastJson) return;
    this.lastJson = json;
    this.state = { ...next, updatedAt: Date.now() };
    this.onChange(this.state);
  }

  private async poll() {
    this.creds ??= await findCredentials();
    if (!this.creds) return this.disconnect();

    const phaseRes = await request<string>(this.creds, "GET", "/lol-gameflow/v1/gameflow-phase");
    if (phaseRes.status !== 200) return this.disconnect();
    const phase = phaseRes.data;

    let summoner = this.state.summoner;
    if (!summoner) {
      const [me, region] = await Promise.all([
        request<{ gameName: string; tagLine: string; puuid: string }>(this.creds, "GET", "/lol-summoner/v1/current-summoner"),
        request<{ region: string }>(this.creds, "GET", "/riotclient/region-locale"),
      ]);
      if (me.status === 200 && me.data?.puuid) {
        summoner = {
          gameName: me.data.gameName,
          tagLine: me.data.tagLine,
          puuid: me.data.puuid,
          platform: REGION_TO_PLATFORM[region.data?.region?.toUpperCase() ?? ""] ?? null,
        };
      }
    }

    // La maestría se lee al conectar y de nuevo al entrar a cada selección de campeones.
    let mastery = this.state.mastery;
    if (!mastery || (phase === "ChampSelect" && this.state.phase !== "ChampSelect")) {
      const res = await request<{ championId: number; championPoints: number }[]>(
        this.creds,
        "GET",
        "/lol-champion-mastery/v1/local-player/champion-mastery",
      );
      if (res.status === 200 && Array.isArray(res.data))
        mastery = Object.fromEntries(res.data.map((m) => [m.championId, m.championPoints]));
    }

    let champSelect = null;
    if (phase === "ChampSelect") {
      const session = await request<RawSession>(this.creds, "GET", "/lol-champ-select/v1/session");
      if (session.status === 200) champSelect = parseSession(session.data);
    }

    // Ya en partida: los equipos salen de la sesión de juego (se pide una vez por partida).
    let game = IN_GAME.has(phase) ? this.state.game : null;
    let tft = IN_GAME.has(phase) && this.state.tft;
    let lastGame = this.state.lastGame;
    if (IN_GAME.has(phase) && !game && !tft && summoner) {
      const session = await request<RawGameSession>(this.creds, "GET", "/lol-gameflow/v1/session");
      if (session.status === 200) {
        // TFT no tiene equipos ni campeones elegidos: solo se marca para abrir el modo partida.
        tft = (session.data.gameData?.queue?.gameMode ?? session.data.map?.gameMode) === "TFT";
        if (!tft) game = parseGame(session.data, summoner.puuid);
        const gameId = session.data.gameData?.gameId;
        // Queda guardada al terminar la partida: con ella se abre el resumen.
        if (gameId) lastGame = { gameId, queueId: session.data.gameData?.queue?.id ?? null, tft };
      }
    }

    // Amigos: cada 15 s alcanza (sale del chat del cliente, no de la API de Riot).
    let friends = this.state.friends;
    if (!friends || Date.now() - this.friendsAt > 15_000) {
      const res = await request<RawFriend[]>(this.creds, "GET", "/lol-chat/v1/friends");
      if (res.status === 200 && Array.isArray(res.data)) {
        friends = parseFriends(res.data);
        this.friendsAt = Date.now();
      }
    }

    this.publish({ connected: true, phase, summoner, champSelect, game, tft, mastery, lastGame, friends });
  }

  /* ---------- Acciones ---------- */

  async importRunes(page: RunePagePayload): Promise<ActionResult> {
    if (!this.creds) return { ok: false, message: "El cliente de League no está abierto." };
    const pages = await request<{ id: number; name: string; isDeletable: boolean; isEditable: boolean }[]>(
      this.creds,
      "GET",
      "/lol-perks/v1/pages",
    );
    if (pages.status !== 200) return { ok: false, message: "No se pudieron leer tus páginas de runas." };

    // Se reutiliza la página que creó RiftLab antes; nunca se borra una página tuya.
    const ours = pages.data.find((p) => p.isDeletable && p.name.startsWith("RiftLab"));
    if (ours) await request(this.creds, "DELETE", `/lol-perks/v1/pages/${ours.id}`);

    const created = await request<{ message?: string }>(this.creds, "POST", "/lol-perks/v1/pages", { ...page, current: true });
    if (created.status >= 200 && created.status < 300) return { ok: true, message: `Página "${page.name}" creada y seleccionada.` };

    const full = /max|limit|maximum/i.test(String(created.data?.message ?? ""));
    return {
      ok: false,
      message: full
        ? 'No queda espacio para otra página de runas. Borra una o renómbrala a "RiftLab" para que la usemos.'
        : `El cliente rechazó la página (${created.status}).`,
    };
  }

  /**
   * Set de objetos en la tienda del juego. Reemplaza el que creó RiftLab antes
   * (empiezan con "RiftLab"); los sets de la persona no se tocan.
   */
  async setItemSet(build: BuildPayload): Promise<ActionResult> {
    if (!this.creds) return { ok: false, message: "El cliente de League no está abierto." };
    const me = await request<{ summonerId: number; accountId: number }>(this.creds, "GET", "/lol-summoner/v1/current-summoner");
    if (me.status !== 200) return { ok: false, message: "No se pudo leer tu cuenta en el cliente." };
    const path = `/lol-item-sets/v1/item-sets/${me.data.summonerId}/sets`;
    const current = await request<{ itemSets?: { title?: string }[] }>(this.creds, "GET", path);
    if (current.status !== 200) return { ok: false, message: "No se pudieron leer tus sets de objetos." };
    const title = `RiftLab ${build.championName}`.slice(0, 75);
    const itemSet = {
      uid: randomUUID(),
      title,
      type: "custom",
      map: "any",
      mode: "any",
      sortrank: 0,
      startedFrom: "blank",
      preferredItemSlots: [],
      associatedChampions: [build.championId],
      associatedMaps: [11, 12],
      blocks: build.blocks.map((b) => ({ type: b.title, items: b.items.map((id) => ({ id, count: 1 })) })),
    };
    const itemSets = [...(current.data.itemSets ?? []).filter((s) => !s.title?.startsWith("RiftLab")), itemSet];
    const saved = await request(this.creds, "PUT", path, { accountId: me.data.accountId, itemSets, timestamp: Date.now() });
    return saved.status >= 200 && saved.status < 300
      ? { ok: true, message: `Set de objetos "${title}" guardado.` }
      : { ok: false, message: `El cliente rechazó el set de objetos (${saved.status}).` };
  }

  /** Runas, set de objetos y, si todavía se está eligiendo, hechizos. */
  async importBuild(build: BuildPayload): Promise<ActionResult> {
    if (!this.creds) return { ok: false, message: "El cliente de League no está abierto." };
    const done: string[] = [];
    const problems: string[] = [];
    const run = async (label: string, action: () => Promise<ActionResult>) => {
      const r = await action();
      if (r.ok) done.push(label);
      else problems.push(r.message);
    };
    if (build.runes) await run("runas", () => this.importRunes(build.runes!));
    if (build.blocks.length) await run("objetos", () => this.setItemSet(build));
    // Fuera de la selección el cliente no deja cambiar hechizos: se avisa sin contarlo como error.
    if (build.spells && this.state.phase === "ChampSelect") await run("hechizos", () => this.setSpells(build.spells![0], build.spells![1]));
    else if (build.spells) problems.push("Los hechizos se ponen solo durante la selección de campeones.");
    const ok = done.length > 0;
    const head = ok ? `Importado: ${done.join(", ")}.` : "No se pudo importar la build.";
    return { ok, message: [head, ...problems].join(" ") };
  }

  /**
   * Comp en el Planificador de TFT. Cada comp exportada es un equipo propio
   * ("RiftLab: …"); si ya existe con ese nombre se reemplazan sus unidades.
   * Queda como recordatorio: el juego marca esas unidades en la tienda.
   */
  async exportTftPlan(plan: TftPlanPayload): Promise<ActionResult> {
    if (!this.creds) return { ok: false, message: "El cliente de League no está abierto." };
    const setId = `TFTSet${plan.set}`;
    const base = "/lol-tft-team-planner/v1/sets";
    const sets = await request<Record<string, { remindedTeamId: string; teams: { id: string; title: string }[] }>>(
      this.creds,
      "GET",
      `${base}/dirty`,
    );
    if (sets.status !== 200) return { ok: false, message: "No se pudo leer el Planificador de TFT." };
    const current = sets.data[setId];
    if (!current) return { ok: false, message: `El cliente todavía no tiene el Planificador del set ${plan.set}.` };

    // El nombre va en la URL: se quitan caracteres que el cliente no acepta.
    const title = `RiftLab: ${plan.title}`
      .replace(/[/\\?#%]/g, " ")
      .slice(0, 32)
      .trim();
    const existing = current.teams.find((t) => t.id && t.title === title);
    const id = existing?.id ?? randomUUID().replace(/-/g, "").toUpperCase();
    const team = `${base}/${setId}/teams/${id}`;
    if (existing) await request(this.creds, "DELETE", `${team}/champions`);
    else if ((await request(this.creds, "POST", team)).status >= 300)
      return { ok: false, message: "El Planificador no dejó crear el equipo (puede que esté lleno)." };

    const added = await request(this.creds, "POST", `${team}/champions`, plan.champions.slice(0, 10));
    if (added.status >= 300) return { ok: false, message: `El Planificador rechazó las unidades (${added.status}).` };
    await request(this.creds, "PATCH", `${team}/${encodeURIComponent(title)}`);
    // Recordatorio: el juego marca en la tienda las unidades de este equipo (uno a la vez por set).
    if (current.remindedTeamId !== id) await request(this.creds, "PATCH", `${base}/${setId}/reminders/${id}`);
    const saved = await request(this.creds, "PUT", `${base}/save-all`);
    return saved.status < 300
      ? { ok: true, message: `"${title}" quedó en el Planificador como recordatorio.` }
      : { ok: false, message: "Se armó el equipo, pero el cliente no lo guardó." };
  }

  async setSpells(spell1Id: number, spell2Id: number): Promise<ActionResult> {
    if (!this.creds) return { ok: false, message: "El cliente de League no está abierto." };
    // Se respeta la tecla en la que el jugador ya tiene Destello (D o F).
    const me = this.state.champSelect?.myTeam.find((p) => p.isMe);
    let [d, f] = [spell1Id, spell2Id];
    const FLASH = 4;
    if (me && (d === FLASH || f === FLASH)) {
      const other = d === FLASH ? f : d;
      [d, f] = me.spell2Id === FLASH ? [other, FLASH] : [FLASH, other];
    }
    const res = await request(this.creds, "PATCH", "/lol-champ-select/v1/session/my-selection", { spell1Id: d, spell2Id: f });
    return res.status >= 200 && res.status < 300
      ? { ok: true, message: "Hechizos de invocador actualizados." }
      : { ok: false, message: "Solo se pueden cambiar durante la selección de campeones." };
  }
}
