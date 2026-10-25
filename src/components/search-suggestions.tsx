"use client";

/*
 * Sugerencias de jugadores mientras se escribe (las usan el buscador de la
 * barra lateral y el de perfiles). Salen de /api/buscar, que mira el índice
 * local de jugadores ya vistos.
 */
import { useEffect, useState } from "react";
import type { PlayerSuggestionView } from "@/app/api/buscar/route";
import type { Platform } from "@/lib/constants";

export type { PlayerSuggestionView };

export function usePlayerSuggestions(query: string, platform: Platform): PlayerSuggestionView[] {
  const [state, setState] = useState<{ key: string; players: PlayerSuggestionView[] }>({ key: "", players: [] });
  const q = query.trim();
  const key = `${platform}:${q}`;

  useEffect(() => {
    if (q.length < 2) return;
    const controller = new AbortController();
    // Pequeña espera: no se consulta en cada tecla.
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/buscar?platform=${platform}&q=${encodeURIComponent(q)}`, { signal: controller.signal });
        if (res.ok) setState({ key, players: ((await res.json()) as { players: PlayerSuggestionView[] }).players });
      } catch {
        // búsqueda cancelada o sin conexión
      }
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, platform, key]);

  return q.length >= 2 && state.key === key ? state.players : [];
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Marca en dorado la parte del texto que coincide con lo escrito. */
export function Highlight({ text, query }: { text: string; query: string }) {
  const q = fold(query.split("#")[0].trim());
  const i = q ? fold(text).indexOf(q) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="bg-transparent font-semibold text-gold-soft">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}
