import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const config = readFileSync(resolve(repositoryRoot, "frontend/web-app/nginx.conf"), "utf8");
const scopedLocation = config.match(/location ~ (\^\/api\/[^\n]+) \{[\s\S]*?\n    \}/);
assert.ok(scopedLocation, "web-app nginx must have scoped upload routes");
const routes = new RegExp(scopedLocation[1]);
for (const route of ["/api/games", "/api/games/game-id/revisions", "/api/materials/material-id/assets/html-games", "/api/schedule/lessons/lesson-id/html-game-page"]) assert.ok(routes.test(route), route);
for (const route of ["/api/games/game-id/fork", "/api/games/game-id/revisions/revision-id/content", "/api/materials/material-id/assets/images", "/api/me"]) assert.ok(!routes.test(route), route);
assert.match(scopedLocation[0], /client_max_body_size 21m;/);
assert.match(scopedLocation[0], /proxy_pass http:\/\/api-gateway;/);
assert.equal((config.match(/client_max_body_size 21m;/g) ?? []).length, 1, "21m must not broaden unrelated web-app routes");

console.log("web-app HTML-game upload limit contract passed");
