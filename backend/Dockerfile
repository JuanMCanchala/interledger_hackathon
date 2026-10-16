FROM node:22-alpine

WORKDIR /app

# The schema has to be there before `npm ci`, whose postinstall runs `prisma generate`.
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts

ENV PRISMA_HIDE_UPDATE_MESSAGE=1

EXPOSE 3000

# Production: apply pending migrations, then serve. The platform's PORT is honored by the config.
# docker-compose overrides this command for development (watch mode over bind-mounted sources).
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]

