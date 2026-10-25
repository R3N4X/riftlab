"use client";

/**
 * Botón Actualizar del perfil: vuelve a pedir el perfil al servidor sin recargar la página,
 * muestra que está trabajando y, al terminar, qué cambió (partidas nuevas y LP).
 */
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

interface Snapshot {
  ids: string[];
  lp: number | null;
  renderedAt: number;
}

interface Notice {
  text: string;
  good: boolean;
}

export function RefreshProfile({ matchIds, lp, renderedAt }: { matchIds: string[]; lp: number | null; renderedAt: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [before, setBefore] = useState<Snapshot | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [now, setNow] = useState(renderedAt);

  // Llegó el perfil nuevo (cambia la hora en que se armó): se compara con lo que había.
  if (before && !pending && renderedAt !== before.renderedAt) {
    setBefore(null);
    setNow(renderedAt);
    setNotice(describe(before, matchIds, lp));
  }

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  const refresh = () => {
    setNotice(null);
    setBefore({ ids: matchIds, lp, renderedAt });
    start(() => router.refresh());
  };

  const busy = pending || before !== null;
  return (
    <div className="flex w-fit flex-col items-start gap-1.5 md:items-end">
      <button
        type="button"
        onClick={refresh}
        disabled={busy}
        aria-busy={busy}
        className="inline-flex items-center gap-2 rounded-md border border-line px-4 py-2 text-sm text-muted transition-colors hover:border-gold hover:text-ink disabled:cursor-wait disabled:border-gold/50 disabled:text-gold-soft"
      >
        <svg
          viewBox="0 0 20 20"
          width={16}
          height={16}
          aria-hidden="true"
          className={busy ? "animate-spin motion-reduce:animate-none" : ""}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M16.5 10a6.5 6.5 0 1 1-1.9-4.6" />
          <path d="M16.5 3.5v3.2h-3.2" />
        </svg>
        {busy ? "Actualizando…" : "Actualizar"}
      </button>
      <p role="status" aria-live="polite" className="min-h-4 text-xs">
        {notice ? (
          <span className={notice.good ? "text-win" : "text-muted"}>{notice.text}</span>
        ) : busy ? (
          <span className="text-dim">Buscando partidas nuevas…</span>
        ) : (
          <span className="text-dim">Actualizado {ago(now - renderedAt)}</span>
        )}
      </p>
    </div>
  );
}

function describe(before: Snapshot, ids: string[], lp: number | null): Notice {
  const idx = before.ids.length ? ids.indexOf(before.ids[0]) : ids.length;
  const fresh = idx === -1 ? ids.length : idx;
  const lpDiff = before.lp !== null && lp !== null ? lp - before.lp : 0;
  const parts: string[] = [];
  if (fresh > 0) parts.push(fresh === 1 ? "1 partida nueva" : `${fresh}${idx === -1 ? "+" : ""} partidas nuevas`);
  if (lpDiff) parts.push(`${lpDiff > 0 ? "+" : ""}${lpDiff} LP`);
  return parts.length ? { text: `Listo: ${parts.join(", ")}`, good: true } : { text: "Listo: no hay partidas nuevas", good: false };
}

function ago(ms: number): string {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  return `hace ${Math.floor(min / 60)} h`;
}

/** Cuenta regresiva que vuelve a pedir el perfil sola (tras un límite de la API), con botón para no esperar. */
export function AutoRetry({ seconds, what = "el perfil" }: { seconds: number; what?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [left, setLeft] = useState(seconds);

  useEffect(() => {
    const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (left === 0) start(() => router.refresh());
  }, [left, router]);

  const retry = () => start(() => router.refresh());
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={retry}
        disabled={pending}
        className="rounded-md border border-line px-3 py-1.5 text-ink hover:border-gold disabled:cursor-wait disabled:text-gold-soft"
      >
        {pending ? "Reintentando…" : "Reintentar ahora"}
      </button>
      <span role="status" aria-live="polite" className="text-xs text-dim">
        {pending || left === 0 ? `Volviendo a pedir ${what}…` : `Se reintenta solo en ${left} s`}
      </span>
    </div>
  );
}
