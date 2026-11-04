"use client";

import Link from "next/link";
import { useState } from "react";
import { ChampIcon } from "@/components/icons";
import { useIsDesktop, useLiveState } from "@/components/live-client";
import { formatScore, scoreClass, scoreOf } from "@/lib/draft-score";
import { pct } from "@/lib/format";
import type { ActionResult } from "@/lib/live";

export interface RecommendedPick {
  key: string;
  id: string;
  name: string;
  winRate: number;
  reasons: { text: string; delta: number }[];
  /** El puntaje se apoya en pocas partidas (del campeón en el rol o contra tu rival de línea). */
  fewGames: string | null;
}

/** Desde cuántos puntos de maestría un campeón cuenta como "tuyo". */
const MINE_POINTS = 20_000;
const MINE_COUNT = 5;
const DRAFT_COUNT = 10;

/**
 * Grilla de recomendaciones. Tocar un campeón lo deja en vista previa y, en la app de escritorio,
 * lo selecciona en el cliente sin fijarlo. Solo muestra campeones que puedes elegir (los tuyos, sin
 * bloqueados ni elegidos) y separa los que más juegas de los mejores para el draft.
 */
export function Recommendations({
  picks,
  roleLabel,
  shownKey,
  meKey,
  version,
  baseQuery,
}: {
  picks: RecommendedPick[];
  roleLabel: string;
  shownKey: string;
  meKey: string | null;
  version: string;
  baseQuery: string;
}) {
  const state = useLiveState();
  const isDesktop = useIsDesktop();
  const [result, setResult] = useState<ActionResult | null>(null);
  const cs = state?.champSelect;
  const pickable = cs?.pickable ? new Set(cs.pickable) : null;
  const mastery = state?.mastery ?? null;

  const available = picks.filter((p) => !pickable || pickable.has(Number(p.key)));
  const points = (key: string) => mastery?.[Number(key)] ?? 0;
  const mine = available.filter((p) => points(p.key) >= MINE_POINTS).slice(0, MINE_COUNT);
  const draft = available.filter((p) => !mine.includes(p)).slice(0, DRAFT_COUNT);
  const selected = available.find((p) => p.key === shownKey);
  const canHover = Boolean(isDesktop && cs && !cs.myTeam.find((p) => p.isMe)?.locked);

  const hover = async (key: string) => {
    if (!canHover) return;
    try {
      const r = await window.riftlab!.hoverChampion(Number(key));
      setResult(r.ok ? null : r);
    } catch {
      setResult({ ok: false, message: "No se pudo comunicar con el cliente de League." });
    }
  };

  const grid = (list: RecommendedPick[]) => (
    <ul className="grid max-w-sm grid-cols-5 gap-2">
      {list.map((p) => {
        const score = scoreOf(p.winRate);
        const ring = p.key === shownKey ? "ring-2 ring-gold" : p.key === meKey ? "ring-2 ring-hex/70" : "ring-1 ring-line";
        const own = points(p.key);
        return (
          <li key={p.key}>
            <Link
              href={`/en-vivo?${baseQuery}&ver=${p.key}`}
              scroll={false}
              onClick={() => void hover(p.key)}
              className="group block text-center"
              title={`${p.name}: ${pct(p.winRate)} esperado${own ? `, ${Math.round(own / 1000)}k de maestría` : ""}${p.reasons.length ? `. ${p.reasons.map((r) => r.text).join("; ")}` : ""}${p.fewGames ? `. ${p.fewGames}` : ""}`}
            >
              <span className={`relative mx-auto block w-fit overflow-hidden rounded-md ${ring} group-hover:ring-gold/70`}>
                <ChampIcon version={version} id={p.id} name={p.name} size={52} />
                {p.fewGames && <FewGamesMark />}
              </span>
              <span className={`mt-1 block font-display text-sm font-semibold ${scoreClass(score)} ${p.fewGames ? "opacity-70" : ""}`}>
                {formatScore(score)}
                {p.fewGames && <span className="text-dim">?</span>}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );

  if (!available.length) return <p className="text-sm text-muted">No hay picks de {roleLabel} disponibles para recomendar.</p>;
  return (
    <div className="space-y-3">
      <p className="text-xs text-dim">
        Picks de {roleLabel} según tus aliados y los rivales que ya eligieron.{" "}
        {canHover ? "Toca uno para compararlo y dejarlo seleccionado en el cliente (sin fijarlo)." : "Toca uno para compararlo."}
      </p>
      {mine.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-xs font-semibold text-gold-soft">Tus campeones</h3>
          {grid(mine)}
        </div>
      )}
      {draft.length > 0 && (
        <div>
          {mine.length > 0 && <h3 className="mb-1.5 text-xs font-semibold text-muted">Mejores para este draft</h3>}
          {grid(draft)}
        </div>
      )}
      {result && !result.ok && (
        <p aria-live="polite" className="text-xs text-loss">
          {result.message}
        </p>
      )}
      {available.some((p) => p.fewGames) && (
        <p className="text-[11px] text-dim">
          <span className="text-gold-soft">?</span> Pocas partidas: el puntaje es menos confiable.
        </p>
      )}
      {selected?.fewGames && <p className="text-xs text-gold-soft">{selected.fewGames}</p>}
      {selected && selected.reasons.length > 0 && (
        <p className="border-t border-line/60 pt-2 text-xs">
          <span className="text-ink">{selected.name}: </span>
          {selected.reasons.map((r, i) => (
            <span key={r.text} className={r.delta >= 0 ? "text-win" : "text-loss"}>
              {i > 0 && <span className="text-dim">; </span>}
              {r.text}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

function FewGamesMark() {
  return (
    <span
      className="absolute top-0.5 right-0.5 grid h-4 w-4 place-items-center rounded-full bg-night/90 font-display text-[11px] font-bold text-gold-soft ring-1 ring-gold/60"
      aria-hidden="true"
    >
      ?
    </span>
  );
}

export interface BanPick {
  key: string;
  id: string;
  name: string;
  reason: string;
}

/**
 * Bloqueos sugeridos para tu línea. Tocar uno lo marca en el cliente para bloquear, sin confirmar
 * (solo en tu turno de bloquear): confirmarlo sigue siendo decisión del jugador.
 */
export function BanSuggestions({ bans, roleLabel, version }: { bans: BanPick[]; roleLabel: string; version: string }) {
  const state = useLiveState();
  const isDesktop = useIsDesktop();
  const [result, setResult] = useState<ActionResult | null>(null);
  const cs = state?.champSelect;
  const canMark = Boolean(isDesktop && cs);

  const mark = async (key: string) => {
    if (!canMark) return;
    try {
      setResult(await window.riftlab!.hoverChampion(Number(key), "ban"));
    } catch {
      setResult({ ok: false, message: "No se pudo comunicar con el cliente de League." });
    }
  };

  if (!bans.length) return <p className="text-sm text-muted">Sin datos suficientes para sugerir bloqueos de {roleLabel}.</p>;
  return (
    <div className="space-y-3">
      <p className="text-xs text-dim">
        Rivales de {roleLabel} que más les cuestan a tus campeones (o los más fuertes de la línea).{" "}
        {canMark ? "Toca uno para marcarlo en el cliente sin confirmar el bloqueo." : ""}
      </p>
      <ul className="space-y-1.5">
        {bans.map((b) => (
          <li key={b.key}>
            <button
              type="button"
              onClick={() => void mark(b.key)}
              disabled={!canMark}
              className="flex w-full items-center gap-3 rounded-md border border-line px-2 py-1.5 text-left enabled:hover:border-loss/60 disabled:cursor-default"
            >
              <span className="overflow-hidden rounded-md ring-1 ring-loss/50">
                <ChampIcon version={version} id={b.id} name={b.name} size={36} />
              </span>
              <span className="min-w-0">
                <span className="block font-medium">{b.name}</span>
                <span className="block truncate text-xs text-muted">{b.reason}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {result && (
        <p aria-live="polite" className={`text-xs ${result.ok ? "text-win" : "text-loss"}`}>
          {result.message}
        </p>
      )}
    </div>
  );
}
