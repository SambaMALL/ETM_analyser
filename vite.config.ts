// Config Vite "nue" pour déployer sur Netlify avec le plugin officiel
// @netlify/vite-plugin-tanstack-start.
// Voir https://tanstack.com/start/latest/docs/framework/react/guide/hosting#netlify
//
// Le plugin Netlify n'est activé que pour `vite build` (donc au déploiement).
// En `npm run dev`, il tentait de démarrer le serveur local des Edge Functions
// (Deno), ce qui provoquait l'erreur "Could not establish a connection to the
// Netlify Edge Functions local development server".
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import netlify from "@netlify/vite-plugin-tanstack-start";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import viteTsConfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ command }) => ({
  plugins: [
    viteTsConfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    tanstackStart({
      // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
      server: { entry: "server" },
    }),
    // Netlify uniquement au build, pas en développement local.
    command === "build" && netlify(),
    viteReact(),
  ],
}));
