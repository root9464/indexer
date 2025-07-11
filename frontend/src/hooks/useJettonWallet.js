import { useQuery } from '@tanstack/react-query';
import { tonApiInstance } from '../constants/instance';

const useJettonWallet = ({ address }) =>
  useQuery({
    queryKey: ['jetton-wallet', address],
    queryFn: async () => {
      const jettons = await tonApiInstance.get(`/accounts/${address}/jettons`);
      return jettons;
    },
    select: (data) => data.data,
    enabled: !!address,
  });

export { useJettonWallet };
