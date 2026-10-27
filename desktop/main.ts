/**
 * Proceso principal de la app de escritorio de RiftLab.
 *
 * - Desarrollo (`npm run desktop:dev`): usa el servidor de `next dev` en
 *   http://localhost:3000 (si no está corriendo, lo levanta).
 * - Producción (`npm run desktop`): arranca el servidor standalone de Next que
 *   genera `npm run desktop:build`, en un puerto libre de 127.0.0.1.
 *
 * Además observa el cliente de League (desktop/lcu.ts) y le pasa el estado a
 * la ventana por IPC.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { BrowserWindow, Menu, app, globalShortcut, ipcMain, screen, shell } from "electron";
import { isPlatform } from "../src/lib/constants";
import {
  profilePath,
  type ActionResult,
  type BuildPayload,
  type DesktopAccount,
  type AutoImportParts,
  type DesktopSettings,
  type RunePagePayload,
  type SettingsPatch,
  type TftPlanPayload,
  type UpdateStatus,
} from "../src/lib/live";
import { autoUpdater } from "electron-updater";
import { LeagueClient } from "./lcu";

const ROOT = join(__dirname, "..", "..");
const PROD = process.argv.includes("--prod") || app.isPackaged;
/**
 * Instalada (con el instalador), el servidor, los datos y el ícono van en la carpeta
 * resources; desde el proyecto se usan los de siempre.
 */
const SERVER_DIR = app.isPackaged ? join(process.resourcesPath, "server") : join(ROOT, ".next", "standalone");
const DATA_DIR = app.isPackaged ? join(process.resourcesPath, "data") : join(ROOT, "data");
const ICON = app.isPackaged ? join(process.resourcesPath, "icon.ico") : join(ROOT, "desktop", "icon.ico");
const DEV_URL = process.env.RIFTLAB_DEV_URL ?? "http://localhost:3000";
// Prueba rápida sin mostrar la ventana: carga la app, revisa el puente y sale.
const SMOKE = process.argv.includes("--smoke");
const DEBUG = SMOKE || Boolean(process.env.RIFTLAB_DEBUG);

// Mismo id que el acceso directo del escritorio: la barra de tareas usa su ícono y nombre.
app.setAppUserModelId("RiftLab");

// Sin el menú por defecto de Electron (con Alt aparecía, y su Ayuda abre páginas en el navegador).
Menu.setApplicationMenu(null);

// Una sola instancia: abrir el acceso directo otra vez trae la ventana existente al frente.
if (!SMOKE && !app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => {
  if (win?.isMinimized()) win.restore();
  win?.focus();
});

let win: BrowserWindow | null = null;
/** Dirección del servidor de la app (http://127.0.0.1:puerto o el de desarrollo). */
let appBase: string | null = null;

/* ---------- Cuenta recordada ---------- */

// La cuenta sale del cliente de League (la sesión que ya iniciaste con Riot) y se guarda
// para abrir la app directo en tu perfil aunque el cliente esté cerrado.
const accountFile = () => join(app.getPath("userData"), "cuenta.json");

function readAccount(): DesktopAccount | null {
  try {
    return JSON.parse(readFileSync(accountFile(), "utf8")) as DesktopAccount;
  } catch {
    return null;
  }
}

let account = readAccount();
let server: ChildProcess | null = null;

function saveAccount(next: DesktopAccount | null) {
  account = next;
  try {
    if (next) writeFileSync(accountFile(), JSON.stringify(next));
    else rmSync(accountFile(), { force: true });
  } catch {
    // si no se puede guardar, se vuelve a detectar en el próximo inicio
  }
  win?.webContents.send("account:changed", next);
}

/* ---------- Ajustes ---------- */

interface StoredSettings {
  /** Clave de Riot guardada desde Ajustes; manda sobre la del .env.local. */
  apiKey?: string;
  openOnProfile?: boolean;
  tftOverlay?: boolean;
  autoImport?: boolean;
  autoImportParts?: Partial<AutoImportParts>;
  games?: DesktopSettings["games"];
  flashKey?: "D" | "F";
  setupDone?: boolean;
  /** Dirección de las actualizaciones automáticas (carpeta con latest.yml). */
  updateUrl?: string;
}

const settingsFile = () => join(app.getPath("userData"), "ajustes.json");

function readSettings(): StoredSettings {
  try {
    return JSON.parse(readFileSync(settingsFile(), "utf8")) as StoredSettings;
  } catch {
    return {};
  }
}

function writeSettings(next: StoredSettings) {
  writeFileSync(settingsFile(), JSON.stringify(next, null, 2));
}

// Inicio con Windows: sin empaquetar, Electron necesita la carpeta del proyecto para saber qué app abrir.
const loginItem = () => ({ path: process.execPath, args: app.isPackaged ? [] : [ROOT, "--prod"] });

function currentSettings(): DesktopSettings {
  const stored = readSettings();
  return {
    version: app.getVersion(),
    apiKey: stored.apiKey ? "ajustes" : readEnvFile().RIOT_API_KEY ? "env" : groupProxy() ? "grupo" : null,
    openAtLogin: app.getLoginItemSettings(loginItem()).openAtLogin,
    openOnProfile: stored.openOnProfile ?? true,
    tftOverlay: stored.tftOverlay ?? true,
    autoImport: stored.autoImport ?? false,
    autoImportParts: {
      runes: stored.autoImportParts?.runes ?? true,
      spells: stored.autoImportParts?.spells ?? true,
      items: stored.autoImportParts?.items ?? true,
    },
    games: stored.games === "lol" ? "lol" : "lol-tft",
    flashKey: stored.flashKey === "D" || stored.flashKey === "F" ? stored.flashKey : null,
    setupDone: stored.setupDone ?? false,
  };
}

/* ---------- Servidor de Next ---------- */

function readEnvFile(): Record<string, string> {
  const file = join(ROOT, ".env.local");
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

/**
 * Intermediario del grupo (Cloudflare), que guarda la clave de Riot: lo usan quienes no tienen
 * clave propia. El instalador lo trae en proxy.json (scripts/stage-installer.ts lo arma desde el
 * .env.local); desde el proyecto se lee directo del .env.local.
 */
function groupProxy(): { RIFTLAB_PROXY_URL: string; RIFTLAB_PROXY_CODE: string } | null {
  let source: Record<string, string | undefined> = readEnvFile();
  if (app.isPackaged) {
    try {
      source = JSON.parse(readFileSync(join(process.resourcesPath, "proxy.json"), "utf8")) as Record<string, string>;
    } catch {
      source = {};
    }
  }
  const { RIFTLAB_PROXY_URL, RIFTLAB_PROXY_CODE } = source;
  return RIFTLAB_PROXY_URL && RIFTLAB_PROXY_CODE ? { RIFTLAB_PROXY_URL, RIFTLAB_PROXY_CODE } : null;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, "127.0.0.1", () => {
      const address = srv.address();
      const port = typeof address === "object" && address ? address.port : 0;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

async function waitFor(url: string, timeoutMs: number) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return true;
    } catch {
      // todavía arrancando
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

/**
 * El instalador trae las carpetas node_modules del servidor como _node_modules (electron-builder
 * descarta las que se llaman node_modules): la primera vez que arranca se les devuelve el nombre.
 */
function restoreServerModules(dir: string) {
  const top = join(dir, "_node_modules");
  const modules = join(dir, "node_modules");
  if (existsSync(top) && !existsSync(modules)) renameSync(top, modules);
  if (!existsSync(modules)) return;
  // Paquetes con sus propios módulos (sharp, por ejemplo), también dentro de los @scope.
  const packages = readdirSync(modules).flatMap((name) =>
    name.startsWith("@") ? readdirSync(join(modules, name)).map((sub) => join(modules, name, sub)) : [join(modules, name)],
  );
  for (const pkg of packages) {
    const nested = join(pkg, "_node_modules");
    if (existsSync(nested) && !existsSync(join(pkg, "node_modules"))) renameSync(nested, join(pkg, "node_modules"));
  }
}

/**
 * Clave que usa el servidor: la de Ajustes manda, pero si Riot la rechaza (una de desarrollo
 * vencida) y la del .env.local funciona, se usa esa y se borra la vencida de Ajustes.
 */
async function pickApiKey(): Promise<string | undefined> {
  const saved = readSettings().apiKey;
  const fromEnv = readEnvFile().RIOT_API_KEY;
  if (!saved || !fromEnv || saved === fromEnv) return saved ?? fromEnv;
  const status = async (key: string) => {
    try {
      const res = await fetch(`https://${account?.platform ?? "la2"}.api.riotgames.com/lol/status/v4/platform-data`, {
        headers: { "X-Riot-Token": key },
        signal: AbortSignal.timeout(4000),
      });
      return res.status;
    } catch {
      return 0;
    }
  };
  const savedStatus = await status(saved);
  if (savedStatus !== 401 && savedStatus !== 403) return saved;
  if ((await status(fromEnv)) !== 200) return saved;
  const rest = readSettings();
  delete rest.apiKey;
  writeSettings(rest);
  return fromEnv;
}

async function startServer(): Promise<string> {
  if (!PROD) {
    if (await waitFor(DEV_URL, 1500)) return DEV_URL;
    // Sin servidor de desarrollo: se levanta uno junto con la app.
    server = spawn("npm", ["run", "dev"], { cwd: ROOT, shell: true, stdio: "inherit", windowsHide: true });
    if (!(await waitFor(DEV_URL, 120_000))) throw new Error("No se pudo iniciar next dev");
    return DEV_URL;
  }

  if (app.isPackaged) restoreServerModules(SERVER_DIR);
  const standalone = join(SERVER_DIR, "server.js");
  if (!existsSync(standalone)) throw new Error("Falta la compilación. Ejecuta: npm run desktop:build");
  const apiKey = await pickApiKey();
  const port = await freePort();
  server = spawn(process.execPath, [standalone], {
    cwd: SERVER_DIR,
    windowsHide: true,
    stdio: "inherit",
    env: {
      ...process.env,
      ...readEnvFile(),
      // Sin clave propia, el servidor consulta a Riot a través del intermediario del grupo.
      ...groupProxy(),
      // La clave guardada desde Ajustes manda sobre la del .env.local.
      ...(apiKey ? { RIOT_API_KEY: apiKey } : {}),
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      // Las estadísticas se leen de la carpeta data del proyecto (o la que trae el instalador).
      RIFTLAB_DATA_DIR: DATA_DIR,
    },
  });
  const url = `http://127.0.0.1:${port}`;
  if (!(await waitFor(url, 60_000))) throw new Error("El servidor de RiftLab no respondió");
  return url;
}

/* ---------- Ventana ---------- */

/** Fondo de la app (--color-night en globals.css): la barra de título usa el mismo. */
const NIGHT = "#080c13";
const TITLEBAR_HEIGHT = 32;

/**
 * Barra de título integrada: Windows dibuja solo los botones de minimizar,
 * maximizar y cerrar, sobre el color de la app. La página deja ese alto libre
 * (--titlebar-h) y lo usa como zona para arrastrar la ventana.
 */
const integratedTitleBar = {
  titleBarStyle: "hidden" as const,
  titleBarOverlay: { color: NIGHT, symbolColor: "#8a9ab0", height: TITLEBAR_HEIGHT },
};

function reserveTitleBar(w: BrowserWindow) {
  w.webContents.on("dom-ready", () => void w.webContents.insertCSS(`html:root { --titlebar-h: ${TITLEBAR_HEIGHT}px; }`));
}

/** Abre un sitio externo en el navegador y lo deja anotado (sirve para saber qué lo abrió). */
function openOutside(target: string) {
  if (!/^https?:/i.test(target)) return;
  try {
    appendFileSync(
      join(app.getPath("userData"), "externos.log"),
      `${new Date().toISOString()} ${target}
`,
    );
  } catch {
    // sin registro no pasa nada
  }
  void shell.openExternal(target);
}

async function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: NIGHT,
    ...integratedTitleBar,
    title: "RiftLab",
    icon: ICON,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  reserveTitleBar(win);
  if (!SMOKE) win.once("ready-to-show", () => win?.show());

  const url = await startServer();
  appBase = url;

  // Lo que sea de la propia app (localhost o 127.0.0.1, mismo puerto) se queda en la ventana,
  // incluso con Ctrl+clic o clic del medio. Solo los sitios externos van al navegador.
  const appUrl = new URL(url);
  const isInternal = (target: string) => {
    try {
      const t = new URL(target);
      return ["127.0.0.1", "localhost", "[::1]"].includes(t.hostname) && t.port === appUrl.port;
    } catch {
      return false;
    }
  };
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (DEBUG) console.log("[debug] ventana nueva:", target);
    if (isInternal(target)) void win?.loadURL(target);
    else openOutside(target);
    return { action: "deny" };
  });
  if (DEBUG) win.webContents.on("console-message", (event) => console.log(`[consola ${event.level}]`, event.message));
  win.webContents.on("will-navigate", (event, target) => {
    if (DEBUG) console.log("[debug] navegación:", target);
    if (!isInternal(target)) {
      event.preventDefault();
      openOutside(target);
    }
  });

  // Atrás y Adelante como en un navegador: botones laterales del mouse y Alt + flechas.
  // La página anterior vuelve tal como estaba (scroll y partidas desplegadas).
  const history = win.webContents.navigationHistory;
  const go = (direction: "back" | "forward") => {
    if (direction === "back" && history.canGoBack()) history.goBack();
    if (direction === "forward" && history.canGoForward()) history.goForward();
  };
  win.on("app-command", (_event, command) => {
    if (command === "browser-backward") go("back");
    if (command === "browser-forward") go("forward");
  });
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown" || !input.alt || input.control || input.meta) return;
    if (input.key === "ArrowLeft") {
      event.preventDefault();
      go("back");
    } else if (input.key === "ArrowRight") {
      event.preventDefault();
      go("forward");
    }
  });

  // Si se cierra la ventana principal, la flotante de TFT no debe quedar sola.
  win.on("closed", () => overlay?.close());

  await win.loadURL(account && currentSettings().openOnProfile ? `${url}${profilePath(account)}` : url);
}

/* ---------- Ventana flotante de TFT ---------- */

// Atajo para mostrarla u ocultarla sin salir del juego.
const OVERLAY_SHORTCUT = "Control+Shift+T";
let overlay: BrowserWindow | null = null;

/**
 * Ventana chica siempre visible encima del juego con las comps fijadas y las
 * recetas de objetos. Es contenido fijo: no lee el tablero ni recomienda
 * jugadas según lo que pasa en la partida (eso lo prohíben las reglas de Riot para TFT).
 */
function showOverlay() {
  if (!appBase) return;
  if (overlay) {
    overlay.showInactive();
    return;
  }
  const area = screen.getPrimaryDisplay().workArea;
  const width = 380;
  const height = Math.min(720, area.height - 80);
  overlay = new BrowserWindow({
    width,
    height,
    x: area.x + area.width - width - 16,
    y: area.y + 60,
    minWidth: 320,
    minHeight: 360,
    alwaysOnTop: true,
    backgroundColor: NIGHT,
    ...integratedTitleBar,
    title: "RiftLab · TFT",
    icon: ICON,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  reserveTitleBar(overlay);
  // Encima también de los juegos en ventana sin bordes.
  overlay.setAlwaysOnTop(true, "screen-saver");
  // Sin robarle el foco al juego al aparecer.
  overlay.once("ready-to-show", () => overlay?.showInactive());
  overlay.on("closed", () => {
    overlay = null;
  });
  overlay.webContents.setWindowOpenHandler(({ url: target }) => {
    openOutside(target);
    return { action: "deny" };
  });
  void overlay.loadURL(`${appBase}/tft/partida?flotante=1`);
}

function toggleOverlay(): boolean {
  if (overlay?.isVisible()) {
    overlay.hide();
    return false;
  }
  showOverlay();
  return true;
}

/* ---------- Cliente de League ---------- */

let lastTft = false;

const league = new LeagueClient((state) => {
  win?.webContents.send("live:state", state);
  overlay?.webContents.send("live:state", state);

  // La flotante se abre al empezar una partida de TFT y se cierra al terminar.
  const settings = currentSettings();
  if (state.tft && !lastTft && settings.tftOverlay && settings.games !== "lol") showOverlay();
  if (!state.tft && lastTft) overlay?.close();
  lastTft = state.tft;

  const s = state.summoner;
  if (!s?.platform) return;
  const next: DesktopAccount = { gameName: s.gameName, tagLine: s.tagLine, platform: s.platform };
  if (account && account.gameName === next.gameName && account.tagLine === next.tagLine && account.platform === next.platform) return;
  const firstTime = !account;
  saveAccount(next);
  // Primera vez que se detecta la cuenta: si seguías en el inicio, se abre tu perfil.
  if (firstTime && currentSettings().openOnProfile && win && appBase && new URL(win.webContents.getURL() || appBase).pathname === "/")
    void win.loadURL(`${appBase}${profilePath(next)}`);
});

ipcMain.handle("account:get", () => account);

ipcMain.handle("window:focus", () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
});

ipcMain.handle("account:set", (_e, next: DesktopAccount | null): ActionResult => {
  if (next === null) {
    saveAccount(null);
    return { ok: true, message: "Cuenta desvinculada." };
  }
  const gameName = typeof next?.gameName === "string" ? next.gameName.trim() : "";
  const tagLine = typeof next?.tagLine === "string" ? next.tagLine.trim() : "";
  if (!gameName || !tagLine || !isPlatform(next.platform)) return { ok: false, message: "Faltan el Riot ID o el servidor." };
  saveAccount({ gameName, tagLine, platform: next.platform });
  return { ok: true, message: `Cuenta vinculada: ${gameName}#${tagLine}.` };
});

/* ---------- Ajustes ---------- */

ipcMain.handle("settings:get", () => currentSettings());

ipcMain.handle("settings:set", (_e, patch: SettingsPatch) => {
  if (typeof patch?.openAtLogin === "boolean") app.setLoginItemSettings({ ...loginItem(), openAtLogin: patch.openAtLogin });
  const next = readSettings();
  if (typeof patch?.openOnProfile === "boolean") next.openOnProfile = patch.openOnProfile;
  if (typeof patch?.tftOverlay === "boolean") next.tftOverlay = patch.tftOverlay;
  if (typeof patch?.autoImport === "boolean") next.autoImport = patch.autoImport;
  if (patch?.autoImportParts && typeof patch.autoImportParts === "object") {
    const parts = { ...next.autoImportParts };
    for (const k of ["runes", "spells", "items"] as const) {
      if (typeof patch.autoImportParts[k] === "boolean") parts[k] = patch.autoImportParts[k];
    }
    next.autoImportParts = parts;
  }
  if (patch?.games === "lol" || patch?.games === "lol-tft") next.games = patch.games;
  if (patch?.flashKey === "D" || patch?.flashKey === "F") next.flashKey = patch.flashKey;
  else if (patch?.flashKey === null) delete next.flashKey;
  if (typeof patch?.setupDone === "boolean") next.setupDone = patch.setupDone;
  writeSettings(next);
  return applySettings();
});

/** Pasa los ajustes al cliente de League y avisa a las ventanas abiertas. */
function applySettings(): DesktopSettings {
  const settings = currentSettings();
  league.flashKey = settings.flashKey;
  if (settings.games === "lol") overlay?.close();
  win?.webContents.send("settings:changed", settings);
  overlay?.webContents.send("settings:changed", settings);
  return settings;
}

ipcMain.handle("settings:api-key", async (_e, raw: string): Promise<ActionResult> => {
  const key = typeof raw === "string" ? raw.trim() : "";
  const rest = readSettings();
  delete rest.apiKey;
  if (key) {
    if (!/^RGAPI-[0-9a-f-]{36}$/i.test(key))
      return { ok: false, message: "La clave tiene la forma RGAPI-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx." };
    // Se prueba antes de guardar: una clave vencida dejaría la app sin perfiles hasta corregirla.
    try {
      const res = await fetch(`https://${account?.platform ?? "la2"}.api.riotgames.com/lol/status/v4/platform-data`, {
        headers: { "X-Riot-Token": key },
      });
      if (res.status === 401 || res.status === 403)
        return { ok: false, message: "Riot rechazó la clave: revisa que esté copiada completa y que no haya vencido." };
    } catch {
      return { ok: false, message: "No se pudo contactar a Riot para probar la clave. Revisa tu conexión." };
    }
  }
  writeSettings(key ? { ...rest, apiKey: key } : rest);
  // El servidor lee la clave al arrancar: se reinicia la app para que la use.
  if (PROD)
    setTimeout(() => {
      app.relaunch();
      app.exit(0);
    }, 1200);
  return {
    ok: true,
    message: PROD
      ? key
        ? "Clave guardada. RiftLab se reinicia para usarla."
        : readEnvFile().RIOT_API_KEY
          ? "Se volvió a la clave del .env.local. RiftLab se reinicia."
          : "Clave quitada: RiftLab usa el servidor del grupo y se reinicia."
      : "Clave guardada. En modo desarrollo, next dev sigue usando la del .env.local.",
  };
});

ipcMain.handle("live:get", () => league.state);
ipcMain.handle("tft:overlay", () => toggleOverlay());
ipcMain.handle("tft:export-plan", (_e, plan: TftPlanPayload) => league.exportTftPlan(plan));
ipcMain.handle("live:import-runes", (_e, page: RunePagePayload) => league.importRunes(page));
ipcMain.handle("live:import-build", (_e, build: BuildPayload) => league.importBuild(build));
ipcMain.handle("live:set-spells", (_e, spell1Id: number, spell2Id: number) => league.setSpells(Number(spell1Id), Number(spell2Id)));

/* ---------- Actualizaciones automáticas ---------- */

// Solo la app instalada se actualiza sola: baja latest.yml de los Releases de GitHub
// (R3N4X/riftlab, viene en app-update.yml dentro del instalador) o de una dirección propia
// configurada en Ajustes, descarga el instalador nuevo en segundo plano y lo aplica al cerrar.
let update: UpdateStatus = {
  state: app.isPackaged ? "idle" : "disabled",
  url: readSettings().updateUrl ?? process.env.RIFTLAB_UPDATE_URL ?? null,
  message: app.isPackaged ? undefined : "Las actualizaciones automáticas funcionan en la app instalada con el instalador.",
};

function setUpdate(next: Partial<UpdateStatus>) {
  update = { ...update, ...next };
  win?.webContents.send("update:status", update);
}

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.on("checking-for-update", () => setUpdate({ state: "checking", message: undefined }));
autoUpdater.on("update-available", (info) => setUpdate({ state: "downloading", version: info.version, percent: 0 }));
autoUpdater.on("download-progress", (p) => setUpdate({ state: "downloading", percent: Math.round(p.percent) }));
autoUpdater.on("update-not-available", () => setUpdate({ state: "none", version: undefined }));
autoUpdater.on("update-downloaded", (info) => setUpdate({ state: "ready", version: info.version }));
const firstLine = (text: string) => text.split(/\r?\n/)[0];
autoUpdater.on("error", (err) => setUpdate({ state: "error", message: firstLine(err.message) }));

function checkUpdates(): UpdateStatus {
  if (!app.isPackaged) return update;
  // Sin dirección propia se usa la del instalador (GitHub).
  if (update.url) autoUpdater.setFeedURL({ provider: "generic", url: update.url });
  else autoUpdater.setFeedURL({ provider: "github", owner: "R3N4X", repo: "riftlab" });
  void autoUpdater.checkForUpdates().catch((err: Error) => setUpdate({ state: "error", message: firstLine(err.message) }));
  return update;
}

ipcMain.handle("update:get", () => update);
ipcMain.handle("update:check", () => checkUpdates());
ipcMain.handle("update:set-url", (_e, raw: string) => {
  const url = typeof raw === "string" ? raw.trim() : "";
  if (url && !/^https?:\/\/\S+$/i.test(url)) {
    setUpdate({ state: "error", message: "La dirección tiene que empezar con https://" });
    return update;
  }
  const rest = readSettings();
  delete rest.updateUrl;
  writeSettings(url ? { ...rest, updateUrl: url } : rest);
  setUpdate({ url: url || null, state: app.isPackaged ? "idle" : "disabled" });
  return checkUpdates();
});
ipcMain.handle("update:install", () => {
  if (update.state === "ready") autoUpdater.quitAndInstall();
});

/* ---------- Ciclo de vida ---------- */

app.whenReady().then(async () => {
  league.flashKey = currentSettings().flashKey;
  league.start();
  if (!SMOKE) globalShortcut.register(OVERLAY_SHORTCUT, () => void toggleOverlay());
  try {
    await createWindow();
    // Busca actualizaciones al abrir y después cada 6 horas.
    if (!SMOKE && app.isPackaged) {
      checkUpdates();
      setInterval(checkUpdates, 6 * 60 * 60 * 1000);
    }
    if (SMOKE) {
      await new Promise((r) => setTimeout(r, Number(process.env.RIFTLAB_SMOKE_WAIT ?? 6000)));
      const report = await win?.webContents.executeJavaScript(
        `window.riftlab.getState().then((s) => ({ title: document.title, url: location.href, connected: s.connected, phase: s.phase, main: document.querySelector("main")?.innerText.slice(0, 160) }))`,
      );
      console.log("[smoke]", JSON.stringify(report));
      // Captura de pantalla opcional (RIFTLAB_SMOKE_SHOT=ruta.png; RIFTLAB_SMOKE_FOCUS=selector a centrar).
      const shot = process.env.RIFTLAB_SMOKE_SHOT;
      if (shot && win) {
        const focus = process.env.RIFTLAB_SMOKE_FOCUS;
        if (focus)
          await win.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(focus)})?.scrollIntoView({ block: "center" })`);
        await new Promise((r) => setTimeout(r, 1500));
        writeFileSync(shot, (await win.webContents.capturePage()).toPNG());
      }
      // Ventana flotante de TFT (RIFTLAB_SMOKE_OVERLAY=ruta.png): se abre por el puente, como el botón de la página.
      const overlayShot = process.env.RIFTLAB_SMOKE_OVERLAY;
      if (overlayShot) {
        const visible = await win?.webContents.executeJavaScript("window.riftlab.toggleTftOverlay()");
        await new Promise((r) => setTimeout(r, 6000));
        console.log("[smoke] flotante:", visible, overlay?.webContents.getURL(), "encima:", overlay?.isAlwaysOnTop());
        if (overlay) writeFileSync(overlayShot, (await overlay.webContents.capturePage()).toPNG());
      }
      for (const href of (process.env.RIFTLAB_SMOKE_CLICK ?? "").split(",").filter(Boolean)) {
        await win?.webContents.executeJavaScript(`document.querySelector('a[href^="${href}"]')?.click()`);
        await new Promise((r) => setTimeout(r, 3000));
        console.log("[smoke] tras clic en", href, "→", await win?.webContents.executeJavaScript("location.href"));
      }
      app.quit();
    }
  } catch (err) {
    if (SMOKE) {
      console.error("[smoke] error:", err);
      app.exit(1);
    }
    const message = err instanceof Error ? err.message : String(err);
    win?.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(`<body style="background:#080c13;color:#e6eaf0;font-family:sans-serif;padding:40px"><h1>RiftLab no pudo iniciar</h1><p>${message}</p></body>`)}`,
    );
    win?.show();
  }
});

app.on("window-all-closed", () => app.quit());

// app.quit() no emite window-all-closed: la limpieza va aquí para no dejar el servidor huérfano.
app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  league.stop();
  server?.kill();
});
