import { readFileSync, writeFileSync } from "node:fs";

const envModule = new URL("../.open-next/cloudflare/next-env.mjs", import.meta.url);

// OpenNext copies local .env values into this generated module. Worker bindings
// supply runtime values; local credentials must stay out of the deployment.
readFileSync(envModule);
writeFileSync(
  envModule,
  [
    "export const production = {};",
    "export const development = {};",
    "export const test = {};",
    "",
  ].join("\n"),
);
