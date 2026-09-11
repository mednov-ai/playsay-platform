import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const config = readFileSync(resolve(repositoryRoot, "frontend/web-app/nginx.conf"), "utf8");
const scopedLocation = config.match(/location ~ \^\/api\/\(\?:materials\/\[\^\/\]\+\/assets\/html-games\|schedule\/lessons\/\[\^\/\]\+\/html-game-page\)\$ \{[\s\S]*?\n    \}/);

assert.ok(scopedLocation, "web-app nginx must have one location scoped to both HTML-game upload routes");
assert.match(scopedLocation[0], /client_max_body_size 21m;/);
assert.match(scopedLocation[0], /proxy_pass http:\/\/api-gateway;/);
assert.equal((config.match(/client_max_body_size 21m;/g) ?? []).length, 1, "21m must not broaden unrelated web-app routes");

console.log("web-app HTML-game upload limit contract passed");
