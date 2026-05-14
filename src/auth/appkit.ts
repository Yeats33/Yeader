import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { mainnet, polygon, bsc, arbitrum, optimism } from "@reown/appkit/networks";
import type { AppKitNetwork } from "@reown/appkit/networks";
import { createAppKit } from "@reown/appkit";

const PROJECT_ID = "ce6edcec2865d2b8d1e23bc639ed44d6";

const networks: [AppKitNetwork, ...AppKitNetwork[]] = [mainnet, polygon, bsc, arbitrum, optimism];

export const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId: PROJECT_ID,
});

export const appKit = createAppKit({
  adapters: [wagmiAdapter],
  networks,
  projectId: PROJECT_ID,
  metadata: {
    name: "Yeader",
    description: "Cross-platform ebook reader",
    url: "https://yeader.cc",
    icons: [],
  },
});
