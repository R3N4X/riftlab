/*
 * Vista de /en-vivo cuando la partida ya empezó: enfrentamiento de línea,
 * ventaja de escalado por duración, build y emparejamientos de cada línea.
 */
import { ItemPath, SkillOrder } from "@/components/build";
import { ChampIcon, RoleIcon } from "@/components/icons";
import { MatchupBuildDetail } from "@/components/matchup-build";
import { ROLE_LABEL, type RankFilter, type Role } from "@/lib/constants";
import { getChampion, getItems, type ChampionSummary } from "@/lib/ddragon";
import { compact, pct, wrClass } from "@/lib/format";
import { getChampionStats, type DraftInsights, type ScalingRow } from "@/lib/stats";
import { counterReason } from "@/lib/stats/reasons";

type Champs = Record<string, ChampionSummary>;

export async function GameView({
  me,
  myRole,
  rank,
  draft,
  champs,
  version,
}: {
  me: ChampionSummary;
  myRole: Role | null;
  rank: RankFilter;
  draft: DraftInsights;
  champs: Champs;
  version: string;
}) {
  const [stats, detail, items] = await Promise.all([getChampionStats(me.key, rank, myRole ?? undefined), getChampion(me.id), getItems()]);
  if (!stats) {
    return (
      <div className="rounded-lg border border-line bg-surface p-4 text-sm text-muted">
        Todavía no hay datos de {me.name} en este parche.
      </div>
    );
  }
  const abilityNames = Object.fromEntries(["Q", "W", "E", "R"].map((k, i) => [k, detail?.spells[i]?.name ?? k]));

  // Orden de build: los 3 principales y después los más comprados como 4.º a 6.º objeto.
  const core = stats.core[0]?.key.split("-") ?? [];
  const late = stats.late.map((s) => s.key).filter((id) => !core.includes(id));
  const order = [...core, ...late.slice(0, 3)];
  const alternatives = [...late.slice(3), ...stats.boots.map((b) => b.key)];

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <LaneMatchupPanel me={me} role={stats.role} draft={draft} champs={champs} version={version} />
          <ScalingPanel rows={draft.scaling} />
        </div>
        {draft.laneOpponent && (
          <MatchupBuildDetail compact champ={me} role={stats.role} opponent={draft.laneOpponent.key} champs={champs} version={version} />
        )}
        <section className="space-y-4 rounded-lg border border-line bg-surface p-4" aria-labelledby="build-partida">
          <h2 id="build-partida" className="font-display text-lg font-semibold">
            Build
          </h2>
          <div className="flex flex-wrap gap-x-10 gap-y-4">
            {stats.starters[0] && (
              <div>
                <h3 className="mb-2 text-xs text-muted">Objetos de inicio</h3>
                <ItemPath ids={stats.starters[0].key.split("-")} version={version} items={items} />
              </div>
            )}
            {order.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs text-muted">Orden de build</h3>
                <ItemPath ids={order} version={version} items={items} />
              </div>
            )}
            {alternatives.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs text-muted">Alternativas y botas</h3>
                <div className="flex flex-wrap gap-1.5">
                  {alternatives.map((id) => (
                    <ItemPath key={id} ids={[id]} version={version} items={items} />
                  ))}
                </div>
              </div>
            )}
          </div>
          {stats.skills[0] && (
            <div className="border-t border-line/60 pt-4">
              <SkillOrder sequence={stats.skills[0].key} abilityNames={abilityNames} />
            </div>
          )}
        </section>
      </div>

      <div className="space-y-4">
        <LaneStatePanel me={me} role={stats.role} draft={draft} version={version} />
        <LanesPanel draft={draft} champs={champs} version={version} />
      </div>
    </div>
  );
}

function LaneMatchupPanel({
  me,
  role,
  draft,
  champs,
  version,
}: {
  me: ChampionSummary;
  role: Role;
  draft: DraftInsights;
  champs: Champs;
  version: string;
}) {
  const opp = draft.laneOpponent;
  const oppChamp = opp ? champs[opp.key] : undefined;
  // En la línea inferior también cuenta el compañero del rival.
  const partnerRole: Role | null = role === "BOTTOM" ? "UTILITY" : role === "UTILITY" ? "BOTTOM" : null;
  const partner = partnerRole ? draft.versus.find((v) => v.role === partnerRole) : undefined;
  const partnerChamp = partner ? champs[partner.key] : undefined;
  const reason = opp && oppChamp ? counterReason(me, oppChamp, opp.lane, opp.winRate < 0.5) : null;

  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <h2 className="mb-3 font-display text-lg font-semibold">
        {oppChamp ? `Enfrentamiento contra ${oppChamp.name}${partnerChamp ? ` + ${partnerChamp.name}` : ""}` : "Enfrentamiento de línea"}
      </h2>
      {!opp || !oppChamp ? (
        <p className="text-sm text-muted">No se identificó a tu rival de línea.</p>
      ) : opp.games === 0 ? (
        <p className="text-sm text-muted">No hay datos suficientes para este enfrentamiento.</p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <ChampIcon version={version} id={oppChamp.id} name={oppChamp.name} size={44} />
            <div>
              <p className={`font-display text-2xl font-semibold ${wrClass(opp.winRate)}`}>{pct(opp.winRate)}</p>
              <p className="text-xs text-muted">tu winrate en {compact(opp.games)} partidas</p>
            </div>
          </div>
          {opp.lane && (
            <dl className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md bg-raised/60 py-2">
                <dt className="text-xs text-muted">Oro al 15</dt>
                <dd className={opp.lane.gold15 >= 0 ? "text-win" : "text-loss"}>
                  {opp.lane.gold15 >= 0 ? "+" : "−"}
                  {Math.round(Math.abs(opp.lane.gold15))}
                </dd>
              </div>
              <div className="rounded-md bg-raised/60 py-2">
                <dt className="text-xs text-muted">Lo matas</dt>
                <dd>{opp.lane.kills.toFixed(1)}</dd>
              </div>
              <div className="rounded-md bg-raised/60 py-2">
                <dt className="text-xs text-muted">Te mata</dt>
                <dd>{opp.lane.deaths.toFixed(1)}</dd>
              </div>
            </dl>
          )}
          {reason && <p className="text-sm text-muted">{reason}</p>}
          {partner && partnerChamp && partner.games > 0 && (
            <p className="text-sm text-muted">
              Con {partnerChamp.name} en su equipo ganas el <span className={wrClass(partner.winRate)}>{pct(partner.winRate)}</span>.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

const PHASE_ROW: Record<ScalingRow["phase"], { label: string; range: string }> = {
  early: { label: "Inicio del juego", range: "menos de 26 min" },
  mid: { label: "Juego medio", range: "26 a 32 min" },
  late: { label: "Juego tardío", range: "33 min o más" },
};

function ScalingPanel({ rows }: { rows: ScalingRow[] }) {
  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <h2 className="mb-1 font-display text-lg font-semibold">Ventaja de escalado</h2>
      <p className="mb-3 text-xs text-muted">Cómo rinde cada equipo según cuánto dure la partida, frente a lo que suele ganar.</p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Todavía se están juntando partidas con su duración; este cálculo aparece a medida que llegan.</p>
      ) : (
        <>
          <ul className="divide-y divide-line/60">
            {rows.map((r) => {
              const advantage = r.ally - r.enemy;
              const tone = Math.abs(advantage) < 0.005 ? "text-muted" : advantage > 0 ? "text-win" : "text-loss";
              return (
                <li key={r.phase} className="flex items-center gap-3 py-2.5" title={`Muestra mínima: ${compact(r.games)} partidas`}>
                  <span className="w-32 text-sm">{PHASE_ROW[r.phase].label}</span>
                  <span className="flex-1 text-xs text-muted">{PHASE_ROW[r.phase].range}</span>
                  <span className={`font-display text-lg font-semibold ${tone}`}>
                    {advantage >= 0 ? "+" : "−"}
                    {pct(Math.abs(advantage))}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-dim">Positivo: esa etapa favorece a tu equipo.</p>
        </>
      )}
    </section>
  );
}

function LaneStatePanel({ me, role, draft, version }: { me: ChampionSummary; role: Role; draft: DraftInsights; version: string }) {
  const lane = draft.laneOpponent?.lane;
  const verdict = !lane ? null : lane.gold15 > 150 ? "Ventaja" : lane.gold15 < -150 ? "Desventaja" : "Parejo";
  const tone = verdict === "Ventaja" ? "text-win" : verdict === "Desventaja" ? "text-loss" : "text-gold-soft";
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="flex items-center gap-3 rounded-lg border border-line bg-surface p-3">
        <ChampIcon version={version} id={me.id} name={me.name} size={40} />
        <div className="min-w-0">
          <p className="truncate font-medium">{me.name}</p>
          <p className="flex items-center gap-1 text-xs text-muted">
            <RoleIcon role={role} size={11} />
            {ROLE_LABEL[role]}
          </p>
        </div>
      </div>
      <div
        className="rounded-lg border border-line bg-surface p-3"
        title="Según la diferencia de oro promedio al minuto 15 en este enfrentamiento."
      >
        <p className={`font-display text-lg font-semibold ${verdict ? tone : "text-dim"}`}>{verdict ?? "Sin datos"}</p>
        <p className="text-xs text-muted">Estado de la línea (0 a 15 min)</p>
      </div>
    </div>
  );
}

function LanesPanel({ draft, champs, version }: { draft: DraftInsights; champs: Champs; version: string }) {
  return (
    <section className="rounded-lg border border-line bg-surface p-3">
      <h2 className="mb-1 font-display text-lg font-semibold">Emparejamientos</h2>
      <p className="mb-3 text-xs text-muted">Winrate de cada campeón contra el de su misma línea.</p>
      <div className="grid grid-cols-5 gap-2 text-center">
        {draft.lanes.map((l) => {
          const a = l.ally ? champs[l.ally] : undefined;
          const e = l.enemy ? champs[l.enemy] : undefined;
          const wr = l.allyWinRate;
          return (
            <div
              key={l.role}
              className="flex min-w-0 flex-col items-center gap-1.5"
              title={l.games ? `${compact(l.games)} partidas` : "Sin partidas registradas"}
            >
              <span className={`text-sm font-semibold ${wr === null ? "text-dim" : wrClass(wr)}`}>{wr === null ? "—" : pct(wr, 0)}</span>
              <span className="w-full truncate text-xs">{a?.name ?? "—"}</span>
              <span className="rounded-md ring-2 ring-hex">
                {a ? (
                  <ChampIcon version={version} id={a.id} name={a.name} size={44} />
                ) : (
                  <span className="block h-11 w-11 rounded-md bg-night" />
                )}
              </span>
              <RoleIcon role={l.role} size={16} className="my-0.5 opacity-60" />
              <span className="rounded-md ring-2 ring-loss">
                {e ? (
                  <ChampIcon version={version} id={e.id} name={e.name} size={44} />
                ) : (
                  <span className="block h-11 w-11 rounded-md bg-night" />
                )}
              </span>
              <span className="w-full truncate text-xs">{e?.name ?? "—"}</span>
              <span className={`text-sm font-semibold ${wr === null ? "text-dim" : wrClass(1 - wr)}`}>
                {wr === null ? "—" : pct(1 - wr, 0)}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
