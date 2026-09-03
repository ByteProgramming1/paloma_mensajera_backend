# Paloma Mensajera - Backend

API del Sistema Integral de Gestion, Ventas y Envios de Paloma Mensajera, construida con NestJS y Prisma. **PostgreSQL** es el motor de base de datos principal; SQLite queda disponible como alternativa liviana para desarrollo local sin instalar nada. El diseno completo del sistema esta documentado en [SDD_Paloma_Mensajera_2.md](SDD_Paloma_Mensajera_2.md).

## Requisitos

- Node.js 20+
- npm

## Instalacion

```bash
npm install
cp .env.example .env
```

Ajusta `.env` con tus propios valores (dominio institucional, secreto JWT, credenciales de la semilla del administrador, etc.). `INSTITUTIONAL_EMAIL_DOMAIN` acepta varios dominios separados por coma — la universidad usa `escuelaing.edu.co` para profesores y `mail.escuelaing.edu.co` para estudiantes, y ambos vienen habilitados por defecto en `.env.example`.

## Base de datos

`DATABASE_PROVIDER` decide el motor activo:

- **`postgresql`** (por defecto, motor principal) - usa `DATABASE_URL` con una cadena de conexion de Postgres.
- **`sqlite`** - alternativa liviana para desarrollo local sin instalar Postgres; usa `SQLITE_DATABASE_URL` (por defecto `file:./dev.db`, relativo a `prisma/sqlite/`).

Cada motor tiene su propio `schema.prisma` (`prisma/postgresql/` y `prisma/sqlite/`) y su propio cliente generado, porque Prisma fija el proveedor de un datasource en tiempo de generacion. `src/prisma/prisma.service.ts` instancia el cliente correcto segun `DATABASE_PROVIDER` en runtime; el resto de la aplicacion sigue usando `PrismaService` sin diferencias.

```bash
# Postgres (motor principal, requiere DATABASE_URL apuntando a una instancia real)
npm run prisma:migrate
npm run prisma:seed

# SQLite (alternativa local, requiere DATABASE_PROVIDER=sqlite en .env)
npm run prisma:migrate:sqlite
npm run prisma:seed
```

El seed crea los permisos y roles nucleares (`admin`, `verifier`, `seller`, `delivery`, `comprador`), el mapa de numeros de rifa y, si `ADMIN_SEED_EMAIL` esta definido en `.env`, un usuario administrador inicial (con `ADMIN_SEED_PASSWORD` opcional, ver seccion siguiente). Lee `DATABASE_PROVIDER` para conectarse al mismo motor activo.

Si cambias el modelo de datos, aplica el cambio en **ambos** `schema.prisma` y genera una migracion para cada motor (`npm run prisma:migrate` y `npm run prisma:migrate:sqlite`).

## Inicio de sesion con Microsoft Entra ID

El acceso institucional se hace con la cuenta de Microsoft de la universidad (Entra ID / Azure AD), igual que Moodle. El backend **no crea cuentas nuevas por si solo**: un administrador debe pre-autorizar cada correo institucional con un rol via `POST /auth/temporary-user` (o el seed inicial, `ADMIN_SEED_EMAIL`); recien despues esa persona puede iniciar sesion con su cuenta de Microsoft.

1. En Azure AD / Microsoft Entra ID (portal de la universidad), registra una **app SPA/publica** para el login del frontend (autenticacion delegada, flujo con PKCE via MSAL) y copia su `Tenant ID` y `Application (client) ID`.
2. Define `AZURE_AD_TENANT_ID` y `AZURE_AD_CLIENT_ID` en `.env` con esos valores.
3. El frontend usa MSAL para autenticar al usuario contra Entra ID y obtiene un `id_token`; ese token se envia a `POST /auth/microsoft` con `{ "idToken": "..." }`.
4. El backend valida la firma del token contra el JWKS del tenant, confirma el dominio institucional, busca un `User` local con ese correo y, si existe y tiene un rol asignado, emite el JWT de sesion de la API (igual que `POST /auth/login`).

Sin `AZURE_AD_TENANT_ID`/`AZURE_AD_CLIENT_ID` configurados, `POST /auth/microsoft` responde `503` y el login local por correo/password (`POST /auth/login`) sigue disponible como respaldo para desarrollo — util mientras se gestiona el registro de la app en Azure AD (misma logica de degradacion controlada que la notificacion por Teams, seccion 11 del SDD). Una cuenta creada sin `password` (ver `CreateTemporaryUserDto`) solo puede iniciar sesion con Microsoft.

## Ejecucion

```bash
npm run start:dev
```

La API queda disponible en `http://localhost:3000` (ver `PORT` en `.env`). `GET /health` sirve como chequeo de disponibilidad.

## Ejecucion con Docker

`docker compose` levanta PostgreSQL (motor principal) junto con la API, persiste los datos en un volumen y ejecuta las migraciones y el seed al iniciar.

```bash
docker compose up --build
```

La API queda disponible en `http://localhost:3000` (`HOST_PORT` en `.env`). Las credenciales de Postgres se configuran con `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` en `.env`. Para detener los contenedores:

```bash
docker compose down
```

Para eliminar tambien la base de datos persistida, usa `docker compose down -v`.

## Scripts

| Script | Descripcion |
| :--- | :--- |
| `npm run start:dev` | Servidor en modo desarrollo (watch) |
| `npm run build` | Compila a `dist/` |
| `npm run lint` | ESLint + Prettier |
| `npm test` | Pruebas unitarias |
| `npm run prisma:generate` | Genera los clientes de Prisma (Postgres y SQLite) |
| `npm run prisma:migrate` | Aplica migraciones de Prisma (Postgres) |
| `npm run prisma:migrate:sqlite` | Aplica migraciones de Prisma (SQLite) |
| `npm run prisma:deploy` | Aplica migraciones en produccion (Postgres) |
| `npm run prisma:deploy:sqlite` | Aplica migraciones en produccion (SQLite) |
| `npm run prisma:seed` | Ejecuta `prisma/seed.ts` contra el motor activo (`DATABASE_PROVIDER`) |
