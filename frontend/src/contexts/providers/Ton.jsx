import { TonConnectUIProvider } from '@tonconnect/ui-react';

export const TonProvider = ({ children }) => (
  <TonConnectUIProvider manifestUrl='https://taiga-labs.github.io/soxominter.json'>{children}</TonConnectUIProvider>
);