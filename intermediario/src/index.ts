/**
 * Intermediario de RiftLab: guarda la clave de Riot como secreto de Cloudflare y responde las
 * consultas de las apps del grupo, que así no necesitan una clave propia. La clave nunca sale de acá.
 *
 * Ruta: /{host}/{ruta de Riot}, por ejemplo /la2/lol/summoner/v4/summoners/by-puuid/...
 * Cada consulta trae el código del grupo en X-RiftLab-Code (viene dentro del instalador).
 */

interface Env {
  RIOT_API_KEY: string;
  GROUP_CODE: string;
}

interface Ctx {
  waitUntil(promise: Promise<unknown>): void;
}

// Mismos servidores que src/lib/constants.ts, más los clústeres regionales.
const HOSTS = new Set([
  "la1", "la2", "na1", "br1", "euw1", "eun1", "tr1", "ru", "me1", "kr", "jp1", "oc1", "sg2", "tw2", "vn2",
  "americas", "europe", "asia", "sea",
]);
// Solo las APIs que usa RiftLab (LoL, TFT y cuentas).
const ALLOWED_PATH = /^\/(lol|tft|riot)\//;
// Partidas terminadas y sus líneas de tiempo no cambian: se guardan y se comparten entre todo el grupo.
const IMMUTABLE_PATH = /^\/(lol\/match\/v5\/matches\/[A-Z0-9]+_\d+(\/timeline)?|tft\/match\/v1\/matches\/[A-Z0-9]+_\d+)$/;
// Encabezados de Riot que la app necesita para respetar los límites.
const PASS_HEADERS = ["retry-after", "x-rate-limit-type", "x-app-rate-limit", "x-app-rate-limit-count", "x-method-rate-limit", "x-method-rate-limit-count"];

const json = (body: unknown, status: number, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...extra } });

export default {
  async fetch(request: Request, env: Env, ctx: Ctx): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/") return json({ servicio: "RiftLab", ok: true }, 200);
    if (request.method !== "GET") return json({ error: "Solo se aceptan consultas GET." }, 405);
    if (!env.GROUP_CODE || request.headers.get("X-RiftLab-Code") !== env.GROUP_CODE)
      return json({ error: "Código del grupo inválido." }, 403, { "X-RiftLab-Proxy": "denied" });

    const [, host, ...rest] = url.pathname.split("/");
    const path = `/${rest.join("/")}`;
    if (!HOSTS.has(host) || !ALLOWED_PATH.test(path)) return json({ error: "Ruta no permitida." }, 404);

    const immutable = IMMUTABLE_PATH.test(path);
    const cacheKey = new Request(`https://cache.riftlab.internal/${host}${path}${url.search}`);
    // caches.default no existe en los tipos del navegador; en Workers es la caché del borde.
    const cache = (caches as unknown as { default: Cache }).default;
    if (immutable) {
      const hit = await cache.match(cacheKey);
      if (hit) return hit;
    }

    const riot = await fetch(`https://${host}.api.riotgames.com${path}${url.search}`, {
      headers: { "X-Riot-Token": env.RIOT_API_KEY },
    });
    const headers = new Headers({ "Content-Type": riot.headers.get("content-type") ?? "application/json" });
    for (const name of PASS_HEADERS) {
      const value = riot.headers.get(name);
      if (value) headers.set(name, value);
    }
    if (immutable && riot.ok) headers.set("Cache-Control", "public, max-age=2592000");
    const response = new Response(riot.body, { status: riot.status, headers });
    if (immutable && riot.ok) ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  },
};
