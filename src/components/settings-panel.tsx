"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { LEGAL_NOTICE_EN, LEGAL_NOTICE_ES, PLATFORMS, type Platform } from "@/lib/constants";
import { profilePath, type ActionResult, type AutoImportParts, type DesktopSettings, type UpdateStatus } from "@/lib/live";
import { setPreferredPlatform, usePreferredPlatform } from "@/lib/preferences";
import { updateDesktopSettings, useDesktopAccount, useDesktopSettings } from "./live-client";
import {
  ChoiceGroup,
  FLASH_CHOICES,
  FlashKeys,
  GAME_CHOICES,
  Toggle,
  fieldClass,
  primaryButton,
  secondaryButton,
} from "./settings-controls";

const noop = () => () => {};

/** null en el servidor; false en el navegador; true en la app de escritorio. */
function useIsDesktop() {
  return useSyncExternalStore(
    noop,
    () => Boolean(window.riftlab),
    () => null,
  );
}

function useClientConnected() {
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    const bridge = window.riftlab;
    if (!bridge) return;
    void bridge.getState().then((s) => setConnected(s.connected));
    return bridge.onState((s) => setConnected(s.connected));
  }, []);
  return connected;
}

export function SettingsPanel({ patch }: { patch: string }) {
  const isDesktop = useIsDesktop();
  const settings = useDesktopSettings();

  return (
    <div className="grid max-w-4xl gap-4">
      {isDesktop === false && (
        <p className="rounded-md border border-line bg-surface px-4 py-3 text-sm text-muted">
          La cuenta de League, la clave de Riot y el inicio automático se configuran en la app de escritorio de RiftLab. Aquí solo se guarda
          el servidor de búsqueda, en este navegador.
        </p>
      )}

      {isDesktop && <AccountSection />}
      <SearchSection />
      {isDesktop && settings && <GamesSection settings={settings} />}
      {isDesktop && settings && <ChampSelectSection settings={settings} />}
      {isDesktop && settings && <StartupSection settings={settings} />}
      {isDesktop && settings && <ApiKeySection settings={settings} />}
      {isDesktop && <UpdatesSection />}

      <SettingsCard title="Acerca de RiftLab">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
          {settings && (
            <>
              <dt className="text-muted">Versión de la app</dt>
              <dd>{settings.version}</dd>
            </>
          )}
          <dt className="text-muted">Parche de los datos</dt>
          <dd>{patch}</dd>
        </dl>
        <p className="mt-3 text-xs text-dim">{LEGAL_NOTICE_ES}</p>
        <p lang="en" className="mt-2 text-xs text-dim">
          {LEGAL_NOTICE_EN}
        </p>
      </SettingsCard>
    </div>
  );
}

function SettingsCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    // Mismo estilo que Panel de ui.tsx, que no se importa aquí porque arrastra código de servidor.
    <section className="rounded-lg border border-line bg-surface p-5">
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Feedback({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  return (
    <p role="status" className={`mt-2 text-sm ${result.ok ? "text-win" : "text-loss"}`}>
      {result.message}
    </p>
  );
}


/* ---------- Cuenta ---------- */

/** Ícono y nivel de la cuenta vinculada (se piden a Riot una vez por cuenta). */
function useAccountIcon(account: { gameName: string; tagLine: string; platform: Platform } | null) {
  const key = account ? `${account.platform}/${encodeURIComponent(`${account.gameName}-${account.tagLine}`)}` : null;
  const [info, setInfo] = useState<{ key: string; icon: string | null; level: number | null } | null>(null);
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    fetch(`/api/cuenta/${key}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => !cancelled && body && setInfo({ key, icon: body.icon ?? null, level: body.level ?? null }))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [key]);
  return info?.key === key ? info : null;
}

function AccountSection() {
  const account = useDesktopAccount();
  const icon = useAccountIcon(account);
  const connected = useClientConnected();
  const [riotId, setRiotId] = useState("");
  const [platform, setPlatform] = useState<Platform>(usePreferredPlatform());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);

  async function link(e: React.FormEvent) {
    e.preventDefault();
    const value = riotId.trim();
    const hash = value.lastIndexOf("#");
    if (hash <= 0 || hash === value.length - 1) {
      setResult({ ok: false, message: "Escribe el Riot ID completo, con el tag: Nombre#TAG" });
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      // Se confirma con Riot antes de guardar: así se guarda con las mayúsculas correctas.
      const slug = encodeURIComponent(`${value.slice(0, hash)}-${value.slice(hash + 1)}`);
      const res = await fetch(`/api/cuenta/${platform}/${slug}`);
      const body = await res.json();
      if (!res.ok) {
        setResult({ ok: false, message: body.error ?? "No se pudo comprobar la cuenta" });
        return;
      }
      const saved = await window.riftlab!.setAccount({ gameName: body.gameName, tagLine: body.tagLine, platform });
      setResult(saved);
      if (saved.ok) setRiotId("");
    } catch {
      setResult({ ok: false, message: "No se pudo comprobar la cuenta. Revisa tu conexión." });
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    setResult(await window.riftlab!.setAccount(null));
  }

  return (
    <SettingsCard
      title="Cuenta de League"
      description="RiftLab toma tu cuenta del cliente de League cuando lo abres e inicias sesión: no te pide contraseña. También puedes vincularla a mano con tu Riot ID."
    >
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-night/40 px-4 py-3">
        <div className="flex min-w-0 items-center gap-4">
          {account && (
            <div className="relative shrink-0">
              {icon?.icon ? (
                <img src={icon.icon} alt="" width={56} height={56} className="h-14 w-14 rounded-xl ring-2 ring-gold/60" />
              ) : (
                <span className="block h-14 w-14 animate-pulse rounded-xl bg-raised" aria-hidden="true" />
              )}
              {icon?.level != null && (
                <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-full border border-gold/60 bg-night px-1.5 text-[11px] leading-tight">
                  {icon.level}
                </span>
              )}
            </div>
          )}
          <div className="min-w-0">
            {account ? (
              <>
                <p className="font-display text-lg font-semibold">
                  {account.gameName}
                  <span className="text-dim">#{account.tagLine}</span>
                  <span className="ml-2 text-sm font-normal text-muted">{PLATFORMS[account.platform]?.label}</span>
                </p>
                <p className="text-xs text-muted">Cuenta vinculada</p>
              </>
            ) : (
              <p className="text-muted">Sin cuenta vinculada</p>
            )}
            <p className="mt-1 flex items-center gap-1.5 text-xs text-dim">
              <span className={`h-2 w-2 rounded-full ${connected ? "bg-win" : "bg-dim"}`} aria-hidden="true" />
              {connected ? "Cliente de League abierto" : "Cliente de League cerrado"}
            </p>
          </div>
        </div>
        {account && (
          <div className="flex gap-2">
            <Link href={profilePath(account)} className={`${secondaryButton} inline-flex items-center`}>
              Ver mi perfil
            </Link>
            <button type="button" onClick={unlink} className={secondaryButton}>
              Desvincular
            </button>
          </div>
        )}
      </div>
      {account && connected && (
        <p className="mt-2 text-xs text-dim">
          Mientras el cliente esté abierto, la cuenta con la que iniciaste sesión se vuelve a vincular sola.
        </p>
      )}

      <form onSubmit={link} className="mt-4">
        <p className="mb-2 text-sm text-muted">{account ? "Vincular otra cuenta" : "Vincular a mano"}</p>
        <div className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="ajustes-servidor-cuenta">
            Servidor
          </label>
          <select
            id="ajustes-servidor-cuenta"
            value={platform}
            onChange={(e) => setPlatform(e.target.value as Platform)}
            className={fieldClass}
          >
            {Object.entries(PLATFORMS).map(([id, p]) => (
              <option key={id} value={id} className="bg-surface">
                {p.label}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="ajustes-riot-id">
            Riot ID
          </label>
          <input
            id="ajustes-riot-id"
            value={riotId}
            onChange={(e) => setRiotId(e.target.value)}
            placeholder="Nombre#TAG"
            autoComplete="off"
            spellCheck={false}
            className={`${fieldClass} min-w-48 flex-1`}
          />
          <button type="submit" disabled={busy} className={primaryButton}>
            {busy ? "Comprobando…" : "Vincular"}
          </button>
        </div>
        <Feedback result={result} />
      </form>
    </SettingsCard>
  );
}

/* ---------- Búsqueda ---------- */

function SearchSection() {
  const platform = usePreferredPlatform();
  return (
    <SettingsCard title="Búsqueda" description="Servidor que se usa al buscar un Riot ID sin elegir otro.">
      <label className="flex items-center gap-3 text-sm">
        <span className="text-muted">Servidor predeterminado</span>
        <select value={platform} onChange={(e) => setPreferredPlatform(e.target.value as Platform)} className={fieldClass}>
          {Object.entries(PLATFORMS).map(([id, p]) => (
            <option key={id} value={id} className="bg-surface">
              {p.label}
            </option>
          ))}
        </select>
      </label>
    </SettingsCard>
  );
}

/* ---------- Juegos ---------- */

function GamesSection({ settings }: { settings: DesktopSettings }) {
  return (
    <SettingsCard title="Juegos" description="Lo que ves en la barra lateral según lo que juegas.">
      <ChoiceGroup
        name="ajustes-juegos"
        legend="Juegos"
        value={settings.games}
        options={GAME_CHOICES}
        onChange={(games) => void updateDesktopSettings({ games })}
      />
      <button type="button" onClick={() => void updateDesktopSettings({ setupDone: false })} className={`${secondaryButton} mt-4`}>
        Repetir la configuración inicial
      </button>
    </SettingsCard>
  );
}

/* ---------- Selección de campeones ---------- */

const PART_LABEL: Record<keyof AutoImportParts, string> = { runes: "Runas", spells: "Hechizos", items: "Set de objetos" };

function ChampSelectSection({ settings }: { settings: DesktopSettings }) {
  const parts = settings.autoImportParts;
  return (
    <SettingsCard
      title="Selección de campeones"
      description="Cómo pone RiftLab tus hechizos y qué importa sola cuando bloqueas el campeón."
    >
      <p className="mb-2 text-sm text-muted">Tecla de Destello</p>
      <ChoiceGroup
        name="ajustes-destello"
        legend="Tecla de Destello"
        value={settings.flashKey ?? "cliente"}
        options={[
          ...FLASH_CHOICES,
          {
            value: "cliente",
            label: "Donde ya lo tengo",
            hint: "Respeta la tecla que tengas en el cliente en cada partida.",
            art: <FlashKeys flashOn={null} />,
          },
        ]}
        onChange={(v) => void updateDesktopSettings({ flashKey: v === "cliente" ? null : v })}
      />

      <div className="mt-5 border-t border-line pt-4">
        <Toggle
          label="Traer RiftLab al frente al entrar a la selección"
          hint="La ventana aparece sobre el cliente de League, en En vivo, con los picks y la build recomendada."
          checked={settings.focusOnChampSelect}
          onChange={(focusOnChampSelect) => void updateDesktopSettings({ focusOnChampSelect })}
        />
      </div>

      <div className="mt-5 space-y-3 border-t border-line pt-4">
        <Toggle
          label="Importar la build sola al bloquear el campeón"
          hint="Usa la build Top 1 contra tu rival. Apagado, se importa solo con los botones de En vivo."
          checked={settings.autoImport}
          onChange={(autoImport) => void updateDesktopSettings({ autoImport })}
        />
        <div className="space-y-2 border-l border-line pl-4">
          {(Object.keys(PART_LABEL) as (keyof AutoImportParts)[]).map((k) => (
            <Toggle
              key={k}
              label={PART_LABEL[k]}
              checked={parts[k]}
              disabled={!settings.autoImport}
              onChange={(v) => void updateDesktopSettings({ autoImportParts: { ...parts, [k]: v } })}
            />
          ))}
        </div>
      </div>
    </SettingsCard>
  );
}

/* ---------- Inicio ---------- */

function StartupSection({ settings }: { settings: DesktopSettings }) {
  return (
    <SettingsCard title="Al iniciar">
      <div className="space-y-3">
        <Toggle
          label="Abrir RiftLab al iniciar Windows"
          checked={settings.openAtLogin}
          onChange={(openAtLogin) => void updateDesktopSettings({ openAtLogin })}
        />
        <Toggle
          label="Abrir directo en mi perfil"
          hint="Si está apagado, la app abre en el inicio."
          checked={settings.openOnProfile}
          onChange={(openOnProfile) => void updateDesktopSettings({ openOnProfile })}
        />
        {settings.games !== "lol" && (
          <Toggle
            label="Ventana flotante en partidas de TFT"
            hint="Se abre encima del juego con tus comps fijadas y las recetas. Ctrl + Shift + T la muestra u oculta."
            checked={settings.tftOverlay}
            onChange={(tftOverlay) => void updateDesktopSettings({ tftOverlay })}
          />
        )}
      </div>
    </SettingsCard>
  );
}

/* ---------- Clave de Riot ---------- */

const KEY_SOURCE: Record<NonNullable<DesktopSettings["apiKey"]>, string> = {
  ajustes: "Configurada desde Ajustes",
  env: "Configurada en el archivo .env.local",
  grupo: "Usando el servidor del grupo: no necesitas clave propia",
};

function ApiKeySection({ settings }: { settings: DesktopSettings }) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);

  async function save(value: string) {
    setBusy(true);
    setResult(null);
    const r = await window.riftlab!.setApiKey(value);
    setResult(r);
    setBusy(false);
    if (r.ok) setKey("");
  }

  return (
    <SettingsCard
      title="Clave de la API de Riot"
      description="Los perfiles y el historial se leen de la API oficial de Riot. RiftLab usa la clave del servidor del grupo, así que no necesitas una propia; si tienes una, pégala aquí y tus consultas no gastarán las del grupo."
    >
      <p className="mb-3 flex items-center gap-1.5 text-sm">
        <span className={`h-2 w-2 rounded-full ${settings.apiKey ? "bg-win" : "bg-loss"}`} aria-hidden="true" />
        {settings.apiKey ? KEY_SOURCE[settings.apiKey] : "Sin clave: los perfiles no van a cargar"}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save(key);
        }}
        className="flex flex-wrap gap-2"
      >
        <label className="sr-only" htmlFor="ajustes-clave">
          Clave nueva
        </label>
        <input
          id="ajustes-clave"
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="RGAPI-…"
          autoComplete="off"
          spellCheck={false}
          className={`${fieldClass} min-w-64 flex-1 font-mono`}
        />
        <button type="submit" disabled={busy || !key.trim()} className={primaryButton}>
          {busy ? "Probando…" : "Guardar y reiniciar"}
        </button>
        {settings.apiKey === "ajustes" && (
          <button type="button" disabled={busy} onClick={() => void save("")} className={secondaryButton}>
            Quitar mi clave
          </button>
        )}
      </form>
      <Feedback result={result} />
      <p className="mt-3 text-xs text-dim">
        La clave se consigue en{" "}
        <a href="https://developer.riotgames.com" target="_blank" rel="noreferrer" className="text-gold-soft hover:underline">
          developer.riotgames.com
        </a>{" "}
        iniciando sesión con tu cuenta de Riot. Se guarda solo en este equipo.
      </p>
    </SettingsCard>
  );
}

/* ---------- Actualizaciones ---------- */

const UPDATE_LABEL: Record<UpdateStatus["state"], string> = {
  disabled: "Desde el proyecto la app no se actualiza sola: se recompila.",
  idle: "Lista para buscar actualizaciones.",
  checking: "Buscando actualizaciones…",
  downloading: "Descargando la versión nueva…",
  ready: "Actualización lista para instalar.",
  none: "Tienes la última versión.",
  error: "No se pudo buscar la actualización.",
};

function UpdatesSection() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const bridge = window.riftlab;
    if (!bridge?.getUpdate) return;
    void bridge.getUpdate().then(setStatus);
    return bridge.onUpdate(setStatus);
  }, []);

  if (!status) return null;
  const field = url ?? status.url ?? "";
  const progress = status.state === "downloading" && status.percent ? ` ${status.percent} %` : "";
  return (
    <SettingsCard
      title="Actualizaciones"
      description="La app instalada busca una versión nueva al abrirse y cada 6 horas, la descarga sola y la instala al cerrarse. Las versiones se publican en GitHub (R3N4X/riftlab)."
    >
      <p
        role="status"
        className={`mb-3 text-sm ${status.state === "error" ? "text-loss" : status.state === "ready" ? "text-win" : "text-muted"}`}
      >
        {UPDATE_LABEL[status.state]}
        {progress}
        {status.version && status.state !== "none" && <> Versión {status.version}.</>}
        {status.message && <span className="block text-xs text-dim">{status.message}</span>}
        {status.state !== "disabled" && <span className="block text-xs text-dim">Origen: {status.url ?? "GitHub, R3N4X/riftlab"}</span>}
      </p>
      {status.state !== "disabled" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void window.riftlab!.setUpdateUrl(field).then(setStatus);
            setUrl(null);
          }}
          className="flex flex-wrap gap-2"
        >
          <label className="sr-only" htmlFor="ajustes-actualizaciones">
            Dirección de actualizaciones
          </label>
          <input
            id="ajustes-actualizaciones"
            value={field}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Dirección propia (opcional): https://… con latest.yml"
            spellCheck={false}
            className={`${fieldClass} min-w-64 flex-1`}
          />
          <button type="submit" className={secondaryButton}>
            Guardar
          </button>
          <button
            type="button"
            disabled={status.state === "checking" || status.state === "downloading"}
            onClick={() => void window.riftlab!.checkForUpdates().then(setStatus)}
            className={secondaryButton}
          >
            Buscar ahora
          </button>
          {status.state === "ready" && (
            <button type="button" onClick={() => void window.riftlab!.installUpdate()} className={primaryButton}>
              Reiniciar y actualizar
            </button>
          )}
        </form>
      )}
    </SettingsCard>
  );
}
