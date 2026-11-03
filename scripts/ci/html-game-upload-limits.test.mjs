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
const boundedLocations = [...config.matchAll(/location ~ (\^\/api\/[^\n]+) \{[\s\S]*?\n    \}/g)]
  .filter((match) => /client_max_body_size 21m;/.test(match[0]));
assert.equal(boundedLocations.length, 2, "21m is limited to game and image upload locations");
const imageLocation = boundedLocations.find((match) => match[1].includes("assets/images"));
assert.ok(imageLocation, "the second bounded location must cover image uploads");
const imageRoutes = new RegExp(imageLocation[1]);
for (const route of ["/api/materials/material-id/assets/images", "/api/materials/material-id/image-page", "/api/schedule/lessons/lesson-id/image-page"]) assert.ok(imageRoutes.test(route), route);
for (const route of ["/api/games", "/api/materials/material-id/assets/html-games", "/api/schedule/lessons/lesson-id/image-page/other", "/api/me"]) assert.ok(!imageRoutes.test(route), route);
assert.match(imageLocation[0], /proxy_pass http:\/\/api-gateway;/);

console.log("web-app HTML-game upload limit contract passed");
