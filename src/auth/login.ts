import { signMessage, getChainId } from "@wagmi/core";
import { generateAuthNonce, verifyEvmAuth } from "../api.ts";
import { setAuthenticated } from "./session.ts";
import { wagmiAdapter, appKit } from "./appkit.ts";

export async function connectWallet(): Promise<void> {
  appKit.open();
}

export async function signIn(): Promise<void> {
  const account = appKit.getAccount();
  if (!account?.address) {
    throw new Error("No wallet connected");
  }

  const chainId = getChainId(wagmiAdapter.wagmiConfig);
  const nonce = await generateAuthNonce();

  const message = `yeader.cc wants you to sign in with your Ethereum account.\n\nNonce: ${nonce}`;

  const signature = await signMessage(wagmiAdapter.wagmiConfig, {
    message,
    account: account.address,
  });

  const result = await verifyEvmAuth(message, signature, account.address, chainId);

  if (!result.verified) {
    throw new Error("Signature verification failed");
  }

  setAuthenticated(account.address, result.chain_id);
}

export function setupAccountListener(onAccountChange: (address: string | null) => void): void {
  appKit.subscribeAccount((state) => {
    onAccountChange(state.address ?? null);
  });
}
