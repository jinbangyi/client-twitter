import { defineConfig } from "tsup";

export default defineConfig({
    entry: ["packages/client-twitter/src/index.ts", "packages/task-manager/src/main.ts"], // Entry points
    outDir: "dist",
    sourcemap: true,
    clean: true,
    dts: {
        resolve: true,
    },
    format: ["esm", "cjs"], // Ensure you're targeting CommonJS
});
