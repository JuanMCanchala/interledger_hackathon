# MiPlante frontend: the Angular landing, plus the proxy that puts the backend under the same domain.
#   target dev  → `ng serve` with proxy.conf.mjs (docker-compose.yml)
#   final stage → nginx serving the build, proxying with nginx.conf.template (Railway, production)

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS dev
COPY . .
ENV NG_CLI_ANALYTICS=false
EXPOSE 3001
# Polling: bind-mounted sources from Windows and macOS hosts do not emit file events in the container.
CMD ["npx", "ng", "serve", "--host", "0.0.0.0", "--port", "3001", "--poll", "1500"]

FROM deps AS build
COPY . .
ENV NG_CLI_ANALYTICS=false
RUN npx ng build

FROM nginx:1.29-alpine
# The backend address and the port are read when the container starts (envsubst on the template),
# so changing the backend URL needs a restart, not a rebuild.
ENV PORT=3001
ENV BACKEND_INTERNAL_URL=http://backend:3000
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY nginx-proxy.conf /etc/nginx/miplante-proxy.conf
COPY --from=build /app/dist/frontend/browser /usr/share/nginx/html
EXPOSE 3001
