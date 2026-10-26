import type { TiltNotice } from "@/lib/tilt";

/** Aviso de tilt: se muestra en el perfil y en el resumen post-partida cuando la sesión viene mal. */
export function TiltBanner({ notice }: { notice: TiltNotice }) {
  const high = notice.level === "alto";
  return (
    <aside
      role="status"
      className={`flex gap-4 rounded-lg border px-5 py-4 ${high ? "border-loss/50 bg-loss/10" : "border-gold/40 bg-gold/5"}`}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className={`mt-0.5 h-6 w-6 shrink-0 ${high ? "text-loss" : "text-gold"}`}>
        {/* Taza: la pausa. */}
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9Zm12 1h1.5a2.5 2.5 0 0 1 0 5H16M8 3v3m4-3v3"
        />
      </svg>
      <div className="min-w-0">
        <p className="font-display text-lg font-semibold">{notice.title}</p>
        <ul className="mt-1 space-y-0.5 text-sm text-muted">
          {notice.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <p className="mt-2 text-sm">{notice.tip}</p>
      </div>
    </aside>
  );
}
