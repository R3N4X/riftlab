"use client";

import { useId, useState } from "react";

/**
 * Pestañas Top 1 / 2 / 3 de las builds: se ve una a la vez para que la
 * selección de campeones entre completa en pantalla, sin scroll. Los paneles
 * llegan ya renderizados desde el servidor.
 */
export function PackTabs({ tabs }: { tabs: { label: string; hint: string; panel: React.ReactNode }[] }) {
  const [active, setActive] = useState(0);
  const id = useId();
  return (
    <div>
      <div role="tablist" aria-label="Builds" className="mb-3 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map((t, i) => (
          <button
            key={t.label}
            type="button"
            role="tab"
            id={`${id}-tab-${i}`}
            aria-selected={active === i}
            aria-controls={`${id}-panel`}
            onClick={() => setActive(i)}
            className={`rounded-md border px-2 py-1.5 text-center transition-colors ${
              active === i ? "border-gold bg-gold/15 text-gold-soft" : "border-line text-muted hover:border-gold/50 hover:text-ink"
            }`}
          >
            <span className="block font-display text-base leading-tight font-bold">{t.label}</span>
            <span className="block text-[11px] text-dim">{t.hint}</span>
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${active}`}>
        {tabs[active]?.panel}
      </div>
    </div>
  );
}
