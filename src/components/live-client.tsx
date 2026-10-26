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
import { draftToQuery, runeKeyToPage, type ActionResult, type BuildPayload, type DesktopAccount, type LiveState } from "@/lib/live";

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

/** Indicador de conexión de /en-vivo. Además mantiene la URL al día con la selección de campeones. */
export function LiveSync() {
  const isDesktop = useIsDesktop();
  const state = useLiveState();
  const router = useRouter();
  const searchParams = useSearchParams();

  const draft = state?.champSelect ?? state?.game ?? null;
  // Con el cliente conectado y sin selección ni partida (menú, sala, fin de partida) la vista vuelve a quedar vacía;
  // solo se conserva la última si se pierde la conexión.
  const target = draft ? draftToQuery(draft, Boolean(state?.game && !state.champSelect)) : state?.connected ? "" : null;
  const currentQuery = searchParams.toString();

  useEffect(() => {
    if (target !== null && target !== currentQuery) router.replace(`/en-vivo${target ? `?${target}` : ""}`, { scroll: false });
  }, [target, currentQuery, router]);

  if (isDesktop === null) return <Pill tone="idle">Conectando…</Pill>;
  if (!isDesktop) {
    return (
      <Pill
        tone="idle"
        title="Lee la selección de campeones desde el cliente de League. Ábrela con npm run desktop:dev o el acceso directo RiftLab."
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
    <Pill tone="ok" title={s ? `${s.gameName}#${s.tagLine}${s.platform ? ` (${PLATFORMS[s.platform].label})` : ""}` : undefined}>
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

/**
 * Si el jugador lo activó en Ajustes, importa la build Top 1 una sola vez por
 * selección de campeones, sin tocar nada: cuando tu campeón está bloqueado y ya se ve el draft completo (etapa
 * final), así las botas y los objetos situacionales tienen en cuenta a todos
 * los rivales.
 */
export function AutoImportBuild({ championKey, build }: { championKey: string; build: BuildPayload }) {
  const state = useLiveState();
  const latest = useRef(build);
  const [result, setResult] = useState<ActionResult | null>(null);
  // Solo si el jugador lo activó en Ajustes: importar sin que lo pida le quitaría la decisión.
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    latest.current = build;
  });
  useEffect(() => {
    void window.riftlab?.getSettings().then((s) => setEnabled(s.autoImport));
  }, []);

  const cs = state?.champSelect;
  const me = cs?.myTeam.find((p) => p.isMe);
  const ready =
    state?.phase === "ChampSelect" &&
    Boolean(me?.locked) &&
    String(me?.championId) === championKey &&
    (cs?.timerPhase === "FINALIZATION" || cs?.timerPhase === "GAME_STARTING");

  useEffect(() => {
    if (!enabled || !ready || autoImportedFor === championKey || !window.riftlab) return;
    // Pequeña espera: la página termina de recibir el draft final antes de importar.
    const timer = setTimeout(async () => {
      if (autoImportedFor === championKey) return;
      autoImportedFor = championKey;
      try {
        const r = await window.riftlab!.importBuild(latest.current);
        setResult({ ok: r.ok, message: r.ok ? "Build Top 1 importada sola: runas, hechizos y objetos." : r.message });
      } catch {
        setResult({ ok: false, message: "No se pudo importar la build automáticamente." });
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [enabled, ready, championKey]);

  if (!result) return null;
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
      router.push(`/resumen/${summoner.platform}/${summoner.platform.toUpperCase()}_${lastGame.gameId}?yo=${summoner.puuid}`);
    }
  }, [phase, tft, gameMode, pathname, router, lastGame, summoner]);

  if (!isDesktop || pathname === "/en-vivo" || gameMode) return null;
  return (
    <Link
      href="/en-vivo"
      className="fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full border border-line bg-surface/95 px-3 py-1.5 text-xs text-muted shadow-lg backdrop-blur hover:text-ink"
    >
      <span className={`h-2 w-2 rounded-full ${state?.connected ? "bg-win" : "bg-dim"}`} aria-hidden="true" />
      {state?.connected ? (PHASE_LABEL[state.phase] ?? "Cliente conectado") : "Cliente de League cerrado"}
    </Link>
  );
}
