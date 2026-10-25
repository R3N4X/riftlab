import Link from "next/link";
import { Suspense } from "react";
import { ChampIcon, RoleIcon, TierBadge } from "@/components/icons";
import { SummonerSearch } from "@/components/summoner-search";
import { DataSourceNote, Panel, Section, Skeleton } from "@/components/ui";
import { DEFAULT_RANK, RANK_FILTERS, ROLE_LABEL, ROLES } from "@/lib/constants";
import { getChampionsByKey, getLatestVersion, img, versionToPatch } from "@/lib/ddragon";
import { dateLabel, pct, wrClass } from "@/lib/format";
import { getPatchNotesList } from "@/lib/patchnotes";
import { getBotlaneDuos, getTierList } from "@/lib/stats";

export default async function HomePage() {
  const version = await getLatestVersion();
  const patch = versionToPatch(version);
  const tier = await getTierList(DEFAULT_RANK);
  const hero = tier[0];

  return (
    <>
      <section className="relative isolate overflow-hidden border-b border-line">
        {hero && (
          <img
            src={img.splash(hero.champion.id)}
            alt=""
            className="absolute inset-0 -z-10 h-full w-full object-cover object-[center_20%] opacity-35"
          />
        )}
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-night via-night/85 to-night/30" />
        <div className="px-4 py-14 sm:px-8 sm:py-20">
          <h1 className="max-w-2xl font-display text-5xl leading-[0.95] font-bold tracking-tight sm:text-6xl">
            Todo lo que necesitas antes de entrar a la Grieta.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-muted">
            Busca a cualquier jugador por su Riot ID, revisa la tier list del parche {patch} y copia la build que más gana.
          </p>
          <div className="mt-8 max-w-2xl">
            <SummonerSearch />
          </div>
          {hero && (
            <p className="mt-6 text-sm text-muted">
              Mejor campeón del parche {DEFAULT_RANK === "ALL" ? "en todos los rangos" : `en ${RANK_FILTERS[DEFAULT_RANK].label}`}:{" "}
              <Link href={`/campeones/${hero.champion.id}?role=${hero.role}`} className="text-gold-soft underline-offset-4 hover:underline">
                {hero.champion.name} ({ROLE_LABEL[hero.role]})
              </Link>
            </p>
          )}
        </div>
      </section>

      <DataSourceNote />

      <div className="space-y-12 px-4 py-8 sm:px-8">
        <Section title="Lo más fuerte por línea" aside={<Link href="/tier-list" className="hover:text-ink">Ver tier list completa</Link>}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
            {ROLES.map((role) => {
              const best = tier.filter((r) => r.role === role).slice(0, 5);
              return (
                <Panel key={role} className="p-3">
                  <Link href={`/tier-list?role=${role}`} className="mb-2 flex items-center gap-2 px-1 font-display text-lg font-semibold hover:text-gold-soft">
                    <RoleIcon role={role} />
                    {ROLE_LABEL[role]}
                  </Link>
                  <ol>
                    {best.map((row) => (
                      <li key={row.champion.key}>
                        <Link
                          href={`/campeones/${row.champion.id}?role=${role}`}
                          className="flex items-center gap-3 rounded-md px-1 py-1.5 hover:bg-raised"
                        >
                          <ChampIcon version={version} id={row.champion.id} name={row.champion.name} size={32} />
                          <span className="flex-1 truncate font-medium">{row.champion.name}</span>
                          <span className={`text-sm ${wrClass(row.winRate)}`}>{pct(row.winRate)}</span>
                          <TierBadge tier={row.tier} />
                        </Link>
                      </li>
                    ))}
                  </ol>
                </Panel>
              );
            })}
            <StrongestOverall tier={tier} version={version} />
          </div>
        </Section>

        <div className="grid gap-8 xl:grid-cols-[1.4fr_1fr]">
          <Suspense fallback={<Skeleton rows={3} />}>
            <LatestPatch />
          </Suspense>
          <TopDuos version={version} />
        </div>
      </div>
    </>
  );
}

/** Los 5 con mejor nota del parche sin importar la línea (cada campeón una vez, en su mejor rol). */
function StrongestOverall({ tier, version }: { tier: Awaited<ReturnType<typeof getTierList>>; version: string }) {
  const seen = new Set<string>();
  const best = tier.filter((row) => !seen.has(row.champion.key) && seen.add(row.champion.key)).slice(0, 5);
  return (
    <Panel className="border-gold/50 p-3">
      <Link href="/tier-list" className="mb-2 flex items-center gap-2 px-1 font-display text-lg font-semibold text-gold-soft hover:text-ink">
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 18h16l-1.5-9-4.5 4-2-7-2 7-4.5-4z" />
        </svg>
        Los más fuertes
      </Link>
      <ol>
        {best.map((row) => (
          <li key={row.champion.key}>
            <Link href={`/campeones/${row.champion.id}?role=${row.role}`} className="flex items-center gap-3 rounded-md px-1 py-1.5 hover:bg-raised">
              <ChampIcon version={version} id={row.champion.id} name={row.champion.name} size={32} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{row.champion.name}</span>
                <span className="flex items-center gap-1 text-xs text-dim">
                  <RoleIcon role={row.role} size={11} />
                  {ROLE_LABEL[row.role]}
                </span>
              </span>
              <span className={`text-sm ${wrClass(row.winRate)}`}>{pct(row.winRate)}</span>
              <TierBadge tier={row.tier} />
            </Link>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

async function LatestPatch() {
  let notes: Awaited<ReturnType<typeof getPatchNotesList>> = [];
  try {
    notes = await getPatchNotesList();
  } catch {
    notes = [];
  }
  const [latest, ...older] = notes;
  return (
    <Section title="Novedades del parche" aside={<Link href="/parche" className="hover:text-ink">Todas las notas</Link>}>
      {latest ? (
        <Panel className="overflow-hidden">
          <Link href={`/parche/${latest.slug}`} className="group block">
            {latest.image && <img src={latest.image} alt="" className="aspect-[21/9] w-full object-cover transition-opacity group-hover:opacity-90" />}
            <div className="p-5">
              <p className="text-sm text-muted">{dateLabel(latest.date)}</p>
              <h3 className="mt-1 font-display text-3xl font-bold group-hover:text-gold-soft">{latest.title}</h3>
              <p className="mt-2 line-clamp-3 text-muted">{latest.description}</p>
            </div>
          </Link>
          <ul className="border-t border-line">
            {older.slice(0, 3).map((n) => (
              <li key={n.slug} className="border-b border-line/60 last:border-0">
                <Link href={`/parche/${n.slug}`} className="flex justify-between gap-4 px-5 py-3 text-sm hover:bg-raised">
                  <span>{n.title}</span>
                  <span className="text-dim">{dateLabel(n.date)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      ) : (
        <Panel className="p-5 text-muted">No se pudieron cargar las notas del parche. Intenta de nuevo en unos minutos.</Panel>
      )}
    </Section>
  );
}

async function TopDuos({ version }: { version: string }) {
  const [duos, champs] = await Promise.all([getBotlaneDuos(DEFAULT_RANK), getChampionsByKey()]);
  const best = [...duos].sort((a, b) => b.synergy - a.synergy).slice(0, 6);
  return (
    <Section title="Dúos de línea inferior" aside={<Link href="/sinergias" className="hover:text-ink">Ver sinergias</Link>}>
      <Panel>
        <ul>
          {best.map((d) => {
            const adc = champs[d.adc];
            const sup = champs[d.support];
            if (!adc || !sup) return null;
            return (
              <li key={`${d.adc}-${d.support}`} className="flex items-center gap-3 border-b border-line/60 px-4 py-3 last:border-0">
                <div className="flex -space-x-2">
                  <ChampIcon version={version} id={adc.id} name={adc.name} size={36} className="ring-2 ring-surface" />
                  <ChampIcon version={version} id={sup.id} name={sup.name} size={36} className="ring-2 ring-surface" />
                </div>
                <span className="flex-1 truncate">
                  {adc.name} y {sup.name}
                </span>
                <span className={`text-sm ${wrClass(d.winRate)}`}>{pct(d.winRate)}</span>
                <span className="w-14 text-right text-sm text-win">+{pct(Math.max(0, d.synergy))}</span>
              </li>
            );
          })}
        </ul>
      </Panel>
    </Section>
  );
}
