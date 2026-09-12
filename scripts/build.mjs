import { build } from "esbuild";
import { resolve } from "node:path";
process.chdir(resolve(import.meta.dirname, ".."));
await build({
  entryPoints: ["src/app.tsx"],
  bundle: true,
  minify: true,
  outfile: "public/app.js",
  platform: "browser",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  legalComments: "linked",
});
console.log("Built public/app.js and public/app.css");
