"use client";

/** Controles compartidos entre Ajustes y la configuración inicial. */

export function Toggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className={`flex items-center justify-between gap-4 ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
      <span>
        <span className="block text-sm">{label}</span>
        {hint && <span className="block text-xs text-dim">{hint}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="relative h-6 w-11 shrink-0 rounded-full bg-raised transition-colors peer-checked:bg-gold peer-focus-visible:ring-2 peer-focus-visible:ring-gold/60 after:absolute after:top-0.5 after:left-0.5 after:h-5 after:w-5 after:rounded-full after:bg-ink after:transition-transform peer-checked:after:translate-x-5 peer-checked:after:bg-night"
      />
    </label>
  );
}

export interface Choice<T extends string> {
  value: T;
  label: string;
  hint?: string;
  /** Dibujo opcional sobre el texto (por ejemplo, las teclas de Destello). */
  art?: React.ReactNode;
}

/** Opciones excluyentes como tarjetas (radios accesibles por teclado). */
export function ChoiceGroup<T extends string>({
  name,
  legend,
  value,
  options,
  onChange,
}: {
  name: string;
  legend: string;
  value: T | null;
  options: Choice<T>[];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset>
      <legend className="sr-only">{legend}</legend>
      <div className={`grid gap-2 ${options.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        {options.map((o) => (
          <label key={o.value} className="relative cursor-pointer">
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="peer sr-only"
            />
            <span className="flex h-full flex-col gap-2 rounded-md border border-line bg-night/40 p-3 transition-colors peer-checked:border-gold peer-checked:bg-gold/10 peer-focus-visible:ring-2 peer-focus-visible:ring-gold/60 hover:border-gold/50">
              {o.art}
              <span className="font-display text-base font-semibold">{o.label}</span>
              {o.hint && <span className="text-xs text-muted">{o.hint}</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Las teclas D y F con Destello en la elegida. */
export function FlashKeys({ flashOn }: { flashOn: "D" | "F" | null }) {
  return (
    <span className="flex gap-1.5" aria-hidden="true">
      {(["D", "F"] as const).map((k) => {
        const flash = flashOn === k;
        return (
          <span
            key={k}
            className={`relative flex h-11 w-11 items-center justify-center rounded-md border-b-4 font-display text-lg font-bold ${
              flash ? "border-gold bg-gold/90 text-night" : "border-line bg-raised text-muted"
            }`}
          >
            {k}
            {flash && (
              <svg viewBox="0 0 24 24" className="absolute top-0.5 right-0.5 h-3.5 w-3.5" fill="currentColor">
                <path d="M13 2 4 14h6l-1 8 9-12h-6z" />
              </svg>
            )}
          </span>
        );
      })}
    </span>
  );
}

export const FLASH_CHOICES: Choice<"D" | "F">[] = [
  { value: "D", label: "Destello en la D", art: <FlashKeys flashOn="D" /> },
  { value: "F", label: "Destello en la F", art: <FlashKeys flashOn="F" /> },
];

export const GAME_CHOICES: Choice<"lol-tft" | "lol">[] = [
  { value: "lol-tft", label: "League of Legends y TFT", hint: "Ves todas las secciones, también las comps de TFT." },
  { value: "lol", label: "Solo League of Legends", hint: "Se oculta la sección de TFT y su ventana flotante." },
];

export const fieldClass =
  "h-10 rounded-md border border-line bg-night/80 px-3 text-sm text-ink outline-none placeholder:text-dim focus:border-gold";
export const primaryButton =
  "h-10 rounded-md bg-gold px-4 font-display font-semibold text-night transition-colors hover:bg-gold-soft disabled:cursor-not-allowed disabled:opacity-60";
export const secondaryButton =
  "h-10 rounded-md border border-line px-4 text-sm text-ink transition-colors hover:bg-raised/60 disabled:cursor-not-allowed disabled:opacity-60";
