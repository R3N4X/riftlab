/**
 * Completa la carpeta .next/standalone que genera `next build` para que la app
 * de escritorio pueda servirla sola: Next no copia los archivos estáticos.
 */
import { cpSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const standalone = join(root, ".next", "standalone");

if (!existsSync(join(standalone, "server.js"))) {
  console.error("No existe .next/standalone/server.js. Revisa que next.config.ts tenga output: \"standalone\".");
  process.exit(1);
}

cpSync(join(root, ".next", "static"), join(standalone, ".next", "static"), { recursive: true });
if (existsSync(join(root, "public"))) cpSync(join(root, "public"), join(standalone, "public"), { recursive: true });

console.log("Servidor standalone listo en .next/standalone");
