"use client";

import { useRouter } from "next/navigation";
import { Fragment, useEffect, useId, useMemo, useRef, useState } from "react";
import { PLATFORMS, type Platform } from "@/lib/constants";
import { img } from "@/lib/assets";
import { usePreferredPlatform } from "@/lib/preferences";
import { Highlight, usePlayerSuggestions } from "./search-suggestions";

export interface SearchChampion {
  id: string;
  name: string;
  /** Key numérica (la que usan la API y el cliente). */
  key?: string;
}

/** "Kai'Sa" → "kaisa", "Nunu y Willump" → "nunuywillump": se busca sin tildes ni signos. */
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

export interface Result {
  key: string;
  group: "Campeones" | "Invocadores";
  label: string;
  /** Tag del Riot ID, que se muestra en gris al lado del nombre. */
  tag?: string;
  hint: string;
  href: string;
  icon?: string;
}

/**
 * Resultados del buscador: campeones (si se pasan) y perfiles del servidor elegido.
 * Lo comparten el buscador de la barra lateral y el de perfiles.
 */
export function useSearchResults(query: string, platform: Platform, champions: SearchChampion[] | undefined, version: string | undefined) {
  const players = usePlayerSuggestions(query, platform);

  return useMemo<Result[]>(() => {
    const q = query.trim();
    if (!q) return [];
    const out: Result[] = [];
    const hash = q.lastIndexOf("#");
    if (hash > 0 && hash < q.length - 1) {
      const slug = encodeURIComponent(`${q.slice(0, hash)}-${q.slice(hash + 1)}`);
      out.push({
        key: "player",
        group: "Invocadores",
        label: q.slice(0, hash),
        tag: q.slice(hash),
        hint: `Ver perfil en ${PLATFORMS[platform].label}`,
        href: `/invocador/${platform}/${slug}`,
      });
    }
    if (hash < 0 && champions && version) {
      const nq = normalize(q);
      out.push(
        ...champions
          .map((c) => {
            const n = normalize(c.name);
            const idn = normalize(c.id);
            const score = n.startsWith(nq) || idn.startsWith(nq) ? 0 : n.includes(nq) || idn.includes(nq) ? 1 : 2;
            return { c, score };
          })
          .filter((x) => x.score < 2)
          .sort((a, b) => a.score - b.score || a.c.name.localeCompare(b.c.name, "es"))
          .slice(0, 4)
          .map(({ c }): Result => ({
            key: c.id,
            group: "Campeones",
            label: c.name,
            hint: "Build, counters y sinergias",
            href: `/campeones/${c.id}`,
            icon: img.champion(version, c.id),
          })),
      );
    }
    for (const p of players) {
      const href = p.href;
      if (out.some((r) => r.href.toLowerCase() === href.toLowerCase())) continue;
      out.push({ key: href, group: "Invocadores", label: p.gameName, tag: `#${p.tagLine}`, hint: p.detail, href, icon: p.icon });
    }
    return out;
  }, [query, champions, version, platform, players]);
}

/** Lista desplegable de resultados, agrupada en campeones y perfiles. */
export function SearchResultsList({
  id,
  results,
  active,
  query,
  platform,
  onPick,
  onHover,
  className = "",
}: {
  id: string;
  results: Result[];
  active: number;
  query: string;
  platform: Platform;
  onPick: (r: Result) => void;
  onHover: (i: number) => void;
  className?: string;
}) {
  return (
    <ul
      id={id}
      role="listbox"
      onMouseDown={(e) => {
        // Un solo manejador para toda la lista: la opción se identifica por data-index.
        const option = (e.target as HTMLElement).closest<HTMLElement>("[data-index]");
        if (!option) return;
        e.preventDefault();
        onPick(results[Number(option.dataset.index)]);
      }}
      className={`absolute inset-x-0 top-full z-40 mt-1 overflow-hidden rounded-md border border-line bg-surface text-left shadow-lg shadow-night/60 ${className}`}
    >
      {results.length === 0 ? (
        <li className="px-3 py-2 text-sm text-muted">Sin coincidencias. Para un jugador que aún no aparece, escribe su Nombre#TAG.</li>
      ) : (
        results.map((r, i) => (
          <Fragment key={r.key}>
            {r.group !== results[i - 1]?.group && (
              <li
                role="presentation"
                className="border-t border-line/60 bg-night/40 px-3 py-1 text-[11px] font-semibold text-dim first:border-t-0"
              >
                {r.group === "Campeones" ? "Builds de campeones" : `Perfiles en ${PLATFORMS[platform].label}`}
              </li>
            )}
            <li
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === active}
              data-index={i}
              onMouseEnter={() => onHover(i)}
              className={`flex cursor-pointer items-center gap-3 px-3 py-2 ${i === active ? "bg-raised" : ""}`}
            >
              {r.icon ? (
                <img
                  src={r.icon}
                  alt=""
                  width={28}
                  height={28}
                  className={`h-7 w-7 ${r.group === "Invocadores" ? "rounded-full" : "rounded"}`}
                />
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-raised text-xs text-gold-soft">#</span>
              )}
              <span className="min-w-0">
                <span className="block truncate text-sm text-ink">
                  <Highlight text={r.label} query={query} />
                  {r.tag && <span className="ml-1 text-dim">{r.tag}</span>}
                </span>
                <span className="block truncate text-xs text-dim">{r.hint}</span>
              </span>
            </li>
          </Fragment>
        ))
      )}
    </ul>
  );
}

/**
 * Buscador único de la app: escribe un campeón ("soraka") para ir a su página
 * o un Riot ID ("Nombre#TAG") para abrir el perfil. Ctrl+K lo enfoca.
 */
export function GlobalSearch({ champions, version }: { champions: SearchChampion[]; version: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const platform = usePreferredPlatform();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useSearchResults(query, platform, champions, version);

  function go(r: Result | undefined) {
    if (!r) return;
    router.push(r.href);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(results[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  const showList = open && query.trim().length > 0;

  return (
    <div className="relative">
      <label htmlFor={`${listId}-input`} className="sr-only">
        Buscar campeón o jugador
      </label>
      <input
        ref={inputRef}
        id={`${listId}-input`}
        type="search"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && results[active] ? `${listId}-${active}` : undefined}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKeyDown}
        placeholder="Campeón o Nombre#TAG"
        autoComplete="off"
        spellCheck={false}
        className="h-9 w-full rounded-md border border-line bg-night px-3 text-sm outline-none placeholder:text-dim focus:border-gold"
      />
      {showList && (
        <SearchResultsList
          id={listId}
          results={results}
          active={active}
          query={query}
          platform={platform}
          onPick={go}
          onHover={setActive}
        />
      )}
    </div>
  );
}
