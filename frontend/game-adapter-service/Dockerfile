FROM node:22.22.0-alpine AS build
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

FROM node:22.22.0-bookworm-slim
WORKDIR /app
RUN apt-get update \
    && apt-get install --no-install-recommends -y ca-certificates chromium fonts-liberation \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 playsay \
    && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin playsay \
    && mkdir -p /tmp/playsay \
    && chown 10001:10001 /tmp/playsay
COPY --from=build /workspace/frontend/game-adapter-service/dist /app/
COPY --from=build /workspace/frontend/node_modules/playwright-core /app/node_modules/playwright-core
COPY --from=build /workspace/frontend/game-sync-sdk/package.json /app/node_modules/@playsay/game-sync/package.json
COPY --from=build /workspace/frontend/game-sync-sdk/dist /app/node_modules/@playsay/game-sync/dist
ENV CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
    HOME=/tmp/playsay \
    TMPDIR=/tmp/playsay
USER playsay
EXPOSE 8088
CMD ["node", "/app/server.js"]
