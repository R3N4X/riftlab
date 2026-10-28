"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { PLATFORMS, type Platform } from "@/lib/constants";
import { usePreferredPlatform } from "@/lib/preferences";
import { SearchResultsList, useSearchResults, type SearchChampion } from "./global-search";

/**
 * Buscador con servidor a la vista. Con `champions` busca lo mismo que el de la barra lateral
 * (campeones y perfiles); sin ellos, solo perfiles (por ejemplo, para comparar).
 */
export function SummonerSearch({
  size = "lg",
  defaultPlatform,
  compareWith,
  champions,
  version,
}: {
  size?: "lg" | "sm";
  defaultPlatform?: Platform;
  /** "la2:Nombre-TAG": en vez de abrir el perfil, abre la comparación con ese jugador. */
  compareWith?: string;
  champions?: SearchChampion[];
  version?: string;
}) {
  const router = useRouter();
  const preferred = usePreferredPlatform();
  // Sin elección propia, sigue al servidor de Ajustes (que se conoce recién en el navegador).
  const [chosen, setPlatform] = useState<Platform | null>(null);
  const platform = chosen ?? defaultPlatform ?? preferred;
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const withChampions = Boolean(champions && version);
  const results = useSearchResults(query, platform, champions, version);
  const showList = open && query.trim().length > 0 && (withChampions || results.length > 0);

  function goTo(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href.startsWith("/invocador/") ? target(href) : href);
  }

  /** "/invocador/la2/Nombre-TAG" → la comparación, si este buscador es para comparar. */
  function target(profileHref: string) {
    if (!compareWith) return profileHref;
    const [, , plat, slug] = profileHref.split("/");
    return `/comparar?a=${encodeURIComponent(compareWith)}&b=${encodeURIComponent(`${plat}:${decodeURIComponent(slug)}`)}`;
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showList) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    // Enter abre el resultado marcado (el primero, si no se movió con las flechas).
    const picked = results[active];
    if (open && picked) {
      setError(null);
      return goTo(picked.href);
    }
    const value = query.trim();
    const idx = value.lastIndexOf("#");
    if (idx <= 0 || idx === value.length - 1) {
      setError(
        withChampions
          ? "Escribe un campeón o el Riot ID completo, con el tag: Nombre#LAN"
          : "Escribe el Riot ID completo, con el tag: Nombre#LAN",
      );
      return;
    }
    setError(null);
    const slug = encodeURIComponent(`${value.slice(0, idx)}-${value.slice(idx + 1)}`);
    router.push(target(`/invocador/${platform}/${slug}`));
  }

  const big = size === "lg";
  return (
    <form onSubmit={submit} className="relative w-full" role="search">
      <div
        className={`flex items-stretch overflow-hidden rounded-lg border border-line bg-night/80 backdrop-blur focus-within:border-gold ${big ? "h-14" : "h-10"}`}
      >
        <label className="sr-only" htmlFor={`platform-${size}`}>
          Servidor
        </label>
        <select
          id={`platform-${size}`}
          value={platform}
          onChange={(e) => setPlatform(e.target.value as Platform)}
          className={`border-r border-line bg-transparent font-display font-semibold text-gold-soft outline-none ${big ? "px-4 text-lg" : "px-2 text-sm"}`}
        >
          {Object.entries(PLATFORMS).map(([id, p]) => (
            <option key={id} value={id} className="bg-surface text-ink">
              {p.label}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor={`riotid-${size}`}>
          {withChampions ? "Campeón o Riot ID" : "Riot ID"}
        </label>
        <input
          id={`riotid-${size}`}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
            setError(null);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && results[active] ? `${listId}-${active}` : undefined}
          placeholder={withChampions ? "Campeón o Nombre#TAG" : "Nombre#TAG"}
          autoComplete="off"
          spellCheck={false}
          className={`min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-dim ${big ? "px-4 text-lg" : "px-3 text-sm"}`}
        />
        <button
          type="submit"
          className={`bg-gold font-display font-semibold text-night transition-colors hover:bg-gold-soft ${big ? "px-6 text-lg" : "px-3 text-sm"}`}
        >
          {compareWith ? "Comparar" : "Buscar"}
        </button>
      </div>
      {showList && (
        <SearchResultsList
          id={listId}
          results={results}
          active={active}
          query={query}
          platform={platform}
          onPick={(r) => goTo(r.href)}
          onHover={setActive}
          className={big ? "rounded-lg" : ""}
        />
      )}
      {error && <p className="mt-2 text-sm text-loss">{error}</p>}
    </form>
  );
}
