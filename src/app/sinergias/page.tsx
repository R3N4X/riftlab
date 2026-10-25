import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChampIcon, RoleIcon } from "@/components/icons";
import { DataSourceNote, PageHeader, RankTabs, Skeleton, SortHeader, parseSort, sortRows, type SortDir } from "@/components/ui";
import { RANK_FILTERS, ROLE_LABEL, type RankFilter, type Role } from "@/lib/constants";
import { getChampionsByKey, getLatestVersion, type ChampionSummary } from "@/lib/ddragon";
import { compact, pct, wrClass } from "@/lib/format";
import { parseRank, parseString } from "@/lib/params";
import { getBotlaneDuos, getTeamSynergies, type DuoRow, type TeamSynergyRow } from "@/lib/stats";

export const metadata: Metadata = { title: "Sinergias" };

const SORT_KEYS = ["sinergia", "winrate", "pick", "partidas"] as const;
type SortKey = (typeof SORT_KEYS)[number];
type Sort = { key: SortKey; dir: SortDir };

export default function SynergiesPage({ searchParams }: PageProps<"/sinergias">) {
  return (
    <>
      <PageHeader title="Sinergias">
        Qué campeones rinden mejor juntos. La sinergia mide cuánto gana la pareja por encima de lo que ganaría cada campeón por su
        cuenta. Toca el nombre de una columna para ver lo mejor o lo peor.
      </PageHeader>
      <DataSourceNote />
      <Suspense fallback={<Skeleton rows={12} />}>
        <SynergiesContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function SynergiesContent({ searchParams }: { searchParams: PageProps<"/sinergias">["searchParams"] }) {
  const sp = await searchParams;
  const rank = parseRank(sp);
  const view = parseString(sp, "vista") === "equipo" ? "equipo" : "duos";
  const sort = parseSort(sp, SORT_KEYS, "sinergia");
  const [version, champs] = await Promise.all([getLatestVersion(), getChampionsByKey()]);

  const tabs = [
    { id: "duos", label: "Dúos de línea inferior" },
    { id: "equipo", label: "Parejas de equipo" },
  ];

  return (
    <div className="px-4 py-6 sm:px-8">
      <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex gap-1 rounded-lg border border-line bg-surface p-1">
          {tabs.map((t) => (
            <Link
              key={t.id}
              href={`/sinergias?vista=${t.id}&rank=${rank}`}
              aria-current={view === t.id ? "page" : undefined}
              className={`rounded-md px-4 py-1.5 text-sm ${view === t.id ? "bg-raised text-ink" : "text-muted hover:text-ink"}`}
            >
              {t.label}
            </Link>
          ))}
        </div>
        {view === "duos" && <RankTabs base="/sinergias" current={rank} query={{ vista: view, orden: sort.key, dir: sort.dir }} />}
      </div>

      {view === "duos" ? (
        <DuoTable rank={rank} sort={sort} version={version} champs={champs} />
      ) : (
        <TeamTable sort={sort} version={version} champs={champs} />
      )}
    </div>
  );
}

function headerFor(sort: Sort, query: Record<string, string | undefined>) {
  return function header(key: SortKey, label: string, className = "") {
    return <SortHeader label={label} sortKey={key} current={sort.key} dir={sort.dir} base="/sinergias" query={query} className={className} />;
  };
}

const DUO_VALUE: Record<SortKey, (d: DuoRow) => number> = {
  sinergia: (d) => d.synergy,
  winrate: (d) => d.winRate,
  pick: (d) => d.pickRate,
  partidas: (d) => d.games,
};

async function DuoTable({ rank, sort, version, champs }: { rank: RankFilter; sort: Sort; version: string; champs: Record<string, ChampionSummary> }) {
  const duos = await getBotlaneDuos(rank);
  const sorted = sortRows(duos, DUO_VALUE[sort.key], sort.dir).slice(0, 100);
  const header = headerFor(sort, { vista: "duos", rank });

  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="w-full min-w-[680px] text-sm">
        <caption className="sr-only">Dúos de línea inferior en {RANK_FILTERS[rank].label}</caption>
        <thead>
          <tr className="border-b border-line text-left text-muted">
            <th className="w-12 px-4 py-3 font-medium">#</th>
            <th className="px-2 py-3 font-medium">Tirador</th>
            <th className="px-2 py-3 font-medium">Soporte</th>
            {header("winrate", "Winrate")}
            {header("sinergia", "Sinergia")}
            {header("pick", "Pick")}
            {header("partidas", "Partidas", "pr-4")}
          </tr>
        </thead>
        <tbody>
          {sorted.map((d, i) => {
            const adc = champs[d.adc];
            const sup = champs[d.support];
            if (!adc || !sup) return null;
            return (
              <tr key={`${d.adc}-${d.support}`} className="border-b border-line/60 last:border-0 hover:bg-raised/50">
                <td className="px-4 py-2 font-display text-base text-dim">{i + 1}</td>
                <td className="px-2 py-2">
                  <ChampCell champ={adc} version={version} role="BOTTOM" />
                </td>
                <td className="px-2 py-2">
                  <ChampCell champ={sup} version={version} role="UTILITY" />
                </td>
                <td className={`px-2 py-2 text-right ${wrClass(d.winRate)}`}>{pct(d.winRate, 2)}</td>
                <td className="px-2 py-2 text-right">
                  <SynergyValue value={d.synergy} />
                </td>
                <td className="px-2 py-2 text-right text-muted">{pct(d.pickRate, 2)}</td>
                <td className="px-4 py-2 text-right text-muted">{compact(d.games)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const TEAM_VALUE: Record<SortKey, (r: TeamSynergyRow) => number> = {
  sinergia: (r) => r.synergy,
  winrate: (r) => r.winRate,
  // Las parejas no tienen pick rate propio: se usan las partidas, que es lo equivalente.
  pick: (r) => r.games,
  partidas: (r) => r.games,
};

async function TeamTable({ sort, version, champs }: { sort: Sort; version: string; champs: Record<string, ChampionSummary> }) {
  const all = await getTeamSynergies();
  const rows = sortRows(all, TEAM_VALUE[sort.key], sort.dir).slice(0, 100);
  const header = headerFor(sort, { vista: "equipo" });

  return (
    <>
      <p className="mb-4 text-sm text-muted">Parejas de campeones en distintas líneas, considerando todos los rangos.</p>
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-muted">
              <th className="w-12 px-4 py-3 font-medium">#</th>
              <th className="px-2 py-3 font-medium">Campeón</th>
              <th className="px-2 py-3 font-medium">Aliado</th>
              {header("winrate", "Winrate")}
              {header("sinergia", "Sinergia")}
              {header("partidas", "Partidas", "pr-4")}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const a = champs[r.a.key];
              const b = champs[r.b.key];
              if (!a || !b) return null;
              return (
                <tr key={`${r.a.key}${r.a.role}-${r.b.key}${r.b.role}`} className="border-b border-line/60 last:border-0 hover:bg-raised/50">
                  <td className="px-4 py-2 font-display text-base text-dim">{i + 1}</td>
                  <td className="px-2 py-2">
                    <ChampCell champ={a} version={version} role={r.a.role} />
                  </td>
                  <td className="px-2 py-2">
                    <ChampCell champ={b} version={version} role={r.b.role} />
                  </td>
                  <td className={`px-2 py-2 text-right ${wrClass(r.winRate)}`}>{pct(r.winRate, 2)}</td>
                  <td className="px-2 py-2 text-right">
                    <SynergyValue value={r.synergy} />
                  </td>
                  <td className="px-4 py-2 text-right text-muted">{compact(r.games)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SynergyValue({ value }: { value: number }) {
  return (
    <span className={value >= 0 ? "text-win" : "text-loss"}>
      {value >= 0 ? "+" : "−"}
      {pct(Math.abs(value))}
    </span>
  );
}

function ChampCell({ champ, version, role }: { champ: ChampionSummary; version: string; role: Role }) {
  return (
    <Link href={`/campeones/${champ.id}?role=${role}`} className="flex items-center gap-3 hover:text-gold-soft">
      <ChampIcon version={version} id={champ.id} name={champ.name} size={32} />
      <span className="font-medium">{champ.name}</span>
      <span className="hidden items-center gap-1 text-xs text-dim md:flex">
        <RoleIcon role={role} size={12} />
        {ROLE_LABEL[role]}
      </span>
    </Link>
  );
}
