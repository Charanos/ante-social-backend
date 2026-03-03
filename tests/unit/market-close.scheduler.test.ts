import assert from 'node:assert/strict';
import test from 'node:test';
import { MarketCloseScheduler } from '../../apps/market-engine/src/schedulers/market-close.scheduler';

test('MarketCloseScheduler auto closes and settles due markets', async () => {
  const executionOrder: string[] = [];
  const fakeMarkets = [{ _id: { toString: () => 'm1' } }, { _id: { toString: () => 'm2' } }];

  const model = {
    find: () => ({
      select: () => ({
        lean: () => ({
          exec: async () => fakeMarkets,
        }),
      }),
    }),
  } as any;

  const marketService = {
    closeMarket: async (id: string) => {
      executionOrder.push(`close:${id}`);
    },
    settleMarket: async (id: string) => {
      executionOrder.push(`settle:${id}`);
    },
  } as any;

  const scheduler = new MarketCloseScheduler(model, marketService);
  await scheduler.checkClosingMarkets();

  assert.deepEqual(executionOrder, ['close:m1', 'settle:m1', 'close:m2', 'settle:m2']);
});
