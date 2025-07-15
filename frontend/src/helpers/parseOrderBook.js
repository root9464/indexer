import { Dictionary } from '@ton/core';

export const orderDictionaryValue = {
  serialize(src, builder) {
    builder.storeCoins(src.orderAmount);
    builder.storeUint(src.stdAddr, 256);
  },

  parse(src) {
    return {
      orderAmount: src.loadCoins(),
      stdAddr: BigInt(src.loadUintBig(256)),
    };
  },
};

export const asksBidsDictionaryValue = {
  serialize(src, builder) {
    builder.storeDict(src.asks);
    builder.storeDict(src.bids);
  },

  parse(src) {
    return {
      asks: src.loadDict(Dictionary.Keys.BigUint(64), orderDictionaryValue),
      bids: src.loadDict(Dictionary.Keys.BigUint(64), orderDictionaryValue),
    };
  },
};
