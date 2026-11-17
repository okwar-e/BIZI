FROM node:22-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine

ENV PORT=8080 \
    API_UPSTREAM=http://api:5000 \
    NGINX_ENVSUBST_FILTER=API_UPSTREAM|PORT

COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
