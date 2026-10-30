import type { Metadata } from "next";
import { Suspense } from "react";
import { WorldsSchedule } from "@/components/worlds";
import { getWorldsResults } from "@/lib/worlds-live";

export const metadata: Metadata = { title: "Worlds 2026" };

export default function WorldsPage() {
  return (
    <>
      <header className="border-b border-line px-4 pt-8 pb-6 sm:px-8">
        <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">Worlds 2026</h1>
        <p className="mt-2 max-w-3xl text-muted">
          Calendario y resultados del Mundial de League of Legends, del 15 de octubre al 14 de noviembre. La final es en el
          Barclays Center de Nueva York.
        </p>
      </header>
      <div className="px-4 py-8 sm:px-8">
        <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-surface" aria-hidden="true" />}>
          <Results />
        </Suspense>
      </div>
    </>
  );
}

async function Results() {
  const { matches, updated } = await getWorldsResults();
  return <WorldsSchedule matches={matches} updated={updated} />;
}
