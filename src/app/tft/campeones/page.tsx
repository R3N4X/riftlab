import type { Metadata } from "next";
import { Suspense } from "react";
import { PlaceValue, TftItemIcon, TftTabs, TftUnitIcon, TraitBadge } from "@/components/tft";
import { PageHeader, Skeleton } from "@/components/ui";
import { pct } from "@/lib/format";
import { getTftCatalog, getTftDataset } from "@/lib/tft/data";
import { getTftUnitStats } from "@/lib/tft/meta";

export const metadata: Metadata = { title: "TFT · Campeones" };

export default function TftUnitsPage() {
  return (
    <>
      <PageHeader title="Teamfight Tactics">Cada campeón del set, su habilidad y los objetos que más le arman en alto elo.</PageHeader>
      <TftTabs current="/tft/campeones" />
      <Suspense fallback={<Skeleton rows={10} />}>
        <UnitsContent />
      </Suspense>
    </>
  );
}

async function UnitsContent() {
  const ds = await getTftDataset();
  const [catalog, stats] = await Promise.all([getTftCatalog(ds?.set), getTftUnitStats()]);
  const units = Object.values(catalog.units);
  const costs = [...new Set(units.map((u) => u.cost))].sort((a, b) => a - b);

  return (
    <div className="space-y-8 px-4 py-6 sm:px-8">
      {costs.map((cost) => (
        <section key={cost}>
          <h2 className="mb-3 font-display text-2xl font-semibold">
            {cost} de oro <span className="text-base font-normal text-dim">· {units.filter((u) => u.cost === cost).length}</span>
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {units
              .filter((u) => u.cost === cost)
              .sort((a, b) => (stats[a.id]?.avgPlace || 9) - (stats[b.id]?.avgPlace || 9) || a.name.localeCompare(b.name, "es"))
              .map((unit) => {
                const s = stats[unit.id];
                return (
                  <li key={unit.id} className="rounded-lg border border-line bg-surface p-3">
                    <div className="flex items-start gap-3">
                      <TftUnitIcon unit={unit} size={52} />
                      <div className="min-w-0 flex-1">
                        <p className="font-display text-lg leading-tight font-semibold">{unit.name}</p>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                          {unit.traits.map((t) => {
                            const trait = catalog.traits[t];
                            return trait ? (
                              <span key={t} className="flex items-center gap-1 text-xs text-muted">
                                <TraitBadge trait={trait} style={0} size={18} />
                                {trait.name}
                              </span>
                            ) : null;
                          })}
                        </div>
                      </div>
                      {s && (
                        <dl className="shrink-0 text-right text-sm">
                          <dt className="sr-only">Colocación promedio</dt>
                          <dd className="font-semibold">
                            <PlaceValue value={s.avgPlace} />
                          </dd>
                          <dt className="sr-only">Top 4</dt>
                          <dd className="text-xs text-muted">Top 4 {pct(s.top4, 0)}</dd>
                        </dl>
                      )}
                    </div>
                    <details className="mt-2 text-sm">
                      <summary className="cursor-pointer text-muted hover:text-ink">{unit.ability.name}</summary>
                      <p className="mt-1 whitespace-pre-line text-dim">{unit.ability.desc}</p>
                      {/\bX\b/.test(unit.ability.desc) && (
                        <p className="mt-1 text-xs text-dim/80">X: valor que el juego calcula según las estrellas y estadísticas.</p>
                      )}
                    </details>
                    {s && s.items.length > 0 && (
                      <div className="mt-2 border-t border-line/60 pt-2">
                        <p className="mb-1.5 text-xs text-dim">Objetos más armados</p>
                        <ul className="flex flex-wrap gap-2">
                          {s.items.map((it) => {
                            const item = catalog.items[it.id];
                            return item ? (
                              <li key={it.id} className="flex flex-col items-center text-[11px]" title={`${item.name}: ${it.games} partidas`}>
                                <TftItemIcon item={item} size={28} />
                                <PlaceValue value={it.avgPlace} />
                              </li>
                            ) : null;
                          })}
                        </ul>
                      </div>
                    )}
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </div>
  );
}
