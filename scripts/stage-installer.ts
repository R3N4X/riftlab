/**
 * Prepara el servidor para el instalador. electron-builder descarta las carpetas
 * node_modules de los recursos extra, así que se copian con otro nombre
 * (_node_modules) y la app instalada las renombra al arrancar por primera vez
 * (restoreServerModules en desktop/main.ts).
 */
import { cpSync, existsSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(process.cwd(), ".next", "standalone");
const DEST = join(process.cwd(), "build", "server");

if (!existsSync(join(SRC, "server.js"))) {
  console.error("Falta .next/standalone: ejecuta npm run desktop:build primero.");
  process.exit(1);
}

rmSync(DEST, { recursive: true, force: true });
cpSync(SRC, DEST, { recursive: true });

// Primero las más profundas, para no mover una carpeta antes de renombrar lo que tiene adentro.
const found: string[] = [];
const walk = (dir: string) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const full = join(dir, entry.name);
    walk(full);
    if (entry.name === "node_modules") found.push(full);
  }
};
walk(DEST);
for (const dir of found) renameSync(dir, join(dir, "..", "_node_modules"));
console.log(`Servidor listo para el instalador en build/server (${found.length} carpetas de módulos).`);

// Intermediario del grupo: la dirección y el código van en el instalador para que quien lo
// instale no necesite clave propia. La clave de Riot nunca va: queda guardada en Cloudflare.
const env = existsSync(".env.local") ? readFileSync(".env.local", "utf8") : "";
const read = (name: string) =>
  env
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith(`${name}=`))
    ?.slice(name.length + 1)
    .replace(/^"|"$/g, "");
const proxy = { RIFTLAB_PROXY_URL: read("RIFTLAB_PROXY_URL"), RIFTLAB_PROXY_CODE: read("RIFTLAB_PROXY_CODE") };
if (!proxy.RIFTLAB_PROXY_URL || !proxy.RIFTLAB_PROXY_CODE) {
  console.error(
    "Faltan RIFTLAB_PROXY_URL y RIFTLAB_PROXY_CODE en .env.local: sin ellos quien instale necesita su propia clave.\n" +
      "Despliega el intermediario: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\\desplegar-intermediario.ps1",
  );
  process.exit(1);
}
writeFileSync(join(process.cwd(), "build", "proxy.json"), JSON.stringify(proxy));
console.log(`Intermediario del grupo incluido: ${proxy.RIFTLAB_PROXY_URL}`);
