"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { PLATFORMS, type Platform } from "@/lib/constants";
import { usePreferredPlatform } from "@/lib/preferences";
import { Highlight, usePlayerSuggestions } from "./search-suggestions";

export function SummonerSearch({
  size = "lg",
  defaultPlatform,
  compareWith,
}: {
  size?: "lg" | "sm";
  defaultPlatform?: Platform;
  /** "la2:Nombre-TAG": en vez de abrir el perfil, abre la comparación con ese jugador. */
  compareWith?: string;
}) {
  const router = useRouter();
  const preferred = usePreferredPlatform();
  // Sin elección propia, sigue al servidor de Ajustes (que se conoce recién en el navegador).
  const [chosen, setPlatform] = useState<Platform | null>(null);
  const platform = chosen ?? defaultPlatform ?? preferred;
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const players = usePlayerSuggestions(query, platform);
  const showList = open && players.length > 0;

  function goTo(href: string) {
    setOpen(false);
    setQuery("");
    router.push(target(href));
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
      setActive((i) => Math.min(i + 1, players.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, -1));
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    // Con una sugerencia marcada (flechas), Enter abre ese perfil.
    if (showList && active >= 0 && players[active]) return goTo(players[active].href);
    const value = query.trim();
    const idx = value.lastIndexOf("#");
    if (idx <= 0 || idx === value.length - 1) {
      setError("Escribe el Riot ID completo, con el tag: Nombre#LAN");
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
          Riot ID
        </label>
        <input
          id={`riotid-${size}`}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          placeholder="Nombre#TAG"
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
        <ul
          id={listId}
          role="listbox"
          onMouseDown={(e) => {
            const option = (e.target as HTMLElement).closest<HTMLElement>("[data-href]");
            if (!option?.dataset.href) return;
            e.preventDefault();
            goTo(option.dataset.href);
          }}
          className="absolute inset-x-0 top-full z-40 mt-1 overflow-hidden rounded-lg border border-line bg-surface text-left shadow-lg shadow-night/60"
        >
          <li role="presentation" className="bg-night/40 px-3 py-1 text-[11px] font-semibold text-dim">
            Perfiles en {PLATFORMS[platform].label}
          </li>
          {players.map((p, i) => (
            <li
              key={p.href}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              data-href={p.href}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-center gap-3 px-3 py-2 ${i === active ? "bg-raised" : ""}`}
            >
              <img src={p.icon} alt="" width={32} height={32} className="h-8 w-8 rounded-full" />
              <span className="min-w-0">
                <span className="block truncate text-sm text-ink">
                  <Highlight text={p.gameName} query={query} />
                  <span className="ml-1 text-dim">#{p.tagLine}</span>
                </span>
                <span className="block truncate text-xs text-dim">{p.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-2 text-sm text-loss">{error}</p>}
    </form>
  );
}
