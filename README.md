# Paloma Mensajera - Backend

API del Sistema Integral de Gestion, Ventas y Envios de Paloma Mensajera, construida con NestJS, Prisma y SQLite. El diseno completo del sistema esta documentado en [SDD_Paloma_Mensajera_2.md](SDD_Paloma_Mensajera_2.md).

## Requisitos

- Node.js 20+
- npm

## Instalacion

```bash
npm install
cp .env.example .env
```

Ajusta `.env` con tus propios valores (dominio institucional, secreto JWT, credenciales de la semilla del administrador, etc.).

## Base de datos

```bash
npm run prisma:migrate
npm run prisma:seed
```

El seed crea los permisos y roles nucleares (`admin`, `verifier`, `seller`, `delivery`, `comprador`), el mapa de numeros de rifa y, si `ADMIN_SEED_EMAIL`/`ADMIN_SEED_PASSWORD` estan definidos en `.env`, un usuario administrador inicial.

## Ejecucion

```bash
npm run start:dev
```

La API queda disponible en `http://localhost:3000` (ver `PORT` en `.env`). `GET /health` sirve como chequeo de disponibilidad.

## Scripts

| Script | Descripcion |
| :--- | :--- |
| `npm run start:dev` | Servidor en modo desarrollo (watch) |
| `npm run build` | Compila a `dist/` |
| `npm run lint` | ESLint + Prettier |
| `npm test` | Pruebas unitarias |
| `npm run prisma:migrate` | Aplica migraciones de Prisma |
| `npm run prisma:seed` | Ejecuta `prisma/seed.ts` |
