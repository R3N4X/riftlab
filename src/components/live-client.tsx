"use client";

/*
 * Piezas de cliente de la sección En vivo. Solo funcionan dentro de la app de
 * escritorio, que expone window.riftlab (ver desktop/preload.ts); en el
 * navegador muestran cómo abrirla.
 */
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { PLATFORMS } from "@/lib/constants";
import {
  draftToQuery,
  runeKeyToPage,
  type ActionResult,
  type AutoAcceptStatus,
  type BuildPayload,
  type DesktopAccount,
  type DesktopSettings,
  type LiveState,
  type SettingsPatch,
} from "@/lib/live";
import { tip, row } from "@/lib/tip";

/* ---------- Estado del cliente de League ---------- */

let current: LiveState | null = null;
/** Campeón para el que ya se importó la build sola en esta selección (se limpia al salir de ella). */
let autoImportedFor: string | null = null;

function setCurrent(s: LiveState) {
  current = s;
  if (s.phase !== "ChampSelect") autoImportedFor = null;
}

function subscribe(onChange: () => void) {
  const bridge = window.riftlab;
  if (!bridge) return () => {};
  void bridge.getState().then((s) => {
    setCurrent(s);
    onChange();
  });
  return bridge.onState((s) => {
    setCurrent(s);
    onChange();
  });
}

const noop = () => () => {};

let account: DesktopAccount | null = null;

function subscribeAccount(onChange: () => void) {
  const bridge = window.riftlab;
  if (!bridge) return () => {};
  void bridge.getAccount().then((a) => {
    account = a;
    onChange();
  });
  return bridge.onAccount((a) => {
    account = a;
    onChange();
  });
}

/** Cuenta del cliente de League que recuerda la app de escritorio (null en el navegador). */
export function useDesktopAccount() {
  return useSyncExternalStore(
    subscribeAccount,
    () => account,
    () => null,
  );
}

/* ---------- Ajustes de la app de escritorio ---------- */

// Un solo enganche al puente para todos los componentes. Se engancha recién cuando algún componente
// se suscribe y el puente existe, y avisa a todos los suscritos (incluso los que llegaron antes).
let settings: DesktopSettings | null = null;
const settingsListeners = new Set<() => void>();
let settingsHooked = false;

function publishSettings(next: DesktopSettings) {
  settings = next;
  for (const listener of settingsListeners) listener();
}

function subscribeSettings(onChange: () => void) {
  settingsListeners.add(onChange);
  const bridge = window.riftlab;
  if (bridge && !settingsHooked) {
    settingsHooked = true;
    void bridge.getSettings().then(publishSettings);
    bridge.onSettings(publishSettings);
  }
  return () => {
    settingsListeners.delete(onChange);
  };
}

/** Ajustes de la app de escritorio (null en el navegador o mientras cargan). */
export function useDesktopSettings() {
  return useSyncExternalStore(
    subscribeSettings,
    () => settings,
    () => null,
  );
}

/** Cambia ajustes de la app de escritorio; todas las pantallas se enteran por onSettings. */
export async function updateDesktopSettings(patch: SettingsPatch) {
  const bridge = window.riftlab;
  if (!bridge) return;
  publishSettings(await bridge.setSettings(patch));
}

/** null en el servidor; false en el navegador; true en la app de escritorio. */
export function useIsDesktop() {
  return useSyncExternalStore(
    noop,
    () => Boolean(window.riftlab),
    () => null,
  );
}

export function useLiveState() {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}

const PHASE_LABEL: Record<string, string> = {
  None: "En el menú principal",
  Lobby: "En una sala",
  Matchmaking: "Buscando partida",
  ReadyCheck: "Partida encontrada",
  ChampSelect: "En la selección de campeones",
  GameStart: "Cargando la partida",
  InProgress: "En partida",
  Reconnect: "Reconectando",
  WaitingForStats: "Esperando estadísticas",
  PreEndOfGame: "Fin de la partida",
  EndOfGame: "Fin de la partida",
};

/* ---------- Encabezado de /en-vivo ---------- */

const TIMER_LABEL: Record<string, string> = {
  PLANNING: "Declarando intenciones",
  BAN_PICK: "Bloqueos y elecciones",
  FINALIZATION: "Esperando la selección final",
  GAME_STARTING: "La partida va a comenzar",
};

/** Los 30 campeones con más maestría (desde 20 mil puntos), separados por coma. */
function masteryPool(mastery: Record<number, number> | null | undefined): string {
  return Object.entries(mastery ?? {})
    .filter(([, points]) => points >= 20_000)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([id]) => id)
    .join(",");
}

/** Indicador de conexión de /en-vivo. Además mantiene la URL al día con la selección de campeones. */
export function LiveSync() {
  const isDesktop = useIsDesktop();
  const state = useLiveState();
  const router = useRouter();
  const searchParams = useSearchParams();

  const draft = state?.champSelect ?? state?.game ?? null;
  // Con el cliente conectado y sin selección ni partida (menú, sala, fin de partida) la vista vuelve a quedar vacía;
  // solo se conserva la última si se pierde la conexión.
  const query = draft ? draftToQuery(draft, Boolean(state?.game && !state.champSelect)) : state?.connected ? "" : null;
  // La vista previa de una recomendación (?ver=) se conserva mientras dura la selección y no fijas campeón.
  // Tus campeones con más maestría, para recomendarte también los que mejor juegas.
  const pool = state?.champSelect ? masteryPool(state.mastery) : "";
  const withPool = query && pool ? `${query}&mios=${pool}` : query;
  const preview = searchParams.get("ver");
  const target = withPool && preview && state?.champSelect && !withPool.includes("fijo=1") ? `${withPool}&ver=${preview}` : withPool;
  const currentQuery = searchParams.toString();

  useEffect(() => {
    if (target !== null && target !== currentQuery) router.replace(`/en-vivo${target ? `?${target}` : ""}`, { scroll: false });
  }, [target, currentQuery, router]);

  if (isDesktop === null) return <Pill tone="idle">Conectando…</Pill>;
  if (!isDesktop) {
    return (
      <Pill
        tone="idle"
        title={tip("Solo en la app de escritorio", "Lee la selección de campeones desde el cliente de League. Abre RiftLab con su acceso directo.")}
      >
        Solo en la app de escritorio
      </Pill>
    );
  }
  if (!state?.connected) return <Pill tone="idle">Abre el cliente de League</Pill>;

  const s = state.summoner;
  const label =
    state.phase === "ChampSelect"
      ? (TIMER_LABEL[state.champSelect?.timerPhase ?? ""] ?? PHASE_LABEL.ChampSelect)
      : (PHASE_LABEL[state.phase] ?? state.phase);
  return (
    <Pill tone="ok" title={s ? tip(`${s.gameName}#${s.tagLine}`, s.platform && row("Servidor", PLATFORMS[s.platform].label)) : undefined}>
      {label}
    </Pill>
  );
}

function Pill({ tone, title, children }: { tone: "ok" | "idle"; title?: string; children: React.ReactNode }) {
  return (
    <span
      role="status"
      title={title}
      className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${tone === "ok" ? "border-gold/60 text-gold-soft" : "border-line text-muted"}`}
    >
      <span className={`h-2 w-2 rounded-full ${tone === "ok" ? "bg-win" : "bg-dim"}`} aria-hidden="true" />
      {children}
    </span>
  );
}

/** Puntos de maestría de la cuenta conectada con ese campeón. */
export function MasteryPoints({ championKey }: { championKey: string }) {
  const state = useLiveState();
  const points = state?.mastery?.[Number(championKey)];
  if (points === undefined) return <span className="text-dim">—</span>;
  return <span className="text-gold-soft">{points >= 1000 ? `${Math.round(points / 1000)}k` : points}</span>;
}

/* ---------- Acciones sobre el cliente ---------- */

function ActionButton({
  label,
  disabledReason,
  run,
  wide = false,
}: {
  label: string;
  disabledReason?: string;
  run: () => Promise<ActionResult>;
  /** Botón a todo el ancho de la tarjeta (los packs de build). */
  wide?: boolean;
}) {
  const isDesktop = useIsDesktop();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const reason = !isDesktop ? "Disponible en la app de escritorio" : disabledReason;

  return (
    <div className={`flex flex-col gap-1.5 ${wide ? "items-stretch" : "items-start"}`}>
      <button
        type="button"
        disabled={Boolean(reason) || busy}
        title={reason}
        onClick={async () => {
          setBusy(true);
          try {
            setResult(await run());
          } catch {
            setResult({ ok: false, message: "No se pudo comunicar con el cliente de League." });
          } finally {
            setBusy(false);
          }
        }}
        className={`${wide ? "w-full py-2.5 font-semibold" : "py-1.5 font-medium"} rounded-md border border-gold/60 bg-gold/10 px-3 whitespace-nowrap text-sm text-gold-soft transition-colors hover:bg-gold/20 disabled:cursor-not-allowed disabled:border-line disabled:bg-transparent disabled:text-dim`}
      >
        {busy ? "Aplicando…" : label}
      </button>
      <span aria-live="polite" className={`text-xs ${result?.ok ? "text-win" : "text-loss"}`}>
        {result?.message}
      </span>
    </div>
  );
}

export function ImportRunesButton({ runeKey, pageName }: { runeKey: string; pageName: string }) {
  return <ActionButton label="Importar runas" run={() => window.riftlab!.importRunes(runeKeyToPage(runeKey, pageName))} />;
}

export function ImportBuildButton({ build }: { build: BuildPayload }) {
  return <ActionButton wide label="Importar build" run={() => window.riftlab!.importBuild(build)} />;
}

/** ["runas", "hechizos", "objetos"] → "runas, hechizos y objetos". */
function listJoin(words: string[]): string {
  return words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} y ${words.at(-1)}`;
}

/*
 * Importación automática de la build Top 1 (si el jugador la activó en Ajustes), una vez por
 * selección de campeones: cuando tu campeón está bloqueado y ya se ve el draft completo (etapa
 * final), así las botas y los objetos situacionales tienen en cuenta a todos los rivales.
 *
 * Corre en el layout, no en la página En vivo: si el jugador se iba a otra sección durante la
 * selección, la build no se importaba. La build sale de /api/en-vivo/build (la misma de En vivo).
 */
let autoImportResult: (ActionResult & { championKey: string; at: number }) | null = null;
const autoImportListeners = new Set<() => void>();

function publishAutoImport(result: typeof autoImportResult) {
  autoImportResult = result;
  autoImportListeners.forEach((l) => l());
}

function useAutoImportResult() {
  return useSyncExternalStore(
    (onChange) => {
      autoImportListeners.add(onChange);
      return () => autoImportListeners.delete(onChange);
    },
    () => autoImportResult,
    () => null,
  );
}

function AutoImporter() {
  const state = useLiveState();
  // Solo si el jugador lo activó en Ajustes: importar sin que lo pida le quitaría la decisión.
  const settings = useDesktopSettings();
  const parts = settings?.autoImportParts;
  const enabled = Boolean(settings?.autoImport && parts && (parts.runes || parts.spells || parts.items));

  const cs = state?.champSelect;
  const me = cs?.myTeam.find((p) => p.isMe);
  const championKey = me?.championId ? String(me.championId) : null;
  const ready =
    state?.phase === "ChampSelect" && Boolean(me?.locked) && (cs?.timerPhase === "FINALIZATION" || cs?.timerPhase === "GAME_STARTING");
  const role = me?.position ?? "";
  const enemies =
    cs?.theirTeam
      .filter((p) => p.championId > 0)
      .map((p) => p.championId)
      .join(",") ?? "";
  const partsRef = useRef(parts);
  useEffect(() => {
    partsRef.current = parts;
  });

  useEffect(() => {
    if (!enabled || !ready || !championKey || autoImportedFor === championKey || !window.riftlab) return;
    // Pequeña espera: el draft final termina de llegar antes de importar.
    const timer = setTimeout(async () => {
      if (autoImportedFor === championKey) return;
      autoImportedFor = championKey;
      const p = partsRef.current ?? { runes: true, spells: true, items: true };
      const names = [p.runes && "runas", p.spells && "hechizos", p.items && "objetos"].filter(Boolean) as string[];
      try {
        const res = await fetch(`/api/en-vivo/build?${new URLSearchParams({ yo: championKey, rol: role, rivales: enemies })}`);
        if (!res.ok) throw new Error();
        const b = (await res.json()) as BuildPayload;
        // Solo las partes elegidas en Ajustes; importBuild salta las que van vacías.
        const r = await window.riftlab!.importBuild({
          ...b,
          runes: p.runes ? b.runes : null,
          spells: p.spells ? b.spells : null,
          blocks: p.items ? b.blocks : [],
        });
        publishAutoImport({
          ok: r.ok,
          message: r.ok ? `Build Top 1 de ${b.championName} importada sola: ${listJoin(names)}.` : r.message,
          championKey,
          at: Date.now(),
        });
      } catch {
        publishAutoImport({
          ok: false,
          message: "No se pudo importar la build automáticamente.",
          championKey,
          at: Date.now(),
        });
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [enabled, ready, championKey, role, enemies]);

  return null;
}

/** Resultado de la importación automática, en la tarjeta de builds de En vivo. */
export function AutoImportStatus({ championKey }: { championKey: string }) {
  const result = useAutoImportResult();
  if (!result || result.championKey !== championKey) return null;
  return (
    <p
      aria-live="polite"
      className={`mb-3 rounded-md border px-2.5 py-1.5 text-center text-xs ${result.ok ? "border-win/40 bg-win/10 text-win" : "border-loss/40 bg-loss/10 text-loss"}`}
    >
      {result.message}
    </p>
  );
}

export function SetSpellsButton({ spellKey }: { spellKey: string }) {
  const state = useLiveState();
  const [a, b] = spellKey.split("-").map(Number);
  return (
    <ActionButton
      label="Poner hechizos"
      disabledReason={state?.phase === "ChampSelect" ? undefined : "Solo durante la selección de campeones"}
      run={() => window.riftlab!.setSpells(a, b)}
    />
  );
}

/* ---------- Aceptar la partida sola ---------- */

/** Cuánto queda a la vista cada aviso que no es la cuenta regresiva. */
const ACCEPT_NOTICE_MS = { accepted: 4000, cancelled: 5000, failed: 6000 } as const;

/**
 * Aviso de la aceptación automática (la decide el proceso principal de la app de escritorio): la cuenta
 * regresiva con "Cancelar" y, después, qué pasó.
 */
function AutoAcceptNotice() {
  const [status, setStatus] = useState<AutoAcceptStatus>({ state: "none" });
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => window.riftlab?.onAutoAccept(setStatus), []);

  // La cuenta regresiva avanza sola; los demás avisos se esconden después de un rato.
  useEffect(() => {
    if (status.state === "none") return;
    if (status.state === "pending") {
      const id = setInterval(() => setNow(Date.now()), 250);
      return () => clearInterval(id);
    }
    const id = setTimeout(() => setStatus({ state: "none" }), ACCEPT_NOTICE_MS[status.state]);
    return () => clearTimeout(id);
  }, [status]);

  if (status.state === "none") return null;
  const pending = status.state === "pending";
  const seconds = pending ? Math.max(0, Math.ceil((status.acceptAt - now) / 1000)) : 0;
  const tone = status.state === "accepted" || pending ? "border-gold/60" : status.state === "failed" ? "border-loss/60" : "border-line";
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-16 left-1/2 z-50 flex w-[min(92vw,26rem)] -translate-x-1/2 items-center gap-3 rounded-lg border bg-surface/95 px-4 py-3 text-sm shadow-xl backdrop-blur ${tone}`}
    >
      {pending ? (
        <>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-gold font-display text-lg font-bold text-gold-soft tabular-nums">
            {seconds}
          </span>
          <p className="min-w-0 flex-1 text-ink">
            Partida encontrada
            <span className="block text-xs text-muted">Se acepta sola en {seconds} s.</span>
          </p>
          <button
            type="button"
            onClick={() => void window.riftlab?.cancelAutoAccept()}
            className="shrink-0 rounded-md border border-line px-3 py-1.5 text-sm text-ink hover:border-loss/70 hover:text-loss"
          >
            Cancelar
          </button>
        </>
      ) : (
        <p className={status.state === "accepted" ? "text-gold-soft" : status.state === "failed" ? "text-loss" : "text-muted"}>{status.message}</p>
      )}
    </div>
  );
}

/* ---------- Observador global (layout) ---------- */

/** En la app de escritorio, abre En vivo al entrar a la selección de campeones y muestra el estado. */
const END_PHASES = new Set(["WaitingForStats", "PreEndOfGame", "EndOfGame"]);
/** Partida cuyo resumen ya se abrió (para no volver a saltar a él). */
let reviewedGame: number | null = null;

export function LiveWatcher() {
  const isDesktop = useIsDesktop();
  const state = useLiveState();
  const router = useRouter();
  const pathname = usePathname();
  const lastPhase = useRef<string | null>(null);

  const phase = state?.phase ?? null;
  const tft = state?.tft ?? false;
  const lastGame = state?.lastGame ?? null;
  const summoner = state?.summoner ?? null;
  // La ventana flotante de TFT (y la página de modo partida) no salta a otras páginas ni muestra el aviso.
  const gameMode = pathname === "/tft/partida";
  useEffect(() => {
    // Salta a En vivo al entrar a la selección y al empezar la partida (solo en el cambio, no bloquea navegar).
    // En TFT no hay selección: al empezar se abre el modo partida.
    const entered = (p: string) => phase === p && lastPhase.current !== p;
    lastPhase.current = phase;
    if (gameMode) return;
    if (tft && entered("InProgress")) router.push("/tft/partida");
    else if ((entered("ChampSelect") || entered("InProgress")) && !tft && pathname !== "/en-vivo") router.push("/en-vivo");
    // Al terminar una partida de LoL con cola (no personalizada ni de práctica) se abre su resumen, una vez.
    else if (
      phase &&
      END_PHASES.has(phase) &&
      lastGame &&
      !lastGame.tft &&
      (lastGame.queueId ?? 0) > 0 &&
      summoner?.platform &&
      reviewedGame !== lastGame.gameId
    ) {
      reviewedGame = lastGame.gameId;
      router.push(
        `/resumen/${summoner.platform}/${summoner.platform.toUpperCase()}_${lastGame.gameId}?yo=${encodeURIComponent(`${summoner.gameName}#${summoner.tagLine}`)}`,
      );
    }
  }, [phase, tft, gameMode, pathname, router, lastGame, summoner]);

  if (!isDesktop || gameMode) return null;
  // Siempre en el mismo orden: así el aviso de la partida aceptada no se pierde al saltar a En vivo.
  return (
    <>
      <AutoImporter />
      <AutoAcceptNotice />
      {pathname !== "/en-vivo" && (
        <Link
          href="/en-vivo"
          className="fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full border border-line bg-surface/95 px-3 py-1.5 text-xs text-muted shadow-lg backdrop-blur hover:text-ink"
        >
          <span className={`h-2 w-2 rounded-full ${state?.connected ? "bg-win" : "bg-dim"}`} aria-hidden="true" />
          {state?.connected ? (PHASE_LABEL[state.phase] ?? "Cliente conectado") : "Cliente de League cerrado"}
        </Link>
      )}
    </>
  );
}
