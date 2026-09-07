FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY scripts ./scripts
RUN npm ci

COPY nest-cli.json tsconfig*.json ./
COPY prisma ./prisma
COPY src ./src

RUN npm run prisma:generate && npm run build

ENV NODE_ENV=production
EXPOSE 3000

# PostgreSQL es el motor principal (ver DATABASE_PROVIDER); "prisma:deploy" y
# "prisma:seed" operan sobre prisma/postgresql por defecto.
CMD ["sh", "-c", "npm run prisma:deploy && npm run prisma:seed && node dist/main.js"]