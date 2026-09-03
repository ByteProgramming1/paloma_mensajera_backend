FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY nest-cli.json tsconfig*.json ./
COPY prisma ./prisma
COPY src ./src

RUN npx prisma generate && npm run build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && npm run prisma:seed && node dist/src/main.js"]