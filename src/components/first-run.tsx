"use client";

/**
 * Configuración inicial de la app de escritorio: aparece la primera vez que se abre (y al
 * actualizar desde una versión que no la tenía) y se puede repetir desde Ajustes.
 * Todo lo que pregunta se cambia después en Ajustes.
 */
import { useEffect, useRef, useState } from "react";
import { PLATFORMS, type Platform } from "@/lib/constants";
import type { AutoImportParts, DesktopSettings } from "@/lib/live";
import { setPreferredPlatform, usePreferredPlatform } from "@/lib/preferences";
import { updateDesktopSettings, useDesktopAccount, useDesktopSettings } from "./live-client";
import { ChoiceGroup, FLASH_CHOICES, GAME_CHOICES, Toggle, fieldClass, primaryButton, secondaryButton } from "./settings-controls";

interface Draft {
  games: DesktopSettings["games"];
  flashKey: "D" | "F";
  autoImport: boolean;
  autoImportParts: AutoImportParts;
  platform: Platform;
  openAtLogin: boolean;
  openOnProfile: boolean;
  tftOverlay: boolean;
}

const STEPS = ["Juegos", "Destello", "Importar la build", "Al iniciar"];

export function FirstRunSetup() {
  const settings = useDesktopSettings();
  if (!settings || settings.setupDone) return null;
  // La ventana flotante de TFT usa el mismo diseño de página: ahí no se pregunta nada.
  if (new URLSearchParams(window.location.search).has("flotante")) return null;
  return <Wizard settings={settings} />;
}

function Wizard({ settings }: { settings: DesktopSettings }) {
  const account = useDesktopAccount();
  const preferred = usePreferredPlatform();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => ({
    games: settings.games,
    flashKey: settings.flashKey ?? "D",
    autoImport: settings.autoImport,
    autoImportParts: settings.autoImportParts,
    platform: account?.platform ?? preferred,
    openAtLogin: settings.openAtLogin,
    openOnProfile: settings.openOnProfile,
    tftOverlay: settings.tftOverlay,
  }));
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const heading = useRef<HTMLHeadingElement>(null);

  // Al cambiar de paso, el foco va al título para que el lector de pantalla lo anuncie.
  useEffect(() => heading.current?.focus(), [step]);

  async function finish() {
    setSaving(true);
    setPreferredPlatform(draft.platform);
    await updateDesktopSettings({
      games: draft.games,
      flashKey: draft.flashKey,
      autoImport: draft.autoImport,
      autoImportParts: draft.autoImportParts,
      openAtLogin: draft.openAtLogin,
      openOnProfile: draft.openOnProfile,
      tftOverlay: draft.tftOverlay,
      setupDone: true,
    });
  }

  const last = step === STEPS.length - 1;
  const parts = draft.autoImportParts;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-night/85 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="configuracion-titulo"
        className="flex max-h-full w-full max-w-xl flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-2xl"
      >
        <div className="border-b border-line px-6 pt-5 pb-4">
          <p className="text-xs text-muted">
            Configura RiftLab · paso {step + 1} de {STEPS.length}
          </p>
          <ol className="mt-2 flex gap-1.5" aria-hidden="true">
            {STEPS.map((s, i) => (
              <li key={s} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-gold" : "bg-raised"}`} />
            ))}
          </ol>
        </div>

        <div className="overflow-y-auto px-6 py-5">
          <h2 id="configuracion-titulo" ref={heading} tabIndex={-1} className="font-display text-2xl font-bold outline-none">
            {step === 0 && "¿Qué juegas?"}
            {step === 1 && "¿En qué tecla usas Destello?"}
            {step === 2 && "¿Quieres que la build se importe sola?"}
            {step === 3 && "Últimos detalles"}
          </h2>

          {step === 0 && (
            <>
              <p className="mt-1 mb-4 text-sm text-muted">Así la barra lateral muestra solo lo que te sirve.</p>
              <ChoiceGroup name="inicial-juegos" legend="Juegos" value={draft.games} options={GAME_CHOICES} onChange={(games) => set({ games })} />
            </>
          )}

          {step === 1 && (
            <>
              <p className="mt-1 mb-4 text-sm text-muted">
                Cuando RiftLab ponga tus hechizos, Destello va siempre en esa tecla y el otro hechizo en la que queda.
              </p>
              <ChoiceGroup
                name="inicial-destello"
                legend="Tecla de Destello"
                value={draft.flashKey}
                options={FLASH_CHOICES}
                onChange={(flashKey) => set({ flashKey })}
              />
            </>
          )}

          {step === 2 && (
            <>
              <p className="mt-1 mb-4 text-sm text-muted">
                Al bloquear tu campeón, RiftLab puede poner sola la build que más gana contra tu rival. Si lo dejas apagado, la
                importas con un botón en En vivo.
              </p>
              <div className="space-y-3">
                <Toggle
                  label="Importar sola al bloquear el campeón"
                  checked={draft.autoImport}
                  onChange={(autoImport) => set({ autoImport })}
                />
                <div className="space-y-2 border-l border-line pl-4">
                  <Toggle
                    label="Runas"
                    checked={parts.runes}
                    disabled={!draft.autoImport}
                    onChange={(runes) => set({ autoImportParts: { ...parts, runes } })}
                  />
                  <Toggle
                    label="Hechizos"
                    hint={`Destello en la ${draft.flashKey}.`}
                    checked={parts.spells}
                    disabled={!draft.autoImport}
                    onChange={(spells) => set({ autoImportParts: { ...parts, spells } })}
                  />
                  <Toggle
                    label="Set de objetos"
                    hint="Aparece en la tienda del juego."
                    checked={parts.items}
                    disabled={!draft.autoImport}
                    onChange={(items) => set({ autoImportParts: { ...parts, items } })}
                  />
                </div>
              </div>
            </>
          )}

          {step === 3 && (
            <div className="mt-4 space-y-4">
              <label className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <span>
                  <span className="block">Tu servidor</span>
                  <span className="block text-xs text-dim">Se usa al buscar un Riot ID sin elegir otro.</span>
                </span>
                <select
                  value={draft.platform}
                  onChange={(e) => set({ platform: e.target.value as Platform })}
                  className={fieldClass}
                >
                  {Object.entries(PLATFORMS).map(([id, p]) => (
                    <option key={id} value={id} className="bg-surface">
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <Toggle label="Abrir RiftLab al iniciar Windows" checked={draft.openAtLogin} onChange={(openAtLogin) => set({ openAtLogin })} />
              <Toggle
                label="Abrir directo en mi perfil"
                hint="Tu cuenta se toma sola del cliente de League al iniciar sesión."
                checked={draft.openOnProfile}
                onChange={(openOnProfile) => set({ openOnProfile })}
              />
              {draft.games !== "lol" && (
                <Toggle
                  label="Ventana flotante en partidas de TFT"
                  hint="Tus comps fijadas encima del juego. Ctrl + Shift + T la muestra u oculta."
                  checked={draft.tftOverlay}
                  onChange={(tftOverlay) => set({ tftOverlay })}
                />
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-line px-6 py-4">
          <button
            type="button"
            onClick={() => void updateDesktopSettings({ setupDone: true })}
            className="mr-auto text-sm text-dim hover:text-ink"
          >
            Omitir
          </button>
          {step > 0 && (
            <button type="button" onClick={() => setStep(step - 1)} className={secondaryButton}>
              Atrás
            </button>
          )}
          <button
            type="button"
            disabled={saving}
            onClick={() => (last ? void finish() : setStep(step + 1))}
            className={primaryButton}
          >
            {last ? (saving ? "Guardando…" : "Listo") : "Siguiente"}
          </button>
        </div>
        <p className="px-6 pb-4 text-xs text-dim">Todo esto se puede cambiar después en Ajustes.</p>
      </div>
    </div>
  );
}
