import type { Metadata } from "next";
import { Suspense } from "react";
import { PlaceValue, TftItemIcon, TftTabs } from "@/components/tft";
import { RecipeGrid } from "@/components/tft-recipes";
import { PageHeader, Section, Skeleton } from "@/components/ui";
import { num } from "@/lib/format";
import { avgPlace, getTftCatalog, getTftDataset, type TftItem } from "@/lib/tft/data";
import { getTftItemStats } from "@/lib/tft/meta";

export const metadata: Metadata = { title: "TFT · Objetos" };

export default function TftItemsPage() {
  return (
    <>
      <PageHeader title="Teamfight Tactics">Qué se arma con cada par de componentes y cómo le va a cada objeto en alto elo.</PageHeader>
      <TftTabs current="/tft/objetos" />
      <Suspense fallback={<Skeleton rows={10} />}>
        <ItemsContent />
      </Suspense>
    </>
  );
}

async function ItemsContent() {
  const ds = await getTftDataset();
  const [catalog, stats] = await Promise.all([getTftCatalog(ds?.set), getTftItemStats()]);
  const recipeItems = Object.fromEntries(
    Object.entries(catalog.items).filter(([, i]) => i.kind === "component" || i.kind === "combined" || i.kind === "emblem"),
  );
  const ranked = (kind: TftItem["kind"]) =>
    Object.values(catalog.items)
      .filter((i) => i.kind === kind)
      .map((item) => ({ item, stat: stats[item.id] }))
      .sort((a, b) => (a.stat ? avgPlace(a.stat) : 9) - (b.stat ? avgPlace(b.stat) : 9));

  return (
    <div className="space-y-10 px-4 py-6 sm:px-8">
      <Section title="Recetas">
        <p className="mb-3 text-sm text-dim">Cruza la fila con la columna: la Espátula y la Sartén arman emblemas.</p>
        <RecipeGrid items={recipeItems} size={34} />
      </Section>

      {(["combined", "emblem"] as const).map((kind) => (
        <Section key={kind} title={kind === "combined" ? "Objetos completos" : "Emblemas"} aside="colocación promedio de quien lo lleva">
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {ranked(kind).map(({ item, stat }) => (
              <li key={item.id} className="flex gap-3 rounded-lg border border-line bg-surface p-3">
                <TftItemIcon item={item} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate font-semibold">{item.name}</p>
                    {stat && (
                      <span className="shrink-0 text-sm" title={`${num(stat.games)} veces`}>
                        <PlaceValue value={avgPlace(stat)} />
                      </span>
                    )}
                  </div>
                  {item.from && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-dim">
                      {item.from.map((c, i) => {
                        const comp = catalog.items[c];
                        return comp ? (
                          <span key={`${c}-${i}`} className="flex items-center gap-1">
                            {i > 0 && "+"}
                            <TftItemIcon item={comp} size={16} />
                          </span>
                        ) : null;
                      })}
                    </p>
                  )}
                  <p className="mt-1 line-clamp-3 text-xs whitespace-pre-line text-muted" title={item.desc}>
                    {item.desc}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      ))}
    </div>
  );
}
