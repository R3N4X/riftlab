import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ChampIcon } from "@/components/icons";
import { MasteryGrid, type MasteryRow } from "@/components/mastery-grid";
import { ErrorNote, Panel, Skeleton } from "@/components/ui";
import { PLATFORMS, isPlatform, type Platform } from "@/lib/constants";
import { getChampionsByKey, getLatestVersion, img } from "@/lib/ddragon";
import {
  RiotApiError,
  errorMessage,
  getAccountByRiotId,
  getAllMasteries,
  getMasteryScore,
  getSummonerByPuuid,
  hasRiotKey,
  riotIdToSlug,
  slugToRiotId,
} from "@/lib/riot";

export async function generateMetadata({ params }: PageProps<"/invocador/[platform]/[riotId]/maestria">): Promise<Metadata> {
  const { riotId } = await params;
  const id = slugToRiotId(riotId);
  return { title: id ? `Maestría de ${id.gameName}#${id.tagLine}` : "Maestría" };
}

/** Maestría con todos los campeones de un jugador, como la pestaña de maestría de op.gg. */
export default function MasteryPage({ params }: PageProps<"/invocador/[platform]/[riotId]/maestria">) {
  return (
    <Suspense fallback={<Skeleton rows={10} />}>
      <MasteryContent params={params} />
    </Suspense>
  );
}

async function MasteryContent({ params }: Pick<PageProps<"/invocador/[platform]/[riotId]/maestria">, "params">) {
  await connection();
  const { platform, riotId } = await params;
  if (!isPlatform(platform)) notFound();
  const id = slugToRiotId(riotId);
  if (!id) notFound();
  const profileHref = `/invocador/${platform}/${riotIdToSlug(id.gameName, id.tagLine)}`;

  if (!hasRiotKey()) {
    return (
      <div className="px-4 py-8 sm:px-8">
        <ErrorNote title="Falta la clave de la API de Riot">Configúrala en Ajustes para ver la maestría.</ErrorNote>
      </div>
    );
  }

  let data;
  try {
    data = await loadMastery(platform, id.gameName, id.tagLine);
  } catch (err) {
    const notFoundAccount = err instanceof RiotApiError && err.status === 404;
    return (
      <div className="px-4 py-8 sm:px-8">
        <ErrorNote
          title={notFoundAccount ? `No encontramos a ${id.gameName}#${id.tagLine} en ${PLATFORMS[platform].label}` : "No se pudo cargar la maestría"}
        >
          {notFoundAccount ? "Revisa el nombre y el tag." : errorMessage(err)}
        </ErrorNote>
      </div>
    );
  }

  const { account, summoner, masteries, score, version, champsByKey, now } = data;
  const rows: MasteryRow[] = masteries.flatMap((m) => {
    const champ = champsByKey[m.championId];
    if (!champ) return [];
    return [
      {
        key: champ.key,
        id: champ.id,
        name: champ.name,
        level: m.championLevel,
        points: m.championPoints,
        since: m.championPointsSinceLastLevel ?? 0,
        until: Math.max(0, m.championPointsUntilNextLevel ?? 0),
        lastPlayTime: m.lastPlayTime,
      },
    ];
  });
  const played = new Set(rows.map((r) => r.key));
  const unplayed = Object.values(champsByKey)
    .filter((c) => !played.has(c.key))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  const totalChamps = Object.keys(champsByKey).length;
  const totalPoints = rows.reduce((s, r) => s + r.points, 0);
  const levelTen = rows.filter((r) => r.level >= 10).length;

  const stats = [
    { label: "Puntaje de maestría", value: (score ?? rows.reduce((s, r) => s + r.level, 0)).toLocaleString("es-CL"), hint: "Suma de los niveles" },
    { label: "Puntos totales", value: totalPoints.toLocaleString("es-CL"), hint: "Con todos los campeones" },
    { label: "Campeones con maestría", value: `${rows.length} / ${totalChamps}`, hint: "Jugados al menos una vez" },
    { label: "Nivel 10 o más", value: levelTen.toLocaleString("es-CL"), hint: "Campeones" },
  ];

  return (
    <div className="space-y-6 px-4 py-8 sm:px-8">
      <header className="flex flex-wrap items-center gap-4">
        {summoner && (
          <img
            src={img.profileIcon(version, summoner.profileIconId)}
            alt=""
            width={64}
            height={64}
            className="h-16 w-16 rounded-xl ring-2 ring-gold/60"
          />
        )}
        <div className="min-w-0">
          <Link href={profileHref} className="text-sm text-gold-soft hover:underline">
            ← Perfil de {account.gameName}
            <span className="text-dim">#{account.tagLine}</span>
          </Link>
          <h1 className="font-display text-4xl font-bold tracking-tight">Maestría de campeones</h1>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Panel key={s.label} className="px-4 py-3">
            <dt className="text-sm text-muted">{s.label}</dt>
            <dd className="font-display text-3xl font-bold text-gold-soft">{s.value}</dd>
            <dd className="text-xs text-dim">{s.hint}</dd>
          </Panel>
        ))}
      </dl>

      {rows.length > 0 ? (
        <MasteryGrid rows={rows} version={version} now={now} />
      ) : (
        <p className="text-muted">Todavía no tiene maestría con ningún campeón.</p>
      )}

      {unplayed.length > 0 && (
        <section>
          <h2 className="mb-2 font-display text-xl font-semibold">
            Sin jugar <span className="text-base font-normal text-dim">({unplayed.length})</span>
          </h2>
          <ul className="flex flex-wrap gap-1.5">
            {unplayed.map((c) => (
              <li key={c.key}>
                <Link href={`/campeones/${c.id}`} title={c.name} className="block opacity-50 grayscale transition hover:opacity-100 hover:grayscale-0">
                  <ChampIcon version={version} id={c.id} name={c.name} size={36} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

async function loadMastery(platform: Platform, gameName: string, tagLine: string) {
  const account = await getAccountByRiotId(platform, gameName, tagLine);
  const [summoner, masteries, score, version, champsByKey] = await Promise.all([
    getSummonerByPuuid(platform, account.puuid).catch(() => null),
    getAllMasteries(platform, account.puuid),
    getMasteryScore(platform, account.puuid).catch(() => null),
    getLatestVersion(),
    getChampionsByKey(),
  ]);
  return { account, summoner, masteries, score, version, champsByKey, now: Date.now() };
}
