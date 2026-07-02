"use client";

import { useState, useMemo } from "react";
import StatsBar from "./StatsBar";
import { connectWallet, payAndFetch } from "@/lib/walletBrowser";
import type { BatchEvmScheme } from "@circle-fin/x402-batching/client";

const PLACEHOLDER = `// Paste your Solidity contract here
pragma solidity ^0.8.0;

contract Example {
    mapping(address => uint256) public balances;

    function withdraw(uint256 amount) public {
        require(balances[msg.sender] >= amount);
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok);
        balances[msg.sender] -= amount;
    }
}`;

function estimatePrice(code: string): number {
  if (!code.trim()) return 0.001;
  const fnMatches = code.match(/function\s+\w+/g) || [];
  const modMatches = code.match(/modifier\s+\w+/g) || [];
  const fnCount = Math.max(new Set([...fnMatches, ...modMatches]).size, 1);
  const hasModifiers = /modifier\s+\w+/.test(code);
  const hasInheritance = /is\s+\w+/.test(code);
  const lineCount = code.split("\n").length;

  let price = 0.001;
  price += fnCount * 0.0005;
  if (hasModifiers) price += 0.001;
  if (hasInheritance) price += 0.0005;
  if (lineCount > 100) price += 0.001;
  return price;
}

function sectionAccent(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("security")) return "text-[#FF6B5C] border-[#FF6B5C]/30";
  if (t.includes("gas")) return "text-[#FFB020] border-[#FFB020]/30";
  if (t.includes("summary")) return "text-[#3ECF8E] border-[#3ECF8E]/30";
  return "text-[#7FB3FF] border-[#7FB3FF]/30";
}

function ReviewOutput({ text }: { text: string }) {
  const blocks = text.split(/\n(?=##\s)/g);
  return (
    <div className="space-y-6">
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        const heading = lines[0].replace(/^##\s*/, "");
        const body = lines.slice(1).join("\n").trim();
        const isHeading = block.startsWith("##");
        if (!isHeading) {
          return (
            <p key={i} className="text-sm text-[#B8BEC6] leading-relaxed whitespace-pre-wrap">
              {block}
            </p>
          );
        }
        return (
          <div key={i} className={`border-l-2 pl-4 ${sectionAccent(heading)}`}>
            <h3 className="font-mono text-xs uppercase tracking-widest mb-2">{heading}</h3>
            <div className="text-sm text-[#D8DBE0] leading-relaxed whitespace-pre-wrap font-sans">
              {body}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Home() {
  const [code, setCode] = useState("");
  const [address, setAddress] = useState<`0x${string}` | null>(null);
  const [scheme, setScheme] = useState<BatchEvmScheme | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [paying, setPaying] = useState(false);
  const [result, setResult] = useState<{ review: string; metadata: any } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statsRefresh, setStatsRefresh] = useState(0);

  const liveEstimate = useMemo(() => estimatePrice(code), [code]);

  async function handleConnect() {
    setError(null);
    setConnecting(true);
    try {
      const { address, scheme } = await connectWallet();
      setAddress(address);
      setScheme(scheme);
    } catch (e: any) {
      setError(e.message || "Failed to connect wallet");
    } finally {
      setConnecting(false);
    }
  }

  async function handlePayAndReview() {
    if (!scheme || !code.trim()) return;
    setError(null);
    setPaying(true);
    setResult(null);
    try {
      const data = await payAndFetch(scheme, code);
      setResult(data);
      setStatsRefresh((n) => n + 1);
    } catch (e: any) {
      setError(e.message || "Payment or review failed");
    } finally {
      setPaying(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0B0E11] text-[#E8E6E1]">
      {/* Top bar */}
      <header className="border-b border-[#20252C] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-[#3ECF8E] shadow-[0_0_8px_#3ECF8E]" />
          <span className="font-mono text-sm tracking-tight text-[#E8E6E1]">AuditPay</span>
          <span className="font-mono text-[10px] text-[#5B6270] border border-[#2A2F37] rounded px-1.5 py-0.5">
            Arc Testnet
          </span>
        </div>
        {address ? (
          <div className="font-mono text-xs text-[#3ECF8E] border border-[#3ECF8E]/30 rounded px-2.5 py-1">
            {address.slice(0, 6)}...{address.slice(-4)}
          </div>
        ) : (
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="font-mono text-xs bg-[#E8E6E1] text-[#0B0E11] rounded px-3 py-1.5 hover:bg-white transition-colors disabled:opacity-50"
          >
            {connecting ? "Connecting..." : "Connect Wallet"}
          </button>
        )}
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="font-mono text-2xl tracking-tight mb-2">
            Solidity review, priced by complexity
          </h1>
          <p className="text-sm text-[#8B92A0]">
            Paste a contract. The price scales with functions, modifiers, and inheritance.
            Pay per call in USDC — no subscription, no API key.
          </p>
        </div>

        <div className="mb-8">
          <StatsBar refreshKey={statsRefresh} />
        </div>

        {/* Terminal window */}
        <div className="rounded-lg border border-[#20252C] bg-[#0F1318] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#20252C] bg-[#12161C]">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-[#FF5F56]" />
              <div className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E]" />
              <div className="w-2.5 h-2.5 rounded-full bg-[#27C93F]" />
            </div>
            <span className="font-mono text-[10px] text-[#5B6270]">contract.sol</span>
          </div>
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={PLACEHOLDER}
            spellCheck={false}
            className="w-full h-72 bg-transparent p-4 font-mono text-[13px] text-[#D8DBE0] placeholder:text-[#3A404A] outline-none resize-none leading-relaxed"
          />
        </div>

        {/* Price meter + action */}
        <div className="mt-4 flex items-center justify-between">
          <div className="font-mono text-xs text-[#5B6270]">
            estimated cost
            <span className="text-[#FFB020] text-base ml-2 tabular-nums">
              ${liveEstimate.toFixed(4)}
            </span>
            <span className="text-[#3A404A] ml-1">USDC</span>
          </div>

          {!address ? (
            <button
              onClick={handleConnect}
              className="font-mono text-xs bg-[#1A1E24] border border-[#2A2F37] text-[#8B92A0] rounded px-4 py-2 cursor-not-allowed"
              disabled
            >
              Connect wallet to pay
            </button>
          ) : (
            <button
              onClick={handlePayAndReview}
              disabled={paying || !code.trim()}
              className="font-mono text-xs bg-[#FFB020] text-[#0B0E11] font-medium rounded px-4 py-2 hover:bg-[#FFC24D] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {paying ? "Awaiting signature..." : "Pay & Review"}
            </button>
          )}
        </div>

        {error && (
          <div className="mt-4 rounded border border-[#FF6B5C]/30 bg-[#FF6B5C]/5 px-4 py-3 text-sm text-[#FF6B5C] font-mono">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-10">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#20252C]">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[#3ECF8E]" />
                <span className="font-mono text-xs text-[#3ECF8E]">Payment settled</span>
              </div>
              <div className="font-mono text-[10px] text-[#5B6270]">
                {result.metadata.price} USDC · {result.metadata.functionCount} functions
              </div>
            </div>
            <ReviewOutput text={result.review} />
          </div>
        )}
      </main>
    </div>
  );
}