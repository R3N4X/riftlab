"use client";

/*
 * Modo partida de TFT: lo que conviene tener a mano mientras se juega. Es
 * información fija (comps fijadas, recetas, rasgos); no lee el tablero ni
 * cambia según lo que pasa en la partida, como piden las reglas de Riot.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import { TftUnitIcon, TraitBadge } from "@/components/tft";
import { OverlayButton } from "@/components/tft-client";
import { CompGuide, CompSummary, type CatalogLite } from "@/components/tft-comp";
import { RecipeGrid } from "@/components/tft-recipes";
import { usePinnedComps } from "@/lib/preferences";
import type { CompView } from "@/lib/tft/meta";

const TABS = [
  { id: "comps", label: "Mis comps" },
  { id: "recetas", label: "Recetas" },
  { id: "rasgos", label: "Rasgos" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export function GameMode({ set, comps, catalog, floating }: { set: number; comps: CompView[]; catalog: CatalogLite; floating: boolean }) {
  const [tab, setTab] = useState<Tab>("comps");
  return (
    <div className={floating ? "fixed inset-x-0 top-[var(--titlebar-h)] bottom-0 z-50 overflow-y-auto bg-night" : "px-4 py-6 sm:px-8"}>
      <div
        className={`sticky top-0 z-10 flex items-center gap-1 border-b border-line bg-night/95 backdrop-blur ${floating ? "px-2" : "mb-4"}`}
        role="tablist"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-3 py-2.5 text-sm transition-colors ${
              tab === t.id ? "border-gold text-gold-soft" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
        {!floating && (
          <span className="ml-auto pb-1.5">
            <OverlayButton />
          </span>
        )}
      </div>
      <div className={floating ? "p-2" : ""} role="tabpanel">
        {tab === "comps" && <PinnedComps set={set} comps={comps} catalog={catalog} floating={floating} />}
        {tab === "recetas" && <RecipeGrid items={catalog.items} size={floating ? 26 : 34} />}
        {tab === "rasgos" && <TraitList catalog={catalog} floating={floating} />}
      </div>
    </div>
  );
}

function PinnedComps({ set, comps, catalog, floating }: { set: number; comps: CompView[]; catalog: CatalogLite; floating: boolean }) {
  const pins = usePinnedComps();
  const pinned = comps.filter((c) => pins.includes(c.key));
  const shown = pinned.length ? pinned : comps.slice(0, 6);
  return (
    <>
      {!pinned.length && (
        <p className="mb-2 text-sm text-muted">
          {comps.length
            ? "Aún no fijas comps. Estas son las mejores del parche; fija las que vayas a jugar con la estrella."
            : "Todavía no hay comps calculadas."}{" "}
          {!floating && (
            <Link href="/tft" className="text-gold-soft underline-offset-2 hover:underline">
              Ver todas
            </Link>
          )}
        </p>
      )}
      <ul className={`divide-y divide-line/60 rounded-lg border border-line bg-surface ${floating ? "" : "max-w-5xl"}`}>
        {shown.map((comp, i) => (
          <CompWithGuide
            key={comp.key}
            comp={comp}
            catalog={catalog}
            set={set}
            floating={floating}
            defaultOpen={pinned.length > 0 && i === 0}
          />
        ))}
      </ul>
    </>
  );
}

/** Comp con su guía desplegable (la primera fijada viene abierta). */
function CompWithGuide({
  comp,
  catalog,
  set,
  floating,
  defaultOpen,
}: {
  comp: CompView;
  catalog: CatalogLite;
  set: number;
  floating: boolean;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <li>
      <CompSummary comp={comp} catalog={catalog} set={set} compact={floating} />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-center gap-1.5 border-t border-line/60 py-1.5 text-xs text-gold-soft hover:bg-raised/60"
      >
        {open ? "Ocultar guía" : "Ver guía: niveles, componentes y objetos"}
        <svg viewBox="0 0 12 12" className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true">
          <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      {open && <CompGuide comp={comp} catalog={catalog} />}
    </li>
  );
}

function TraitList({ catalog, floating }: { catalog: CatalogLite; floating: boolean }) {
  const [query, setQuery] = useState("");
  const traits = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.values(catalog.traits)
      .filter((t) => t.units.length > 1)
      .filter((t) => !q || t.name.toLowerCase().includes(q) || t.units.some((u) => catalog.units[u]?.name.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [catalog, query]);
  return (
    <>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar rasgo o campeón"
        aria-label="Buscar rasgo o campeón"
        className="mb-2 h-9 w-full max-w-sm rounded-md border border-line bg-surface px-3 text-sm outline-none placeholder:text-dim focus:border-gold"
      />
      <ul className={`grid gap-1.5 ${floating ? "" : "md:grid-cols-2 xl:grid-cols-3"}`}>
        {traits.map((trait) => (
          <li key={trait.id} className="rounded-md border border-line bg-surface px-2.5 py-2">
            <div className="flex items-center gap-2">
              <TraitBadge trait={trait} style={trait.breakpoints.at(-1)?.style ?? 1} size={20} />
              <span className="font-semibold">{trait.name}</span>
              <span className="ml-auto text-xs text-muted tabular-nums">{trait.breakpoints.map((b) => b.min).join(" · ")}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {trait.units.map((id) => {
                const unit = catalog.units[id];
                return unit ? <TftUnitIcon key={id} unit={unit} size={26} /> : null;
              })}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
