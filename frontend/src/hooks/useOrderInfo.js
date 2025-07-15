import { useQuery } from '@tanstack/react-query';
import { tonApiInstance } from '../constants/instance';

export const useOrderInfo = (address) =>
  useQuery({
    queryKey: ['orderInfo', address],
    queryFn: async () => {
      const { data, status, statusText } = await tonApiInstance.get(`/blockchain/accounts/${address}/methods/get_porder_queues`);
      if (status !== 200) {
        throw new Error(statusText);
      }
      return data;
    },
    enabled: !!address,
  });
