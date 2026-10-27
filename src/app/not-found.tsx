import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "No encontrado" };

/** Página para rutas que no existen y para notFound() (campeón o jugador inexistente). */
export default function NotFound() {
  return (
    <div className="px-4 py-16 sm:px-8">
      <div className="max-w-xl">
        <p className="font-display text-6xl font-bold text-gold">404</p>
        <h1 className="mt-2 font-display text-3xl font-semibold">No encontramos esta página</h1>
        <p className="mt-2 text-muted">
          Puede que el enlace esté mal escrito o que el campeón o jugador no exista. Usa el buscador de la barra lateral o vuelve al
          inicio.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-md bg-gold px-4 py-2 font-semibold text-night hover:bg-gold-soft"
        >
          Ir al inicio
        </Link>
      </div>
    </div>
  );
}
