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

FROM nginx:1.30.4-alpine@sha256:dc5069ad14f19660b141b21236140b91656bf89bbc3e2417c70ae650cd66104c

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
