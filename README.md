# Paloma Mensajera - Backend

API del Sistema Integral de Gestion, Ventas y Envios de Paloma Mensajera, construida con NestJS y Prisma. **PostgreSQL** es el motor de base de datos principal; SQLite queda disponible como alternativa liviana para desarrollo local sin instalar nada. El diseno vigente del sistema esta documentado en [SDD_Paloma_Mensajera.md](SDD_Paloma_Mensajera.md) (versiones anteriores conservadas en [SDD_Paloma_Mensajera_2.md](SDD_Paloma_Mensajera_2.md)).

## Flujo de un pedido

1. **`POST /orders/public`** - el comprador arma el carrito, escribe su dedicatoria y decide si recoge el regalo el mismo (`selfPickup`) o indica un destinatario distinto. El pedido nace directo en `MESSAGE_PENDING_REVIEW` (sin ningun filtro automatico ni IA) - aun sin tocar stock ni rifa.
2. **`PATCH /orders/:id/verify-message`** (rol `seller`, revision 100% manual) - el Vendedor busca al comprador por nombre en `GET /orders?view=message&search=...` y aprueba o rechaza la dedicatoria. Solo `MESSAGE_APPROVED` habilita el paso siguiente.
3. **`POST /orders/:id/select-raffle-number`** - descuenta stock del carrito, asigna el numero de rifa de forma atomica y crea el pago pendiente (`PAYMENT_PENDING`).
4. **`PATCH /orders/:id/verify-payment`** (rol `admin`, **exclusivo, sin ninguna excepcion**) - confirma o rechaza el pago contra Nequi viendo el pedido completo.
5. **`PATCH /orders/:id/assign-delivery`** + **`PATCH /orders/:id/delivery-status`** (rol `seller`, que fusiona venta y entrega) - notifica por Teams y confirma la entrega. Si `selfPickup=true`, no se notifica a un tercero (el destinatario es el propio comprador).
6. **`POST /raffle-numbers/draw`** (admin, al cierre del evento) - sorteo con ruleta sobre los numeros con pago verificado.

El rol `verifier` ya no existe (el SDD vigente lo elimina por completo): la revision de la dedicatoria pasa al Vendedor (`messages:read_queue`, `messages:verify`) y la verificacion de pago queda como tarea exclusiva del Administrador, sin ningun alcance para el Vendedor. La fila `verifier` no se borra de la base de datos si ya existia (para no romper una cuenta previa), pero el seed deja de otorgarle permisos. El rol `delivery` tampoco se elimina, por la misma razon, aunque las cuentas nuevas usan `seller`. Un administrador puede reasignar el rol de cualquier usuario (`ADMIN` o `SELLER`, seccion 7 del SDD) o desactivar su acceso sin crear una cuenta nueva: `PATCH /users/:id/role` y `PATCH /users/:id/status` — el cambio aplica de inmediato porque el rol y los permisos se re-consultan en cada request, no se confia en el JWT ya emitido.

## Imagenes del catalogo

`POST /products/:id/image` (rol `admin`, `multipart/form-data`, campo `file`) sube una imagen (JPEG/PNG/WebP, hasta `IMAGE_MAX_SIZE_MB`) y actualiza `Product.imageUrl`. Por defecto (`IMAGE_STORAGE_PROVIDER=LOCAL_FILESYSTEM`) se guarda en `uploads/products/<id>/` y se sirve como archivo estatico en `/uploads/...` - no requiere configurar nada mas. `IMAGE_STORAGE_PROVIDER=S3_COMPATIBLE` queda declarado en `.env` para cuando el equipo tenga un bucket real, pero todavia no esta implementado.

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

El seed crea los permisos y roles nucleares (`admin`, `seller`, `comprador`; `verifier` y `delivery` quedan como roles legado sin mantenerse), el mapa de numeros de rifa y, si `ADMIN_SEED_EMAIL` esta definido en `.env`, un usuario administrador inicial (con `ADMIN_SEED_PASSWORD` opcional, ver seccion siguiente). Lee `DATABASE_PROVIDER` para conectarse al mismo motor activo.

Si cambias el modelo de datos, aplica el cambio en **ambos** `schema.prisma` y genera una migracion para cada motor (`npm run prisma:migrate` y `npm run prisma:migrate:sqlite`).

## Inicio de sesion con Microsoft Entra ID

El acceso institucional se hace con la cuenta de Microsoft de la universidad (Entra ID / Azure AD), igual que Moodle. El backend **no crea cuentas nuevas por si solo**: un administrador debe pre-autorizar cada correo institucional con un rol via `POST /auth/temporary-user` (o el seed inicial, `ADMIN_SEED_EMAIL`); recien despues esa persona puede iniciar sesion con su cuenta de Microsoft.

1. En Azure AD / Microsoft Entra ID (portal de la universidad), registra una **app SPA/publica** para el login del frontend (autenticacion delegada, flujo con PKCE via MSAL) y copia su `Tenant ID` y `Application (client) ID`.
2. Define `AZURE_AD_TENANT_ID` y `AZURE_AD_CLIENT_ID` en `.env` con esos valores.
3. El frontend usa MSAL para autenticar al usuario contra Entra ID y obtiene un `id_token`; ese token se envia a `POST /auth/microsoft` con `{ "idToken": "..." }`.
4. El backend valida la firma del token contra el JWKS del tenant, confirma el dominio institucional, busca un `User` local con ese correo y, si existe y tiene un rol asignado, emite el JWT de sesion de la API (igual que `POST /auth/login`).

Sin `AZURE_AD_TENANT_ID`/`AZURE_AD_CLIENT_ID` configurados, `POST /auth/microsoft` responde `503` y el login local por correo/password (`POST /auth/login`) sigue disponible como respaldo para desarrollo — util mientras se gestiona el registro de la app en Azure AD (misma logica de degradacion controlada que la notificacion por Teams, seccion 11 del SDD). Una cuenta creada sin `password` (ver `CreateTemporaryUserDto`) solo puede iniciar sesion con Microsoft.

## Auto-registro con verificacion de correo

Cuando no es posible obtener un registro de app en Microsoft Entra ID (TI no lo autoriza, por ejemplo), el acceso institucional se sigue restringiendo sin depender de Azure AD: **cualquier persona con un correo de los dominios institucionales configurados puede crear su propia cuenta**, probando que realmente tiene acceso a ese buzon mediante un codigo de un solo uso enviado por correo (SMTP), no solo revisando el sufijo del email.

1. `POST /auth/register` con `{ "email", "name", "password" }` (el correo debe terminar en alguno de los dominios de `INSTITUTIONAL_EMAIL_DOMAIN`). Crea (o reutiliza, si aun no se ha verificado) la cuenta con el rol `comprador`, genera un codigo de 6 digitos valido por 15 minutos y lo envia por correo. La respuesta nunca incluye el codigo.
2. `POST /auth/verify-email` con `{ "email", "code" }`. Si el codigo es correcto y no ha expirado, la cuenta queda verificada (`emailVerifiedAt`) y la respuesta ya incluye la sesion (mismo formato que `POST /auth/login`).
3. `POST /auth/login` rechaza con `401` a las cuentas con password que aun no verificaron su correo. Las cuentas creadas por un administrador (`POST /auth/temporary-user`) o que inician sesion por primera vez con Microsoft quedan verificadas de inmediato, porque ya hay alguien (o algo) que dio fe de esa identidad.

Requiere las variables `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` y `SMTP_PASSWORD` en `.env` (puede ser una cuenta de Gmail/Outlook con una "contrasena de aplicacion", o cualquier proveedor SMTP). Sin `SMTP_HOST` configurado, `POST /auth/register` responde `503` en vez de fallar silenciosamente.

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

## Pruebas y CI/CD

`src/**/*.spec.ts` contiene pruebas unitarias (Jest) de la logica de negocio mas critica: doble verificacion del pedido, autorrecogida, verificacion de pago exclusiva del admin, rotacion de roles, sorteo con `crypto.randomInt`, y el guard de permisos. Corren con `npm test` sin necesitar una base de datos real (Prisma va mockeado en cada spec).

`.github/workflows/ci.yml` ejecuta en cada push/PR a `main`/`develop`: instalacion, generacion de clientes de Prisma, lint, chequeo de tipos, pruebas unitarias y build; un segundo job valida que la imagen de Docker siga construyendo. Ese build de Docker es el "CD" disponible por ahora - no hay un entorno de hosting real configurado todavia para desplegar automaticamente.

## Scripts

| Script | Descripcion |
| :--- | :--- |
| `npm run start:dev` | Servidor en modo desarrollo (watch) |
| `npm run build` | Compila a `dist/` |
| `npm run lint` | ESLint + Prettier (con `--fix`) |
| `npm run lint:check` | ESLint sin `--fix` (el que corre en CI) |
| `npm run typecheck` | Chequeo de tipos sin emitir (`tsc --noEmit`) |
| `npm test` | Pruebas unitarias |
| `npm run test:cov` | Pruebas unitarias con reporte de cobertura |
| `npm run prisma:generate` | Genera los clientes de Prisma (Postgres y SQLite) |
| `npm run prisma:migrate` | Aplica migraciones de Prisma (Postgres) |
| `npm run prisma:migrate:sqlite` | Aplica migraciones de Prisma (SQLite) |
| `npm run prisma:deploy` | Aplica migraciones en produccion (Postgres) |
| `npm run prisma:deploy:sqlite` | Aplica migraciones en produccion (SQLite) |
| `npm run prisma:seed` | Ejecuta `prisma/seed.ts` contra el motor activo (`DATABASE_PROVIDER`) |
