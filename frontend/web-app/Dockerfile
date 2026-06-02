FROM nginx:1.27-alpine

COPY web-app/nginx.conf /etc/nginx/conf.d/default.conf
COPY web-app/dist /usr/share/nginx/html

EXPOSE 80
