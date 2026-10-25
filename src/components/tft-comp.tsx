/**
 * Tarjeta de una comp del meta. Se usa en /tft y en el modo partida, así que
 * no importa nada de servidor: recibe el catálogo ya armado.
 */
import { TierBadge } from "./icons";
import { ExportPlanButton, PinButton } from "./tft-client";
import { COST_COLOR, PlaceValue, TftItemWithRecipe, TftUnitIcon, TraitBadge } from "./tft";
import { pct } from "@/lib/format";
import type { TftCatalog } from "@/lib/tft/data";
import type { CompDifficulty, CompStyle, CompUnit, CompView } from "@/lib/tft/meta";
import { BOARD_COLS, BOARD_ROWS, suggestPositions } from "@/lib/tft/positioning";

export type CatalogLite = Pick<TftCatalog, "units" | "items" | "traits">;

function UnitWithItems({ u, catalog, size }: { u: CompUnit; catalog: CatalogLite; size: number }) {
  const unit = catalog.units[u.id];
  if (!unit) return null;
  return <TftUnitIcon unit={unit} size={size} stars={u.stars} items={u.items.map((i) => catalog.items[i]).filter(Boolean)} />;
}

const DIFFICULTY_TONE: Record<CompDifficulty["level"], string> = {
  Fácil: "border-win/60 text-win",
  Media: "border-gold/60 text-gold-soft",
  Difícil: "border-loss/60 text-loss",
};

/** Etiquetas de cómo se juega la comp y qué tan difícil es. */
export function CompTags({ style, difficulty }: { style: CompStyle; difficulty: CompDifficulty }) {
  return (
    <span className="flex flex-wrap gap-1.5 text-xs">
      <span className="inline-flex items-center gap-1 rounded-full border border-hex/60 px-2 py-0.5 text-hex" title={style.howTo}>
        <svg
          viewBox="0 0 16 16"
          className="h-3 w-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {style.kind === "reroll" ? <path d="M13 8a5 5 0 1 1-1.5-3.5M13 3v2.5h-2.5" /> : <path d="M3 10l5-5 5 5M3 14l5-5 5 5" />}
        </svg>
        {style.label}
      </span>
      <span className={`rounded-full border px-2 py-0.5 ${DIFFICULTY_TONE[difficulty.level]}`} title={difficulty.reasons.join(". ") + "."}>
        {difficulty.level}
      </span>
    </span>
  );
}

export function CompSummary({
  comp,
  catalog,
  set,
  compact = false,
}: {
  comp: CompView;
  catalog: CatalogLite;
  set: number;
  compact?: boolean;
}) {
  // Para el Planificador: el tablero típico y, si sobra lugar, las alternativas (máximo 10).
  const plan = [...comp.core, ...comp.flex].map((u) => u.id).slice(0, 10);
  const unitSize = compact ? 34 : 44;
  const traits = comp.traits.slice(0, compact ? 4 : 6);
  return (
    <div className={`flex flex-wrap items-center gap-x-5 gap-y-3 ${compact ? "px-3 py-2.5" : "px-4 py-3"}`}>
      <div className={`flex min-w-0 items-start gap-3 ${compact ? "w-full" : "w-60"}`}>
        <TierBadge tier={comp.grade} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg leading-tight font-semibold">{comp.name}</p>
          <div className="mt-1">
            <CompTags style={comp.style} difficulty={comp.difficulty} />
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {traits.map((t) => {
              const trait = catalog.traits[t.id];
              return trait ? <TraitBadge key={t.id} trait={trait} style={t.style} size={compact ? 18 : 22} /> : null;
            })}
          </div>
        </div>
        {compact && (
          <div className="flex shrink-0 flex-col gap-1">
            <PinButton compKey={comp.key} name={comp.name} />
            <ExportPlanButton set={set} name={comp.name} champions={plan} />
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
        {comp.core.map((u) => (
          <UnitWithItems key={u.id} u={u} catalog={catalog} size={unitSize} />
        ))}
      </div>

      <dl className={`grid shrink-0 grid-cols-4 gap-x-4 text-right text-sm ${compact ? "w-full text-xs" : ""}`}>
        <div>
          <dt className="text-xs text-dim">Prom.</dt>
          <dd className="font-semibold">
            <PlaceValue value={comp.avgPlace} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-dim">Top 4</dt>
          <dd className="tabular-nums">{pct(comp.top4, 0)}</dd>
        </div>
        <div>
          <dt className="text-xs text-dim">1.º</dt>
          <dd className="tabular-nums">{pct(comp.win, 0)}</dd>
        </div>
        <div>
          <dt className="text-xs text-dim">Juegan</dt>
          <dd className="tabular-nums text-muted">{pct(comp.playRate, 1)}</dd>
        </div>
      </dl>
      {!compact && (
        <div className="flex shrink-0 flex-col gap-1">
          <PinButton compKey={comp.key} name={comp.name} />
          <ExportPlanButton set={set} name={comp.name} champions={plan} />
        </div>
      )}
    </div>
  );
}

export function CompDetails({ comp, catalog }: { comp: CompView; catalog: CatalogLite }) {
  const carriers = comp.core.filter((u) => u.items.length > 0);
  return (
    <div className="grid gap-5 border-t border-line/60 bg-night/30 px-4 py-4 text-sm lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto]">
      <div>
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Objetos</h3>
        <ul className="space-y-2">
          {carriers.map((u) => {
            const unit = catalog.units[u.id];
            if (!unit) return null;
            return (
              <li key={u.id} className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2">
                <TftUnitIcon unit={unit} size={34} />
                <span className="min-w-0 flex-1 truncate font-medium">{unit.name}</span>
                <span className="flex shrink-0 gap-2">
                  {u.items.map((id) => {
                    const item = catalog.items[id];
                    return item ? <TftItemWithRecipe key={id} item={item} items={catalog.items} size={30} /> : null;
                  })}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-dim">Deja el mouse sobre un objeto para ver su receta.</p>
      </div>

      <div className="space-y-4">
        <div>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Cómo se juega</h3>
          <CompTags style={comp.style} difficulty={comp.difficulty} />
          <p className="mt-2 text-muted">{comp.style.howTo}</p>
          <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-dim">
            {comp.difficulty.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Posición</h3>
          <CompBoard comp={comp} catalog={catalog} size={40} />
        </div>
        <div>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Alternativas</h3>
          {comp.flex.length ? (
            <ul className="flex flex-wrap gap-3">
              {comp.flex.map((u) => {
                const unit = catalog.units[u.id];
                return unit ? (
                  <li key={u.id} className="flex flex-col items-center gap-0.5 text-xs text-muted">
                    <TftUnitIcon unit={unit} size={34} />
                    {pct(u.freq, 0)}
                  </li>
                ) : null;
              })}
            </ul>
          ) : (
            <p className="text-dim">Tablero bastante fijo: casi nadie cambia piezas.</p>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 self-start lg:grid-cols-1">
        <div>
          <dt className="text-xs text-dim">Nivel final promedio</dt>
          <dd>{comp.level.toFixed(1)}</dd>
        </div>
        <div>
          <dt className="text-xs text-dim">Partidas analizadas</dt>
          <dd>{comp.games}</dd>
        </div>
      </dl>
    </div>
  );
}

/* ---------- Guía de la comp (modo partida) ---------- */

/**
 * Curva de niveles general según el estilo. Es fija por comp (no mira la
 * partida), como piden las reglas de Riot para TFT.
 */
function levelPlan(style: CompStyle): { stage: string; text: string }[] {
  switch (style.kind) {
    case "reroll":
      return style.level <= 6
        ? [
            { stage: "2-1", text: "Nivel 4 y junta oro con las unidades baratas de la comp" },
            { stage: "3-1", text: "Nivel 6: gasta solo lo que pase de 50 de oro hasta tener las 3 estrellas" },
            { stage: "4-1", text: "Nivel 7 y después 8 para completar el tablero" },
          ]
        : [
            { stage: "2-1", text: "Nivel 4; guarda pares de las unidades clave" },
            { stage: "3-2", text: "Nivel 6 y junta oro (racha si puedes)" },
            { stage: "3-5", text: "Nivel 7: gasta solo lo que pase de 50 de oro hasta las 3 estrellas" },
            { stage: "4-5", text: "Con el carry listo, sube a 8 para cerrar el tablero" },
          ];
    case "fast9":
      return [
        { stage: "2-1", text: "Nivel 4; arma un tablero fuerte con lo que salga" },
        { stage: "3-2", text: "Nivel 6 y ahorra para llegar a 50 de oro" },
        { stage: "4-1", text: "Nivel 8: gasta solo lo justo para estabilizarte" },
        { stage: "5-1", text: "Nivel 9 y ahí busca las unidades de 4 y 5 de oro" },
      ];
    case "level8":
      return [
        { stage: "2-1", text: "Nivel 4" },
        { stage: "3-2", text: "Nivel 6 y junta oro" },
        { stage: "4-1", text: "Nivel 8 y gasta el oro buscando el carry y las de 4 de oro" },
        { stage: "5-1", text: "Nivel 9 solo si el tablero ya está completo" },
      ];
    default:
      return [
        { stage: "2-1", text: "Nivel 4" },
        { stage: "3-2", text: "Nivel 6 y junta oro" },
        { stage: "3-5", text: "Nivel 7 y gasta hasta tener el carry y el tablero armados" },
        { stage: "4-5", text: "Sube a 8 cuando el tablero esté estable" },
      ];
  }
}

function GuideHeading({ children }: { children: React.ReactNode }) {
  return <h4 className="mb-1.5 text-xs font-semibold text-gold-soft">{children}</h4>;
}

/** Guía fija de la comp: cómo se juega, curva de niveles, componentes a guardar, objetos y rasgos. */
export function CompGuide({ comp, catalog }: { comp: CompView; catalog: CatalogLite }) {
  const carriers = comp.core.filter((u) => u.items.length > 0).sort((a, b) => (a.id === comp.carry ? -1 : b.id === comp.carry ? 1 : 0));

  // Componentes que piden los objetos de los carries (el carry principal primero).
  const components = new Map<string, number>();
  for (const u of carriers) {
    for (const id of u.items) {
      for (const part of catalog.items[id]?.from ?? []) components.set(part, (components.get(part) ?? 0) + 1);
    }
  }
  const neededComponents = [...components].filter(([id]) => catalog.items[id]).sort((a, b) => b[1] - a[1]);

  const early = [...comp.core, ...comp.flex]
    .filter((u) => (catalog.units[u.id]?.cost ?? 9) <= 2)
    .sort((a, b) => (catalog.units[a.id]?.cost ?? 0) - (catalog.units[b.id]?.cost ?? 0));

  const traits = comp.traits
    .map((t) => ({ trait: catalog.traits[t.id], style: t.style }))
    .filter((t) => t.trait && t.trait.units.length > 1)
    .map((t) => ({ ...t, min: t.trait!.breakpoints.find((b) => b.style === t.style)?.min }));

  return (
    <div className="space-y-4 border-t border-line/60 bg-night/40 px-3 py-3 text-sm">
      <section>
        <GuideHeading>Cómo se juega</GuideHeading>
        <p className="text-muted">{comp.style.howTo}</p>
      </section>

      <section>
        <GuideHeading>Plan de niveles</GuideHeading>
        <ol className="space-y-1">
          {levelPlan(comp.style).map((step) => (
            <li key={step.stage} className="flex gap-2.5">
              <span className="w-8 shrink-0 self-start rounded bg-raised py-0.5 text-center text-xs font-semibold tabular-nums text-ink">
                {step.stage}
              </span>
              <span className="text-muted">{step.text}</span>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <GuideHeading>Posición</GuideHeading>
        <CompBoard comp={comp} catalog={catalog} size={36} />
      </section>

      {neededComponents.length > 0 && (
        <section>
          <GuideHeading>Componentes que conviene guardar</GuideHeading>
          <div className="flex flex-wrap gap-2">
            {neededComponents.map(([id, n]) => (
              <span key={id} className="flex items-center gap-1 rounded-md bg-raised px-1.5 py-1 text-xs tabular-nums text-muted">
                <TftItemWithRecipe item={catalog.items[id]} items={catalog.items} size={24} />×{n}
              </span>
            ))}
          </div>
        </section>
      )}

      {carriers.length > 0 && (
        <section>
          <GuideHeading>Objetos</GuideHeading>
          <ul className="space-y-1.5">
            {carriers.map((u) => {
              const unit = catalog.units[u.id];
              if (!unit) return null;
              return (
                <li key={u.id} className="flex items-center gap-2.5 rounded-md border border-line bg-surface px-2 py-1.5">
                  <TftUnitIcon unit={unit} size={28} />
                  <span className="min-w-0 flex-1 truncate">
                    {unit.name}
                    {u.id === comp.carry && <span className="ml-1.5 text-xs text-gold-soft">carry</span>}
                  </span>
                  <span className="flex shrink-0 gap-1.5">
                    {u.items.map((id) => {
                      const item = catalog.items[id];
                      return item ? <TftItemWithRecipe key={id} item={item} items={catalog.items} size={26} /> : null;
                    })}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {early.length > 0 && (
        <section>
          <GuideHeading>Para empezar</GuideHeading>
          <p className="mb-1.5 text-xs text-dim">Unidades baratas de la comp que sirven desde el principio.</p>
          <div className="flex flex-wrap gap-1.5">
            {early.map((u) => {
              const unit = catalog.units[u.id];
              return unit ? <TftUnitIcon key={u.id} unit={unit} size={30} /> : null;
            })}
          </div>
        </section>
      )}

      {traits.length > 0 && (
        <section>
          <GuideHeading>Rasgos a activar</GuideHeading>
          <ul className="flex flex-wrap gap-x-3 gap-y-1.5">
            {traits.map(({ trait, style, min }) => (
              <li key={trait!.id} className="flex items-center gap-1.5 text-xs text-muted">
                <TraitBadge trait={trait!} style={style} size={18} />
                {trait!.name}
                {min && <span className="text-ink tabular-nums">{min}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {comp.flex.length > 0 && (
        <section>
          <GuideHeading>Si no salen, alternativas</GuideHeading>
          <div className="flex flex-wrap gap-1.5">
            {comp.flex.map((u) => {
              const unit = catalog.units[u.id];
              return unit ? <TftUnitIcon key={u.id} unit={unit} size={30} /> : null;
            })}
          </div>
        </section>
      )}
    </div>
  );
}

/* ---------- Tablero con la ubicación base ---------- */

const HEX = "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)";

/**
 * Minimapa hexagonal de 4 x 7. La fila de arriba es la que da al rival; las
 * filas impares van corridas medio hexágono, como en el juego.
 */
export function CompBoard({ comp, catalog, size = 38 }: { comp: CompView; catalog: CatalogLite; size?: number }) {
  const itemized = new Set(comp.core.filter((u) => u.items.length > 0).map((u) => u.id));
  const slots = suggestPositions(
    comp.core.map((u) => u.id),
    catalog.units,
    comp.carry,
    itemized,
  );
  const at = new Map(slots.map((sl) => [`${sl.row}:${sl.col}`, sl.id]));
  const height = Math.round(size * 1.155);
  const gap = 3;

  return (
    <figure>
      <p className="mb-1 text-center text-[11px] text-dim">Hacia el rival</p>
      <div className="mx-auto" style={{ width: BOARD_COLS * (size + gap) + size / 2 }}>
        {Array.from({ length: BOARD_ROWS }, (_, row) => (
          <div
            key={row}
            className="flex"
            style={{ gap, marginLeft: row % 2 ? size / 2 + gap / 2 : 0, marginTop: row ? -height / 4 + gap : 0 }}
          >
            {Array.from({ length: BOARD_COLS }, (_, col) => {
              const id = at.get(`${row}:${col}`);
              const unit = id ? catalog.units[id] : undefined;
              return (
                <span
                  key={col}
                  className="relative shrink-0"
                  style={{
                    width: size,
                    height,
                    clipPath: HEX,
                    background: unit ? (COST_COLOR[unit.cost] ?? COST_COLOR[1]) : "var(--color-raised)",
                  }}
                  title={unit ? `${unit.name}${unit.id === comp.carry ? " (carry)" : ""}` : undefined}
                >
                  {unit && (
                    <img
                      src={unit.icon}
                      alt={unit.name}
                      loading="lazy"
                      className="absolute object-cover"
                      style={{ inset: 2, width: size - 4, height: height - 4, clipPath: HEX }}
                    />
                  )}
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <figcaption className="mt-2 text-center text-[11px] text-dim">
        Ubicación base: tanques adelante, carry en una esquina de atrás. Pasa el mouse sobre una casilla para ver la unidad.
      </figcaption>
    </figure>
  );
}
