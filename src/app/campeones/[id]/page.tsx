import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ItemPath, RunePage, SkillOrder, SpellPair, StatLine } from "@/components/build";
import { ChampIcon, ItemIcon, RoleIcon, TierBadge } from "@/components/icons";
import { DataSourceNote, Panel, RankTabs, Section, Skeleton } from "@/components/ui";
import { RANK_FILTERS, ROLE_LABEL, ROLES, type RankFilter, type Role } from "@/lib/constants";
import {
  getChampion,
  getChampionsByKey,
  getItems,
  getLatestVersion,
  getRunes,
  getSummonerSpells,
  img,
  stripTags,
  type ChampionDetail,
  type ChampionSummary,
} from "@/lib/ddragon";
import { compact, pct, wrClass } from "@/lib/format";
import { parseRank, parseRole, parseString } from "@/lib/params";
import { MatchupBuildPanel } from "@/components/matchup-build";
import { getChampionStats, type ChampionStats, type MatchupStat, type PairStat, type Stat } from "@/lib/stats";
import { counterReason } from "@/lib/stats/reasons";

const VIEWS = [
  { id: "build", label: "Build" },
  { id: "counters", label: "Counters" },
  { id: "sinergias", label: "Sinergias" },
] as const;
type View = (typeof VIEWS)[number]["id"];

export default function ChampionPage({ params, searchParams }: PageProps<"/campeones/[id]">) {
  return (
    <Suspense fallback={<Skeleton rows={12} />}>
      <ChampionContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function ChampionContent({ params, searchParams }: Pick<PageProps<"/campeones/[id]">, "params" | "searchParams">) {
  const { id } = await params;
  const sp = await searchParams;
  const rank = parseRank(sp);
  const preferredRole = parseRole(sp);
  const view: View = VIEWS.find((v) => v.id === parseString(sp, "vista"))?.id ?? "build";

  const [version, champ] = await Promise.all([getLatestVersion(), getChampion(id)]);
  if (!champ) notFound();

  const [stats, champsByKey] = await Promise.all([getChampionStats(champ.key, rank, preferredRole), getChampionsByKey()]);
  const summary = stats?.summary;
  const href = (v: View, extra: Partial<{ role: Role; rank: RankFilter }> = {}) => {
    const q = new URLSearchParams();
    if (v !== "build") q.set("vista", v);
    const r = extra.role ?? stats?.role;
    if (r) q.set("role", r);
    q.set("rank", extra.rank ?? rank);
    return `/campeones/${champ.id}?${q}`;
  };

  return (
    <>
      {/* Cabecera con splash art */}
      <section className="relative isolate overflow-hidden border-b border-line">
        <img
          src={img.splash(champ.id)}
          alt=""
          className="absolute inset-0 -z-10 h-full w-full object-cover object-[center_25%] opacity-30"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-night via-night/90 to-night/40" />
        <div className="flex flex-col gap-6 px-4 py-8 sm:px-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-center gap-5">
            <ChampIcon version={version} id={champ.id} name={champ.name} size={88} className="rounded-xl ring-2 ring-gold/60" />
            <div>
              <h1 className="font-display text-5xl font-bold tracking-tight">{champ.name}</h1>
              <p className="text-muted capitalize">{champ.title}</p>
              {stats && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {stats.roles.map((r) => (
                    <Link
                      key={r.role}
                      href={href(view, { role: r.role })}
                      className={`flex items-center gap-2 rounded-md border px-3 py-1 text-sm ${
                        r.role === stats.role ? "border-gold/60 bg-raised text-ink" : "border-line text-muted hover:text-ink"
                      }`}
                    >
                      <RoleIcon role={r.role} size={16} />
                      {ROLE_LABEL[r.role]}
                      <span className="text-dim">{pct(r.share, 0)}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          {summary && (
            <dl className="grid grid-cols-3 gap-x-8 gap-y-3 sm:grid-cols-6">
              <SummaryStat label="Tier">
                <TierBadge tier={summary.tier} className="h-7 text-base" />
              </SummaryStat>
              <SummaryStat label="Winrate">
                <span className={wrClass(summary.winRate)}>{pct(summary.winRate, 2)}</span>
              </SummaryStat>
              <SummaryStat label="Pick rate">{pct(summary.pickRate)}</SummaryStat>
              <SummaryStat label="Ban rate">{pct(summary.banRate)}</SummaryStat>
              <SummaryStat label={`Puesto en ${ROLE_LABEL[summary.role].toLowerCase()}`}>#{summary.rank}</SummaryStat>
              <SummaryStat label="Partidas">{compact(summary.games)}</SummaryStat>
            </dl>
          )}
        </div>
      </section>

      <DataSourceNote />

      <div className="px-4 py-6 sm:px-8">
        <div className="mb-6 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <nav className="flex gap-1 rounded-lg border border-line bg-surface p-1" aria-label="Secciones del campeón">
            {VIEWS.map((v) => (
              <Link
                key={v.id}
                href={href(v.id)}
                aria-current={view === v.id ? "page" : undefined}
                className={`rounded-md px-4 py-1.5 font-display text-base font-semibold ${view === v.id ? "bg-raised text-gold-soft" : "text-muted hover:text-ink"}`}
              >
                {v.label}
              </Link>
            ))}
          </nav>
          <RankTabs
            base={`/campeones/${champ.id}`}
            current={rank}
            query={{ role: stats?.role, vista: view === "build" ? undefined : view }}
          />
        </div>

        {stats && <SmallSampleNote champ={champ} stats={stats} rank={rank} />}

        {!stats ? (
          <Panel className="p-6 text-muted">
            Todavía no hay suficientes partidas de {champ.name} en {RANK_FILTERS[rank].label} para mostrar estadísticas. Prueba con otro
            rango.
          </Panel>
        ) : view === "counters" ? (
          <CountersView champ={champ} stats={stats} champs={champsByKey} version={version} rank={rank} />
        ) : view === "sinergias" ? (
          <SynergyView champ={champ} stats={stats} champs={champsByKey} version={version} />
        ) : (
          <BuildView
            champ={champ}
            stats={stats}
            champs={champsByKey}
            version={version}
            rank={rank}
            countersHref={href("counters")}
            synergyHref={href("sinergias")}
            rival={parseString(sp, "rival") ?? null}
            rivalHref={(key) => `${href("build")}&rival=${key}#segun-rival`}
          />
        )}
      </div>
    </>
  );
}

/* ---------- Build ---------- */

async function BuildView({
  champ,
  stats,
  champs,
  version,
  rank,
  countersHref,
  synergyHref,
  rival,
  rivalHref,
}: {
  champ: ChampionDetail;
  stats: ChampionStats;
  champs: Record<string, ChampionSummary>;
  version: string;
  rank: RankFilter;
  countersHref: string;
  synergyHref: string;
  rival: string | null;
  rivalHref: (opponentKey: string) => string;
}) {
  const [items, trees, spells] = await Promise.all([getItems(), getRunes(), getSummonerSpells()]);
  const abilityNames = { Q: champ.spells[0]?.name, W: champ.spells[1]?.name, E: champ.spells[2]?.name, R: champ.spells[3]?.name };
  const me = champs[champ.key];
  const topAllies = Object.values(stats.alliesByRole)
    .flat()
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 4);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="space-y-6">
        <Panel className="p-5">
          <Section title="Runas" aside={stats.runes[0] && <StatLine stat={stats.runes[0]} />}>
            {stats.runes[0] && <RunePage runeKey={stats.runes[0].key} trees={trees} />}
            {stats.runes.length > 1 && (
              <details className="mt-5 border-t border-line pt-4">
                <summary className="cursor-pointer text-sm text-muted hover:text-ink">Otras páginas de runas</summary>
                <div className="mt-4 space-y-6">
                  {stats.runes.slice(1).map((r) => (
                    <div key={r.key}>
                      <div className="mb-2 flex">
                        <StatLine stat={r} />
                      </div>
                      <RunePage runeKey={r.key} trees={trees} />
                    </div>
                  ))}
                </div>
              </details>
            )}
          </Section>
        </Panel>

        <Panel className="p-5">
          <Section title="Objetos">
            <div className="grid gap-6 md:grid-cols-2">
              <BuildList
                title="Compra inicial"
                rows={stats.starters}
                render={(s) => <ItemPath ids={s.key.split("-")} version={version} items={items} />}
              />
              <BuildList
                title="Hechizos de invocador"
                rows={stats.spells}
                render={(s) => <SpellPair spellKey={s.key} spells={spells} version={version} />}
              />
              <BuildList title="Botas" rows={stats.boots} render={(s) => <ItemPath ids={[s.key]} version={version} items={items} />} />
              {stats.supportItems.length > 0 && (
                <BuildList
                  title="Mejora del objeto de soporte"
                  rows={stats.supportItems}
                  render={(s) => <ItemPath ids={[s.key]} version={version} items={items} />}
                />
              )}
            </div>
            <div className="mt-6 border-t border-line pt-5">
              <BuildList
                title="Build principal (primeros 3 objetos)"
                rows={stats.core}
                render={(s) => <ItemPath ids={s.key.split("-")} version={version} items={items} />}
              />
            </div>
            {stats.late.length > 0 && (
              <div className="mt-6 border-t border-line pt-5">
                <h3 className="mb-3 font-semibold">Objetos de cierre</h3>
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {stats.late.map((s) => (
                    <li key={s.key} className="flex items-center gap-2 rounded-md bg-raised/50 p-2">
                      <ItemIcon version={version} id={s.key} name={items[s.key]?.name} size={32} />
                      <span className="min-w-0 text-xs">
                        <span className="block truncate">{items[s.key]?.name}</span>
                        <span className={wrClass(s.winRate)}>{pct(s.winRate)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Section>
        </Panel>

        {me && (
          <Panel className="scroll-mt-12 p-5">
            <div id="segun-rival" className="scroll-mt-12">
              <Section title="Build según el rival" aside="Objetos y runa clave contra cada rival directo">
                <MatchupBuildPanel champ={me} role={stats.role} opponent={rival} champs={champs} version={version} hrefFor={rivalHref} />
              </Section>
            </div>
          </Panel>
        )}

        {stats.skills[0] && (
          <Panel className="p-5">
            <Section title="Orden de habilidades" aside={<StatLine stat={stats.skills[0]} />}>
              <SkillOrder sequence={stats.skills[0].key} abilityNames={abilityNames} />
            </Section>
          </Panel>
        )}

        <Panel className="p-5">
          <Section title="Habilidades">
            <ul className="space-y-4">
              <li className="flex gap-4">
                <img
                  src={img.passive(version, champ.passive.image.full)}
                  alt=""
                  width={44}
                  height={44}
                  className="h-11 w-11 shrink-0 rounded"
                />
                <div>
                  <p className="font-semibold">
                    {champ.passive.name} <span className="text-sm font-normal text-dim">Pasiva</span>
                  </p>
                  <p className="text-sm whitespace-pre-line text-muted">{stripTags(champ.passive.description)}</p>
                </div>
              </li>
              {champ.spells.map((s, i) => (
                <li key={s.id} className="flex gap-4">
                  <img src={img.spell(version, s.image.full)} alt="" width={44} height={44} className="h-11 w-11 shrink-0 rounded" />
                  <div>
                    <p className="font-semibold">
                      {s.name} <span className="text-sm font-normal text-dim">{"QWER"[i]}</span>
                    </p>
                    <p className="text-sm whitespace-pre-line text-muted">{stripTags(s.description)}</p>
                    <p className="mt-1 text-xs text-dim">
                      Enfriamiento: {s.cooldownBurn} s{s.costBurn !== "0" && `, costo: ${s.costBurn}`}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        </Panel>
      </div>

      {/* Columna lateral: lo más importante de las otras pestañas */}
      <div className="space-y-6">
        <Panel className="p-5">
          <Section
            title="Te cuesta contra"
            aside={
              <Link href={countersHref} className="hover:text-ink">
                Todos los counters
              </Link>
            }
          >
            <MatchupList
              rows={stats.weakAgainst.slice(0, 4)}
              me={me}
              champs={champs}
              version={version}
              rank={rank}
              role={stats.role}
              opponentFavored
            />
          </Section>
        </Panel>
        <Panel className="p-5">
          <Section
            title="Le ganas a"
            aside={
              <Link href={countersHref} className="hover:text-ink">
                Todos los counters
              </Link>
            }
          >
            <MatchupList
              rows={stats.strongAgainst.slice(0, 4)}
              me={me}
              champs={champs}
              version={version}
              rank={rank}
              role={stats.role}
              opponentFavored={false}
            />
          </Section>
        </Panel>
        <Panel className="p-5">
          <Section
            title="Mejores aliados"
            aside={
              <Link href={synergyHref} className="hover:text-ink">
                Todas las sinergias
              </Link>
            }
          >
            <PairList
              rows={stats.bestDuos.length ? stats.bestDuos.slice(0, 2).concat(topAllies.slice(0, 2)) : topAllies}
              champs={champs}
              version={version}
            />
          </Section>
        </Panel>
        {(champ.allytips.length > 0 || champ.enemytips.length > 0) && (
          <Panel className="p-5">
            <Section title="Consejos">
              <ul className="list-disc space-y-2 pl-5 text-sm text-muted">
                {champ.allytips.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
              {champ.enemytips.length > 0 && (
                <>
                  <h3 className="mt-4 mb-2 font-semibold">Cómo jugar en contra</h3>
                  <ul className="list-disc space-y-2 pl-5 text-sm text-muted">
                    {champ.enemytips.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </>
              )}
            </Section>
          </Panel>
        )}
      </div>
    </div>
  );
}

/* ---------- Counters ---------- */

const ENEMIES_EMPTY = "Todavía no hay suficientes partidas contra rivales de otras líneas. Se van sumando mientras corre el agregador.";

function CountersView({
  champ,
  stats,
  champs,
  version,
  rank,
}: {
  champ: ChampionDetail;
  stats: ChampionStats;
  champs: Record<string, ChampionSummary>;
  version: string;
  rank: RankFilter;
}) {
  const me = champs[champ.key];
  const lane = ROLE_LABEL[stats.role].toLowerCase();
  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel className="p-5">
          <Section title="Te cuesta en línea" aside={`Rivales de ${lane}`}>
            <MatchupList rows={stats.weakAgainst} me={me} champs={champs} version={version} rank={rank} role={stats.role} opponentFavored />
          </Section>
        </Panel>
        <Panel className="p-5">
          <Section title="Le ganas en línea" aside={`Rivales de ${lane}`}>
            <MatchupList
              rows={stats.strongAgainst}
              me={me}
              champs={champs}
              version={version}
              rank={rank}
              role={stats.role}
              opponentFavored={false}
            />
          </Section>
        </Panel>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel className="p-5">
          <Section title="Rivales de otras líneas que más te cuestan">
            <PairList rows={stats.enemyThreats} champs={champs} version={version} me={me} opponentFavored emptyText={ENEMIES_EMPTY} />
          </Section>
        </Panel>
        <Panel className="p-5">
          <Section title="Rivales de otras líneas que menos te cuestan">
            <PairList rows={stats.enemyEasy} champs={champs} version={version} me={me} opponentFavored={false} emptyText={ENEMIES_EMPTY} />
          </Section>
        </Panel>
      </div>
      <p className="text-sm text-dim">
        El porcentaje es tu winrate cuando ese campeón está en el equipo rival. Los motivos salen de la fase de líneas (oro al minuto 15 y
        duelos entre ambos) y de las estadísticas base de cada campeón.
      </p>
    </div>
  );
}

/* ---------- Sinergias ---------- */

function SynergyView({
  champ,
  stats,
  champs,
  version,
}: {
  champ: ChampionDetail;
  stats: ChampionStats;
  champs: Record<string, ChampionSummary>;
  version: string;
}) {
  const otherRoles = ROLES.filter((r) => r !== stats.role);
  return (
    <div className="space-y-6">
      {stats.bestDuos.length > 0 && (
        <Panel className="p-5">
          <Section title={stats.role === "BOTTOM" ? "Mejores soportes para ir contigo" : "Mejores tiradores para acompañar"}>
            <PairList rows={stats.bestDuos} champs={champs} version={version} columns />
          </Section>
        </Panel>
      )}
      <Panel className="p-5">
        <Section title={`Mejores aliados de ${champ.name} por línea`}>
          <div className="grid gap-6 md:grid-cols-2 2xl:grid-cols-4">
            {otherRoles.map((r) => (
              <div key={r}>
                <h3 className="mb-2 flex items-center gap-2 font-semibold">
                  <RoleIcon role={r} size={16} />
                  {ROLE_LABEL[r]}
                </h3>
                <PairList rows={stats.alliesByRole[r] ?? []} champs={champs} version={version} hideRole />
              </div>
            ))}
          </div>
        </Section>
      </Panel>
      {stats.worstAllies.length > 0 && (
        <Panel className="p-5">
          <Section title="Aliados con los que más pierdes">
            <PairList rows={stats.worstAllies} champs={champs} version={version} columns />
          </Section>
        </Panel>
      )}
      <p className="text-sm text-dim">
        La diferencia compara tu winrate con ese aliado contra tu winrate general como {ROLE_LABEL[stats.role].toLowerCase()} (
        {pct(stats.baseWinRate)}).
      </p>
    </div>
  );
}

/* ---------- Piezas ---------- */

/** Aviso cuando el rol elegido tiene pocas partidas: los datos se muestran, pero con menos confianza. */
function SmallSampleNote({ champ, stats, rank }: { champ: ChampionDetail; stats: ChampionStats; rank: RankFilter }) {
  const games = stats.roles.find((r) => r.role === stats.role)?.games ?? 0;
  if (games >= 300) return null;
  const main = stats.roles[0];
  return (
    <p className="mb-6 rounded-md border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-gold-soft">
      {champ.name} como {ROLE_LABEL[stats.role].toLowerCase()} tiene solo {compact(games)} partidas en este parche: las runas, objetos y
      enfrentamientos salen de pocas partidas y pueden cambiar bastante.
      {main && main.role !== stats.role && (
        <>
          {" "}
          Su línea principal es{" "}
          <Link
            href={`/campeones/${champ.id}?role=${main.role}&rank=${rank}`}
            className="font-medium underline underline-offset-4 hover:text-ink"
          >
            {ROLE_LABEL[main.role].toLowerCase()} ({compact(main.games)} partidas)
          </Link>
          .
        </>
      )}
    </p>
  );
}

function SummaryStat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-display text-2xl font-semibold">{children}</dd>
    </div>
  );
}

function BuildList({ title, rows, render }: { title: string; rows: Stat[]; render: (s: Stat) => React.ReactNode }) {
  if (!rows.length) return null;
  return (
    <div>
      <h3 className="mb-3 font-semibold">{title}</h3>
      <ul className="space-y-2">
        {rows.map((s) => (
          <li key={s.key} className="flex items-center gap-3">
            {render(s)}
            <StatLine stat={s} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Delta({ value }: { value: number }) {
  return (
    <span className={`w-14 text-right text-xs ${value >= 0 ? "text-win" : "text-loss"}`}>
      {value >= 0 ? "+" : ""}
      {pct(value)}
    </span>
  );
}

function MatchupList({
  rows,
  me,
  champs,
  version,
  rank,
  role,
  opponentFavored,
}: {
  rows: MatchupStat[];
  me: ChampionSummary | undefined;
  champs: Record<string, ChampionSummary>;
  version: string;
  rank: RankFilter;
  role: Role;
  opponentFavored: boolean;
}) {
  if (!rows.length) return <p className="text-sm text-muted">Aún no hay suficientes enfrentamientos registrados.</p>;
  return (
    <ul className="space-y-1">
      {rows.map((m) => {
        const c = champs[m.key];
        if (!c) return null;
        const reason = me ? counterReason(me, c, m.lane, opponentFavored) : null;
        return (
          <li key={m.key}>
            <Link
              href={`/campeones/${c.id}?role=${role}&rank=${rank}&vista=counters`}
              className="flex gap-3 rounded-md px-1 py-2 hover:bg-raised"
            >
              <ChampIcon version={version} id={c.id} name={c.name} size={36} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-3">
                  <span className="flex-1 truncate font-medium">{c.name}</span>
                  <span className={`text-sm ${wrClass(m.winRate)}`}>{pct(m.winRate)}</span>
                  <span className="w-16 text-right text-xs text-dim">{compact(m.games)} part.</span>
                </span>
                {reason && <span className="mt-0.5 block text-sm text-muted">{reason}</span>}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function PairList({
  rows,
  champs,
  version,
  me,
  opponentFavored,
  hideRole = false,
  columns = false,
  emptyText = "Aún no hay suficientes partidas juntos.",
}: {
  rows: PairStat[];
  champs: Record<string, ChampionSummary>;
  version: string;
  me?: ChampionSummary;
  opponentFavored?: boolean;
  hideRole?: boolean;
  columns?: boolean;
  emptyText?: string;
}) {
  if (!rows.length) return <p className="text-sm text-muted">{emptyText}</p>;
  return (
    <ul className={columns ? "grid gap-x-6 gap-y-1 md:grid-cols-2" : "space-y-1"}>
      {rows.map((s) => {
        const c = champs[s.key];
        if (!c) return null;
        // En rivales de otras líneas no hay fase de líneas: el motivo sale solo del alcance y la clase.
        const reason = me && opponentFavored !== undefined ? counterReason(me, c, null, opponentFavored) : null;
        return (
          <li key={`${s.key}-${s.role}`}>
            <Link href={`/campeones/${c.id}?role=${s.role}`} className="flex gap-3 rounded-md px-1 py-1.5 hover:bg-raised">
              <ChampIcon version={version} id={c.id} name={c.name} size={32} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="flex-1 truncate">{c.name}</span>
                  {!hideRole && <RoleIcon role={s.role} size={14} className="opacity-60" />}
                  <span className={`text-sm ${wrClass(s.winRate)}`}>{pct(s.winRate)}</span>
                  <Delta value={s.delta} />
                </span>
                {reason && <span className="block text-xs text-muted">{reason}</span>}
                <span className="block text-xs text-dim">{compact(s.games)} partidas</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
