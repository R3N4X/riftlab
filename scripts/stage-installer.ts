/**
 * Prepara el servidor para el instalador. electron-builder descarta las carpetas
 * node_modules de los recursos extra, así que se copian con otro nombre
 * (_node_modules) y la app instalada las renombra al arrancar por primera vez
 * (restoreServerModules en desktop/main.ts).
 */
import { cpSync, existsSync, readdirSync, renameSync, rmSync } from "node:fs";
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
