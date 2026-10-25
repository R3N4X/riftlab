import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ChampIcon, RankCrest, RoleIcon } from "@/components/icons";
import { profileStyle, scoreClass, type Axis } from "@/components/profile-highlights";
import { SummonerSearch } from "@/components/summoner-search";
import { ErrorNote, Panel, Skeleton } from "@/components/ui";
import { PLATFORMS, ROLE_LABEL, TIER_LABEL, isPlatform, type Platform, type Tier } from "@/lib/constants";
import { headToHead, loadComparedPlayer, type ComparedPlayer } from "@/lib/compare";
import { getChampionsByKey, getLatestVersion, img, type ChampionSummary } from "@/lib/ddragon";
import { kda } from "@/lib/format";
import { parseString } from "@/lib/params";
import { RiotApiError, hasRiotKey, riotIdToSlug, slugToRiotId } from "@/lib/riot";

export const metadata: Metadata = { title: "Comparar jugadores" };

export default function ComparePage({ searchParams }: PageProps<"/comparar">) {
  return (
    <Suspense fallback={<Skeleton rows={10} />}>
      <CompareContent searchParams={searchParams} />
    </Suspense>
  );
}

/** "la2:Nombre-TAG" → servidor y Riot ID. */
function parsePlayer(raw: string | null | undefined): { platform: Platform; gameName: string; tagLine: string; key: string } | null {
  if (!raw) return null;
  const idx = raw.indexOf(":");
  const platform = raw.slice(0, idx);
  const id = slugToRiotId(raw.slice(idx + 1));
  if (!isPlatform(platform) || !id) return null;
  return { platform, ...id, key: `${platform}:${id.gameName}-${id.tagLine}` };
}

async function load(p: NonNullable<ReturnType<typeof parsePlayer>>) {
  try {
    return { ok: true as const, player: await loadComparedPlayer(p.platform, p.gameName, p.tagLine) };
  } catch (err) {
    return {
      ok: false as const,
      message:
        err instanceof RiotApiError && err.status === 404
          ? `No encontramos a ${p.gameName}#${p.tagLine} en ${PLATFORMS[p.platform].label}.`
          : err instanceof Error
            ? err.message
            : "Error desconocido",
    };
  }
}

async function CompareContent({ searchParams }: Pick<PageProps<"/comparar">, "searchParams">) {
  await connection();
  const sp = await searchParams;
  const a = parsePlayer(parseString(sp, "a"));
  const b = parsePlayer(parseString(sp, "b"));

  if (!hasRiotKey()) {
    return (
      <Wrap>
        <ErrorNote title="Falta la clave de la API de Riot">Configúrala en Ajustes.</ErrorNote>
      </Wrap>
    );
  }

  if (!a || !b) {
    return (
      <Wrap>
        <h1 className="font-display text-4xl font-bold tracking-tight">Comparar jugadores</h1>
        <p className="text-muted">
          {a ? (
            <>
              Elige con quién comparar a <span className="text-ink">{a.gameName}</span>
              <span className="text-dim">#{a.tagLine}</span>.
            </>
          ) : (
            "Busca al primer jugador; desde su perfil, el botón Comparar abre esta página."
          )}
        </p>
        <div className="max-w-xl">
          <SummonerSearch size="sm" defaultPlatform={a?.platform} compareWith={a?.key} />
        </div>
      </Wrap>
    );
  }

  const [ra, rb, version, champs] = await Promise.all([load(a), load(b), getLatestVersion(), getChampionsByKey()]);
  if (!ra.ok || !rb.ok) {
    return (
      <Wrap>
        <ErrorNote title="No se pudo comparar">{!ra.ok ? ra.message : !rb.ok ? rb.message : ""}</ErrorNote>
      </Wrap>
    );
  }
  const pa = ra.player;
  const pb = rb.player;
  const sa = profileStyle(pa.matches, pa.account.puuid);
  const sb = profileStyle(pb.matches, pb.account.puuid);
  const h2h = headToHead(pa, pb);

  const A = pa.summary;
  const B = pb.summary;
  const rows: { label: string; a: number; b: number; fmt: (v: number) => string; lowerIsBetter?: boolean }[] = [
    { label: "Winrate", a: A.wins / Math.max(1, A.games), b: B.wins / Math.max(1, B.games), fmt: (v) => `${Math.round(v * 100)} %` },
    {
      label: "KDA",
      a: (A.kills + A.assists) / Math.max(1, A.deaths),
      b: (B.kills + B.assists) / Math.max(1, B.deaths),
      fmt: (v) => v.toFixed(2),
    },
    {
      label: "Muertes por partida",
      a: A.deaths / Math.max(1, A.games),
      b: B.deaths / Math.max(1, B.games),
      fmt: (v) => v.toFixed(1),
      lowerIsBetter: true,
    },
    { label: "Participación en asesinatos", a: A.kp, b: B.kp, fmt: (v) => `${Math.round(v * 100)} %` },
    { label: "Daño por minuto", a: A.dmgMin, b: B.dmgMin, fmt: (v) => String(Math.round(v)) },
    { label: "Oro por minuto", a: A.goldMin, b: B.goldMin, fmt: (v) => String(Math.round(v)) },
    { label: "Súbditos por minuto", a: A.csMin, b: B.csMin, fmt: (v) => v.toFixed(1) },
    { label: "Visión por minuto", a: A.visionMin, b: B.visionMin, fmt: (v) => v.toFixed(2) },
  ];
  const wins = rows.reduce(
    (acc, r) => {
      if (r.a === r.b) return acc;
      const aBetter = r.lowerIsBetter ? r.a < r.b : r.a > r.b;
      return aBetter ? { ...acc, a: acc.a + 1 } : { ...acc, b: acc.b + 1 };
    },
    { a: 0, b: 0 },
  );

  return (
    <Wrap>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-4xl font-bold tracking-tight">Comparar jugadores</h1>
        <Link
          href={`/comparar?a=${encodeURIComponent(b.key)}&b=${encodeURIComponent(a.key)}`}
          className="text-sm text-gold-soft hover:underline"
        >
          Invertir el orden
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
        <PlayerHead p={pa} version={version} side="a" style={sa} />
        <p className="text-center font-display text-2xl text-dim">vs</p>
        <PlayerHead p={pb} version={version} side="b" style={sb} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <Panel className="p-5">
          <h2 className="font-display text-xl font-semibold">Perfil de juego</h2>
          <p className="text-xs text-dim">Últimas 10 partidas de cada uno contra lo normal en su rol.</p>
          {sa && sb ? (
            <CompareRadar a={sa.axes} b={sb.axes} nameA={pa.account.gameName} nameB={pb.account.gameName} />
          ) : (
            <p className="mt-3 text-sm text-muted">Hacen falta al menos 3 partidas recientes de cada uno.</p>
          )}
        </Panel>

        <Panel className="p-5">
          <h2 className="font-display text-xl font-semibold">
            Cara a cara{" "}
            <span className="text-base font-normal text-muted">
              ({A.games} y {B.games} partidas recientes)
            </span>
          </h2>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-muted">
                <th className="py-1 text-left font-normal">
                  <span className="text-gold-soft">{pa.account.gameName}</span>
                </th>
                <th className="py-1 font-normal" />
                <th className="py-1 text-right font-normal">
                  <span className="text-hex">{pb.account.gameName}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const aBetter = r.a !== r.b && (r.lowerIsBetter ? r.a < r.b : r.a > r.b);
                const bBetter = r.a !== r.b && !aBetter;
                return (
                  <tr key={r.label} className="border-t border-line/60">
                    <td className={`py-1.5 font-semibold ${aBetter ? "text-win" : "text-muted"}`}>{r.fmt(r.a)}</td>
                    <td className="py-1.5 text-center text-xs text-dim">{r.label}</td>
                    <td className={`py-1.5 text-right font-semibold ${bBetter ? "text-win" : "text-muted"}`}>{r.fmt(r.b)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-3 text-sm text-muted">
            {wins.a === wins.b
              ? "Empatan en cantidad de estadísticas ganadas."
              : `${wins.a > wins.b ? pa.account.gameName : pb.account.gameName} gana en ${Math.max(wins.a, wins.b)} de ${rows.length} estadísticas.`}
          </p>
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel className="p-5 lg:col-span-1">
          <h2 className="font-display text-xl font-semibold">Entre ustedes</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li className="flex justify-between gap-3">
              <span className="text-muted">Juntos</span>
              <span>
                {h2h.together.games ? (
                  <>
                    {h2h.together.games} partidas, {Math.round((h2h.together.wins / h2h.together.games) * 100)} % de victorias
                  </>
                ) : (
                  <span className="text-dim">ninguna reciente</span>
                )}
              </span>
            </li>
            <li className="flex justify-between gap-3">
              <span className="text-muted">En contra</span>
              <span>
                {h2h.against.games ? (
                  <>
                    {h2h.against.games} partidas: {pa.account.gameName} ganó {h2h.against.winsA}
                  </>
                ) : (
                  <span className="text-dim">ninguna reciente</span>
                )}
              </span>
            </li>
          </ul>
        </Panel>
        {[pa, pb].map((p, i) => (
          <Panel key={p.account.puuid} className="p-5">
            <h2 className={`font-display text-xl font-semibold ${i === 0 ? "text-gold-soft" : "text-hex"}`}>
              Campeones de {p.account.gameName}
            </h2>
            <ChampList p={p} champs={champs} version={version} />
          </Panel>
        ))}
      </div>
    </Wrap>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <div className="max-w-6xl space-y-6 px-4 py-6 sm:px-8">{children}</div>;
}

function PlayerHead({
  p,
  version,
  side,
  style,
}: {
  p: ComparedPlayer;
  version: string;
  side: "a" | "b";
  style: ReturnType<typeof profileStyle>;
}) {
  const tone = side === "a" ? "border-gold/60" : "border-hex/60";
  return (
    <Panel className={`flex items-center gap-4 border-t-4 p-4 ${tone} ${side === "b" ? "md:flex-row-reverse md:text-right" : ""}`}>
      <img src={img.profileIcon(version, p.summoner.profileIconId)} alt="" width={64} height={64} className="h-16 w-16 rounded-xl" />
      <div className="min-w-0">
        <Link
          href={`/invocador/${p.platform}/${riotIdToSlug(p.account.gameName, p.account.tagLine)}`}
          className="block truncate font-display text-2xl font-semibold hover:text-gold-soft"
        >
          {p.account.gameName}
          <span className="text-base text-dim">#{p.account.tagLine}</span>
        </Link>
        <p className={`flex items-center gap-1.5 text-sm text-muted ${side === "b" ? "md:justify-end" : ""}`}>
          {p.solo ? (
            <>
              <RankCrest tier={p.solo.tier} size={18} />
              {TIER_LABEL[p.solo.tier as Tier] ?? p.solo.tier}{" "}
              {["MASTER", "GRANDMASTER", "CHALLENGER"].includes(p.solo.tier) ? "" : p.solo.rank} · {p.solo.leaguePoints} LP
            </>
          ) : (
            "Sin clasificar en Solo/Dúo"
          )}
          {p.summary.mainRole && (
            <>
              {" · "}
              <RoleIcon role={p.summary.mainRole} size={14} /> {ROLE_LABEL[p.summary.mainRole]}
            </>
          )}
        </p>
        {style && <p className="text-sm text-gold-soft">{style.title}</p>}
      </div>
    </Panel>
  );
}

function ChampList({ p, champs, version }: { p: ComparedPlayer; champs: Record<string, ChampionSummary>; version: string }) {
  if (!p.summary.champions.length) return <p className="mt-2 text-sm text-dim">Sin partidas recientes.</p>;
  return (
    <ul className="mt-3 space-y-2 text-sm">
      {p.summary.champions.map((c) => {
        const champ = champs[c.championId];
        return (
          <li key={c.championId} className="flex items-center gap-2.5">
            {champ && <ChampIcon version={version} id={champ.id} name={champ.name} size={28} />}
            <span className="flex-1 truncate">{champ?.name}</span>
            <span className="text-muted">
              {c.games} {c.games === 1 ? "partida" : "partidas"}, {Math.round((c.wins / c.games) * 100)} %
            </span>
          </li>
        );
      })}
      <li className="pt-1 text-xs text-dim">KDA total {kda(p.summary.kills, p.summary.deaths, p.summary.assists)}</li>
    </ul>
  );
}

/** Los dos hexágonos superpuestos: dorado el primero, azul el segundo. */
function CompareRadar({ a, b, nameA, nameB }: { a: Axis[]; b: Axis[]; nameA: string; nameB: string }) {
  const cx = 195;
  const cy = 100;
  const r = 66;
  const point = (i: number, v: number) => {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    return [cx + Math.cos(angle) * r * v, cy + Math.sin(angle) * r * v] as const;
  };
  const ring = (v: number) => a.map((_, i) => point(i, v).join(",")).join(" ");
  const shape = (axes: Axis[]) => axes.map((x, i) => point(i, (x.score ?? 0) / 100).join(",")).join(" ");
  return (
    <figure className="mt-2">
      <svg viewBox="0 0 390 200" className="w-full" role="img" aria-label={`Perfil de juego de ${nameA} y ${nameB}`}>
        {[0.25, 0.75, 1].map((v) => (
          <polygon key={v} points={ring(v)} className="fill-none stroke-line" strokeWidth={1} />
        ))}
        <polygon points={ring(0.5)} className="fill-none stroke-muted/50" strokeWidth={1} strokeDasharray="3 3" />
        {a.map((_, i) => {
          const [x, y] = point(i, 1);
          return <line key={i} x1={cx} y1={cy} x2={x} y2={y} className="stroke-line" strokeWidth={1} />;
        })}
        <polygon points={shape(a)} className="fill-gold/15 stroke-gold" strokeWidth={2} strokeLinejoin="round" />
        <polygon points={shape(b)} className="fill-hex/15 stroke-hex" strokeWidth={2} strokeLinejoin="round" />
        {a.map((x, i) => {
          const [lx, ly] = point(i, 1.22);
          const anchor = Math.abs(lx - cx) < 4 ? "middle" : lx > cx ? "start" : "end";
          return (
            <g key={x.id}>
              <title>{`${x.label}: ${nameA} ${x.score ?? "—"}, ${nameB} ${b[i].score ?? "—"}`}</title>
              <text x={lx} y={ly + 4} textAnchor={anchor} className="text-[11px]">
                <tspan className="fill-muted">{x.label} </tspan>
                <tspan className={`font-semibold ${scoreClass(x.score).replace("fill-ink", "fill-gold-soft")}`}>{x.score ?? "—"}</tspan>
                <tspan className="fill-dim"> / </tspan>
                <tspan className={`font-semibold ${scoreClass(b[i].score).replace("fill-ink", "fill-hex")}`}>{b[i].score ?? "—"}</tspan>
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="flex justify-center gap-4 text-xs text-muted">
        <span>
          <span className="mr-1 inline-block h-2 w-3 rounded-sm bg-gold" aria-hidden="true" />
          {nameA}
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-3 rounded-sm bg-hex" aria-hidden="true" />
          {nameB}
        </span>
        <span className="text-dim">Punteado: promedio del rol</span>
      </figcaption>
    </figure>
  );
}
