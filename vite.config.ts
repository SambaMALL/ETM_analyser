// Config Vite "nue" (sans le wrapper @lovable.dev/vite-tanstack-config, qui cible
// Cloudflare par défaut) afin de pouvoir déployer sur Netlify avec le plugin officiel
// @netlify/vite-plugin-tanstack-start.
// Voir https://tanstack.com/start/latest/docs/framework/react/guide/hosting#netlify
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import netlify from "@netlify/vite-plugin-tanstack-start";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import viteTsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    viteTsConfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    tanstackStart({
      // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
      server: { entry: "server" },
    }),
    netlify(),
    viteReact(),
  ],
});
