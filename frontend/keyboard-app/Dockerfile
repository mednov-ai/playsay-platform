FROM nginx:1.27-alpine

COPY keyboard-app/nginx.conf /etc/nginx/conf.d/default.conf
COPY keyboard-app/dist /usr/share/nginx/html

EXPOSE 80
