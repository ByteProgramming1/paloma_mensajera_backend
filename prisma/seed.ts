import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { PERMISSION_DEFINITIONS, ROLE_PERMISSION_MATRIX } from '../src/common/enums/permissions';

const prisma = new PrismaClient();

const ARGON2ID_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
};

const ROLE_NAMES: Record<string, string> = {
  admin: 'Administrador',
  verifier: 'Verificador de Pagos',
  seller: 'Vendedor',
  delivery: 'Encargado de Entrega',
  comprador: 'Comprador',
};

async function seedPermissions() {
  for (const permission of PERMISSION_DEFINITIONS) {
    await prisma.permission.upsert({
      where: { slug: permission.slug },
      update: { resource: permission.resource, action: permission.action },
      create: permission,
    });
  }
}

async function seedRoles() {
  for (const [slug, permissionSlugs] of Object.entries(ROLE_PERMISSION_MATRIX)) {
    const role = await prisma.role.upsert({
      where: { slug },
      update: { name: ROLE_NAMES[slug] ?? slug },
      create: { slug, name: ROLE_NAMES[slug] ?? slug, isSystem: true },
    });

    const permissions = await prisma.permission.findMany({
      where: { slug: { in: permissionSlugs } },
    });

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
    });
  }
}

async function seedAdminUser() {
  const email = process.env.ADMIN_SEED_EMAIL;

  if (!email) {
    console.warn('[seed] ADMIN_SEED_EMAIL no configurado: se omite la creacion del admin inicial.');
    return;
  }

  // ADMIN_SEED_PASSWORD es opcional: sin ella, el admin inicial solo puede
  // iniciar sesion con su cuenta institucional de Microsoft (ver AuthService.loginWithMicrosoft).
  const password = process.env.ADMIN_SEED_PASSWORD;
  const passwordHash = password ? await argon2.hash(password, ARGON2ID_OPTIONS) : null;

  const adminRole = await prisma.role.findUniqueOrThrow({ where: { slug: 'admin' } });

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: 'Administrador Paloma Mensajera',
      password: passwordHash,
      roleId: adminRole.id,
    },
  });
}

async function seedAppSettings() {
  await prisma.appSettings.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton', notificationMode: process.env.NOTIFICATION_MODE ?? 'MANUAL' },
  });
}

async function seedRaffleNumbers() {
  const count = Number(process.env.RAFFLE_NUMBER_COUNT ?? 100);
  const existing = await prisma.raffleNumber.count();
  if (existing >= count) {
    return;
  }

  const numbersToCreate = Array.from({ length: count - existing }, (_, index) => ({
    number: existing + index + 1,
  }));
  await prisma.raffleNumber.createMany({ data: numbersToCreate });
}

async function main() {
  await seedPermissions();
  await seedRoles();
  await seedAppSettings();
  await seedAdminUser();
  await seedRaffleNumbers();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
