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
import { SCORE_HINT, formatScore, goldScore, scoreClass, scoreOf } from "@/lib/draft-score";
import { compact, pct } from "@/lib/format";
import { parseRank, parseString } from "@/lib/params";
import {
  getChampionStats,
  getDraftInsights,
  FEW_LANE_GAMES,
  FEW_ROLE_GAMES,
  getBanSuggestions,
  getDraftPicks,
  type BanSuggestion,
  type DraftInsights,
  type DraftPick,
  type DraftSlot,
  type EncounterCell,
} from "@/lib/stats";
import { counterReason } from "@/lib/stats/reasons";
import { BuildPacks, ItemsAndSkills } from "./build-panels";
import { GameView } from "./game-view";
import { PanelTabs } from "./panel-tabs";
import { BanSuggestions, Recommendations } from "./recommendations";

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

/** Aviso de pocos datos de un pick (null si el puntaje se apoya en partidas suficientes). */
function fewGames(p: DraftPick): string | null {
  if (p.games < FEW_ROLE_GAMES) return `Pocas partidas de este campeón en la línea (${p.games}): tómalo como referencia.`;
  if (p.laneGames !== null && p.laneGames < FEW_LANE_GAMES)
    return `Pocas partidas contra tu rival de línea (${p.laneGames}): el cruce pesa poco en el puntaje.`;
  return null;
}

/** Hasta 40 keys de campeón ("103,222,...") para la lista de campeones propios. */
const parseKeys40 = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .filter((k) => /^\d+$/.test(k))
    .slice(0, 40);

/**
 * Pick para la vista previa automática: el mejor de los tuyos si está a menos de 1,5 puntos de winrate
 * del mejor del meta (jugar algo que dominas vale más que esa diferencia); si no, el mejor del meta.
 */
function bestPick(picks: DraftPick[], pool: string[]): string | null {
  const best = picks[0];
  if (!best) return null;
  const own = picks.find((p) => pool.includes(p.key));
  return own && own.winRate >= best.winRate - 0.015 ? own.key : best.key;
}

const parseKeys = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .filter((k) => /^\d+$/.test(k))
    .slice(0, 5);

/** Cuántas recomendaciones muestra la grilla (tres filas de cinco). */
const PICK_COUNT = 15;

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
  const unavailable = [...bans.mine, ...bans.theirs];
  const verParam = parseString(sp, "ver");
  // Campeones con más maestría del jugador (los manda la app de escritorio).
  const pool = parseKeys40(parseString(sp, "mios"));

  // Sin nadie elegido todavía es la etapa de bloqueos: la pestaña de bloqueos va primero.
  const banPhase = !myKey && !allies.length && !enemies.length;
  const [version, champs, draft, spells, picks, bansSuggested] = await Promise.all([
    getLatestVersion(),
    getChampionsByKey(),
    getDraftInsights({ key: myKey, role: myRole }, allies, enemies, rank),
    getSummonerSpells(),
    // Con la línea conocida y sin fijar campeón se recomiendan picks (también al elegir primero).
    myRole && !locked && !inGame ? getDraftPicks(myRole, allies, enemies, unavailable, rank, PICK_COUNT, pool) : Promise.resolve([]),
    myRole && !locked && !inGame
      ? getBanSuggestions(myRole, pool, [...unavailable, ...allies.map((a) => a.key), ...enemies.map((e) => e.key)], rank)
      : Promise.resolve([] as BanSuggestion[]),
  ]);
  const me = myKey ? champs[myKey] : undefined;
  // En vista previa: el que tocaste en la grilla o, sin campeón propio todavía, el mejor pick.
  const chosen = verParam && /^\d+$/.test(verParam) && champs[verParam] && verParam !== myKey && !locked && !inGame ? verParam : null;
  const previewKey = chosen ?? (!me ? bestPick(picks, pool) : null);
  const preview = previewKey ? champs[previewKey] : undefined;
  const empty = !myKey && !myRole && !allies.length && !enemies.length;
  // Lo justo para la pantalla de carga (componente de cliente).
  const slimChamps = Object.fromEntries(Object.entries(champs).map(([k, c]) => [k, { id: c.id, name: c.name }]));
  const slimSpells = Object.fromEntries(Object.entries(spells).map(([k, sp]) => [k, { file: sp.image.full, name: sp.name }]));
  const playersPreview = parseString(sp, "jugadores") ?? undefined;

  // La URL actual sin la vista previa: base de los enlaces de la grilla.
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (k !== "ver" && typeof v === "string") query.set(k, v);
  const baseQuery = query.toString();

  return (
    <>
      <TopBar me={me} myRole={myRole} draft={draft} bans={bans} champs={champs} version={version} />
      {playersPreview && <LoadingScreen champs={slimChamps} spells={slimSpells} version={version} preview={playersPreview} />}

      {empty ? (
        <div className="rounded-lg border border-line bg-surface py-16 text-center">
          <p className="font-display text-2xl font-semibold">Esperando la selección de campeones</p>
          <p className="mx-auto mt-2 max-w-lg text-sm text-muted">
            Cuando entres a una partida, aquí aparecen tu build, la sinergia con cada aliado y cómo te va contra cada rival. Se actualiza
            sola a medida que eligen.
          </p>
        </div>
      ) : me && inGame ? (
        <div className="space-y-4">
          <LoadingScreen champs={slimChamps} spells={slimSpells} version={version} />
          <Suspense fallback={<Skeleton rows={10} />}>
            <GameView me={me} myRole={myRole} rank={rank} draft={draft} champs={champs} version={version} />
          </Suspense>
        </div>
      ) : !me && !preview ? (
        <div className="rounded-lg border border-line bg-surface p-4 text-sm text-muted">
          Todavía no eliges campeón. En esta cola el cliente no dice tu línea, así que no se pueden recomendar picks: pasa el cursor sobre
          un campeón para ver su análisis.
        </div>
      ) : (
        <Suspense fallback={<Skeleton rows={10} />}>
          <Dashboard
            me={me}
            preview={preview}
            pickedPreview={Boolean(chosen)}
            myRole={myRole}
            rank={rank}
            locked={locked}
            draft={draft}
            picks={picks}
            bans={bansSuggested}
            banPhase={banPhase}
            champs={champs}
            version={version}
            slots={{ allies, enemies }}
            baseQuery={baseQuery}
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
  preview,
  pickedPreview,
  myRole,
  rank,
  locked,
  draft,
  picks,
  bans,
  banPhase,
  champs,
  version,
  slots,
  baseQuery,
}: {
  /** Tu campeón (elegido o con el cursor encima), si ya hay uno. */
  me: ChampionSummary | undefined;
  /** Campeón en vista previa: se evalúa en lugar del tuyo y se compara con él. */
  preview: ChampionSummary | undefined;
  /** La vista previa la elegiste tú en la grilla (si no, es el mejor pick automático). */
  pickedPreview: boolean;
  myRole: Role | null;
  rank: RankFilter;
  locked: boolean;
  draft: DraftInsights;
  picks: DraftPick[];
  bans: BanSuggestion[];
  /** Nadie eligió todavía: los bloqueos van primero. */
  banPhase: boolean;
  champs: Champs;
  version: string;
  slots: { allies: DraftSlot[]; enemies: DraftSlot[] };
  baseQuery: string;
}) {
  const shown = (preview ?? me)!;
  const [stats, shownDraft] = await Promise.all([
    getChampionStats(shown.key, rank, myRole ?? undefined),
    preview ? getDraftInsights({ key: preview.key, role: myRole }, slots.allies, slots.enemies, rank) : Promise.resolve(draft),
  ]);
  if (!stats) {
    return (
      <div className="rounded-lg border border-line bg-surface p-4 text-sm text-muted">
        Todavía no hay datos de {shown.name} en este parche.
      </div>
    );
  }

  const [detail, items, spells, runeIndex] = await Promise.all([getChampion(shown.id), getItems(), getSummonerSpells(), getRuneIndex()]);
  const after = cardNumbers(shown, shownDraft, stats.role, champs);
  // Comparación "tu campeón → vista previa": sin campeón propio, el lado izquierdo queda vacío.
  const before = preview ? (me ? cardNumbers(me, draft, stats.role, champs) : null) : undefined;
  const opp = shownDraft.laneOpponent;

  const banTab =
    !locked && myRole
      ? [
          {
            label: "Bloqueos",
            panel: (
              <BanSuggestions
                bans={bans.flatMap((b) => (champs[b.key] ? [{ key: b.key, id: champs[b.key].id, name: champs[b.key].name, reason: b.reason }] : []))}
                roleLabel={ROLE_LABEL[myRole].toLowerCase()}
                version={version}
              />
            ),
          },
        ]
      : [];
  const tabs = [
    ...(banPhase ? banTab : []),
    ...(!locked && picks.length
      ? [
          {
            label: "Recomendaciones",
            panel: (
              <Recommendations
                picks={picks.flatMap((p) =>
                  champs[p.key]
                    ? [{ key: p.key, id: champs[p.key].id, name: champs[p.key].name, winRate: p.winRate, reasons: p.reasons, fewGames: fewGames(p) }]
                    : [],
                )}
                roleLabel={ROLE_LABEL[picks[0].role].toLowerCase()}
                shownKey={shown.key}
                meKey={me?.key ?? null}
                version={version}
                baseQuery={baseQuery}
              />
            ),
          },
        ]
      : []),
    {
      label: "Emparejamiento",
      panel: (
        <div className="space-y-3">
          {!opp && (
            <p className="text-sm text-muted">Cuando tu rival de línea elija, aquí aparecen consejos para jugarle y qué comprar contra él.</p>
          )}
          <EnemyIntel draft={shownDraft} champs={champs} version={version} />
          {opp && <MatchupBuildDetail compact champ={shown} role={stats.role} opponent={opp.key} champs={champs} version={version} />}
        </div>
      ),
    },
    ...(banPhase ? [] : banTab),
  ];

  return (
    <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-3">
        <ChampionHeader
          me={me}
          shown={shown}
          preview={Boolean(preview)}
          pickedPreview={pickedPreview}
          tier={stats.summary?.tier}
          role={stats.role}
          locked={locked}
          version={version}
          rank={rank}
          baseQuery={baseQuery}
        />
        <ScoreCard before={before} after={after} me={me} shown={shown} />
        <PanelTabs tabs={tabs} />
      </div>
      <Encounters me={shown} draft={shownDraft} champs={champs} version={version} />
      <div className="space-y-4">
        <BuildPacks
          me={shown}
          stats={stats}
          enemies={shownDraft.enemies.map((e) => champs[e.key]).filter(Boolean)}
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

interface CardNumbers {
  /** Puntuación global: winrate esperado en este draft. */
  global: number | null;
  /** Fase de líneas: winrate contra el rival de línea (o el promedio, si no eligió). */
  lane: number | null;
  laneBlind: boolean;
  winRate: number;
  synergy: number | null;
  counter: number | null;
  /** Parte del daño del equipo propio que es física. */
  physical: number;
  /** Oro al 15 contra el rival de línea. */
  gold15: number | null;
  reason: string | null;
  opponent: ChampionSummary | undefined;
}

function cardNumbers(champ: ChampionSummary, d: DraftInsights, role: Role, champs: Champs): CardNumbers {
  const laneCell = d.encounters.find((e) => e.role === role)?.enemy;
  const average = (cells: (EncounterCell | null)[]) => {
    const withData = cells.filter((c): c is EncounterCell => c !== null && c.games > 0);
    return withData.length ? withData.reduce((s, c) => s + c.winRate, 0) / withData.length : null;
  };
  // Tipo de daño del equipo propio, según el perfil de cada campeón en Data Dragon.
  const team = [champ, ...d.allies.map((a) => champs[a.key]).filter(Boolean)];
  const attack = team.reduce((s, c) => s + c.info.attack, 0);
  const magic = team.reduce((s, c) => s + c.info.magic, 0);
  const opp = d.laneOpponent;
  const opponent = opp ? champs[opp.key] : undefined;
  return {
    global: d.estimatedWinRate,
    lane: laneCell && laneCell.games > 0 ? laneCell.winRate : null,
    laneBlind: Boolean(laneCell?.blind),
    winRate: d.baseWinRate,
    synergy: average(d.encounters.map((e) => e.ally)),
    counter: average(d.encounters.map((e) => e.enemy)),
    physical: attack + magic ? attack / (attack + magic) : 0.5,
    gold15: opp?.lane?.gold15 ?? null,
    reason: opp && opponent ? counterReason(champ, opponent, opp.lane, opp.winRate < 0.5) : null,
    opponent,
  };
}

function ChampionHeader({
  me,
  shown,
  preview,
  pickedPreview,
  tier,
  role,
  locked,
  version,
  rank,
  baseQuery,
}: {
  me: ChampionSummary | undefined;
  shown: ChampionSummary;
  preview: boolean;
  pickedPreview: boolean;
  tier: Parameters<typeof TierBadge>[0]["tier"] | undefined;
  role: Role;
  locked: boolean;
  version: string;
  rank: RankFilter;
  baseQuery: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-line bg-surface p-3">
      {preview && (
        <>
          {me ? (
            <ChampIcon version={version} id={me.id} name={me.name} size={36} />
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-night text-dim" title="Sin campeón todavía">
              —
            </span>
          )}
          <span className="text-muted" aria-hidden="true">
            →
          </span>
        </>
      )}
      <ChampIcon version={version} id={shown.id} name={shown.name} size={preview ? 36 : 48} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 font-display text-xl font-semibold">
          <Link href={`/campeones/${shown.id}?role=${role}&rank=${rank}`} className="truncate hover:text-gold-soft">
            {shown.name}
          </Link>
          {tier && <TierBadge tier={tier} />}
        </p>
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <RoleIcon role={role} size={12} />
          {ROLE_LABEL[role]}
          {preview ? (pickedPreview ? " · vista previa" : " · mejor pick para este draft") : !locked ? " · sin bloquear" : ""}
        </p>
      </div>
      {pickedPreview && (
        <Link href={`/en-vivo?${baseQuery}`} scroll={false} className="shrink-0 text-xs text-muted underline hover:text-ink">
          {me ? `Volver a ${me.name}` : "Quitar"}
        </Link>
      )}
    </div>
  );
}

/** Valor con comparación opcional, "antes → ahora". `before` undefined: sin comparación; null: no había campeón. */
function Compare<T>({ before, after, render }: { before: T | null | undefined; after: T; render: (v: T) => React.ReactNode }) {
  if (before === undefined) return <>{render(after)}</>;
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="opacity-60">{before === null ? <span className="text-dim">—</span> : render(before)}</span>
      <span className="text-sm text-dim" aria-hidden="true">
        →
      </span>
      {render(after)}
    </span>
  );
}

function Score({ wr }: { wr: number | null }) {
  if (wr === null) return <span className="text-dim">—</span>;
  const score = scoreOf(wr);
  return <span className={scoreClass(score)}>{formatScore(score)}</span>;
}

function ScoreCard({
  before,
  after,
  me,
  shown,
}: {
  before: CardNumbers | null | undefined;
  after: CardNumbers;
  me: ChampionSummary | undefined;
  shown: ChampionSummary;
}) {
  const prev = <K extends keyof CardNumbers>(k: K): CardNumbers[K] | null | undefined =>
    before === undefined ? undefined : before === null ? null : before[k];
  const oneSided = after.physical > 0.7 || after.physical < 0.3;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <ScoreTile label="Puntuación global" hint={`Cómo te va en este draft: tu winrate más el efecto de cada campeón elegido. ${SCORE_HINT}`}>
          <Compare before={prev("global")} after={after.global} render={(v) => <Score wr={v} />} />
          {after.global !== null && before === undefined && <span className="ml-2 text-sm font-normal text-muted">{pct(after.global)}</span>}
        </ScoreTile>
        <ScoreTile
          label="Fase de líneas"
          hint={
            after.laneBlind
              ? `Rival de línea sin elegir: promedio contra todos los de tu línea. ${SCORE_HINT}`
              : `Tu winrate contra el rival de tu línea. ${SCORE_HINT}`
          }
        >
          <Compare before={prev("lane")} after={after.lane} render={(v) => <Score wr={v} />} />
          {after.laneBlind && after.lane !== null && <span className="text-loss">*</span>}
        </ScoreTile>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-line bg-surface p-3">
        <Metric label="Maestría">
          <Compare before={before === undefined ? undefined : (me?.key ?? null)} after={shown.key} render={(k) => <MasteryPoints championKey={k} />} />
        </Metric>
        <Metric label="Winrate" hint="Winrate del campeón en tu línea, en todas las partidas.">
          <Compare before={prev("winRate")} after={after.winRate} render={(v) => <span className={scoreClass(scoreOf(v))}>{pct(v)}</span>} />
        </Metric>
        <Metric label="Sinergia promedio" hint={`Promedio con tus aliados (los que no eligieron cuentan por su línea). ${SCORE_HINT}`}>
          <Compare before={prev("synergy")} after={after.synergy} render={(v) => <Score wr={v} />} />
        </Metric>
        <Metric label="Counter promedio" hint={`Promedio contra los rivales (los que no eligieron cuentan por su línea). ${SCORE_HINT}`}>
          <Compare before={prev("counter")} after={after.counter} render={(v) => <Score wr={v} />} />
        </Metric>
      </dl>

      <div className="space-y-2.5 rounded-lg border border-line bg-surface p-3 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs text-muted" title="Parte del daño de tu equipo que es físico, según los campeones ya elegidos.">
            Daño físico del equipo
          </span>
          <Compare
            before={prev("physical")}
            after={after.physical}
            render={(v) => <span className={v > 0.7 || v < 0.3 ? "text-gold-soft" : "text-ink"}>{pct(v)}</span>}
          />
        </div>
        <div className="flex h-1.5 overflow-hidden rounded-full bg-night" aria-hidden="true">
          <div className="bg-loss/80" style={{ width: `${after.physical * 100}%` }} />
          <div className="flex-1 bg-hex/80" />
        </div>
        {oneSided && (
          <p className="text-xs text-gold-soft">
            Tu equipo hace casi todo daño {after.physical > 0.7 ? "físico" : "mágico"}: al rival le basta con comprar{" "}
            {after.physical > 0.7 ? "armadura" : "resistencia mágica"}.
          </p>
        )}
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs text-muted" title={`Diferencia de oro al minuto 15 contra tu rival de línea. ${SCORE_HINT}`}>
            Ventaja temprana
          </span>
          <Compare
            before={prev("gold15")}
            after={after.gold15}
            render={(v) =>
              v === null ? (
                <span className="text-dim">—</span>
              ) : (
                <span className="inline-flex items-baseline gap-1.5">
                  <span className={`font-semibold ${scoreClass(goldScore(v))}`}>{formatScore(goldScore(v))}</span>
                  <span className="text-xs text-muted">
                    {v >= 0 ? "+" : "−"}
                    {Math.round(Math.abs(v))} de oro
                  </span>
                </span>
              )
            }
          />
        </div>
        {after.reason && after.opponent && (
          <p className="border-t border-line/60 pt-2 text-xs text-muted">
            <span className="text-ink">Contra {after.opponent.name}:</span> {after.reason}
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

function Metric({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div title={hint}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-display text-xl font-semibold">{children}</dd>
    </div>
  );
}

function AverageValue({ cells }: { cells: EncounterCell[] }) {
  const withData = cells.filter((c) => c.games > 0);
  if (!withData.length) return <span className="text-dim">—</span>;
  return <Score wr={withData.reduce((s, c) => s + c.winRate, 0) / withData.length} />;
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
        <span className="text-loss">*</span> Todavía sin campeón: se usa tu promedio contra esa línea. Puntaje de 0 a 5 (2.5 es parejo,
        desde 3 es ventaja); debajo, tu winrate en ese cruce.
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
  const score = scoreOf(cell.winRate);
  return (
    <span className={`leading-tight ${className}`} title={`${pct(cell.winRate)} en ${compact(cell.games)} partidas`}>
      <span className={`block font-display text-xl font-semibold ${scoreClass(score)}`}>
        {formatScore(score)}
        {cell.blind && <span className="text-loss">*</span>}
      </span>
      <span className="text-xs text-dim">{pct(cell.winRate)}</span>
    </span>
  );
}

/* ---------- Emparejamiento ---------- */

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
    <section className="space-y-3 text-sm">
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
