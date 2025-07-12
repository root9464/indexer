import { Address, beginCell, toNano } from '@ton/core';
import { CHAIN } from '@tonconnect/ui-react';
import { ORDER_BOOK_ADDRESS, SOXO_MASTER_ADDRESS } from '../../constants/adresses';

const deployOrderBook = (address) => {
  const cell = beginCell()
    .storeUint(0xf4874876, 32)
    .storeUint(BigInt(Math.floor(Date.now() / 1000)), 64)
    .storeAddress(Address.parse(SOXO_MASTER_ADDRESS))
    .endCell();

  const message = {
    validUntil: Math.round(Date.now() / 1000) + 60 * 5,
    network: CHAIN.TESTNET,
    messages: [
      {
        address: address,
        amount: toNano('0.05').toString(),
        payload: cell.toBoc().toString('base64'),
      },
    ],
  };

  return message;
};

const makeAsk = (amount, jetton_address) => {
  console.log(amount * 10 ** 6, jetton_address);
  const payload = beginCell().storeUint(0x845746, 32).storeUint(1n, 16).endCell();
  const msg_cell = beginCell()
    .storeUint(0xf8a7ea5, 32)
    .storeUint(BigInt(Math.floor(Date.now() / 1000)), 64)
    .storeCoins(amount * Math.pow(10, 9))
    .storeAddress(Address.parse(ORDER_BOOK_ADDRESS))
    .storeUint(0, 2)
    .storeUint(0, 1)
    .storeCoins(toNano('0.1'))
    .storeBit(1)
    .storeRef(payload)
    .endCell();

  const message = {
    validUntil: Math.round(Date.now() / 1000) + 60 * 5,
    network: CHAIN.TESTNET,
    messages: [
      {
        address: jetton_address,
        amount: toNano('0.15').toString(),
        payload: msg_cell.toBoc().toString('base64'),
      },
    ],
  };

  return message;
};

const makeBid = (amount, jetton_address) => {
  const payload = beginCell().storeUint(0xbf4385, 32).storeUint(1, 16).endCell();
  const msg_cell = beginCell()
    .storeUint(0xf8a7ea5, 32)
    .storeUint(BigInt(Math.floor(Date.now() / 1000)), 64)
    .storeCoins(amount * Math.pow(10, 9))
    .storeAddress(Address.parse(ORDER_BOOK_ADDRESS))
    .storeUint(0, 2)
    .storeUint(0, 1)
    .storeCoins(toNano('0.1'))
    .storeBit(1)
    .storeRef(payload)
    .endCell();

  const message = {
    validUntil: Math.round(Date.now() / 1000) + 60 * 5,
    network: CHAIN.TESTNET,
    messages: [
      {
        address: jetton_address,
        amount: toNano('0.15').toString(),
        payload: msg_cell.toBoc().toString('base64'),
      },
    ],
  };

  return message;
};

export { deployOrderBook, makeAsk, makeBid };
