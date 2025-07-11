import axios from 'axios';

const tonApiInstance = axios.create({
  baseURL: 'https://testnet.tonapi.io/v2',
});

export { tonApiInstance };
