import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  // The same "@/*" -> "./*" mapping as tsconfig.json, so a tested module can
  // import "@/lib/brand" the way the app does.
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    // The Ghost Light app (apps/mobile) runs its own tests with its own setup.
    exclude: [...configDefaults.exclude, "apps/**"],
  },
});
