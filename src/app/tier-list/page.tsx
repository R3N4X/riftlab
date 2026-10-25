import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChampIcon, RoleIcon, TierBadge } from "@/components/icons";
import { DataSourceNote, PageHeader, RankTabs, RoleTabs, Skeleton, SortHeader, parseSort, sortRows } from "@/components/ui";
import { RANK_FILTERS, ROLE_LABEL } from "@/lib/constants";
import { getChampionsByKey, getLatestVersion } from "@/lib/ddragon";
import { compact, pct, wrClass } from "@/lib/format";
import { parseRank, parseRole } from "@/lib/params";
import { getTierList, type TierRow } from "@/lib/stats";

export const metadata: Metadata = { title: "Tier list" };

const SORT_KEYS = ["tier", "winrate", "pick", "ban", "partidas"] as const;
type SortKey = (typeof SORT_KEYS)[number];
const SORT_VALUE: Record<SortKey, (row: TierRow) => number> = {
  tier: (r) => r.score,
  winrate: (r) => r.winRate,
  pick: (r) => r.pickRate,
  ban: (r) => r.banRate,
  partidas: (r) => r.games,
};

export default function TierListPage({ searchParams }: PageProps<"/tier-list">) {
  return (
    <>
      <PageHeader title="Tier list">
        Los campeones más fuertes del parche en cada línea. La nota combina winrate, popularidad y bloqueos, comparando solo
        contra campeones del mismo rol.
      </PageHeader>
      <DataSourceNote />
      <Suspense fallback={<Skeleton rows={14} />}>
        <TierListContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function TierListContent({ searchParams }: { searchParams: PageProps<"/tier-list">["searchParams"] }) {
  const sp = await searchParams;
  const rank = parseRank(sp);
  const role = parseRole(sp) ?? "ALL";
  const [allRows, version, champsByKey] = await Promise.all([getTierList(rank, role), getLatestVersion(), getChampionsByKey()]);
  const sort = parseSort(sp, SORT_KEYS, "tier");
  const rows = sortRows(allRows, SORT_VALUE[sort.key], sort.dir);
  const query = { rank, role: role === "ALL" ? undefined : role };
  const header = (key: SortKey, label: string, align: "right" | "center" = "right") => (
    <SortHeader label={label} sortKey={key} current={sort.key} dir={sort.dir} base="/tier-list" query={query} align={align} />
  );

  return (
    <div className="px-4 py-6 sm:px-8">
      <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <RoleTabs base="/tier-list" current={role} query={{ rank, orden: sort.key, dir: sort.dir }} />
        <RankTabs base="/tier-list" current={rank} query={{ role: role === "ALL" ? undefined : role, orden: sort.key, dir: sort.dir }} />
      </div>

      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full min-w-[760px] text-sm">
          <caption className="sr-only">
            Tier list {role === "ALL" ? "de todas las líneas" : ROLE_LABEL[role]} en {RANK_FILTERS[rank].label}
          </caption>
          <thead>
            <tr className="border-b border-line text-left text-muted">
              <th className="w-12 px-4 py-3 font-medium">#</th>
              <th className="px-2 py-3 font-medium">Campeón</th>
              {header("tier", "Tier", "center")}
              {header("winrate", "Winrate")}
              {header("pick", "Pick")}
              {header("ban", "Ban")}
              {header("partidas", "Partidas")}
              <th className="px-4 py-3 font-medium">Le cuesta contra</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={`${row.champion.key}-${row.role}`} className="border-b border-line/60 last:border-0 hover:bg-raised/50">
                <td className="px-4 py-2 font-display text-base text-dim">{i + 1}</td>
                <td className="px-2 py-2">
                  <Link href={`/campeones/${row.champion.id}?role=${row.role}&rank=${rank}`} className="flex items-center gap-3 hover:text-gold-soft">
                    <ChampIcon version={version} id={row.champion.id} name={row.champion.name} size={36} />
                    <span className="font-semibold">{row.champion.name}</span>
                    {role === "ALL" && (
                      <span className="flex items-center gap-1 text-xs text-muted">
                        <RoleIcon role={row.role} size={14} />
                        {ROLE_LABEL[row.role]}
                      </span>
                    )}
                  </Link>
                </td>
                <td className="px-2 py-2 text-center">
                  <TierBadge tier={row.tier} />
                </td>
                <td className={`px-2 py-2 text-right ${wrClass(row.winRate)}`}>{pct(row.winRate, 2)}</td>
                <td className="px-2 py-2 text-right text-muted">{pct(row.pickRate)}</td>
                <td className="px-2 py-2 text-right text-muted">{pct(row.banRate)}</td>
                <td className="px-2 py-2 text-right text-muted">{compact(row.games)}</td>
                <td className="px-4 py-2">
                  <div className="flex gap-1">
                    {row.counters.map((k) =>
                      champsByKey[k] ? <ChampIcon key={k} version={version} id={champsByKey[k].id} name={champsByKey[k].name} size={24} /> : null,
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
