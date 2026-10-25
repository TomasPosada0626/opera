import { describe, expect, it } from 'vitest';
import {
  currentStationSince,
  deliveredFor,
  deliveryState,
  isOrderOpen,
  orderCollection,
  orderStations,
  orderTotal,
} from './order-status';
import { buildOrder, buildRemission } from '../test/factories';

describe('order-status', () => {
  const now = new Date(2026, 0, 20, 9, 0);

  it('builds the four stations with when the order entered and left each one', () => {
    const stations = orderStations(
      buildOrder({
        status: 'EN_ALMACEN',
        productionStartedAt: '2026-01-16T10:00:00.000Z',
        warehousedAt: '2026-01-18T10:00:00.000Z',
      }),
    );

    expect(stations.map((s) => s.status)).toEqual([
      'PENDIENTE',
      'EN_PRODUCCION',
      'EN_ALMACEN',
      'DESPACHADO',
    ]);
    expect(stations[0].leftAt).toBe('2026-01-16T10:00:00.000Z');
    expect(stations[2].leftAt).toBeNull();
    expect(stations[3].enteredAt).toBeNull();
  });

  it.each([
    ['PENDIENTE', {}, '2026-01-15T10:00:00.000Z'],
    ['EN_PRODUCCION', { productionStartedAt: 'p' }, 'p'],
    ['EN_ALMACEN', { warehousedAt: 'w' }, 'w'],
    ['DESPACHADO', { dispatchedAt: 'd' }, 'd'],
    ['CANCELADO', { cancelledAt: 'c' }, 'c'],
  ] as const)(
    'knows since when a %s order is in its station',
    (status, extra, expected) => {
      expect(currentStationSince(buildOrder({ status, ...extra }))).toBe(
        expected,
      );
    },
  );

  it('falls back to createdAt when a station mark is missing', () => {
    for (const status of [
      'EN_PRODUCCION',
      'EN_ALMACEN',
      'DESPACHADO',
      'CANCELADO',
    ] as const) {
      expect(currentStationSince(buildOrder({ status }))).toBe(
        '2026-01-15T10:00:00.000Z',
      );
    }
  });

  it('treats only dispatched and cancelled orders as closed', () => {
    expect(isOrderOpen('EN_ALMACEN')).toBe(true);
    expect(isOrderOpen('DESPACHADO')).toBe(false);
    expect(isOrderOpen('CANCELADO')).toBe(false);
  });

  it('computes the delivery state against today', () => {
    const order = (date: string | null, status = 'EN_PRODUCCION' as const) => ({
      estimatedDeliveryDate: date,
      status,
    });

    expect(deliveryState(order(null), now)).toEqual({ kind: 'none' });
    expect(
      deliveryState(
        { estimatedDeliveryDate: '2026-01-01', status: 'DESPACHADO' },
        now,
      ),
    ).toEqual({ kind: 'done' });
    expect(deliveryState(order('2026-01-17T00:00:00.000Z'), now)).toEqual({
      kind: 'overdue',
      days: 3,
    });
    expect(deliveryState(order('2026-01-20T00:00:00.000Z'), now)).toEqual({
      kind: 'today',
    });
    expect(deliveryState(order('2026-01-22T00:00:00.000Z'), now)).toEqual({
      kind: 'upcoming',
      days: 2,
    });
  });

  it('sums the order total, delivered quantity and collection, ignoring voided remissions', () => {
    const order = buildOrder({
      remissions: [
        buildRemission({ total: '50', amountPaid: '20' }),
        buildRemission({
          id: 'voided',
          total: '25',
          amountPaid: '0',
          voidedAt: '2026-01-21T00:00:00.000Z',
        }),
      ],
    });

    expect(orderTotal(order)).toBe(75);
    expect(deliveredFor(order, 'item-1')).toBe(2);
    expect(orderCollection(order)).toEqual({
      dispatched: 50,
      paid: 20,
      pending: 30,
    });
  });
});
