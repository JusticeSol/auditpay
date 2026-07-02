import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

const KEYS = {
  totalRevenue: "auditpay:total_revenue_micro", // stored in micro-USDC (integer)
  totalTx: "auditpay:total_tx",
  payers: "auditpay:payers", // a set of unique payer addresses
  recentTx: "auditpay:recent_tx", // a list of recent tx JSON blobs
};

export interface TxRecord {
  payer: string;
  amountMicro: number; // micro-USDC
  price: string;
  functionCount: number;
  transaction: string;
  timestamp: string;
}

export async function recordPayment(tx: TxRecord): Promise<void> {
  try {
    await Promise.all([
      redis.incrby(KEYS.totalRevenue, tx.amountMicro),
      redis.incr(KEYS.totalTx),
      redis.sadd(KEYS.payers, tx.payer.toLowerCase()),
      redis.lpush(KEYS.recentTx, JSON.stringify(tx)),
    ]);
    await redis.ltrim(KEYS.recentTx, 0, 49);
  } catch (err) {
    console.error("[stats] Failed to record payment:", err);
  }
}

export interface StatsSnapshot {
  totalRevenueUsdc: number;
  totalTransactions: number;
  uniquePayers: number;
  transactionsPerHour: number;
  recentTransactions: TxRecord[];
}

export async function getStats(): Promise<StatsSnapshot> {
  const [revenueMicro, totalTx, uniquePayers, recentRaw] = await Promise.all([
    redis.get<number>(KEYS.totalRevenue),
    redis.get<number>(KEYS.totalTx),
    redis.scard(KEYS.payers),
    redis.lrange(KEYS.recentTx, 0, 49),
  ]);

  const recentTransactions: TxRecord[] = (recentRaw || []).map((r) =>
    typeof r === "string" ? JSON.parse(r) : (r as TxRecord)
  );

  let txPerHour = 0;
  if (recentTransactions.length >= 2) {
    const newest = new Date(recentTransactions[0].timestamp).getTime();
    const oldest = new Date(
      recentTransactions[recentTransactions.length - 1].timestamp
    ).getTime();
    const hours = (newest - oldest) / (1000 * 60 * 60);
    txPerHour = hours > 0 ? recentTransactions.length / hours : recentTransactions.length;
  } else {
    txPerHour = recentTransactions.length;
  }

  return {
    totalRevenueUsdc: (revenueMicro || 0) / 1_000_000,
    totalTransactions: totalTx || 0,
    uniquePayers: uniquePayers || 0,
    transactionsPerHour: Math.round(txPerHour * 100) / 100,
    recentTransactions,
  };
}