import { dirname, fromFileUrl, join } from "https://deno.land/std@0.200.0/path/mod.ts";
import { build } from "https://deno.land/x/dnt@0.38.1/mod.ts";
import packageJson from "../package.json" assert { type: "json" };

const currentPath = dirname(fromFileUrl(import.meta.url));
const distPath = join(currentPath, "../dist");

try {
  await Deno.remove(distPath, { recursive: true });
} catch {
  // Ignore
}

await Deno.mkdir(distPath);

await build({
  entryPoints: [join(currentPath, "../src/index.ts")],
  outDir: distPath,
  test: false,
  shims: {
    // deno: true,
    timers: true,
  },
  package: packageJson,
  compilerOptions: {
    lib: ["ES2021", "DOM"],
  },
  mappings: {},
});
