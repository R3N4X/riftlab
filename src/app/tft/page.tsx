import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Expandable } from "@/components/expandable";
import { TftTabs } from "@/components/tft";
import { CompDetails, CompSummary } from "@/components/tft-comp";
import { TftDataNote } from "@/components/tft-note";
import { PageHeader, Skeleton } from "@/components/ui";
import { getTftCatalog } from "@/lib/tft/data";
import { parseString } from "@/lib/params";
import { getTftMeta, type CompDifficulty } from "@/lib/tft/meta";

export const metadata: Metadata = { title: "TFT · Comps" };

/** Valor del filtro en la URL (?dificultad=facil) → nivel de dificultad de la comp. */
const DIFFICULTY_FILTERS: { id: string; level: CompDifficulty["level"] | null; label: string; dot: string }[] = [
  { id: "todas", level: null, label: "Todas", dot: "" },
  { id: "facil", level: "Fácil", label: "Fáciles", dot: "bg-win" },
  { id: "media", level: "Media", label: "Medias", dot: "bg-gold" },
  { id: "dificil", level: "Difícil", label: "Difíciles", dot: "bg-loss" },
];

export default function TftCompsPage({ searchParams }: PageProps<"/tft">) {
  return (
    <>
      <PageHeader title="Teamfight Tactics">
        Las comps que mejor les van a los jugadores de Retador, Gran Maestro y Maestro en este parche. Fija las que quieras jugar y las
        tendrás a mano en Modo partida.
      </PageHeader>
      <TftTabs current="/tft" />
      <Suspense fallback={<Skeleton rows={10} />}>
        <CompsContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function CompsContent({ searchParams }: { searchParams: PageProps<"/tft">["searchParams"] }) {
  const sp = await searchParams;
  const filter = DIFFICULTY_FILTERS.find((f) => f.id === parseString(sp, "dificultad")) ?? DIFFICULTY_FILTERS[0];
  const meta = await getTftMeta();
  const catalog = await getTftCatalog(meta?.set);
  const comps = (meta?.comps ?? []).filter((c) => !filter.level || c.difficulty.level === filter.level);
  return (
    <div className="px-4 py-6 sm:px-8">
      <TftDataNote meta={meta} />
      {meta && meta.comps.length > 0 && (
        <>
          <div className="mb-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <p className="text-sm text-dim">
              Ordenadas por colocación promedio (1 es ganar, 4.5 es el promedio de la partida). La nota compara cada comp con las demás del
              parche.
            </p>
            <nav aria-label="Filtrar por dificultad" className="flex shrink-0 gap-1 rounded-lg border border-line bg-surface p-1">
              {DIFFICULTY_FILTERS.map((f) => {
                const count = f.level ? meta.comps.filter((c) => c.difficulty.level === f.level).length : meta.comps.length;
                const active = f.id === filter.id;
                return (
                  <Link
                    key={f.id}
                    href={f.level ? `/tft?dificultad=${f.id}` : "/tft"}
                    scroll={false}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm ${active ? "bg-raised text-ink" : "text-muted hover:text-ink"}`}
                  >
                    {f.dot && <span className={`h-2 w-2 rounded-full ${f.dot}`} aria-hidden="true" />}
                    {f.label}
                    <span className="text-xs text-dim">{count}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
          {comps.length === 0 && (
            <p className="rounded-lg border border-line bg-surface px-4 py-6 text-center text-sm text-muted">
              No hay comps {filter.label.toLowerCase()} en este parche con suficientes partidas.
            </p>
          )}
          {comps.length > 0 && (
            <ul className="divide-y divide-line/60 overflow-hidden rounded-lg border border-line bg-surface">
              {comps.map((comp) => (
                <Expandable
                  key={comp.key}
                  label={comp.name}
                  summary={<CompSummary comp={comp} catalog={catalog} set={meta.set} />}
                  details={<CompDetails comp={comp} catalog={catalog} />}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
