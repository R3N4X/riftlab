import type { Metadata } from "next";
import { Suspense } from "react";
import { STYLE_LABEL, TftTabs, TftUnitIcon, TraitBadge } from "@/components/tft";
import { PageHeader, Skeleton } from "@/components/ui";
import { getTftCatalog, getTftDataset } from "@/lib/tft/data";

export const metadata: Metadata = { title: "TFT · Rasgos" };

export default function TftTraitsPage() {
  return (
    <>
      <PageHeader title="Teamfight Tactics">Los rasgos del set: cuántas unidades piden en cada nivel y quiénes los tienen.</PageHeader>
      <TftTabs current="/tft/rasgos" />
      <Suspense fallback={<Skeleton rows={10} />}>
        <TraitsContent />
      </Suspense>
    </>
  );
}

async function TraitsContent() {
  const ds = await getTftDataset();
  const catalog = await getTftCatalog(ds?.set);
  // Primero los rasgos con varias unidades; los únicos (de un solo campeón) al final.
  const traits = Object.values(catalog.traits).sort((a, b) => Number(a.units.length === 1) - Number(b.units.length === 1) || a.name.localeCompare(b.name, "es"));

  return (
    <ul className="grid gap-3 px-4 py-6 sm:px-8 lg:grid-cols-2">
      {traits.map((trait) => (
        <li key={trait.id} className="rounded-lg border border-line bg-surface p-4">
          <div className="flex items-center gap-3">
            <TraitBadge trait={trait} style={trait.breakpoints.at(-1)?.style ?? 1} size={34} />
            <h2 className="font-display text-xl font-semibold">{trait.name}</h2>
            <ol className="ml-auto flex gap-1">
              {trait.breakpoints.map((b) => (
                <li key={b.min}>
                  <TraitBadge trait={trait} style={b.style} size={20} count={b.min} />
                  <span className="sr-only">{STYLE_LABEL[b.style]}</span>
                </li>
              ))}
            </ol>
          </div>
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {trait.units.map((id) => {
              const unit = catalog.units[id];
              return unit ? (
                <li key={id}>
                  <TftUnitIcon unit={unit} size={36} />
                </li>
              ) : null;
            })}
          </ul>
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-muted hover:text-ink">Qué hace</summary>
            <p className="mt-1 whitespace-pre-line text-dim">{trait.desc}</p>
          </details>
        </li>
      ))}
    </ul>
  );
}
