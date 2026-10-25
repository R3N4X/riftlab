import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChampIcon, RoleIcon, TierBadge } from "@/components/icons";
import { LiveSync, MasteryPoints } from "@/components/live-client";
import { LoadingScreen } from "@/components/loading-screen";
import { MatchupBuildDetail } from "@/components/matchup-build";
import { Skeleton } from "@/components/ui";
import { ROLE_LABEL, ROLES, isRole, type RankFilter, type Role } from "@/lib/constants";
import {
  getChampion,
  getChampionsByKey,
  getItems,
  getLatestVersion,
  getRuneIndex,
  getSummonerSpells,
  type ChampionSummary,
} from "@/lib/ddragon";
import { compact, pct, wrClass } from "@/lib/format";
import { parseRank, parseString } from "@/lib/params";
import { getChampionStats, getDraftInsights, getDraftPicks, type DraftInsights, type DraftSlot, type EncounterCell } from "@/lib/stats";
import { counterReason } from "@/lib/stats/reasons";
import { BuildPacks, ItemsAndSkills } from "./build-panels";
import { GameView } from "./game-view";

export const metadata: Metadata = { title: "En vivo" };

type Champs = Record<string, ChampionSummary>;

export default function LivePage({ searchParams }: PageProps<"/en-vivo">) {
  return (
    <div className="space-y-4 p-4">
      <Suspense fallback={<Skeleton rows={10} />}>
        <LiveContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

/** "266-TOP,64" → [{ key: "266", role: "TOP" }, { key: "64", role: null }] */
function parseSlots(value: string | undefined): DraftSlot[] {
  if (!value) return [];
  return value
    .split(",")
    .slice(0, 5)
    .map((part) => {
      const [key, role] = part.split("-");
      return { key, role: isRole(role) ? role : null };
    })
    .filter((s) => /^\d+$/.test(s.key));
}

const parseKeys = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .filter((k) => /^\d+$/.test(k))
    .slice(0, 5);

async function LiveContent({ searchParams }: { searchParams: PageProps<"/en-vivo">["searchParams"] }) {
  const sp = await searchParams;
  const rank = parseRank(sp);
  const keyParam = parseString(sp, "yo");
  const myKey = keyParam && /^\d+$/.test(keyParam) ? keyParam : null;
  const roleParam = parseString(sp, "rol");
  const myRole = isRole(roleParam) ? roleParam : null;
  const locked = parseString(sp, "fijo") === "1";
  const inGame = parseString(sp, "partida") === "1";
  const allies = parseSlots(parseString(sp, "aliados"));
  const enemies = parseSlots(parseString(sp, "rivales"));
  const bans = { mine: parseKeys(parseString(sp, "bloqueos")), theirs: parseKeys(parseString(sp, "bloqueosRivales")) };

  const [version, champs, draft, spells] = await Promise.all([
    getLatestVersion(),
    getChampionsByKey(),
    getDraftInsights({ key: myKey, role: myRole }, allies, enemies, rank),
    getSummonerSpells(),
  ]);
  const me = myKey ? champs[myKey] : undefined;
  const empty = !myKey && !allies.length && !enemies.length;
  // Lo justo para la pantalla de carga (componente de cliente).
  const slimChamps = Object.fromEntries(Object.entries(champs).map(([k, c]) => [k, { id: c.id, name: c.name }]));
  const slimSpells = Object.fromEntries(Object.entries(spells).map(([k, sp]) => [k, { file: sp.image.full, name: sp.name }]));
  const preview = parseString(sp, "jugadores") ?? undefined;

  return (
    <>
      <TopBar me={me} myRole={myRole} draft={draft} bans={bans} champs={champs} version={version} />
      {preview && <LoadingScreen champs={slimChamps} spells={slimSpells} version={version} preview={preview} />}

      {empty ? (
        <div className="rounded-lg border border-line bg-surface py-16 text-center">
          <p className="font-display text-2xl font-semibold">Esperando la selección de campeones</p>
          <p className="mx-auto mt-2 max-w-lg text-sm text-muted">
            Cuando entres a una partida, aquí aparecen tu build, la sinergia con cada aliado y cómo te va contra cada rival. Se actualiza
            sola a medida que eligen.
          </p>
        </div>
      ) : !me ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {myRole ? (
            <Suspense fallback={<Skeleton rows={6} />}>
              <DraftPicks
                role={myRole}
                allies={allies}
                enemies={enemies}
                unavailable={[...bans.mine, ...bans.theirs]}
                rank={rank}
                champs={champs}
                version={version}
                limit={8}
              />
            </Suspense>
          ) : (
            <div className="rounded-lg border border-line bg-surface p-4 text-sm text-muted">
              Todavía no eliges campeón. En esta cola el cliente no dice tu línea, así que no se pueden recomendar picks: pasa el cursor
              sobre un campeón para ver su análisis.
            </div>
          )}
          <div className="rounded-lg border border-line bg-surface p-4 text-sm text-muted">
            Todavía no eliges campeón{myRole ? ` (te toca ${ROLE_LABEL[myRole].toLowerCase()})` : ""}. Las recomendaciones se actualizan a
            medida que cada jugador elige o bloquea. Pasa el cursor sobre un campeón en el cliente para ver su build y cómo le va en este
            draft.
          </div>
        </div>
      ) : inGame ? (
        <div className="space-y-4">
          <LoadingScreen champs={slimChamps} spells={slimSpells} version={version} />
          <Suspense fallback={<Skeleton rows={10} />}>
            <GameView me={me} myRole={myRole} rank={rank} draft={draft} champs={champs} version={version} />
          </Suspense>
        </div>
      ) : (
        <Suspense fallback={<Skeleton rows={10} />}>
          <Dashboard
            me={me}
            myRole={myRole}
            rank={rank}
            locked={locked}
            draft={draft}
            champs={champs}
            version={version}
            slots={{ allies, enemies, unavailable: [...bans.mine, ...bans.theirs] }}
          />
        </Suspense>
      )}
    </>
  );
}

/* ---------- Barra superior: bloqueos y equipos ---------- */

function TopBar({
  me,
  myRole,
  draft,
  bans,
  champs,
  version,
}: {
  me: ChampionSummary | undefined;
  myRole: Role | null;
  draft: DraftInsights;
  bans: { mine: string[]; theirs: string[] };
  champs: Champs;
  version: string;
}) {
  // Mi equipo ordenado por rol, con huecos para los que todavía no eligen.
  const mySlots: { key: string | null; role: Role | null; isMe: boolean }[] = ROLES.map((r) => {
    if (me && myRole === r) return { key: me.key, role: r, isMe: true };
    const ally = draft.allies.find((a) => a.role === r && a.key);
    return ally ? { key: ally.key, role: r, isMe: false } : { key: null, role: r, isMe: !me && myRole === r };
  });
  // Sin rol propio conocido (normales a ciegas): se agrega al final.
  if (me && !myRole)
    mySlots.splice(
      mySlots.findIndex((s) => !s.key),
      1,
      { key: me.key, role: null, isMe: true },
    );
  const theirSlots = ROLES.map((r) => {
    const e = draft.enemies.find((x) => x.role === r);
    return { key: e?.key ?? null, role: r, isMe: false };
  });

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border border-line bg-surface px-3 py-2.5">
      <Suspense fallback={<span className="text-sm text-dim">Conectando…</span>}>
        <LiveSync />
      </Suspense>
      <div className="flex flex-1 flex-wrap items-center justify-center gap-x-3 gap-y-2">
        <BanRow keys={bans.mine} champs={champs} version={version} />
        <div className="flex gap-1.5">
          {mySlots.map((s, i) => (
            <Slot key={i} slot={s} champs={champs} version={version} side="ally" />
          ))}
        </div>
        <span className="px-1 font-display text-lg font-bold text-dim">VS</span>
        <div className="flex gap-1.5">
          {theirSlots.map((s, i) => (
            <Slot key={i} slot={s} champs={champs} version={version} side="enemy" />
          ))}
        </div>
        <BanRow keys={bans.theirs} champs={champs} version={version} />
      </div>
    </div>
  );
}

function Slot({
  slot,
  champs,
  version,
  side,
}: {
  slot: { key: string | null; role: Role | null; isMe: boolean };
  champs: Champs;
  version: string;
  side: "ally" | "enemy";
}) {
  const c = slot.key ? champs[slot.key] : undefined;
  const ring = slot.isMe ? "ring-2 ring-gold" : side === "ally" ? "ring-1 ring-hex/50" : "ring-1 ring-loss/50";
  if (!c) {
    return (
      <span
        className={`flex h-11 w-11 items-center justify-center rounded-md bg-night ${ring}`}
        title={slot.role ? ROLE_LABEL[slot.role] : undefined}
      >
        {slot.role && <RoleIcon role={slot.role} size={18} className="opacity-40" />}
      </span>
    );
  }
  return (
    <span className={`rounded-md ${ring}`} title={c.name}>
      <ChampIcon version={version} id={c.id} name={c.name} size={44} />
    </span>
  );
}

function BanRow({ keys, champs, version }: { keys: string[]; champs: Champs; version: string }) {
  if (!keys.length) return null;
  return (
    <div className="flex gap-1" aria-label="Bloqueos">
      {keys.map((k) =>
        champs[k] ? (
          <span key={k} className="relative opacity-60 grayscale">
            <ChampIcon version={version} id={champs[k].id} name={`${champs[k].name} (bloqueado)`} size={26} />
          </span>
        ) : null,
      )}
    </div>
  );
}

/* ---------- Panel principal ---------- */

async function Dashboard({
  me,
  myRole,
  rank,
  locked,
  draft,
  champs,
  version,
  slots,
}: {
  me: ChampionSummary;
  myRole: Role | null;
  rank: RankFilter;
  locked: boolean;
  draft: DraftInsights;
  champs: Champs;
  version: string;
  slots: { allies: DraftSlot[]; enemies: DraftSlot[]; unavailable: string[] };
}) {
  const stats = await getChampionStats(me.key, rank, myRole ?? undefined);
  if (!stats) {
    return (
      <div className="rounded-lg border border-line bg-surface p-4 text-sm text-muted">
        Todavía no hay datos de {me.name} en este parche.
      </div>
    );
  }

  const [detail, items, spells, runeIndex] = await Promise.all([getChampion(me.id), getItems(), getSummonerSpells(), getRuneIndex()]);

  return (
    <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)_minmax(0,1fr)]">
      {/* Repartido para que toda la selección entre en pantalla sin scroll: las builds van en pestañas y,
          debajo, objetos y habilidades. */}
      <div className="space-y-4">
        <ChampionCard me={me} stats={stats} draft={draft} locked={locked} champs={champs} version={version} rank={rank} />
        {!locked ? (
          <Suspense fallback={<Skeleton rows={4} />}>
            <DraftPicks role={stats.role} {...slots} rank={rank} champs={champs} version={version} limit={4} current={me.key} />
          </Suspense>
        ) : (
          <Suspense fallback={<Skeleton rows={4} />}>
            <EnemyIntel draft={draft} champs={champs} version={version} />
            {draft.laneOpponent && (
              <MatchupBuildDetail
                compact
                champ={me}
                role={stats.role}
                opponent={draft.laneOpponent.key}
                champs={champs}
                version={version}
              />
            )}
          </Suspense>
        )}
      </div>
      <Encounters me={me} draft={draft} champs={champs} version={version} />
      <div className="space-y-4">
        <BuildPacks
          me={me}
          stats={stats}
          enemies={draft.enemies.map((e) => champs[e.key]).filter(Boolean)}
          detail={detail}
          items={items}
          runeIndex={runeIndex}
          spells={spells}
          version={version}
        />
        <ItemsAndSkills stats={stats} detail={detail} items={items} version={version} />
      </div>
    </div>
  );
}

type Stats = NonNullable<Awaited<ReturnType<typeof getChampionStats>>>;

function ChampionCard({
  me,
  stats,
  draft,
  locked,
  champs,
  version,
  rank,
}: {
  me: ChampionSummary;
  stats: Stats;
  draft: DraftInsights;
  locked: boolean;
  champs: Champs;
  version: string;
  rank: RankFilter;
}) {
  const opp = draft.laneOpponent;
  const oppChamp = opp ? champs[opp.key] : undefined;
  const laneCell = draft.encounters.find((e) => e.role === stats.role)?.enemy;
  const reason = opp && oppChamp ? counterReason(me, oppChamp, opp.lane, opp.winRate < 0.5) : null;

  const allyCells = draft.encounters.map((e) => e.ally).filter((c): c is EncounterCell => c !== null);
  const enemyCells = draft.encounters.map((e) => e.enemy);

  // Tipo de daño del equipo propio, según el perfil de cada campeón en Data Dragon.
  const team = [me, ...draft.allies.map((a) => champs[a.key]).filter(Boolean)];
  const attack = team.reduce((s, c) => s + c.info.attack, 0);
  const magic = team.reduce((s, c) => s + c.info.magic, 0);
  const physicalShare = attack + magic ? attack / (attack + magic) : 0.5;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 rounded-lg border border-line bg-surface p-3">
        <ChampIcon version={version} id={me.id} name={me.name} size={48} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-display text-xl font-semibold">
            <Link href={`/campeones/${me.id}?role=${stats.role}&rank=${rank}`} className="truncate hover:text-gold-soft">
              {me.name}
            </Link>
            {stats.summary && <TierBadge tier={stats.summary.tier} />}
          </p>
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <RoleIcon role={stats.role} size={12} />
            {ROLE_LABEL[stats.role]}
            {!locked && " · sin bloquear"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <ScoreTile label="Victoria estimada" hint="Tu winrate general más el efecto de los campeones ya elegidos en ambos equipos.">
          {draft.estimatedWinRate !== null ? pct(draft.estimatedWinRate) : "—"}
        </ScoreTile>
        <ScoreTile
          label="Fase de líneas"
          hint={
            laneCell?.blind
              ? "Rival de línea sin elegir: promedio contra todos los de tu línea."
              : "Tu winrate contra el rival de tu línea."
          }
        >
          {laneCell ? (
            <>
              {pct(laneCell.winRate)}
              {laneCell.blind && <span className="text-loss">*</span>}
            </>
          ) : (
            "—"
          )}
        </ScoreTile>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-line bg-surface p-3">
        <Metric label="Maestría">
          <MasteryPoints championKey={me.key} />
        </Metric>
        <Metric label="Winrate">
          <span className={wrClass(stats.baseWinRate)}>{pct(stats.baseWinRate)}</span>
        </Metric>
        <Metric label="Sinergia promedio">
          <AverageValue cells={allyCells} />
        </Metric>
        <Metric label="Counter promedio">
          <AverageValue cells={enemyCells} />
        </Metric>
      </dl>

      <div className="space-y-3 rounded-lg border border-line bg-surface p-3 text-sm">
        <div>
          <p className="mb-1.5 flex justify-between text-xs text-muted">
            <span>Daño físico {pct(physicalShare, 0)}</span>
            <span>Mágico {pct(1 - physicalShare, 0)}</span>
          </p>
          <div className="flex h-2 overflow-hidden rounded-full bg-night">
            <div className="bg-loss/80" style={{ width: `${physicalShare * 100}%` }} />
            <div className="flex-1 bg-hex/80" />
          </div>
          {(physicalShare > 0.7 || physicalShare < 0.3) && team.length >= 3 && (
            <p className="mt-1.5 text-xs text-gold-soft">
              Tu equipo hace casi todo daño {physicalShare > 0.7 ? "físico" : "mágico"}: al rival le basta con comprar{" "}
              {physicalShare > 0.7 ? "armadura" : "resistencia mágica"}.
            </p>
          )}
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs text-muted">Oro al 15 contra tu rival</span>
          {opp?.lane ? (
            <span className={opp.lane.gold15 >= 0 ? "text-win" : "text-loss"}>
              {opp.lane.gold15 >= 0 ? "+" : "−"}
              {Math.round(Math.abs(opp.lane.gold15))}
            </span>
          ) : (
            <span className="text-dim">—</span>
          )}
        </div>
        {reason && oppChamp && (
          <p className="border-t border-line/60 pt-2 text-xs text-muted">
            <span className="text-ink">Contra {oppChamp.name}:</span> {reason}
          </p>
        )}
      </div>
    </div>
  );
}

function ScoreTile({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gold/50 bg-gold/10 p-3" title={hint}>
      <p className="text-xs text-gold-soft">{label}</p>
      <p className="mt-1 font-display text-3xl font-bold text-ink">{children}</p>
    </div>
  );
}

function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-display text-xl font-semibold">{children}</dd>
    </div>
  );
}

function AverageValue({ cells }: { cells: EncounterCell[] }) {
  const withData = cells.filter((c) => c.games > 0);
  if (!withData.length) return <span className="text-dim">—</span>;
  const avg = withData.reduce((s, c) => s + c.winRate, 0) / withData.length;
  return <span className={wrClass(avg)}>{pct(avg)}</span>;
}

/* ---------- Encuentros ---------- */

function Encounters({ me, draft, champs, version }: { me: ChampionSummary; draft: DraftInsights; champs: Champs; version: string }) {
  const allyCells = draft.encounters.map((e) => e.ally).filter((c): c is EncounterCell => c !== null);
  const enemyCells = draft.encounters.map((e) => e.enemy);

  return (
    <section className="rounded-lg border border-line bg-surface p-3" aria-labelledby="encuentros">
      <h2 id="encuentros" className="mb-3 text-center font-display text-lg font-semibold">
        Encuentros
      </h2>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-md bg-raised/60 py-2 text-center">
          <p className="text-xs text-muted">Sinergia promedio</p>
          <p className="font-display text-lg font-semibold">
            <AverageValue cells={allyCells} />
          </p>
        </div>
        <div className="rounded-md bg-raised/60 py-2 text-center">
          <p className="text-xs text-muted">Counter promedio</p>
          <p className="font-display text-lg font-semibold">
            <AverageValue cells={enemyCells} />
          </p>
        </div>

        {draft.encounters.map((e) => (
          <EncounterRow key={e.role} role={e.role} ally={e.ally} enemy={e.enemy} me={me} champs={champs} version={version} />
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">
        <span className="text-loss">*</span> Todavía sin campeón: se usa tu winrate promedio con ese rol. Los valores son tu winrate en esa
        situación; el número chico es la diferencia con tu winrate general.
      </p>
    </section>
  );
}

function EncounterRow({
  role,
  ally,
  enemy,
  me,
  champs,
  version,
}: {
  role: Role;
  ally: EncounterCell | null;
  enemy: EncounterCell;
  me: ChampionSummary;
  champs: Champs;
  version: string;
}) {
  return (
    <>
      <div className="flex min-h-16 items-center gap-3 rounded-md border border-line/60 bg-night/40 px-3 py-2">
        {ally ? (
          <>
            <Pair me={me} cell={ally} role={role} champs={champs} version={version} side="ally" />
            <CellValue cell={ally} className="ml-auto text-right" />
          </>
        ) : (
          <span className="flex w-full items-center justify-center gap-2 text-xs text-dim">
            <RoleIcon role={role} size={14} />
            Tu línea
          </span>
        )}
      </div>
      <div className="flex min-h-16 items-center gap-3 rounded-md border border-line/60 bg-night/40 px-3 py-2">
        <CellValue cell={enemy} />
        <Pair me={me} cell={enemy} role={role} champs={champs} version={version} side="enemy" className="ml-auto flex-row-reverse" />
      </div>
    </>
  );
}

function Pair({
  me,
  cell,
  role,
  champs,
  version,
  side,
  className = "",
}: {
  me: ChampionSummary;
  cell: EncounterCell;
  role: Role;
  champs: Champs;
  version: string;
  side: "ally" | "enemy";
  className?: string;
}) {
  const other = cell.key ? champs[cell.key] : undefined;
  const ring = side === "ally" ? "ring-hex" : "ring-loss";
  return (
    <span className={`flex items-center ${className}`}>
      <span className="opacity-70">
        <ChampIcon version={version} id={me.id} name={me.name} size={28} className="rounded-full" />
      </span>
      <span className={`relative -mx-1.5 rounded-full ring-2 ${ring}`}>
        {other ? (
          <ChampIcon version={version} id={other.id} name={other.name} size={40} className="rounded-full" />
        ) : (
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-raised" title={`Sin elegir (${ROLE_LABEL[role]})`}>
            <RoleIcon role={role} size={18} className="opacity-50" />
          </span>
        )}
        <span
          className="absolute -right-1 -bottom-1 rounded-full bg-surface p-0.5"
          title={`${ROLE_LABEL[role]}${cell.guessed ? " (estimado)" : ""}`}
        >
          <RoleIcon role={role} size={12} className={cell.guessed ? "opacity-50" : ""} />
        </span>
      </span>
    </span>
  );
}

function CellValue({ cell, className = "" }: { cell: EncounterCell; className?: string }) {
  if (cell.games === 0) return <span className={`text-dim ${className}`}>—</span>;
  return (
    <span className={`leading-tight ${className}`} title={`${compact(cell.games)} partidas`}>
      <span className={`block font-display text-xl font-semibold ${wrClass(cell.winRate)}`}>
        {pct(cell.winRate)}
        {cell.blind && <span className="text-loss">*</span>}
      </span>
      <span className={`text-xs ${cell.delta >= 0 ? "text-win" : "text-loss"}`}>
        {cell.delta >= 0 ? "+" : "−"}
        {pct(Math.abs(cell.delta))}
      </span>
    </span>
  );
}

/* ---------- Build ---------- */

/* ---------- Qué elegir contra el rival de línea ---------- */

/** Mejores picks para tu línea en este draft (antes de bloquear). */
async function DraftPicks({
  role,
  allies,
  enemies,
  unavailable,
  rank,
  champs,
  version,
  limit,
  current,
}: {
  role: Role;
  allies: DraftSlot[];
  enemies: DraftSlot[];
  unavailable: string[];
  rank: RankFilter;
  champs: Champs;
  version: string;
  limit: number;
  /** Campeón que tienes en mente: se marca si aparece en la lista. */
  current?: string;
}) {
  const picks = await getDraftPicks(role, allies, enemies, unavailable, rank, limit);
  if (!picks.length) return null;
  return (
    <section className="rounded-lg border border-line bg-surface p-3" aria-labelledby="draft-picks">
      <h2 id="draft-picks" className="font-display text-lg font-semibold">
        Mejores picks de {ROLE_LABEL[role].toLowerCase()} para este draft
      </h2>
      <p className="mb-2 text-xs text-dim">Winrate esperado según tus aliados y los rivales que ya eligieron.</p>
      <ul className="space-y-0.5">
        {picks.map((p) => {
          const c = champs[p.key];
          if (!c) return null;
          return (
            <li key={p.key}>
              <Link
                href={`/campeones/${c.id}?role=${p.role}&rank=${rank}`}
                className={`flex gap-3 rounded-md px-1.5 py-1.5 hover:bg-raised ${p.key === current ? "bg-gold/10 ring-1 ring-gold/40" : ""}`}
              >
                <ChampIcon version={version} id={c.id} name={c.name} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="flex-1 truncate font-medium">{c.name}</span>
                    <TierBadge tier={p.tier.tier} />
                    <span className={`w-12 text-right text-sm ${wrClass(p.winRate)}`}>{pct(p.winRate)}</span>
                  </span>
                  {p.reasons.length > 0 && (
                    <span className="mt-0.5 block truncate text-xs">
                      {p.reasons.map((r, i) => (
                        <span key={r.text} className={r.delta >= 0 ? "text-win" : "text-loss"}>
                          {i > 0 && <span className="text-dim">; </span>}
                          {r.text}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Con el campeón ya bloqueado: lo que no está en el resto de la pantalla.
 * Consejos para jugar contra tu rival de línea y el tipo de daño del equipo rival.
 */
async function EnemyIntel({ draft, champs, version }: { draft: DraftInsights; champs: Champs; version: string }) {
  const opp = draft.laneOpponent ? champs[draft.laneOpponent.key] : undefined;
  const detail = opp ? await getChampion(opp.id) : null;
  const tips = detail?.enemytips.slice(0, 3) ?? [];
  const team = draft.enemies.map((e) => champs[e.key]).filter(Boolean);
  const attack = team.reduce((s, c) => s + c.info.attack, 0);
  const magic = team.reduce((s, c) => s + c.info.magic, 0);
  const physical = attack + magic ? attack / (attack + magic) : 0.5;
  if (!tips.length && team.length < 2) return null;

  return (
    <section className="space-y-3 rounded-lg border border-line bg-surface p-3 text-sm">
      {opp && tips.length > 0 && (
        <div>
          <h2 className="mb-2 flex items-center gap-2 font-display text-lg font-semibold">
            <ChampIcon version={version} id={opp.id} name={opp.name} size={24} />
            Cómo jugar contra {opp.name}
          </h2>
          <ul className="list-disc space-y-1 pl-4 text-xs text-muted">
            {tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}
      {team.length >= 2 && (
        <div className={opp && tips.length ? "border-t border-line/60 pt-3" : ""}>
          <p className="mb-1.5 flex justify-between text-xs text-muted">
            <span>Daño rival: físico {pct(physical, 0)}</span>
            <span>Mágico {pct(1 - physical, 0)}</span>
          </p>
          <div className="flex h-2 overflow-hidden rounded-full bg-night">
            <div className="bg-loss/80" style={{ width: `${physical * 100}%` }} />
            <div className="flex-1 bg-hex/80" />
          </div>
          {(physical >= 0.65 || physical <= 0.35) && (
            <p className="mt-1.5 text-xs text-gold-soft">
              El equipo rival hace casi todo daño{" "}
              {physical >= 0.65 ? "físico: la armadura rinde más" : "mágico: la resistencia mágica rinde más"}.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
