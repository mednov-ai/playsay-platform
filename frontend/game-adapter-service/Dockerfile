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

FROM node:22.22.0-alpine
WORKDIR /app
RUN addgroup -S playsay && adduser -S -G playsay playsay
COPY --from=build /workspace/frontend/game-adapter-service/dist /app/
USER playsay
EXPOSE 8088
CMD ["node", "/app/server.js"]
