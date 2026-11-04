/*
 * Texto de los tooltips de la app. Se escriben en el atributo title de siempre y la capa de
 * tooltips (components/tooltip.tsx) los muestra con estructura en vez del globo del sistema:
 *
 *   primera línea      título (solo si hay más de una línea)
 *   "etiqueta\tvalor"  fila con la etiqueta a la izquierda y el valor a la derecha
 *   "• texto"          viñeta
 *   "! texto"          aviso, resaltado
 *   otra línea         párrafo
 */

type Line = string | false | null | undefined;

/** Título y líneas de un tooltip; las vacías o en false se saltan. */
export function tip(title: string, ...lines: Line[]): string {
  return [title, ...lines].filter((l): l is string => Boolean(l)).join("\n");
}

export const row = (label: string, value: string | number) => `${label}\t${value}`;
export const bullet = (text: string) => `• ${text}`;
export const warn = (text: string) => `! ${text}`;
