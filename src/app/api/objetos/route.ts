import { getItems } from "@/lib/ddragon";

/**
 * Ficha corta de cada objeto para los tooltips (nombre, precio, estadísticas y efectos). Se pide
 * una vez desde el navegador y queda en memoria; así cada ícono de objeto no tiene que cargar su
 * descripción.
 */
export interface ItemTip {
  name: string;
  gold: number;
  stats: string[];
  effects: { kind: "Pasiva" | "Activa"; name: string; text: string }[];
  plaintext: string;
}

const strip = (html: string) =>
  html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Primera oración, para que el tooltip no repita la descripción entera del juego. */
const firstSentence = (text: string) => {
  const end = text.search(/\.(\s|$)/);
  const sentence = end > 0 ? text.slice(0, end + 1) : text;
  return sentence.length > 160 ? `${sentence.slice(0, 157).trimEnd()}…` : sentence;
};

function parse(description: string): Pick<ItemTip, "stats" | "effects"> {
  const statsHtml = description.match(/<stats>([\s\S]*?)<\/stats>/)?.[1] ?? "";
  const stats = statsHtml.split(/<br\s*\/?>/i).map(strip).filter(Boolean);
  const effects: ItemTip["effects"] = [];
  const re = /<(passive|active)>([\s\S]*?)<\/\1>(?:<br\s*\/?>)*([\s\S]*?)(?=<(?:passive|active)>|<\/mainText>|$)/g;
  for (const m of description.matchAll(re)) {
    effects.push({ kind: m[1] === "active" ? "Activa" : "Pasiva", name: strip(m[2]), text: firstSentence(strip(m[3])) });
  }
  return { stats, effects: effects.slice(0, 3) };
}

export async function GET() {
  const items = await getItems();
  const tips: Record<string, ItemTip> = {};
  for (const [id, it] of Object.entries(items)) {
    tips[id] = { name: it.name, gold: it.gold.total, plaintext: strip(it.plaintext ?? ""), ...parse(it.description ?? "") };
  }
  return Response.json(tips, { headers: { "Cache-Control": "public, max-age=3600" } });
}
