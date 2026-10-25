"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ROLE_LABEL, ROLES, type Role, type TierGrade } from "@/lib/constants";
import { ChampIcon, RoleIcon, TierBadge } from "./icons";

export interface GridChampion {
  id: string;
  name: string;
  title: string;
  roles: Role[];
  tier: TierGrade | null;
}

export function ChampionGrid({ champions, version }: { champions: GridChampion[]; version: string }) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<Role | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return champions.filter((c) => (!q || c.name.toLowerCase().includes(q)) && (!role || c.roles.includes(role)));
  }, [champions, query, role]);

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center">
        <label className="sr-only" htmlFor="champ-search">
          Buscar campeón
        </label>
        <input
          id="champ-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar campeón"
          autoFocus
          className="h-10 rounded-lg border border-line bg-surface px-4 outline-none placeholder:text-dim focus:border-gold md:w-72"
        />
        <div className="flex flex-wrap gap-1 rounded-lg border border-line bg-surface p-1">
          {ROLES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(role === r ? null : r)}
              aria-pressed={role === r}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm ${role === r ? "bg-raised text-ink" : "text-muted hover:text-ink"}`}
            >
              <RoleIcon role={r} size={16} />
              {ROLE_LABEL[r]}
            </button>
          ))}
        </div>
        <p className="text-sm text-dim md:ml-auto">{visible.length} campeones</p>
      </div>

      {visible.length === 0 ? (
        <p className="py-12 text-center text-muted">Ningún campeón coincide con “{query}”. Prueba con otro nombre o quita el filtro de línea.</p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-2">
          {visible.map((c) => (
            <li key={c.id}>
              <Link
                href={`/campeones/${c.id}${role ? `?role=${role}` : ""}`}
                className="group flex flex-col items-center gap-2 rounded-lg p-2 text-center hover:bg-surface"
              >
                <span className="relative">
                  <ChampIcon version={version} id={c.id} name={c.name} size={64} className="group-hover:ring-2 group-hover:ring-gold" />
                  {c.tier && <TierBadge tier={c.tier} className="absolute -right-2 -bottom-1 h-5 min-w-6 text-xs" />}
                </span>
                <span className="w-full truncate text-sm">{c.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
