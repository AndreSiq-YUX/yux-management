FROM node:22.23.2-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS build

WORKDIR /app

ARG VITE_API_BASE_URL=/api
ARG VITE_MISSION_FORM_COMPATIBILITY=true

ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_MISSION_FORM_COMPATIBILITY=$VITE_MISSION_FORM_COMPATIBILITY

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:1.30.4-alpine-slim@sha256:77da26c31397bf6694b4bf93275f5b40b0b120ba1b8f114264b603e592c561d6

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
