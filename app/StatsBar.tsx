"use client";

import { useEffect, useState } from "react";

interface Stats {
  totalRevenueUsdc: number;
  totalTransactions: number;
  uniquePayers: number;
  transactionsPerHour: number;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="font-mono text-base text-[#E8E6E1] tabular-nums">{value}</span>
      <span className="font-mono text-[10px] uppercase tracking-widest text-[#5B6270]">
        {label}
      </span>
    </div>
  );
}

export default function StatsBar({ refreshKey }: { refreshKey?: number }) {
  const [stats, setStats] = useState<Stats | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/stats", { cache: "no-store" });
      if (res.ok) setStats(await res.json());
    } catch {
      // silent — stats bar is non-critical
    }
  }

  useEffect(() => {
    load();
  }, [refreshKey]);

  if (!stats) return null;

  return (
    <div className="grid grid-cols-4 gap-6 rounded-lg border border-[#20252C] bg-[#0F1318] px-6 py-4">
      <Stat label="Revenue" value={`$${stats.totalRevenueUsdc.toFixed(4)}`} />
      <Stat label="Payments" value={String(stats.totalTransactions)} />
      <Stat label="Unique payers" value={String(stats.uniquePayers)} />
      <Stat label="Tx / hour" value={String(stats.transactionsPerHour)} />
    </div>
  );
}