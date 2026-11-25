FROM nginx:1.30.7-alpine@sha256:caf4e1e032a20f9c3c5e28fc7f25ffd768ad8677b4975c54193075997b3a97e3

# The pinned base predates Alpine security fixes; scan the final image before delivery.
RUN apk upgrade --no-cache

COPY keyboard-app/nginx.conf /etc/nginx/conf.d/default.conf
COPY keyboard-app/dist /usr/share/nginx/html

EXPOSE 80
