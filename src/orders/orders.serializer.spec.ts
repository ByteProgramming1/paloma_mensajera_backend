import { serializeOrderFull, type OrderWithRelations } from './orders.serializer';

function buildOrder(overrides: Partial<OrderWithRelations> = {}): OrderWithRelations {
  return {
    id: 'o1',
    orderCode: 'PM-0001',
    status: 'PAYMENT_VERIFIED',
    totalAmount: 1000,
    salesChannel: 'PRESENCIAL',
    createdAt: new Date('2026-01-01'),
    raffleNumber: null,
    items: [],
    deliveryDetail: null,
    messageReview: null,
    paymentTransaction: null,
    deliveryAssignments: [],
    ...overrides,
  } as unknown as OrderWithRelations;
}

describe('serializeOrderFull', () => {
  it('resuelve verifiedByName desde verifiedByAdmin.name', () => {
    const order = buildOrder({
      paymentTransaction: {
        id: 'pt1',
        paymentMethod: 'CASH',
        verified: true,
        verifiedByAdminId: 'seller1',
        verifiedByAdmin: { name: 'Ana Vendedora' },
        verifiedAt: new Date('2026-01-02'),
        verificationNotes: null,
      },
    } as never);

    const result = serializeOrderFull(order);

    expect(result.payment).toEqual({
      id: 'pt1',
      paymentMethod: 'CASH',
      verified: true,
      verifiedByAdminId: 'seller1',
      verifiedByName: 'Ana Vendedora',
      verifiedAt: new Date('2026-01-02'),
      verificationNotes: null,
    });
  });

  it('deja verifiedByName en null si aun no se ha verificado el pago', () => {
    const order = buildOrder({
      paymentTransaction: {
        id: 'pt1',
        paymentMethod: 'NEQUI',
        verified: false,
        verifiedByAdminId: null,
        verifiedByAdmin: null,
        verifiedAt: null,
        verificationNotes: null,
      },
    } as never);

    const result = serializeOrderFull(order);

    expect(result.payment?.verifiedByName).toBeNull();
  });

  it('payment queda en null si el pedido aun no tiene paymentTransaction', () => {
    const order = buildOrder({ paymentTransaction: null });

    const result = serializeOrderFull(order);

    expect(result.payment).toBeNull();
  });
});
