import { configDefaults, defineConfig } from "vitest/config";

// The Ghost Light app (apps/mobile) runs its own tests with its own setup.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "apps/**"],
  },
});
