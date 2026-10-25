/**
 * Tipos compartidos entre la app de escritorio (proceso principal de
 * Electron, que habla con el cliente de League) y la web (página En vivo).
 * Sin dependencias: lo importan ambos lados.
 */
import type { Platform, Role } from "./constants";

export type GamePhase =
  | "None"
  | "Lobby"
  | "Matchmaking"
  | "CheckedIntoTournament"
  | "ReadyCheck"
  | "ChampSelect"
  | "GameStart"
  | "InProgress"
  | "Reconnect"
  | "WaitingForStats"
  | "PreEndOfGame"
  | "EndOfGame"
  | string;

export interface LivePlayer {
  cellId: number;
  /** Campeón elegido o, si todavía no elige, el que tiene en mente (0 = ninguno). */
  championId: number;
  /** true cuando ya bloqueó el campeón. */
  locked: boolean;
  position: Role | null;
  isMe: boolean;
  gameName: string | null;
  tagLine: string | null;
  spell1Id: number;
  spell2Id: number;
}

export interface LiveChampSelect {
  myTeam: LivePlayer[];
  theirTeam: LivePlayer[];
  /** Campeones bloqueados por cada equipo. */
  bans: { mine: number[]; theirs: number[] };
  /** Etapa de la selección: PLANNING, BAN_PICK, FINALIZATION... */
  timerPhase: string | null;
  /** Cola (420 = clasificatoria solo/dúo...) si el cliente la informa. */
  queueId: number | null;
}

/** Amigo de la lista del cliente y lo que está haciendo (sale del chat del cliente, no gasta consultas a Riot). */
export interface LiveFriend {
  puuid: string;
  gameName: string;
  tagLine: string;
  icon: number | null;
  status: "inGame" | "champSelect" | "queue" | "online" | "away";
  championId: number | null;
  /** Cola en texto del cliente ("RANKED_SOLO_5x5", "ARAM"...). */
  queue: string | null;
  /** Hora de inicio de la partida (ms), si está jugando. */
  since: number | null;
}

export interface LiveState {
  /** El cliente de League está abierto y respondió. */
  connected: boolean;
  phase: GamePhase;
  summoner: { gameName: string; tagLine: string; puuid: string; platform: Platform | null } | null;
  champSelect: LiveChampSelect | null;
  /** Equipos de la partida en curso (mismo formato que la selección, ya todo bloqueado). */
  game: LiveChampSelect | null;
  /** La partida en curso es de TFT (no trae equipos: se usa para abrir el modo partida). */
  tft: boolean;
  /** Puntos de maestría por id de campeón (de la cuenta conectada). */
  mastery: Record<number, number> | null;
  /** Última partida jugada (se mantiene al terminar, para abrir su resumen). */
  lastGame: { gameId: number; queueId: number | null; tft: boolean } | null;
  /** Amigos conectados a League (null si todavía no se leyó la lista). */
  friends: LiveFriend[] | null;
  updatedAt: number;
}

export interface RunePagePayload {
  name: string;
  primaryStyleId: number;
  subStyleId: number;
  selectedPerkIds: number[];
}

/** Build completa para llevar al cliente: runas, hechizos y un set de objetos para la tienda. */
export interface BuildPayload {
  championId: number;
  championName: string;
  runes: RunePagePayload | null;
  spells: [number, number] | null;
  /** Bloques del set de objetos, en el orden en que aparecen en la tienda. */
  blocks: { title: string; items: string[] }[];
}

/** Comp de TFT para el Planificador del cliente (máximo 10 unidades). */
export interface TftPlanPayload {
  /** Número del set (18 → "TFTSet18" en el cliente). */
  set: number;
  title: string;
  /** character_id de cada unidad, como en el juego ("DA_18_Kennen"). */
  champions: string[];
}

export interface ActionResult {
  ok: boolean;
  message: string;
}

/** Cuenta con la que se inició sesión en el cliente de League (la app la recuerda). */
export interface DesktopAccount {
  gameName: string;
  tagLine: string;
  platform: Platform;
}

/** "/invocador/la2/RynaT1-Eli" */
export function profilePath(a: DesktopAccount): string {
  return `/invocador/${a.platform}/${encodeURIComponent(`${a.gameName}-${a.tagLine}`)}`;
}

/** Ajustes de la app de escritorio (se guardan en la carpeta de datos de la app). */
export interface DesktopSettings {
  version: string;
  /** De dónde sale la clave de Riot: guardada desde Ajustes, del .env.local, o ninguna. */
  apiKey: "ajustes" | "env" | null;
  openAtLogin: boolean;
  /** Abrir directo en el perfil de la cuenta vinculada en vez del inicio. */
  openOnProfile: boolean;
  /** Abrir la ventana flotante de TFT al empezar una partida. */
  tftOverlay: boolean;
}

/** Estado de las actualizaciones automáticas (solo en la app instalada). */
export interface UpdateStatus {
  state: "disabled" | "idle" | "checking" | "downloading" | "ready" | "none" | "error";
  /** Dirección de donde se bajan las actualizaciones (latest.yml y el instalador). */
  url: string | null;
  /** Versión nueva encontrada. */
  version?: string;
  percent?: number;
  message?: string;
}

/** API que el preload de Electron expone como window.riftlab. */
export interface DesktopBridge {
  getState(): Promise<LiveState>;
  onState(callback: (state: LiveState) => void): () => void;
  getAccount(): Promise<DesktopAccount | null>;
  onAccount(callback: (account: DesktopAccount | null) => void): () => void;
  /** Vincula una cuenta a mano, o la desvincula con null. */
  setAccount(account: DesktopAccount | null): Promise<ActionResult>;
  getSettings(): Promise<DesktopSettings>;
  setSettings(patch: Partial<Pick<DesktopSettings, "openAtLogin" | "openOnProfile" | "tftOverlay">>): Promise<DesktopSettings>;
  /** Prueba la clave contra Riot, la guarda y reinicia la app. Vacía, vuelve a la del .env.local. */
  setApiKey(key: string): Promise<ActionResult>;
  importRunes(page: RunePagePayload): Promise<ActionResult>;
  setSpells(spell1Id: number, spell2Id: number): Promise<ActionResult>;
  /** Runas, hechizos (solo en la selección) y set de objetos de una vez. */
  importBuild(build: BuildPayload): Promise<ActionResult>;
  /** Guarda la comp en el Planificador de TFT del cliente y la deja como recordatorio en la partida. */
  exportTftPlan(plan: TftPlanPayload): Promise<ActionResult>;
  getUpdate(): Promise<UpdateStatus>;
  onUpdate(callback: (status: UpdateStatus) => void): () => void;
  checkForUpdates(): Promise<UpdateStatus>;
  /** Guarda la dirección de actualizaciones (vacía la borra) y busca. */
  setUpdateUrl(url: string): Promise<UpdateStatus>;
  /** Cierra la app e instala la actualización ya descargada. */
  installUpdate(): Promise<void>;
  /** Trae la ventana principal al frente (al hacer clic en un aviso). */
  focusWindow(): Promise<void>;
  /** Muestra u oculta la ventana flotante de TFT; devuelve si quedó visible. */
  toggleTftOverlay(): Promise<boolean>;
}

declare global {
  interface Window {
    riftlab?: DesktopBridge;
  }
}

/** "8000:8010,9111,9104,8299|8400:8444,8451|5008,5008,5001" → página para el cliente. */
export function runeKeyToPage(key: string, name: string): RunePagePayload {
  const [primary, secondary, shards] = key.split("|");
  const [pStyle, pRunes] = primary.split(":");
  const [sStyle, sRunes] = secondary.split(":");
  return {
    name: name.slice(0, 25),
    primaryStyleId: Number(pStyle),
    subStyleId: Number(sStyle),
    selectedPerkIds: [...pRunes.split(","), ...sRunes.split(","), ...shards.split(",")].map(Number),
  };
}

/* ---------- Selección de campeones ↔ URL de /en-vivo ---------- */

/** Parámetros de /en-vivo: ?yo=<key>&rol=<ROL>&aliados=266-TOP,64&rivales=103,51&fijo=1 (&partida=1 ya en juego) */
export function draftToQuery(cs: LiveChampSelect, inGame = false): string {
  const me = cs.myTeam.find((p) => p.isMe);
  const slot = (p: LivePlayer) => (p.position ? `${p.championId}-${p.position}` : String(p.championId));
  const q = new URLSearchParams();
  if (me?.championId) q.set("yo", String(me.championId));
  if (me?.position) q.set("rol", me.position);
  const allies = cs.myTeam.filter((p) => !p.isMe && p.championId > 0).map(slot);
  const enemies = cs.theirTeam.filter((p) => p.championId > 0).map(slot);
  if (allies.length) q.set("aliados", allies.join(","));
  if (enemies.length) q.set("rivales", enemies.join(","));
  if (me?.locked) q.set("fijo", "1");
  if (cs.bans.mine.length) q.set("bloqueos", cs.bans.mine.join(","));
  if (cs.bans.theirs.length) q.set("bloqueosRivales", cs.bans.theirs.join(","));
  if (inGame) q.set("partida", "1");
  return q.toString();
}
