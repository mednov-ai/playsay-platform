FROM node:26.13.0-alpine@sha256:c6ad9e9c1d80f6eb607c26b4b0a132ff7a2344fad1c78ea3baa2a7d4c8de6d94 AS build
WORKDIR /workspace/frontend
COPY package.json package-lock.json ./
COPY web-app/package.json web-app/package.json
COPY keyboard-app/package.json keyboard-app/package.json
COPY shared-ui/package.json shared-ui/package.json
COPY browser-extension/package.json browser-extension/package.json
COPY game-sync-sdk/package.json game-sync-sdk/package.json
COPY game-adapter-service/package.json game-adapter-service/package.json
RUN npm ci --ignore-scripts
COPY game-sync-sdk game-sync-sdk
COPY game-adapter-service game-adapter-service
RUN npm --workspace game-sync-sdk run build \
    && npm --workspace game-adapter-service run build

FROM node:26.13.0-alpine@sha256:c6ad9e9c1d80f6eb607c26b4b0a132ff7a2344fad1c78ea3baa2a7d4c8de6d94
WORKDIR /app
RUN apk upgrade --no-cache \
    && apk add --no-cache ca-certificates chromium font-liberation \
    && addgroup -g 10001 -S playsay \
    && adduser -S -D -H -u 10001 -G playsay -s /sbin/nologin playsay \
    && mkdir -p /tmp/playsay \
    && chown 10001:10001 /tmp/playsay \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
COPY --from=build /workspace/frontend/game-adapter-service/dist /app/
COPY --from=build /workspace/frontend/node_modules/playwright-core /app/node_modules/playwright-core
COPY --from=build /workspace/frontend/node_modules/sharp /app/node_modules/sharp
COPY --from=build /workspace/frontend/node_modules/detect-libc /app/node_modules/detect-libc
COPY --from=build /workspace/frontend/node_modules/@img /app/node_modules/@img
COPY --from=build /workspace/frontend/game-sync-sdk/package.json /app/node_modules/@playsay/game-sync/package.json
COPY --from=build /workspace/frontend/game-sync-sdk/dist /app/node_modules/@playsay/game-sync/dist
ENV CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
    HOME=/tmp/playsay \
    TMPDIR=/tmp/playsay
USER playsay
EXPOSE 8088
CMD ["node", "/app/server.js"]
