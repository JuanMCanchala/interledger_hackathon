FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

# Next.js resolves the /api and static-page rewrites at build time, so the backend URL is a build
# argument (Railway passes service variables to declared ARGs) and stays available at runtime.
ARG BACKEND_INTERNAL_URL=http://localhost:3000
ENV BACKEND_INTERNAL_URL=$BACKEND_INTERNAL_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

EXPOSE 3001

# Production server on the platform's PORT; docker-compose overrides this with the dev server.
CMD ["sh", "-c", "npx next start -p ${PORT:-3001}"]
