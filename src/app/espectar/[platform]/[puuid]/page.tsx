import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { LoadingScreen } from "@/components/loading-screen";
import { Skeleton } from "@/components/ui";
import { isPlatform } from "@/lib/constants";
import { getChampionsByKey, getLatestVersion, getSummonerSpells } from "@/lib/ddragon";
import { parseString } from "@/lib/params";

export const metadata: Metadata = { title: "Partida en vivo" };

/** Partida en curso de otro jugador (un amigo), con la misma vista de la pantalla de carga de En vivo. */
export default function SpectatePage({ params, searchParams }: PageProps<"/espectar/[platform]/[puuid]">) {
  return (
    <Suspense fallback={<Skeleton rows={8} />}>
      <SpectateContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function SpectateContent({ params, searchParams }: Pick<PageProps<"/espectar/[platform]/[puuid]">, "params" | "searchParams">) {
  const { platform, puuid: raw } = await params;
  const sp = await searchParams;
  const puuid = decodeURIComponent(raw);
  if (!isPlatform(platform) || !/^[\w-]{20,100}$/.test(puuid)) notFound();
  const name = parseString(sp, "nombre");
  const [gameName, tagLine] = name?.split("#") ?? [];

  const [version, champs, spells] = await Promise.all([getLatestVersion(), getChampionsByKey(), getSummonerSpells()]);
  const slimChamps = Object.fromEntries(Object.entries(champs).map(([k, c]) => [k, { id: c.id, name: c.name }]));
  const slimSpells = Object.fromEntries(Object.entries(spells).map(([k, s]) => [k, { file: s.image.full, name: s.name }]));

  return (
    <div className="space-y-4 px-4 py-6 sm:px-8">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-3xl font-bold tracking-tight">Partida de {gameName ?? "tu amigo"} en vivo</h1>
        {gameName && tagLine && (
          <Link
            href={`/invocador/${platform}/${encodeURIComponent(`${gameName}-${tagLine}`)}`}
            className="text-sm text-gold-soft hover:underline"
          >
            Ver su perfil
          </Link>
        )}
      </header>
      <LoadingScreen
        champs={slimChamps}
        spells={slimSpells}
        version={version}
        preview={`${platform}:${puuid}`}
        teamLabel={gameName ? `Equipo de ${gameName}` : "Su equipo"}
      />
    </div>
  );
}
