/**
 * Cliente de la API de Riot para los scripts de agregación: lee la clave de
 * .env.local y respeta los límites de la API key por host (región o servidor).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/* ---------- .env.local ---------- */

export function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    const path = join(process.cwd(), file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  }
}

/* ---------- Cliente con límite de tasa ---------- */

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class RateLimiter {
  private stamps: number[] = [];
  constructor(private limits: { limit: number; windowMs: number }[]) {}
  async take() {
    for (;;) {
      const now = Date.now();
      const maxWindow = Math.max(...this.limits.map((l) => l.windowMs));
      this.stamps = this.stamps.filter((t) => now - t < maxWindow);
      const waits = this.limits.map((l) => {
        const inWindow = this.stamps.filter((t) => now - t < l.windowMs);
        return inWindow.length < l.limit ? 0 : l.windowMs - (now - inWindow[inWindow.length - l.limit]) + 25;
      });
      const wait = Math.max(...waits);
      if (wait <= 0) {
        this.stamps.push(now);
        return;
      }
      await sleep(wait);
    }
  }
}

/** Un limitador por host: Riot cuenta los límites por región y por servidor. */
const limiters = new Map<string, RateLimiter>();
export interface RateLimit {
  limit: number;
  windowMs: number;
}
let limitsFor: (host: string) => RateLimit[] = () => [];
let requests = 0;

/** Límites que se aplican en cada host (se llama una vez por host). */
export function setRateLimits(fn: (host: string) => RateLimit[]) {
  limitsFor = fn;
}

export const requestCount = () => requests;

function limiterFor(host: string): RateLimiter {
  let l = limiters.get(host);
  if (!l) {
    l = new RateLimiter(limitsFor(host));
    limiters.set(host, l);
  }
  return l;
}

export async function riot<T>(host: string, path: string): Promise<T | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    await limiterFor(host).take();
    requests++;
    let res: Response;
    try {
      res = await fetch(`https://${host}.api.riotgames.com${path}`, {
        headers: { "X-Riot-Token": process.env.RIOT_API_KEY! },
      });
      if (!res.ok) throw Object.assign(new Error("http"), { res });
      return (await res.json()) as T;
    } catch (err) {
      const failed = (err as { res?: Response }).res;
      if (!failed) {
        // Corte de red ("terminated", ECONNRESET...): se espera y se reintenta, sin tumbar la corrida.
        await sleep(3000);
        continue;
      }
      res = failed;
    }
    if (res.status === 404) return null;
    if (res.status === 401) throw new Error("API key inválida o vencida (las Development Keys duran 24 h).");
    if (res.status === 403) return null; // servidor o endpoint no habilitado para esta clave
    if (res.status === 429) {
      await sleep(Number(res.headers.get("retry-after") ?? "5") * 1000);
      continue;
    }
    await sleep(1500);
  }
  return null;
}

