"use client";

import { useId, useState } from "react";

/**
 * Pestañas de la columna izquierda (Recomendaciones / Emparejamiento): una a la vez para que la
 * selección entre en pantalla. Los paneles llegan ya renderizados desde el servidor.
 */
export function PanelTabs({ tabs }: { tabs: { label: string; panel: React.ReactNode }[] }) {
  const [active, setActive] = useState(0);
  const id = useId();
  if (tabs.length === 1) {
    return (
      <section className="rounded-lg border border-line bg-surface">
        <h2 className="border-b border-line px-3 py-2 font-display text-base font-semibold text-gold-soft">{tabs[0].label}</h2>
        <div className="p-3">{tabs[0].panel}</div>
      </section>
    );
  }
  return (
    <div className="rounded-lg border border-line bg-surface">
      <div role="tablist" aria-label="Panel" className="grid border-b border-line" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map((t, i) => (
          <button
            key={t.label}
            type="button"
            role="tab"
            id={`${id}-tab-${i}`}
            aria-selected={active === i}
            aria-controls={`${id}-panel`}
            onClick={() => setActive(i)}
            className={`border-b-2 px-3 py-2 font-display text-base font-semibold transition-colors ${
              active === i ? "border-gold text-gold-soft" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${active}`} className="p-3">
        {tabs[active]?.panel}
      </div>
    </div>
  );
}
