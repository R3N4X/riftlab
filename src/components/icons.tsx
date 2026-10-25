import { TIER_LABEL, type Role, type Tier, type TierGrade } from "@/lib/constants";
import { img } from "@/lib/assets";

/*
 * Íconos servidos desde Data Dragon / Community Dragon. Se usa <img> plano:
 * son cientos de PNG chicos que ya vienen optimizados desde el CDN de Riot.
 */

type Size = { size?: number; className?: string };

export function ChampIcon({ version, id, name, size = 32, className = "" }: Size & { version: string; id: string; name?: string }) {
  return (
    <img
      src={img.champion(version, id)}
      alt={name ?? id}
      width={size}
      height={size}
      loading="lazy"
      className={`shrink-0 rounded-md bg-raised object-cover ${className}`}
      // Los íconos de DDragon traen un borde negro de 3 px; el zoom lo oculta.
      style={{ width: size, height: size, objectPosition: "center", transform: "scale(1.08)" }}
    />
  );
}

export function ItemIcon({ version, id, name, size = 28, className = "" }: Size & { version: string; id: string | number; name?: string }) {
  if (!id || id === "0" || id === 0) {
    return <span className={`inline-block shrink-0 rounded bg-raised ${className}`} style={{ width: size, height: size }} />;
  }
  return (
    <img
      src={img.item(version, id)}
      alt={name ?? `Objeto ${id}`}
      title={name}
      width={size}
      height={size}
      loading="lazy"
      className={`shrink-0 rounded bg-raised ${className}`}
    />
  );
}

export function SpellIcon({ version, file, name, size = 22 }: { version: string; file: string; name?: string; size?: number }) {
  return <img src={img.spell(version, file)} alt={name ?? file} title={name} width={size} height={size} loading="lazy" className="shrink-0 rounded" />;
}

export function RuneIcon({ icon, name, size = 28, dim = false }: { icon: string; name?: string; size?: number; dim?: boolean }) {
  return (
    <img
      src={img.rune(icon)}
      alt={name ?? ""}
      title={name}
      width={size}
      height={size}
      loading="lazy"
      className={`shrink-0 ${dim ? "opacity-30 grayscale" : ""}`}
    />
  );
}

export function RoleIcon({ role, size = 18, className = "" }: { role: Role | string; size?: number; className?: string }) {
  return <img src={img.role(role)} alt="" width={size} height={size} className={`shrink-0 ${className}`} />;
}

export function RankCrest({ tier, size = 20 }: { tier: string; size?: number }) {
  return <img src={img.rankCrest(tier)} alt={TIER_LABEL[tier as Tier] ?? tier} width={size} height={size} className="shrink-0" />;
}

const GRADE_STYLE: Record<TierGrade, string> = {
  "S+": "bg-tier-splus text-night",
  S: "bg-tier-s text-night",
  A: "bg-tier-a text-night",
  B: "bg-tier-b/80 text-night",
  C: "bg-tier-c/40 text-ink",
  D: "bg-tier-d/40 text-muted",
};

export function TierBadge({ tier, className = "" }: { tier: TierGrade; className?: string }) {
  return (
    <span
      className={`inline-flex h-6 min-w-8 items-center justify-center rounded px-1.5 font-display text-sm font-bold ${GRADE_STYLE[tier]} ${className}`}
    >
      {tier}
    </span>
  );
}
