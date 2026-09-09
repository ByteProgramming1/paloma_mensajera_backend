// Punto de entrada de despliegue (Dockerfile CMD y "npm start"): aplica las
// migraciones pendientes, corre el seed, y arranca el servidor. Si
// RESET_DATABASE_ON_DEPLOY=true, en vez de eso vacia la base de datos por
// completo (dropea y recrea el esquema aplicando todas las migraciones desde
// cero) antes de sembrarla - pensado para reutilizar la misma base de datos
// de produccion en un evento nuevo sin arrastrar datos del anterior.
// Cualquier otro valor (incluido no definirla) deja el despliegue normal
// intacto: "prisma migrate deploy" + el seed (idempotente, ver
// prisma/seed.ts), exactamente como antes de esta variable existir.
const { execSync } = require('child_process');

function run(command) {
  execSync(command, { stdio: 'inherit' });
}

const shouldReset = process.env.RESET_DATABASE_ON_DEPLOY === 'true';

if (shouldReset) {
  console.log(
    '[deploy] RESET_DATABASE_ON_DEPLOY=true: vaciando la base de datos y volviendo a aplicar el seed.',
  );
  // "prisma migrate reset --force" ya corre el seed configurado en el campo
  // "prisma.seed" de package.json (ts-node prisma/seed.ts) automaticamente,
  // asi que no hace falta llamar "prisma:seed" aparte en esta rama.
  run('npm run prisma:reset');
} else {
  run('npm run prisma:deploy');
  run('npm run prisma:seed');
}

run('node dist/main.js');
