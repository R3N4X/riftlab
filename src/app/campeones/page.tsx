import type { Metadata } from "next";
import { ChampionGrid, type GridChampion } from "@/components/champion-grid";
import { PageHeader } from "@/components/ui";
import { DEFAULT_RANK, type Role } from "@/lib/constants";
import { getChampionList, getLatestVersion } from "@/lib/ddragon";
import { getTierList } from "@/lib/stats";

export const metadata: Metadata = { title: "Campeones y builds" };

export default async function ChampionsPage() {
  const [version, champions, tier] = await Promise.all([getLatestVersion(), getChampionList(), getTierList(DEFAULT_RANK)]);

  const byKey = new Map<string, { roles: Role[]; best: (typeof tier)[number] }>();
  for (const row of tier) {
    const entry = byKey.get(row.champion.key);
    if (!entry) byKey.set(row.champion.key, { roles: [row.role], best: row });
    else entry.roles.push(row.role);
  }

  const grid: GridChampion[] = champions.map((c) => {
    const entry = byKey.get(c.key);
    return { id: c.id, name: c.name, title: c.title, roles: entry?.roles ?? [], tier: entry?.best.tier ?? null };
  });

  return (
    <>
      <PageHeader title="Campeones y builds">
        Elige un campeón para ver sus runas, objetos, orden de habilidades, enfrentamientos y mejores aliados.
      </PageHeader>
      <div className="px-4 py-6 sm:px-8">
        <ChampionGrid champions={grid} version={version} />
      </div>
    </>
  );
}
