FROM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Uygulama dosyalarını sunar ve /api isteklerini backend'e iletir; böylece frontend ile API
# aynı alan adındadır (yenileme çerezi ve CSP buna dayanır).
FROM nginxinc/nginx-unprivileged:1.30-alpine
USER root
# Temel imaj yayımlandıktan sonra çıkan işletim sistemi yamaları.
RUN apk upgrade --no-cache
USER nginx
COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /src/dist /usr/share/nginx/html
# Açılışta şablondaki ${BACKEND_URL} doldurulur.
ENV BACKEND_URL=http://backend:8080
EXPOSE 8080
