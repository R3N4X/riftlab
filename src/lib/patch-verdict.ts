import type { Verdict } from "./patch-changes";

/** Etiqueta y colores de cada veredicto (se usa en servidor y cliente). */
export const VERDICT: Record<Verdict, { label: string; plural: string; badge: string }> = {
  buff: { label: "Mejora", plural: "Mejoras", badge: "bg-win/15 text-win" },
  nerf: { label: "Debilitamiento", plural: "Debilitamientos", badge: "bg-loss/15 text-loss" },
  adjust: { label: "Ajuste", plural: "Ajustes", badge: "bg-gold/15 text-gold-soft" },
  new: { label: "Nuevo", plural: "Nuevos", badge: "bg-hex/15 text-hex" },
};
