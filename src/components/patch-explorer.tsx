"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ROLE_LABEL } from "@/lib/constants";
import type { ChangeEntry, ChangeKind, Verdict } from "@/lib/patch-changes";
import { VERDICT } from "@/lib/patch-verdict";
import { TierBadge } from "./icons";


const KINDS: { id: ChangeKind | "all"; label: string }[] = [
  { id: "all", label: "Todo" },
  { id: "champion", label: "Campeones" },
  { id: "item", label: "Objetos" },
  { id: "other", label: "Modos y sistemas" },
];

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export function PatchExplorer({ changes }: { changes: ChangeEntry[] }) {
  const [kind, setKind] = useState<ChangeKind | "all">("all");
  const [verdicts, setVerdicts] = useState<Set<Verdict>>(new Set());
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const base = changes.filter((c) => kind === "all" || c.kind === kind);
    return Object.fromEntries((Object.keys(VERDICT) as Verdict[]).map((v) => [v, base.filter((c) => c.verdict === v).length])) as Record<Verdict, number>;
  }, [changes, kind]);

  const visible = useMemo(() => {
    const q = normalize(query.trim());
    return changes.filter(
      (c) => (kind === "all" || c.kind === kind) && (!verdicts.size || verdicts.has(c.verdict)) && (!q || normalize(c.name).includes(q)),
    );
  }, [changes, kind, verdicts, query]);

  const toggleVerdict = (v: Verdict) =>
    setVerdicts((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="flex flex-wrap gap-1 rounded-lg border border-line bg-surface p-1" role="tablist" aria-label="Tipo de cambio">
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              role="tab"
              aria-selected={kind === k.id}
              onClick={() => setKind(k.id)}
              className={`rounded-md px-3 py-1.5 text-sm ${kind === k.id ? "bg-raised text-ink" : "text-muted hover:text-ink"}`}
            >
              {k.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(VERDICT) as Verdict[])
            .filter((v) => counts[v] > 0)
            .map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={verdicts.has(v)}
                onClick={() => toggleVerdict(v)}
                className={`rounded-full border px-3 py-1 text-sm ${
                  verdicts.has(v) ? `border-transparent ${VERDICT[v].badge}` : "border-line text-muted hover:text-ink"
                }`}
              >
                {VERDICT[v].plural} <span className="opacity-70">{counts[v]}</span>
              </button>
            ))}
        </div>
        <label className="sr-only" htmlFor="patch-search">
          Buscar en los cambios
        </label>
        <input
          id="patch-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar campeón u objeto"
          className="h-9 rounded-md border border-line bg-surface px-3 text-sm outline-none placeholder:text-dim focus:border-gold xl:ml-auto xl:w-64"
        />
      </div>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-line bg-surface p-6 text-muted">Ningún cambio coincide con estos filtros. Quita alguno para ver más.</p>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {visible.map((c) => (
            <ChangeCard key={c.key} change={c} />
          ))}
        </ul>
      )}
    </div>
  );
}

const PREVIEW = 4;

function ChangeCard({ change: c }: { change: ChangeEntry }) {
  const [expanded, setExpanded] = useState(false);
  const lines = c.groups.flatMap((g) => g.changes.map((ch, i) => ({ group: i === 0 ? g.title : null, icon: i === 0 ? g.icon : null, ch })));
  const shown = expanded ? lines : lines.slice(0, PREVIEW);
  const hidden = lines.length - shown.length;

  const title = (
    <span className="truncate font-display text-xl font-semibold">{c.name}</span>
  );

  return (
    <li className="flex flex-col rounded-lg border border-line bg-surface">
      <div className="flex items-start gap-3 border-b border-line/60 p-4">
        {c.icon ? (
          <img src={c.icon} alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-md bg-raised object-cover" />
        ) : (
          <span className="h-12 w-12 shrink-0 rounded-md bg-raised" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {c.href ? (
              <Link href={c.href} className="min-w-0 hover:text-gold-soft">
                {title}
              </Link>
            ) : (
              title
            )}
            <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${VERDICT[c.verdict].badge}`}>{VERDICT[c.verdict].label}</span>
          </div>
          {c.current ? (
            <p className="mt-1 flex items-center gap-2 text-xs text-muted">
              Hoy: <TierBadge tier={c.current.tier} className="h-5 min-w-6 text-xs" /> {(c.current.winRate * 100).toFixed(1)}% de victorias como{" "}
              {ROLE_LABEL[c.current.role].toLowerCase()}
            </p>
          ) : c.section ? (
            <p className="mt-1 text-xs text-muted">{c.section}</p>
          ) : null}
        </div>
      </div>

      <div className="flex-1 space-y-2 p-4 text-sm">
        {c.context && c.groups.length === 0 && <p className="text-muted">{c.context}</p>}
        {shown.map(({ group, icon, ch }, i) => (
          <div key={i}>
            {group && (
              <p className="mt-1 mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted">
                {icon && <img src={icon} alt="" width={18} height={18} className="h-[18px] w-[18px] rounded" />}
                {group}
              </p>
            )}
            {ch.after ? (
              <p>
                {ch.label && <span className="text-muted">{ch.label}: </span>}
                <span className="text-dim line-through decoration-dim/50">{ch.before}</span>
                <span className="mx-1.5 text-gold">⇒</span>
                <span className="text-ink">{ch.after}</span>
              </p>
            ) : (
              <p className="text-muted">{ch.text}</p>
            )}
          </div>
        ))}
        {hidden > 0 && (
          <button type="button" onClick={() => setExpanded(true)} className="text-xs text-gold-soft hover:underline">
            Ver {hidden} {hidden === 1 ? "cambio más" : "cambios más"}
          </button>
        )}

        {c.detected.length > 0 && (
          <div className="mt-2 rounded-md bg-raised/50 p-2.5">
            <p className="mb-1 text-xs font-semibold text-muted">{c.groups.length ? "También detectado en los datos" : "Detectado en los datos del juego"}</p>
            <ul className="space-y-0.5 text-xs">
              {c.detected.map((d) => {
                const better = d.stat === "Costo total" ? d.after < d.before : d.after > d.before;
                return (
                  <li key={d.stat} className="text-muted">
                    {d.stat}: {d.before} <span className="text-dim">⇒</span> <span className={better ? "text-win" : "text-loss"}>{d.after}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {c.context && c.groups.length > 0 && (
        <details className="border-t border-line/60 px-4 py-2.5 text-sm">
          <summary className="cursor-pointer text-xs text-muted hover:text-ink">Por qué lo cambiaron</summary>
          <p className="mt-2 text-muted italic">{c.context}</p>
        </details>
      )}
    </li>
  );
}
