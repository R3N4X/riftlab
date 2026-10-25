/**
 * Piezas visuales de TFT (unidades, objetos, rasgos). Sin código de servidor:
 * las usan tanto las páginas como el modo partida.
 */
import Link from "next/link";
import type { TftItem, TftTrait, TftUnit } from "@/lib/tft/data";

/** Borde según el costo, con los colores del juego. */
export const COST_COLOR: Record<number, string> = {
  1: "#9aa4af",
  2: "#1eb36b",
  3: "#2f8fd6",
  4: "#b84fdc",
  5: "#f0b43c",
};

/** Fondo del hexágono del rasgo según su nivel (0 inactivo, 1 bronce … 4 prismático). */
const STYLE_BG: Record<number, string> = {
  0: "#2a3a4d",
  1: "#a0715e",
  2: "#8fa3a8",
  3: "#d4ad48",
  4: "linear-gradient(135deg, #f5c0ff, #9de6ff 50%, #fff2a8)",
};

export const STYLE_LABEL: Record<number, string> = { 1: "Bronce", 2: "Plata", 3: "Oro", 4: "Prismático" };

export function TftItemIcon({ item, size = 18 }: { item: TftItem; size?: number }) {
  return (
    <img
      src={item.icon}
      alt={item.name}
      title={item.name}
      width={size}
      height={size}
      loading="lazy"
      className="shrink-0 rounded-sm border border-night/80"
    />
  );
}

/**
 * Objeto con su receta: al dejar el mouse encima un segundo (o al enfocarlo
 * con el teclado) aparece el nombre y los dos componentes. Solo CSS.
 */
export function TftItemWithRecipe({ item, items, size = 30 }: { item: TftItem; items: Record<string, TftItem>; size?: number }) {
  const from = item.from?.map((id) => items[id]).filter(Boolean) ?? [];
  return (
    <span tabIndex={0} className="group relative inline-flex rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-gold">
      <img
        src={item.icon}
        alt={item.name}
        width={size}
        height={size}
        loading="lazy"
        className="shrink-0 rounded-sm border border-night/80"
      />
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 -translate-x-1/2 rounded-md border border-line bg-night px-3 py-2 text-xs whitespace-nowrap opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-hover:delay-1000 group-focus-visible:opacity-100 group-focus-visible:delay-0"
      >
        <span className="block font-medium text-ink">{item.name}</span>
        {from.length === 2 && (
          <span className="mt-1.5 flex items-center justify-center gap-1.5 text-muted">
            <TftItemIcon item={from[0]} size={22} />
            <span aria-hidden="true">+</span>
            <TftItemIcon item={from[1]} size={22} />
          </span>
        )}
      </span>
    </span>
  );
}

export function TftUnitIcon({
  unit,
  size = 44,
  stars,
  items = [],
}: {
  unit: TftUnit;
  size?: number;
  /** Estrellas promedio; se muestran redondeadas (2,6 → ★★★). */
  stars?: number;
  items?: TftItem[];
}) {
  const shownStars = stars ? Math.round(stars) : 0;
  return (
    <span className="inline-flex shrink-0 flex-col items-center" style={{ width: size }}>
      <span
        className="h-3 text-[10px] leading-3 tracking-tighter text-gold-soft"
        aria-label={shownStars ? `${shownStars} estrellas` : undefined}
      >
        {shownStars > 1 ? "★".repeat(shownStars) : ""}
      </span>
      <img
        src={unit.icon}
        alt={unit.name}
        title={`${unit.name} (${unit.cost} de oro)`}
        width={size}
        height={size}
        loading="lazy"
        className="rounded-md border-2 object-cover"
        style={{ borderColor: COST_COLOR[unit.cost] ?? COST_COLOR[1], width: size, height: size }}
      />
      {items.length > 0 && (
        <span className="-mt-2 flex">
          {items.map((item, i) => (
            <TftItemIcon key={`${item.id}-${i}`} item={item} size={Math.round(size * 0.36)} />
          ))}
        </span>
      )}
    </span>
  );
}

export function TraitBadge({ trait, style, count, size = 22 }: { trait: TftTrait; style: number; count?: number; size?: number }) {
  const bg = STYLE_BG[style] ?? STYLE_BG[0];
  return (
    <span className="inline-flex items-center gap-1" title={`${trait.name}${style ? ` (${STYLE_LABEL[style]})` : ""}`}>
      <span
        className="flex items-center justify-center"
        style={{
          width: size,
          height: size,
          background: bg,
          clipPath: "polygon(25% 4%, 75% 4%, 100% 50%, 75% 96%, 25% 96%, 0 50%)",
        }}
      >
        <img src={trait.icon} alt="" width={size * 0.62} height={size * 0.62} className={style ? "brightness-0" : "opacity-80"} />
      </span>
      {count !== undefined && <span className="text-xs text-muted">{count}</span>}
    </span>
  );
}

const TABS = [
  { href: "/tft", label: "Comps" },
  { href: "/tft/campeones", label: "Campeones" },
  { href: "/tft/objetos", label: "Objetos" },
  { href: "/tft/rasgos", label: "Rasgos" },
  { href: "/tft/partida", label: "Modo partida" },
];

export function TftTabs({ current }: { current: string }) {
  return (
    <nav aria-label="Secciones de TFT" className="flex flex-wrap gap-1 border-b border-line px-4 sm:px-8">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.href === current ? "page" : undefined}
          className={`-mb-px border-b-2 px-3 py-2.5 text-sm transition-colors ${
            t.href === current ? "border-gold text-gold-soft" : "border-transparent text-muted hover:text-ink"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

/** Colocación promedio con color: verde si es mejor que 4,5 (el promedio), rojo si es peor. */
export function PlaceValue({ value }: { value: number }) {
  const tone = value <= 4.2 ? "text-win" : value >= 4.8 ? "text-loss" : "text-ink";
  return <span className={`tabular-nums ${tone}`}>{value.toFixed(2)}</span>;
}
