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

# ./src is bind-mounted in development, which hides the client generated at build time:
# generate it again, apply pending migrations, then start.
CMD ["sh", "-c", "npx prisma generate && npx prisma migrate deploy && npm run dev"]

