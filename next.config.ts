import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // La app de escritorio arranca este servidor autocontenido (ver desktop/main.ts).
  output: "standalone",
  // Los datos se leen de RIFTLAB_DATA_DIR y el instalador no es parte del servidor: sin esto el
  // rastreo de archivos copiaba ambas carpetas completas al servidor (y al instalador).
  outputFileTracingExcludes: {
    "/*": ["./data/**/*", "./dist-installer/**/*", "./build/**/*", "./scripts/**/*"],
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
