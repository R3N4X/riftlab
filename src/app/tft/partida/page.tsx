import type { Metadata } from "next";
import { Suspense } from "react";
import { TftTabs } from "@/components/tft";
import { PageHeader, Skeleton } from "@/components/ui";
import { parseString } from "@/lib/params";
import { getTftCatalog } from "@/lib/tft/data";
import { getTftMeta } from "@/lib/tft/meta";
import { GameMode } from "./game-mode";

export const metadata: Metadata = { title: "TFT · Modo partida" };

export default function TftGamePage({ searchParams }: PageProps<"/tft/partida">) {
  return (
    <Suspense fallback={<Skeleton rows={8} />}>
      <GameContent searchParams={searchParams} />
    </Suspense>
  );
}

async function GameContent({ searchParams }: { searchParams: PageProps<"/tft/partida">["searchParams"] }) {
  // ?flotante=1: la ventana chica que la app de escritorio deja encima del juego.
  const floating = parseString(await searchParams, "flotante") === "1";
  const meta = await getTftMeta();
  const catalog = await getTftCatalog(meta?.set);
  // Al cliente solo van los objetos que entran en recetas (el set trae cientos de aumentos y variantes).
  const items = Object.fromEntries(Object.entries(catalog.items).filter(([, i]) => i.kind !== "other"));
  const game = (
    <GameMode
      set={meta?.set ?? catalog.set}
      comps={meta?.comps ?? []}
      catalog={{ units: catalog.units, traits: catalog.traits, items }}
      floating={floating}
    />
  );
  if (floating) return game;
  return (
    <>
      <PageHeader title="Teamfight Tactics">
        Tus comps fijadas, las recetas y los rasgos, para consultar mientras juegas. En la app de escritorio se abre una ventana flotante
        encima del juego al empezar la partida (Ctrl + Shift + T la muestra u oculta).
      </PageHeader>
      <TftTabs current="/tft/partida" />
      {game}
    </>
  );
}
