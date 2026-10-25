/**
 * Build de la selección de campeones: objetos y habilidades (bajo los
 * encuentros) y, en la columna derecha, los tres packs completos (runas,
 * objetos, hechizos y habilidades) para importar al cliente de una vez.
 */
import { ItemPath, SHARDS, SkillOrder, SpellPair, parseRunePage, skillPriority } from "@/components/build";
import { ItemIcon, RuneIcon, SpellIcon } from "@/components/icons";
import { AutoImportBuild, ImportBuildButton } from "@/components/live-client";
import type { ChampionDetail, ChampionSummary, Item, Rune, SummonerSpell } from "@/lib/ddragon";
import { pct } from "@/lib/format";
import { runeKeyToPage, type BuildPayload } from "@/lib/live";
import type { Stat, getChampionStats } from "@/lib/stats";
import { PackTabs } from "./pack-tabs";

type Stats = NonNullable<Awaited<ReturnType<typeof getChampionStats>>>;

export function ItemsAndSkills({
  stats,
  detail,
  items,
  version,
}: {
  stats: Stats;
  detail: ChampionDetail | null;
  items: Record<string, Item>;
  version: string;
}) {
  const abilityNames = Object.fromEntries(["Q", "W", "E", "R"].map((k, i) => [k, detail?.spells[i]?.name ?? k]));
  // Los objetos principales ya están en la build completa de cada Top: aquí solo va cómo empezar.
  const starter = stats.starters[0];
  if (!starter && !stats.skills[0]) return null;
  return (
    <section className="space-y-3 rounded-lg border border-line bg-surface p-3" aria-labelledby="objetos">
      <h2 id="objetos" className="sr-only">
        Inicio y habilidades
      </h2>
      {starter && (
        <div>
          <h3 className="mb-2 text-xs text-muted">Compra inicial</h3>
          <ItemPath ids={starter.key.split("-")} version={version} items={items} />
        </div>
      )}
      {stats.skills[0] && (
        <div className={starter ? "border-t border-line/60 pt-3" : ""}>
          <SkillOrder sequence={stats.skills[0].key} abilityNames={abilityNames} compact />
        </div>
      )}
    </section>
  );
}

/* ---------- Packs Top 1 / 2 / 3 ---------- */

interface Pack {
  rune: Stat | undefined;
  core: Stat | undefined;
  boots: Stat | undefined;
  /** Por qué se cambiaron las botas según los rivales (null si son las de siempre). */
  bootsReason: string | null;
  starter: Stat | undefined;
  spell: Stat | undefined;
  skill: Stat | undefined;
}

const STEELCAPS = "3047";
const MERCURY = "3111";

/**
 * Botas según el draft: con rivales de casi puro daño físico (o mágico) y esas
 * botas entre las más usadas del campeón, se priorizan Tabi o Mercurio.
 */
function draftBoots(boots: Stat[], draft: DraftProfile): { pick: Stat; reason: string } | null {
  const { physical } = draft;
  if (physical === null) return null;
  const want = physical >= 0.65 ? STEELCAPS : physical <= 0.35 ? MERCURY : null;
  const pick = want ? boots.find((b) => b.key === want) : undefined;
  if (!pick) return null;
  return { pick, reason: want === STEELCAPS ? "Rivales con mucho daño físico" : "Rivales con mucho daño mágico" };
}

/**
 * El pack N toma la N-ésima opción más usada de cada parte (runas, objetos,
 * hechizos, habilidades). Si una parte tiene menos alternativas, repite la
 * más usada: así el Top 3 nunca queda con huecos. Las botas se ajustan al draft.
 */
function buildPacks(stats: Stats, draft: DraftProfile): Pack[] {
  const at = (list: Stat[], i: number) => list[i] ?? list[0];
  const count = Math.min(3, Math.max(stats.runes.length, stats.core.length, stats.spells.length));
  const boots = draftBoots(stats.boots, draft);
  return Array.from({ length: count }, (_, i) => ({
    rune: at(stats.runes, i),
    core: at(stats.core, i),
    boots: boots?.pick ?? at(stats.boots, i),
    bootsReason: boots?.reason ?? null,
    starter: at(stats.starters, i),
    spell: at(stats.spells, i),
    skill: at(stats.skills, i),
  }));
}

/* ---------- Set de objetos para la tienda ---------- */

/** Campeones que se curan mucho: contra ellos conviene un objeto de Heridas Graves. */
const HEALERS = new Set([
  "Aatrox",
  "Briar",
  "DrMundo",
  "Fiddlesticks",
  "Illaoi",
  "Milio",
  "Nami",
  "Olaf",
  "Soraka",
  "Sona",
  "Swain",
  "Sylas",
  "Vladimir",
  "Warwick",
  "Yuumi",
]);

/** Respaldo por clase cuando el campeón casi no registra ese tipo de objeto en las estadísticas. */
const FALLBACK: Record<"armor" | "mr", Record<string, string[]>> = {
  armor: {
    Mage: ["3157"],
    Assassin: ["3026"],
    Marksman: ["3026"],
    Fighter: ["3143", "6665"],
    Tank: ["3075", "3143"],
    Support: ["3190", "3050"],
  },
  mr: {
    Mage: ["3102"],
    Assassin: ["3156"],
    Marksman: ["3139"],
    Fighter: ["3156", "3065"],
    Tank: ["4401", "3065"],
    Support: ["3222", "3190"],
  },
};

const POTION = "2003";
const CONTROL_WARD = "2055";

interface DraftProfile {
  /** Fracción de daño físico de los rivales elegidos (null con menos de 3). */
  physical: number | null;
  healers: string[];
}

function draftProfile(enemies: ChampionSummary[]): DraftProfile {
  const attack = enemies.reduce((s, c) => s + c.info.attack, 0);
  const magic = enemies.reduce((s, c) => s + c.info.magic, 0);
  return {
    physical: enemies.length >= 3 && attack + magic ? attack / (attack + magic) : null,
    healers: enemies.filter((c) => HEALERS.has(c.id)).map((c) => c.name),
  };
}

const isAp = (me: ChampionSummary) => me.info.magic > me.info.attack;

function antiHeal(me: ChampionSummary): string {
  if (me.tags[0] === "Tank" || me.tags[0] === "Support") return isAp(me) ? "3165" : "3075";
  if (isAp(me)) return "3165";
  return me.tags[0] === "Marksman" ? "3033" : "6609";
}

/** Elixir según el estilo del campeón: hierro para tanques, brujería para magos, furia para el resto. */
function elixir(me: ChampionSummary): string {
  if (me.tags[0] === "Tank") return "2138";
  return isAp(me) ? "2139" : "2140";
}

/**
 * Build completa de 6 objetos: el núcleo del pack con las botas como segundo
 * objeto (como se suele comprar) y lo que más se arma después.
 */
function fullBuild(pack: Pack, stats: Stats): string[] {
  const core = pack.core?.key.split("-") ?? [];
  const order = [core[0], pack.boots?.key, ...core.slice(1), ...stats.situational.map((s) => s.key)];
  return [...new Set(order.filter((id): id is string => Boolean(id)))].slice(0, 6);
}

/**
 * Objetos que pide la partida: resistencias contra el tipo de daño que más
 * hacen los rivales y Heridas Graves contra campeones que se curan. Primero
 * los que el campeón ya arma según las estadísticas; si no hay, uno típico de su clase.
 */
function draftItems(me: ChampionSummary, draft: DraftProfile, stats: Stats, items: Record<string, Item>, exclude: Set<string>) {
  const reasons: string[] = [];
  const picks: string[] = [];
  const add = (ids: string[]) => {
    for (const id of ids) if (!exclude.has(id) && !picks.includes(id) && items[id]) picks.push(id);
  };
  const fromStats = (tag: string) =>
    stats.situational
      .map((s) => s.key)
      .filter((id) => items[id]?.tags.includes(tag))
      .slice(0, 2);
  const withFallback = (tag: string, kind: "armor" | "mr") => {
    const own = fromStats(tag);
    return own.length ? own : (FALLBACK[kind][me.tags[0]] ?? []);
  };
  if (draft.physical !== null && draft.physical >= 0.6) {
    reasons.push("mucho daño físico");
    add(withFallback("Armor", "armor"));
  } else if (draft.physical !== null && draft.physical <= 0.4) {
    reasons.push("mucho daño mágico");
    add(withFallback("SpellBlock", "mr"));
  }
  if (draft.healers.length) {
    reasons.push(`curación (${draft.healers.join(", ")})`);
    add([antiHeal(me)]);
  }
  return { reasons, items: picks };
}

function payloadFor(me: ChampionSummary, pack: Pack, stats: Stats, draft: DraftProfile, items: Record<string, Item>): BuildPayload {
  const build = fullBuild(pack, stats);
  const used = new Set(build);
  const vsDraft = draftItems(me, draft, stats, items, used);
  vsDraft.items.forEach((id) => used.add(id));
  const blocks = [
    { title: "Compra inicial", items: pack.starter?.key.split("-") ?? [] },
    // Soportes: a qué mejorar el objeto de soporte al completar la misión.
    { title: "Mejora del objeto de soporte", items: stats.supportItems.map((s) => s.key).slice(0, 2) },
    { title: "Build completa", items: build },
    { title: `Según la partida: ${vsDraft.reasons.join(" y ")}`, items: vsDraft.items },
    {
      title: "Situacionales",
      items: stats.situational
        .map((s) => s.key)
        .filter((id) => !used.has(id))
        .slice(0, 6),
    },
    { title: "Consumibles", items: [POTION, CONTROL_WARD, elixir(me)] },
  ].filter((b) => b.items.length > 0);
  const spells = pack.spell?.key.split("-").map(Number);
  return {
    championId: Number(me.key),
    championName: me.name,
    runes: pack.rune ? runeKeyToPage(pack.rune.key, `RiftLab ${me.name}`) : null,
    spells: spells?.length === 2 ? [spells[0], spells[1]] : null,
    blocks,
  };
}

export function BuildPacks({
  me,
  stats,
  enemies,
  detail,
  items,
  runeIndex,
  spells,
  version,
}: {
  me: ChampionSummary;
  stats: Stats;
  /** Rivales ya elegidos: ajustan las botas. */
  enemies: ChampionSummary[];
  detail: ChampionDetail | null;
  items: Record<string, Item>;
  runeIndex: Record<number, Rune>;
  spells: Record<string, SummonerSpell>;
  version: string;
}) {
  const draft = draftProfile(enemies);
  const packs = buildPacks(stats, draft);
  if (!packs.length) return null;
  return (
    <section className="rounded-lg border border-line bg-surface p-3" aria-labelledby="packs">
      <h2 id="packs" className="text-center font-display text-lg font-semibold">
        Builds
      </h2>
      <p className="mt-1 mb-3 text-center text-xs text-muted">Las más jugadas con este campeón en este rol (victorias y uso).</p>
      <AutoImportBuild championKey={me.key} build={payloadFor(me, packs[0], stats, draft, items)} />
      {packs.length < 3 && (
        <p className="mb-3 text-xs text-dim">
          Solo {packs.length === 1 ? "una build tiene" : `${packs.length} builds tienen`} partidas suficientes con este campeón en este rol.
        </p>
      )}
      <PackTabs
        tabs={packs.map((pack, i) => {
          const reference = pack.core ?? pack.rune;
          return {
            label: `Top ${i + 1}`,
            hint: reference ? `${pct(reference.winRate)} · ${pct(reference.share)} uso` : "",
            panel: (
              <PackCard
                pack={pack}
                build={payloadFor(me, pack, stats, draft, items)}
                detail={detail}
                items={items}
                runeIndex={runeIndex}
                spells={spells}
                version={version}
              />
            ),
          };
        })}
      />
    </section>
  );
}

function PackCard({
  pack,
  build,
  detail,
  items,
  runeIndex,
  spells,
  version,
}: {
  pack: Pack;
  build: BuildPayload;
  detail: ChampionDetail | null;
  items: Record<string, Item>;
  runeIndex: Record<number, Rune>;
  spells: Record<string, SummonerSpell>;
  version: string;
}) {
  const block = (prefix: string) => build.blocks.find((b) => b.title.startsWith(prefix));
  const keyItems = block("Build completa")?.items ?? [];
  const vsDraft = block("Según la partida");
  return (
    <article className="flex flex-col gap-4 rounded-lg border border-line bg-night/40 p-3">
      <div className="grid grid-cols-2 gap-x-4 gap-y-4">
        <div>
          <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Build completa</h4>
          {pack.bootsReason && <p className="-mt-1 mb-1.5 text-[11px] text-gold-soft">Botas: {pack.bootsReason.toLowerCase()}</p>}
          <div className="grid w-fit grid-cols-3 gap-1.5">
            {keyItems.map((id, j) => (
              <ItemIcon key={`${id}-${j}`} version={version} id={id} name={items[id]?.name} size={36} />
            ))}
          </div>
        </div>
        <div>
          <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Runas</h4>
          {pack.rune ? <CompactRunes runeKey={pack.rune.key} runeIndex={runeIndex} /> : <p className="text-xs text-dim">Sin datos</p>}
        </div>
        <div>
          <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Hechizos</h4>
          {pack.spell ? (
            <SpellPair spellKey={pack.spell.key} spells={spells} version={version} />
          ) : (
            <p className="text-xs text-dim">Sin datos</p>
          )}
        </div>
        <div>
          <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Habilidades</h4>
          {pack.skill ? (
            <SkillIcons sequence={pack.skill.key} detail={detail} version={version} />
          ) : (
            <p className="text-xs text-dim">Sin datos</p>
          )}
        </div>
      </div>
      {vsDraft && (
        <div className="flex items-center gap-2 rounded-md border border-gold/30 bg-gold/5 px-2 py-1.5">
          <p className="min-w-0 flex-1 text-[11px] leading-tight text-gold-soft">{vsDraft.title}</p>
          {vsDraft.items.map((id) => (
            <ItemIcon key={id} version={version} id={id} name={items[id]?.name} size={28} />
          ))}
        </div>
      )}
      <div className="mt-auto">
        <ImportBuildButton build={build} />
      </div>
    </article>
  );
}

/** Piedra angular grande, el resto de las runas y los fragmentos en chico. */
function CompactRunes({ runeKey, runeIndex }: { runeKey: string; runeIndex: Record<number, Rune> }) {
  const page = parseRunePage(runeKey);
  const [keystone, ...rest] = page.primary.map((id) => runeIndex[id]).filter(Boolean);
  const secondary = page.secondary.map((id) => runeIndex[id]).filter(Boolean);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        {keystone && (
          <span className="rounded-full ring-2 ring-gold">
            <RuneIcon icon={keystone.icon} name={keystone.name} size={34} />
          </span>
        )}
        {rest.map((r) => (
          <RuneIcon key={r.id} icon={r.icon} name={r.name} size={26} />
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        {secondary.map((r) => (
          <RuneIcon key={r.id} icon={r.icon} name={r.name} size={24} />
        ))}
        {page.shards.map((id, j) =>
          SHARDS[id] ? <RuneIcon key={`${id}-${j}`} icon={SHARDS[id].icon} name={SHARDS[id].name} size={16} /> : null,
        )}
      </div>
    </div>
  );
}

/** Orden de maximización con el ícono de cada habilidad: W > E > Q. */
function SkillIcons({ sequence, detail, version }: { sequence: string; detail: ChampionDetail | null; version: string }) {
  return (
    <div className="flex items-center gap-1.5">
      {skillPriority(sequence).map((k, i) => {
        const spell = detail?.spells["QWE".indexOf(k)];
        return (
          <span key={k} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-dim">&gt;</span>}
            <span className="relative">
              {spell ? <SpellIcon version={version} file={spell.image.full} name={spell.name} size={32} /> : null}
              <span className="absolute -right-1 -bottom-1 rounded bg-night px-1 font-display text-xs font-bold text-gold-soft">{k}</span>
            </span>
          </span>
        );
      })}
    </div>
  );
}
