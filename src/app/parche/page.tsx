import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PatchExplorer } from "@/components/patch-explorer";
import { Section, Skeleton } from "@/components/ui";
import { dateLabel } from "@/lib/format";
import { getPatchOverview, type ChangeEntry } from "@/lib/patch-changes";
import { VERDICT } from "@/lib/patch-verdict";

export const metadata: Metadata = { title: "Parche" };

export default function PatchPage() {
  return (
    <Suspense fallback={<Skeleton rows={12} />}>
      <PatchContent />
    </Suspense>
  );
}

async function PatchContent() {
  const { patch, note, changes, others } = await getPatchOverview();
  const champs = changes.filter((c) => c.kind === "champion");
  const count = (list: ChangeEntry[], v: ChangeEntry["verdict"]) => list.filter((c) => c.verdict === v).length;

  return (
    <>
      {/* Portada: el parche en números, no una imagen gigante */}
      <section className="relative isolate overflow-hidden border-b border-line">
        {note?.banner && (
          <img
            src={note.banner}
            alt=""
            className="absolute inset-y-0 right-0 -z-10 h-full w-full object-cover opacity-40 [mask-image:linear-gradient(to_right,transparent,black_55%)] lg:w-3/5"
          />
        )}
        <div className="px-4 py-10 sm:px-8">
          <p className="text-sm text-muted">{note ? dateLabel(note.date) : "Parche actual"}</p>
          <h1 className="mt-1 font-display text-6xl leading-none font-bold tracking-tight">Parche {patch}</h1>

          <dl className="mt-6 flex flex-wrap gap-3">
            <Stat label="Campeones mejorados" value={count(champs, "buff")} tone="text-win" />
            <Stat label="Campeones debilitados" value={count(champs, "nerf")} tone="text-loss" />
            <Stat label="Campeones ajustados" value={count(champs, "adjust") + count(champs, "new")} tone="text-gold-soft" />
            <Stat label="Objetos con cambios" value={changes.filter((c) => c.kind === "item").length} tone="text-ink" />
          </dl>

          {note && (
            <div className="mt-6 flex flex-wrap gap-2 text-sm">
              <Link href={`/parche/${note.slug}`} className="rounded-md bg-gold px-4 py-2 font-semibold text-night hover:bg-gold-soft">
                Leer las notas completas
              </Link>
              <a href={note.url} target="_blank" rel="noreferrer" className="rounded-md border border-line px-4 py-2 text-muted hover:border-gold hover:text-ink">
                Ver en leagueoflegends.com
              </a>
            </div>
          )}
        </div>
      </section>

      <div className="space-y-12 px-4 py-8 sm:px-8">
        <Section title="Todos los cambios" aside={`${changes.length} en total`}>
          <p className="-mt-1 mb-4 max-w-3xl text-sm text-muted">
            Las notas oficiales y los ajustes que encontramos comparando los datos del juego con el parche anterior. La etiqueta (
            {Object.values(VERDICT)
              .slice(0, 3)
              .map((v) => v.label.toLowerCase())
              .join(", ")}
            ) sale de comparar los números de antes y después.
          </p>
          <PatchExplorer changes={changes} />
        </Section>

        {others.length > 0 && (
          <Section title="Notas anteriores">
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {others.slice(0, 8).map((n) => (
                <li key={n.slug}>
                  <Link href={`/parche/${n.slug}`} className="group flex gap-3 rounded-lg border border-line bg-surface p-2 hover:border-gold/50">
                    {n.image && <img src={n.image} alt="" loading="lazy" className="aspect-video w-28 shrink-0 rounded object-cover" />}
                    <span className="min-w-0 self-center">
                      <span className="line-clamp-2 font-semibold group-hover:text-gold-soft">{n.title.replace(/ de League of Legends$/i, "")}</span>
                      <span className="text-xs text-dim">{dateLabel(n.date)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="flex min-w-36 flex-col-reverse rounded-lg border border-line bg-night/70 px-4 py-3 backdrop-blur">
      <dt className="mt-1 text-sm text-muted">{label}</dt>
      <dd className={`font-display text-4xl leading-none font-bold ${tone}`}>{value}</dd>
    </div>
  );
}
