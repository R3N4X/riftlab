/**
 * Notas de parche oficiales desde leagueoflegends.com (sitio público de Riot).
 * Se lee la lista de artículos y se parsea cada artículo a una estructura
 * propia (secciones → bloques → cambios "antes ⇒ después") para mostrarla
 * con nuestro diseño. Siempre se enlaza al artículo original.
 */
import * as cheerio from "cheerio";
import { cacheLife } from "next/cache";

const SITE = "https://www.leagueoflegends.com";
const LIST_URL = `${SITE}/es-mx/news/tags/patch-notes/`;
const UA = { "User-Agent": "Mozilla/5.0 (RiftLab prototype)" };

export interface PatchNoteSummary {
  slug: string;
  title: string;
  url: string;
  image: string | null;
  date: string;
  description: string;
}

interface NextData {
  props: { pageProps: { page: { blades: { type: string; items?: unknown[] }[] } } };
}

interface ArticleCard {
  title: string;
  action?: { payload?: { url?: string } };
  media?: { url?: string };
  analytics?: { publishDate?: string };
  description?: { body?: string };
}

export async function getPatchNotesList(): Promise<PatchNoteSummary[]> {
  "use cache";
  cacheLife("hours");
  const res = await fetch(LIST_URL, { headers: UA });
  if (!res.ok) throw new Error(`No se pudo leer la lista de notas (${res.status})`);
  const html = await res.text();
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return [];
  const data = JSON.parse(m[1]) as NextData;
  const grid = data.props.pageProps.page.blades.find((b) => b.type === "articleCardGrid");
  const items = (grid?.items ?? []) as ArticleCard[];

  return items
    .map((it) => {
      const path = it.action?.payload?.url ?? "";
      const slug = path.split("/").filter(Boolean).pop() ?? "";
      return {
        slug,
        title: it.title,
        url: path.startsWith("http") ? path : `${SITE}${path}`,
        image: it.media?.url ?? null,
        date: it.analytics?.publishDate ?? "",
        description: cheerio.load(it.description?.body ?? "").text().trim(),
      };
    })
    .filter((p) => p.slug.includes("patch") && p.slug.endsWith("-notes"));
}

/* ---------- Artículo ---------- */

export interface PatchChange {
  label?: string;
  before?: string;
  after?: string;
  text: string;
}

export interface PatchChangeGroup {
  title: string | null;
  icon: string | null;
  changes: PatchChange[];
}

export interface PatchBlock {
  title: string | null;
  /** Para campeones: id de Data Dragon deducido de la imagen. */
  championId: string | null;
  image: string | null;
  context: string | null;
  groups: PatchChangeGroup[];
  paragraphs: string[];
  images: string[];
}

export interface PatchSection {
  id: string;
  title: string;
  blocks: PatchBlock[];
}

export interface PatchNote {
  slug: string;
  title: string;
  url: string;
  date: string;
  banner: string | null;
  intro: string[];
  sections: PatchSection[];
}

/** El CDN de Riot envuelve las imágenes: "https://am-a.akamaihd.net/image?f=<url real>". */
function unwrapImage(src: string | undefined): string | null {
  if (!src) return null;
  const m = src.match(/[?&]f=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : src;
}

function parseChange(text: string, strongFirst: string | null): PatchChange {
  const clean = text.replace(/\s+/g, " ").trim();
  const arrow = clean.indexOf("⇒");
  if (arrow < 0) return { text: clean };
  const left = clean.slice(0, arrow).trim();
  const after = clean.slice(arrow + 1).trim();
  let label: string | undefined;
  let before = left;
  if (strongFirst && left.startsWith(strongFirst)) {
    label = strongFirst.replace(/:$/, "");
    before = left.slice(strongFirst.length).replace(/^:\s*/, "");
  } else {
    const colon = left.indexOf(":");
    if (colon > 0 && colon < 60) {
      label = left.slice(0, colon);
      before = left.slice(colon + 1).trim();
    }
  }
  return { label, before, after, text: clean };
}

export async function getPatchNote(slug: string): Promise<PatchNote | null> {
  "use cache";
  cacheLife("hours");
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  const url = `${SITE}/es-mx/news/game-updates/${slug}/`;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) return null;
  const $ = cheerio.load(await res.text());

  const title = $("h1").first().text().trim() || $("title").text().trim();
  const date = $("time").first().attr("datetime") ?? "";
  const banner = $('meta[property="og:image"]').attr("content") ?? null;

  const firstHeader = $("header.header-primary").first();
  if (!firstHeader.length) return null;
  const container = firstHeader.parent();

  const intro: string[] = [];
  firstHeader.prevAll("blockquote, p").each((_, el) => {
    const t = $(el).text().trim();
    if (t) intro.unshift(t);
  });

  const sections: PatchSection[] = [];
  let current: PatchSection | null = null;

  container.children().each((_, el) => {
    const node = $(el);
    if (node.is("header.header-primary")) {
      const h2 = node.find("h2");
      current = { id: (h2.attr("id") ?? "").replace(/^patch-/, ""), title: h2.text().trim(), blocks: [] };
      sections.push(current);
      return;
    }
    if (!current) return;
    const section: PatchSection = current;

    const blocks = node.find(".patch-change-block").length ? node.find(".patch-change-block") : node.find(".white-stone");
    blocks.each((_, b) => {
      const block = $(b);
      const titleEl = block.find("h3.change-title").first();
      const image = unwrapImage(block.find("a.reference-link img").attr("src"));
      const champMatch = image?.match(/\/img\/champion\/([A-Za-z0-9]+)\.png/);

      const groups: PatchChangeGroup[] = [];
      let group: PatchChangeGroup | null = null;
      block.find("h4, ul > li").each((_, child) => {
        const c = $(child);
        if (c.is("h4")) {
          group = { title: c.text().trim(), icon: unwrapImage(c.find("img").attr("src")), changes: [] };
          groups.push(group);
        } else {
          if (!group) {
            group = { title: null, icon: null, changes: [] };
            groups.push(group);
          }
          const strong = c.find("strong").first().text().trim() || null;
          group.changes.push(parseChange(c.text(), strong));
        }
      });

      const paragraphs: string[] = [];
      block.find("> div > p").each((_, p) => {
        const t = $(p).text().trim();
        if (t) paragraphs.push(t);
      });
      const images: string[] = [];
      block.find("> div > p img, span.content-border img").each((_, img) => {
        const src = unwrapImage($(img).attr("src"));
        if (src && src !== image) images.push(src);
      });

      section.blocks.push({
        title: titleEl.text().trim() || null,
        championId: champMatch?.[1] ?? null,
        image,
        context: block.find("blockquote.context").first().text().trim() || null,
        groups,
        paragraphs,
        images: [...new Set(images)],
      });
    });
  });

  return { slug, title, url, date, banner, intro, sections: sections.filter((s) => s.blocks.length) };
}
