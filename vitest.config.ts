import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["{shared,engine,server}/src/**/*.test.ts"],
    environment: "node",
  },
});
