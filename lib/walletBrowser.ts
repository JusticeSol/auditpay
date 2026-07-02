"use client";

import { createWalletClient, custom, type Hex } from "viem";
import { BatchEvmScheme } from "@circle-fin/x402-batching/client";

const ARC_TESTNET = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
} as const;

interface EIP6963ProviderDetail {
  info: { uuid: string; name: string; rdns: string };
  provider: any;
}

async function discoverProvider(): Promise<any> {
  const providers = new Map<string, EIP6963ProviderDetail>();

  const onAnnounce = (event: any) => {
    providers.set(event.detail.info.uuid, event.detail);
  };

  window.addEventListener("eip6963:announceProvider", onAnnounce);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  await new Promise((resolve) => setTimeout(resolve, 250));
  window.removeEventListener("eip6963:announceProvider", onAnnounce);

  const list = [...providers.values()];
  const metamask = list.find((p) => p.info.rdns === "io.metamask");
  const selected = metamask ?? list[0];

  if (!selected) {
    if ((window as any).ethereum) return (window as any).ethereum;
    throw new Error("No wallet found. Please install MetaMask.");
  }

  return selected.provider;
}

export async function connectWallet(): Promise<{
  address: `0x${string}`;
  scheme: BatchEvmScheme;
}> {
  const provider = await discoverProvider();

  await provider.request({ method: "eth_requestAccounts" });

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x4CEF52" }], // 5042002 in hex
    });
  } catch (switchError: any) {
    if (switchError.code === 4902) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: "0x4CEF52",
            chainName: "Arc Testnet",
            nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
            rpcUrls: ["https://rpc.testnet.arc.network"],
            blockExplorerUrls: ["https://testnet.arcscan.app"],
          },
        ],
      });
    } else {
      throw switchError;
    }
  }

  const accounts = await provider.request({ method: "eth_accounts" });
  const address = accounts[0] as `0x${string}`;

  const walletClient = createWalletClient({
    account: address,
    chain: ARC_TESTNET as any,
    transport: custom(provider),
  });

  const signer = {
    address,
    signTypedData: async (params: {
      domain: any;
      types: Record<string, Array<{ name: string; type: string }>>;
      primaryType: string;
      message: Record<string, unknown>;
    }): Promise<Hex> => {
      return walletClient.signTypedData({
        account: address,
        domain: params.domain,
        types: params.types as any,
        primaryType: params.primaryType as any,
        message: params.message as any,
      });
    },
  };

  const scheme = new BatchEvmScheme(signer);

  return { address, scheme };
}

export async function payAndFetch(
  scheme: BatchEvmScheme,
  code: string
): Promise<{ review: string; metadata: any }> {
  const firstRes = await fetch("/api/review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });

  if (firstRes.status !== 402) {
    const data = await firstRes.json();
    throw new Error(data.error || "Unexpected response");
  }

  const paymentRequiredHeader = firstRes.headers.get("payment-required");
  if (!paymentRequiredHeader) throw new Error("Missing payment requirements");

  const paymentRequired = JSON.parse(atob(paymentRequiredHeader));
  const requirements = paymentRequired.accepts[0];

  const paymentPayload = await scheme.createPaymentPayload(2, requirements);

  const fullPayload = {
    ...paymentPayload,
    resource: paymentRequired.resource,
    accepted: requirements,
  };

  const paymentSignature = btoa(JSON.stringify(fullPayload));

  const secondRes = await fetch("/api/review", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "payment-signature": paymentSignature,
    },
    body: JSON.stringify({ code }),
  });

  const data = await secondRes.json();

  if (!secondRes.ok) {
    throw new Error(data.error || "Payment or review failed");
  }

  return data;
}