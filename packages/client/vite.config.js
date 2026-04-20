import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
    plugins: [react()],
    test: {
        environment: "jsdom",
        setupFiles: "./src/test/setup.ts"
    },
    server: {
    allowedHosts: [
      'established-housing-bathroom-strips.trycloudflare.com'
    ]
  }
});
