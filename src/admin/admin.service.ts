import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ProductType } from '../common/enums/domain.enums';

// "Zona de peligro" del panel de administracion: borrado masivo para
// reutilizar la plataforma en un evento nuevo. La cuenta admin que se
// preserva es siempre la de ADMIN_SEED_EMAIL (la misma que siembra
// prisma/seed.ts), para no depender de adivinar "cual admin es el original"
// cuando existe mas de una cuenta con rol admin.
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  // Borra todo excepto: (a) el correo+contraseña de la cuenta admin por
  // defecto y (b) el registro de los productos tipo COMBO (nombre, precio,
  // stock, imagen, isActive). Los grupos de acompañantes/opciones se borran
  // igual que en resetFull: "excepto los combos" se interpreta como solo el
  // producto en si, no sus acompañantes asociados.
  async resetKeepCombos() {
    const defaultAdmin = await this.findDefaultAdminOrThrow();

    return this.prisma.$transaction(async (tx) => {
      await this.wipeTransactionalData(tx);
      const { count: deletedProducts } = await tx.product.deleteMany({
        where: { type: { not: ProductType.COMBO } },
      });
      const deletedUsers = await this.wipeUsersExcept(tx, defaultAdmin.id);

      return {
        preservedAdminEmail: defaultAdmin.email,
        preservedProductType: ProductType.COMBO,
        deletedProducts,
        deletedUsers,
      };
    });
  }

  // Borra absolutamente todo excepto el correo+contraseña de la cuenta admin
  // por defecto (combos y acompañantes incluidos).
  async resetFull() {
    const defaultAdmin = await this.findDefaultAdminOrThrow();

    return this.prisma.$transaction(async (tx) => {
      await this.wipeTransactionalData(tx);
      const { count: deletedProducts } = await tx.product.deleteMany({});
      const deletedUsers = await this.wipeUsersExcept(tx, defaultAdmin.id);

      return {
        preservedAdminEmail: defaultAdmin.email,
        deletedProducts,
        deletedUsers,
      };
    });
  }

  // Borra pedidos y todo lo que cuelga de ellos, numeros de rifa/sorteo, y el
  // catalogo reutilizable de acompañantes - todo lo que ambos endpoints
  // borran por igual, sin tocar productos ni usuarios (eso lo decide cada
  // metodo publico). El orden respeta las FK que no tienen onDelete: Cascade
  // (DrawRound -> RaffleNumber/Order, y OrderItem/AddOnOption antes de poder
  // borrar AddOnGroup) - mismo criterio que RaffleNumbersService.resetAll.
  private async wipeTransactionalData(tx: PrismaTx) {
    await tx.drawRound.deleteMany({});
    await tx.raffleNumber.deleteMany({});
    // Order en cascada se lleva OrderItem, DeliveryDetail, MessageReview,
    // PaymentTransaction y DeliveryAssignment (onDelete: Cascade en el schema).
    await tx.order.deleteMany({});
    await tx.addOnOption.deleteMany({});
    await tx.addOnGroup.deleteMany({});
  }

  // No borra por email/password directamente: elimina toda cuenta cuyo id no
  // sea el del admin por defecto. Antes limpia roleAssignedByAdminId (FK
  // propia de User) para que ninguna fila sobreviviente quede apuntando a una
  // cuenta que esta a punto de borrarse.
  private async wipeUsersExcept(tx: PrismaTx, keepUserId: string) {
    await tx.user.updateMany({ data: { roleAssignedByAdminId: null } });
    const { count } = await tx.user.deleteMany({ where: { id: { not: keepUserId } } });
    return count;
  }

  private async findDefaultAdminOrThrow() {
    const email = this.configService.get<string>('ADMIN_SEED_EMAIL');
    if (!email) {
      throw new InternalServerErrorException(
        'ADMIN_SEED_EMAIL no esta configurado: no se puede determinar que cuenta admin preservar.',
      );
    }

    const admin = await this.prisma.user.findUnique({ where: { email } });
    if (!admin) {
      throw new NotFoundException(
        `No existe ninguna cuenta con el correo de ADMIN_SEED_EMAIL ('${email}').`,
      );
    }

    return admin;
  }
}

// Subconjunto de PrismaService disponible dentro de $transaction (mismo
// patron que RaffleNumbersService.configure).
type PrismaTx = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];
