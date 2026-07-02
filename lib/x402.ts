import { BatchFacilitatorClient } from "@circle-fin/x402-batching/server";

// Arc Testnet — from @circle-fin/x402-batching SDK / Circle reference implementation
const ARC_TESTNET_NETWORK = "eip155:5042002";
const ARC_TESTNET_USDC = "0x3600000000000000000000000000000000000000";
const ARC_TESTNET_GATEWAY_WALLET = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9";

export const sellerAddress = process.env.PAYMENT_RECIPIENT_ADDRESS as `0x${string}`;

export const facilitator = new BatchFacilitatorClient({
  url: "https://gateway-api-testnet.circle.com",
});

export interface PaymentPayload {
  x402Version: number;
  resource?: { url: string; description: string; mimeType: string };
  accepted?: Record<string, unknown>;
  payload: Record<string, unknown>;
  extensions?: Record<string, unknown>;
}

export function buildPaymentRequirements(priceDollar: string) {
  const amount = Math.round(parseFloat(priceDollar.replace("$", "")) * 1_000_000);
  return {
    scheme: "exact" as const,
    network: ARC_TESTNET_NETWORK,
    asset: ARC_TESTNET_USDC,
    amount: amount.toString(),
    payTo: sellerAddress,
    maxTimeoutSeconds: 345600,
    extra: {
      name: "GatewayWalletBatched",
      version: "1",
      verifyingContract: ARC_TESTNET_GATEWAY_WALLET,
    },
  };
}
