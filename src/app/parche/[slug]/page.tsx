import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui";
import { dateLabel } from "@/lib/format";
import { getPatchNote, type PatchBlock } from "@/lib/patchnotes";

export default function PatchNotePage({ params }: PageProps<"/parche/[slug]">) {
  return (
    <Suspense fallback={<Skeleton rows={14} />}>
      <PatchNoteContent params={params} />
    </Suspense>
  );
}

async function PatchNoteContent({ params }: Pick<PageProps<"/parche/[slug]">, "params">) {
  const { slug } = await params;
  const note = await getPatchNote(slug);
  if (!note) notFound();

  return (
    <article>
      <header className="relative isolate overflow-hidden border-b border-line">
        {note.banner && <img src={note.banner} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover opacity-30" />}
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-night via-night/80 to-night/40" />
        <div className="px-4 pt-16 pb-8 sm:px-8">
          <Link href="/parche" className="text-sm text-muted hover:text-ink">
            Todas las notas
          </Link>
          <h1 className="mt-2 font-display text-5xl font-bold tracking-tight">{note.title}</h1>
          <p className="mt-2 text-muted">
            {dateLabel(note.date)}. Fuente:{" "}
            <a href={note.url} target="_blank" rel="noreferrer" className="text-gold-soft underline-offset-4 hover:underline">
              leagueoflegends.com
            </a>
          </p>
        </div>
      </header>

      <div className="grid gap-8 px-4 py-8 sm:px-8 xl:grid-cols-[220px_minmax(0,1fr)]">
        {/* Índice de secciones */}
        <nav aria-label="Secciones" className="hidden xl:block">
          <ul className="sticky top-6 space-y-1 text-sm">
            {note.sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="block rounded px-2 py-1 text-muted hover:bg-surface hover:text-ink">
                  {s.title}
                  <span className="ml-1 text-dim">{s.blocks.length > 1 ? s.blocks.length : ""}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="max-w-4xl space-y-12">
          {note.intro.length > 0 && (
            <div className="space-y-3 text-lg text-muted">
              {note.intro.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          )}
          {note.sections.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-6">
              <h2 className="mb-4 border-b border-line pb-2 font-display text-3xl font-bold">{section.title}</h2>
              <div className="space-y-4">
                {section.blocks.map((block, i) => (
                  <ChangeBlock key={i} block={block} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </article>
  );
}

function ChangeBlock({ block }: { block: PatchBlock }) {
  const hasChanges = block.groups.some((g) => g.changes.length);
  return (
    <div className="rounded-lg border border-line bg-surface p-5">
      {block.title && (
        <div className="mb-3 flex items-center gap-3">
          {block.image && <img src={block.image} alt="" width={44} height={44} className="h-11 w-11 rounded-md object-cover" />}
          <h3 className="font-display text-2xl font-semibold">
            {block.championId ? (
              <Link href={`/campeones/${block.championId}`} className="hover:text-gold-soft">
                {block.title}
              </Link>
            ) : (
              block.title
            )}
          </h3>
        </div>
      )}
      {block.context && <p className="mb-4 border-l-2 border-gold/50 pl-4 text-sm text-muted italic">{block.context}</p>}
      {!block.title && block.paragraphs.map((p, i) => <p key={i} className="mb-2 text-muted">{p}</p>)}
      {block.images.slice(0, 1).map((src) => (
        <img key={src} src={src} alt="" loading="lazy" className="mb-3 w-full rounded-md" />
      ))}
      {hasChanges && (
        <div className="space-y-4">
          {block.groups.map((g, i) => (
            <div key={i}>
              {g.title && (
                <h4 className="mb-2 flex items-center gap-2 font-semibold">
                  {g.icon && <img src={g.icon} alt="" width={24} height={24} className="h-6 w-6 rounded" />}
                  {g.title}
                </h4>
              )}
              <ul className="space-y-1.5 text-sm">
                {g.changes.map((c, j) =>
                  c.after ? (
                    <li key={j} className="grid gap-x-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
                      <span className="text-ink">{c.label ?? "Cambio"}</span>
                      <span>
                        <span className="text-dim line-through decoration-dim/60">{c.before}</span>
                        <span className="mx-2 text-gold">⇒</span>
                        <span className="text-ink">{c.after}</span>
                      </span>
                    </li>
                  ) : (
                    <li key={j} className="text-muted">
                      {c.text}
                    </li>
                  ),
                )}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
