FROM node:22-alpine AS build

WORKDIR /workspace

COPY package.json package-lock.json ./
COPY web-app/package.json web-app/package.json
RUN npm ci --cache .npm --prefer-offline

COPY web-app web-app
RUN npm --workspace web-app run build

FROM nginx:1.27-alpine

COPY web-app/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/web-app/dist /usr/share/nginx/html

EXPOSE 80
