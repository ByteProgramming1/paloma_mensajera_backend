import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';

function buildPrismaMock() {
  return {
    user: { findUnique: jest.fn(), update: jest.fn() },
    role: { findUnique: jest.fn() },
  };
}

describe('UsersService', () => {
  describe('reassignRole', () => {
    it('lanza 404 si el usuario no existe', async () => {
      const prisma = buildPrismaMock();
      prisma.user.findUnique.mockResolvedValue(null);
      const service = new UsersService(prisma as never);

      await expect(
        service.reassignRole('admin1', 'nadie', { newRole: 'seller', roleExpiresAt: '2099-01-01T00:00:00.000Z' } as never),
      ).rejects.toThrow(NotFoundException);
    });

    it('rechaza un rol inexistente', async () => {
      const prisma = buildPrismaMock();
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      prisma.role.findUnique.mockResolvedValue(null);
      const service = new UsersService(prisma as never);

      await expect(
        service.reassignRole('admin1', 'u1', { newRole: 'inexistente', roleExpiresAt: '2099-01-01T00:00:00.000Z' } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('actualiza el rol y registra quien y cuando lo reasigno', async () => {
      const prisma = buildPrismaMock();
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      prisma.role.findUnique.mockResolvedValue({ id: 'role-seller', slug: 'seller' });
      prisma.user.update.mockResolvedValue({ id: 'u1', role: { slug: 'seller' } });
      const service = new UsersService(prisma as never);

      await service.reassignRole('admin1', 'u1', { newRole: 'seller', roleExpiresAt: '2099-01-01T00:00:00.000Z' } as never);

      const updateArgs = prisma.user.update.mock.calls[0][0];
      expect(updateArgs.data.roleId).toBe('role-seller');
      expect(updateArgs.data.roleAssignedByAdminId).toBe('admin1');
      expect(updateArgs.data.roleAssignedAt).toBeInstanceOf(Date);
      expect(updateArgs.data.roleExpiresAt).toEqual(new Date('2099-01-01T00:00:00.000Z'));
    });

    it('rechaza una fecha de vencimiento pasada', async () => {
      const prisma = buildPrismaMock();
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', roleId: 'role-buyer' });
      const service = new UsersService(prisma as never);

      await expect(
        service.reassignRole('admin1', 'u1', { newRole: 'seller', roleExpiresAt: '2020-01-01T00:00:00.000Z' } as never),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.role.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('toggleStatus', () => {
    it('impide que un admin se desactive a si mismo', async () => {
      const prisma = buildPrismaMock();
      const service = new UsersService(prisma as never);

      await expect(service.toggleStatus('admin1', 'admin1', { isActive: false })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('permite que un admin se reactive a si mismo', async () => {
      const prisma = buildPrismaMock();
      prisma.user.findUnique.mockResolvedValue({ id: 'admin1' });
      prisma.user.update.mockResolvedValue({ id: 'admin1', isActive: true });
      const service = new UsersService(prisma as never);

      await expect(service.toggleStatus('admin1', 'admin1', { isActive: true })).resolves.toEqual({
        id: 'admin1',
        isActive: true,
      });
    });

    it('desactiva a otro usuario', async () => {
      const prisma = buildPrismaMock();
      prisma.user.findUnique.mockResolvedValue({ id: 'u2' });
      prisma.user.update.mockResolvedValue({ id: 'u2', isActive: false });
      const service = new UsersService(prisma as never);

      await service.toggleStatus('admin1', 'u2', { isActive: false });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u2' },
        data: { isActive: false },
        select: { id: true, email: true, name: true, isActive: true },
      });
    });
  });
});
