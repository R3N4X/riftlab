import { PLATFORMS, isPlatform } from "@/lib/constants";
import { dateLabel, num } from "@/lib/format";
import type { TftMeta } from "@/lib/tft/meta";

/** De dónde salen los números de TFT, o cómo juntarlos si todavía no hay. */
export function TftDataNote({ meta }: { meta: TftMeta | null }) {
  if (!meta || meta.comps.length === 0) {
    return (
      <div className="mb-4 rounded-md border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-gold-soft">
        {meta
          ? `Hay ${num(meta.matches)} partidas juntadas, todavía pocas para armar comps.`
          : "Todavía no hay partidas de TFT juntadas."}{" "}
        Con tu API key de Riot ejecuta <code className="rounded bg-night/60 px-1">npm run aggregate:tft</code> para traer partidas
        clasificatorias de alto elo. Unidades, rasgos y objetos ya se muestran igual.
      </div>
    );
  }
  const servers = meta.platforms.map((p) => (isPlatform(p) ? PLATFORMS[p].label : p)).join(", ");
  return (
    <p className="mb-4 text-sm text-dim">
      {num(meta.matches)} partidas clasificatorias ({num(meta.boards)} tableros) del set {meta.set}, parche {meta.patch}, en {servers}.
      Actualizado el {dateLabel(meta.generatedAt)}.
    </p>
  );
}
