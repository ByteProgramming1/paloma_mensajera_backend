// Genera los clientes de Prisma (postgresql y sqlite) automaticamente
// despues de "npm install", sin importar que pipeline lo ejecute (CI,
// Azure, o la maquina de un desarrollador). Antes de esto, cualquier
// pipeline que solo corriera "npm install && npm run build" fallaba con
// decenas de errores TS2339 porque src/prisma/prisma.service.ts importa
// los tipos generados (prisma/*/generated), que no existen hasta correr
// "prisma generate".
//
// Se omite en silencio si prisma/ todavia no esta presente (ej. la capa
// de Docker que corre "npm ci" antes de copiar el codigo fuente) - ahi el
// Dockerfile ya llama "npm run prisma:generate" explicitamente despues.
const { existsSync } = require('fs');
const { execSync } = require('child_process');

const hasPostgresqlSchema = existsSync('prisma/postgresql/schema.prisma');
const hasSqliteSchema = existsSync('prisma/sqlite/schema.prisma');

if (hasPostgresqlSchema && hasSqliteSchema) {
  execSync('npm run prisma:generate', { stdio: 'inherit' });
} else {
  console.log(
    '[postinstall] prisma/ no esta presente todavia - se omite "prisma generate" en este paso.',
  );
}
