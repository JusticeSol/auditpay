# AuditPay

**Pay-per-review Solidity smart contract auditing, priced by complexity, settled in USDC on Arc.**

Live demo: [auditpay-sigma.vercel.app](https://auditpay-sigma.vercel.app/)

Built for Arc Network RFB 02 — *Selling Agent Services via Nanopayments*.

---

## What it does

AuditPay is an AI agent that reviews Solidity smart contracts for security vulnerabilities, gas inefficiencies, and code-quality issues — and charges **per call**, with no subscription and no API key.

Paste a contract, and the price is calculated dynamically from its complexity (function count, modifiers, inheritance, length). You pay that exact amount in USDC via a gasless signature, the payment settles on Arc Testnet through Circle's Gateway, and the review streams back — typically for a fraction of a cent.

## Why it fits RFB 02

RFB 02 asks for agent services monetized at the micro level: pay-per-call, dynamic pricing by complexity, no subscription overhead. AuditPay implements exactly that:

- **x402-enabled agent API** — the `/api/review` endpoint returns HTTP 402 until a valid payment is presented
- **Dynamic pricing by complexity** — price scales with the actual contract, not a flat rate
- **Pay-per-call, no subscriptions** — each review is a standalone sub-cent transaction
- **Traction tracked live** — total revenue, unique paying clients, and transactions/hour are recorded on every settled payment and displayed in-app

## How it works

```
┌─────────────┐   1. POST /api/review (code)     ┌──────────────┐
│   Browser   │ ───────────────────────────────> │  Next.js API │
│  (MetaMask) │                                   │    Route     │
│             │ <─── 402 + price + requirements ──│              │
│             │                                   │              │
│             │   2. sign payment (EIP-712)       │              │
│             │ ───────────────────────────────> │              │
│             │                                   │  verify +    │
│             │                                   │  settle via  │
│             │                                   │  Circle      │
│             │                                   │  Gateway     │
│             │ <─────── review + metadata ───────│      │       │
└─────────────┘                                   └──────┼───────┘
                                                         │
                                              3. Claude reviews contract
                                                         │
                                              4. record metrics (Redis)
```

1. The client requests a review. The server counts the contract's functions/modifiers/inheritance, computes a price, and returns **402 Payment Required** with x402 payment requirements.
2. The browser signs a gasless USDC payment authorization with MetaMask (EIP-712 typed data) and retries the request with the signed payload.
3. The server verifies and settles the payment through Circle's Gateway on Arc Testnet.
4. On success, the contract is reviewed by Claude, metrics are recorded, and the review is returned.

## Pricing model

| Factor | Cost |
|---|---|
| Base | $0.0010 |
| Per function / modifier | +$0.0005 |
| Contains modifiers | +$0.0010 |
| Uses inheritance | +$0.0005 |
| Over 100 lines | +$0.0010 |

A simple one-function contract costs ~$0.0015; a complex inherited contract with many functions scales up accordingly — but stays well within nanopayment territory.

## Tech stack

- **Frontend / API** — Next.js 16 (App Router), TypeScript, Tailwind CSS
- **Payments** — x402 via Circle's `@circle-fin/x402-batching` (Gateway facilitator on Arc Testnet)
- **Wallet** — MetaMask through viem, EIP-6963 provider discovery
- **AI** — Anthropic Claude (Solidity security-audit system prompt)
- **Metrics store** — Upstash Redis (via Vercel Marketplace)
- **Chain** — Arc Testnet (`eip155:5042002`), USDC settlement
- **Hosting** — Vercel

## Traction metrics

Every settled payment records the payer, amount, complexity, transaction ID, and timestamp. The `/api/stats` endpoint aggregates:

- **Total revenue** (USDC)
- **Total payments**
- **Unique paying clients**
- **Transactions per hour**

These are displayed live in the app header and update after each review.

## Running locally

```bash
git clone https://github.com/JusticeSol/auditpay.git
cd auditpay
npm install
```

Create `.env.local`:

```bash
ANTHROPIC_API_KEY=your_anthropic_key
PAYMENT_RECIPIENT_ADDRESS=your_seller_wallet_address
NEXT_PUBLIC_CHAIN_ID=5042002
KV_REST_API_URL=your_upstash_url
KV_REST_API_TOKEN=your_upstash_token
```

```bash
npm run dev
```

Open [localhost:3000](http://localhost:3000), connect a wallet on Arc Testnet with a Gateway USDC deposit, paste a contract, and pay for a review.

> **Note:** paying requires a one-time USDC deposit into Circle Gateway from the buyer wallet. See `test-payment.ts` for a scripted example of the deposit + payment flow.

## Project structure

```
app/
  api/
    review/route.ts   # x402-gated review endpoint (pricing, verify, settle, review)
    stats/route.ts     # aggregated traction metrics
  page.tsx             # main UI — code input, live pricing, payment, review output
  StatsBar.tsx         # live traction metrics bar
lib/
  x402.ts              # payment requirements + Circle Gateway facilitator
  walletBrowser.ts     # MetaMask connect + browser-side payment signing
  stats.ts             # Redis-backed metrics recording/aggregation
test-payment.ts        # scripted deposit + payment (buyer-side reference)
```

## License

MIT
