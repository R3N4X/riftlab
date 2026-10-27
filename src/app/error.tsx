"use client";

/** Errores inesperados al mostrar una página: aviso en español con reintento, en vez del mensaje genérico de Next. */
export default function Error({ retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="px-4 py-16 sm:px-8">
      <div className="max-w-xl rounded-lg border border-loss/40 bg-loss/10 px-5 py-4">
        <h1 className="font-display text-2xl font-semibold">Algo salió mal al cargar esta página</h1>
        <p className="mt-1 text-sm text-muted">
          Suele ser un corte momentáneo de internet o de los servidores de Riot. Prueba de nuevo en unos segundos.
        </p>
        <button
          type="button"
          onClick={() => retry()}
          className="mt-4 rounded-md border border-line px-4 py-1.5 text-sm hover:border-gold"
        >
          Reintentar
        </button>
      </div>
    </div>
  );
}
