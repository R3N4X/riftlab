/**
 * Build según el rival directo: qué objetos y runa clave usa un campeón
 * contra un rival concreto y qué cambia respecto de su build de siempre.
 * Sale de `vs` en el agregado (solo partidas con rival directo de línea).
 */
import Link from "next/link";
import type { Role } from "@/lib/constants";
import { getItems, getRuneIndex, type ChampionSummary } from "@/lib/ddragon";
import { pct, wrClass } from "@/lib/format";
import { getMatchupBuild, getMatchupOpponents } from "@/lib/stats";
import { ChampIcon, ItemIcon, RuneIcon } from "./icons";

type Champs = Record<string, ChampionSummary>;

/** Recuadro completo para la página del campeón, con la lista de rivales para elegir. */
export async function MatchupBuildPanel({
  champ,
  role,
  opponent,
  champs,
  version,
  hrefFor,
}: {
  champ: ChampionSummary;
  role: Role;
  opponent: string | null;
  champs: Champs;
  version: string;
  /** Link de la página con ese rival elegido. */
  hrefFor: (opponentKey: string) => string;
}) {
  const opponents = await getMatchupOpponents(champ.key, role);
  if (!opponents.length) {
    return (
      <p className="text-sm text-muted">
        Todavía no hay partidas suficientes de {champ.name} contra rivales concretos. El recolector las junta desde el 25 de octubre: vuelve
        en unos días.
      </p>
    );
  }
  const selected = opponent && opponents.some((o) => o.key === opponent) ? opponent : opponents[0].key;
  return (
    <div className="space-y-4">
      <ul className="flex flex-wrap gap-1.5" aria-label="Elige el rival">
        {opponents.slice(0, 14).map((o) => {
          const c = champs[o.key];
          if (!c) return null;
          const active = o.key === selected;
          return (
            <li key={o.key}>
              <Link
                href={hrefFor(o.key)}
                scroll={false}
                aria-current={active ? "true" : undefined}
                title={`Contra ${c.name} (${o.games} partidas)`}
                className={`block rounded-md p-0.5 ${active ? "ring-2 ring-gold" : "opacity-70 hover:opacity-100"}`}
              >
                <ChampIcon version={version} id={c.id} name={c.name} size={34} />
              </Link>
            </li>
          );
        })}
      </ul>
      <MatchupBuildDetail champ={champ} role={role} opponent={selected} champs={champs} version={version} />
    </div>
  );
}

/** Detalle contra un rival (también lo usa En vivo, en versión corta). */
export async function MatchupBuildDetail({
  champ,
  role,
  opponent,
  champs,
  version,
  compact = false,
}: {
  champ: ChampionSummary;
  role: Role;
  opponent: string;
  champs: Champs;
  version: string;
  compact?: boolean;
}) {
  const [info, items, runes] = await Promise.all([getMatchupBuild(champ.key, role, opponent), getItems(), getRuneIndex()]);
  const opp = champs[opponent];
  if (!info || !opp) {
    return compact ? null : <p className="text-sm text-muted">Pocas partidas contra este rival todavía.</p>;
  }
  const keystone = info.keystone ? runes[Number(info.keystone.id)] : undefined;

  if (compact) {
    if (!info.risers.length) return null;
    return (
      <div className="rounded-lg border border-line bg-surface p-3 text-sm">
        <p className="mb-2 flex items-center gap-2 font-semibold">
          <ChampIcon version={version} id={opp.id} name={opp.name} size={22} />
          Contra {opp.name} se compra más
        </p>
        <ul className="flex flex-wrap gap-2">
          {info.risers.map((i) => (
            <li key={i.id} className="flex items-center gap-1.5 rounded-md bg-raised/50 py-1 pr-2 pl-1" title={items[i.id]?.name}>
              <ItemIcon version={version} id={i.id} name={items[i.id]?.name} size={26} />
              <span className="text-xs">
                <span className="block max-w-28 truncate">{items[i.id]?.name}</span>
                <span className="text-win">+{Math.round(i.lift * 100)} %</span>{" "}
                <span className={wrClass(i.winRate)}>{pct(i.winRate, 0)}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-1.5 text-[11px] text-dim">
          {info.games} partidas de {champ.name} contra {opp.name}.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        {info.games} partidas de {champ.name} contra {opp.name}, <span className={wrClass(info.winRate)}>{pct(info.winRate)}</span> de
        victorias.
      </p>
      {info.risers.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">Lo que cambia contra {opp.name}</h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {info.risers.map((i) => (
              <li key={i.id} className="flex items-center gap-2.5 rounded-md border border-win/30 bg-win/5 p-2">
                <ItemIcon version={version} id={i.id} name={items[i.id]?.name} size={32} />
                <span className="min-w-0 text-xs">
                  <span className="block truncate text-sm">{items[i.id]?.name}</span>
                  <span className="text-win">Se compra {Math.round(i.lift * 100)} % más que de costumbre</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <h3 className="mb-2 text-sm font-semibold">Objetos más comprados contra {opp.name}</h3>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {info.items.map((i) => (
            <li key={i.id} className="flex items-center gap-2 rounded-md bg-raised/50 p-2">
              <ItemIcon version={version} id={i.id} name={items[i.id]?.name} size={30} />
              <span className="min-w-0 text-xs">
                <span className="block truncate">{items[i.id]?.name}</span>
                <span className="text-muted">{pct(i.share, 0)}</span> · <span className={wrClass(i.winRate)}>{pct(i.winRate, 0)}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-1.5 text-[11px] text-dim">Porcentaje de partidas en que se compró y winrate con ese objeto.</p>
      </div>
      {keystone && info.keystone && (
        <p className="flex items-center gap-2 text-sm">
          <RuneIcon icon={keystone.icon} name={keystone.name} size={28} />
          Runa clave más usada: <span className="font-semibold">{keystone.name}</span>
          <span className="text-muted">
            ({pct(info.keystone.share, 0)}, <span className={wrClass(info.keystone.winRate)}>{pct(info.keystone.winRate, 0)}</span>)
          </span>
        </p>
      )}
    </div>
  );
}
