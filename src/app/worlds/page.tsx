import type { Metadata } from "next";
import { WorldsSchedule } from "@/components/worlds";
import { SCHEDULE_UPDATED } from "@/lib/worlds";

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
        <WorldsSchedule />
        <p className="mt-10 text-sm text-dim">
          Resultados cargados a mano, actualizados al {SCHEDULE_UPDATED}. Para el marcador en vivo y las transmisiones, entra
          a{" "}
          <a href="https://lolesports.com/" target="_blank" rel="noreferrer" className="text-muted underline hover:text-ink">
            lolesports.com
          </a>
          .
        </p>
      </div>
    </>
  );
}
