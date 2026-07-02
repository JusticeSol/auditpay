import { NextRequest, NextResponse } from "next/server";
import { recordPayment } from "@/lib/stats";
import {
  facilitator,
  buildPaymentRequirements,
  type PaymentPayload,
} from "@/lib/x402";

function countFunctions(code: string): number {
  const patterns = [/function\s+\w+/g, /modifier\s+\w+/g];
  const matches = new Set<string>();
  patterns.forEach((pattern) => {
    const found = code.match(pattern) || [];
    found.forEach((m) => matches.add(m.trim()));
  });
  return Math.max(matches.size, 1);
}

function calculatePrice(code: string): string {
  const functionCount = countFunctions(code);
  const hasModifiers = /modifier\s+\w+/.test(code);
  const hasInheritance = /is\s+\w+/.test(code);
  const lineCount = code.split("\n").length;

  let price = 0.001;
  price += functionCount * 0.0005;
  if (hasModifiers) price += 0.001;
  if (hasInheritance) price += 0.0005;
  if (lineCount > 100) price += 0.001;

  return `$${price.toFixed(4)}`;
}

async function runReview(code: string): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system: `You are an expert Solidity smart contract auditor. Review the provided Solidity code and identify:
1. Critical security vulnerabilities (reentrancy, integer overflow, access control issues)
2. Gas optimization opportunities
3. Code quality issues
4. Best practice violations

Format your response as:
## Security Issues
[list issues with severity: CRITICAL/HIGH/MEDIUM/LOW]

## Gas Optimizations
[list optimizations]

## Code Quality
[list quality issues]

## Summary
[brief overall assessment]

Be concise but thorough. If no issues found in a category, say "None found."`,
      messages: [{ role: "user", content: `Review this Solidity contract:\n\n${code}` }],
    }),
  });

  const data = await response.json();
  const review = data.content?.[0]?.text;
  if (!review) throw new Error("Failed to generate review");
  return review;
}

export async function POST(req: NextRequest) {
  const { code } = await req.json();

  if (!code || typeof code !== "string") {
    return NextResponse.json({ error: "No Solidity code provided" }, { status: 400 });
  }

  const price = calculatePrice(code);
  const requirements = buildPaymentRequirements(price);
  const paymentSignature = req.headers.get("payment-signature");
  const endpoint = "/api/review";

  // No payment yet — return 402 with dynamic price for this specific contract
  if (!paymentSignature) {
    console.log(`[x402] 402 Payment Required: ${endpoint} — ${price}`);
    const paymentRequired = {
      x402Version: 2,
      resource: {
        url: endpoint,
        description: `Solidity contract review (${price} USDC)`,
        mimeType: "application/json",
      },
      accepts: [requirements],
    };
    return new NextResponse(JSON.stringify({ price }), {
      status: 402,
      headers: {
        "Content-Type": "application/json",
        "PAYMENT-REQUIRED": Buffer.from(JSON.stringify(paymentRequired)).toString("base64"),
      },
    });
  }

  // Payment present — verify and settle via Circle Gateway
  try {
    const paymentPayload: PaymentPayload = JSON.parse(
      Buffer.from(paymentSignature, "base64").toString("utf-8")
    );

    const verifyResult = await facilitator.verify(paymentPayload, requirements);
    if (!verifyResult.isValid) {
      console.error("[x402] Verification failed, reason:", verifyResult.invalidReason);
      console.error("[x402] Full verify result:", JSON.stringify(verifyResult, null, 2));
      return NextResponse.json(
        { error: "Payment verification failed", reason: verifyResult.invalidReason },
        { status: 402 }
      );
    }

    const settleResult = await facilitator.settle(paymentPayload, requirements);
    if (!settleResult.success) {
      console.error(`[x402] Settlement failed: ${settleResult.errorReason}`);
      return NextResponse.json(
        { error: "Payment settlement failed", reason: settleResult.errorReason },
        { status: 402 }
      );
    }

    const payer = settleResult.payer ?? verifyResult.payer ?? "unknown";
    console.log(`[x402] Payment settled: ${endpoint} — ${price} USDC from ${payer}`);

    // Record traction metrics (non-blocking — never breaks the review flow)
    await recordPayment({
      payer,
      amountMicro: Math.round(parseFloat(price.replace("$", "")) * 1_000_000),
      price,
      functionCount: countFunctions(code),
      transaction: settleResult.transaction ?? "unknown",
      timestamp: new Date().toISOString(),
    });

    const review = await runReview(code);

    const response = NextResponse.json({
      review,
      metadata: {
        functionCount: countFunctions(code),
        lineCount: code.split("\n").length,
        price,
        payer,
        timestamp: new Date().toISOString(),
      },
    });

    response.headers.set(
      "PAYMENT-RESPONSE",
      Buffer.from(
        JSON.stringify({
          success: true,
          transaction: settleResult.transaction,
          network: requirements.network,
          payer,
        })
      ).toString("base64")
    );

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[x402] Payment processing error:", message);
    if (error instanceof Error && error.cause) {
      console.error("[x402] Underlying cause:", error.cause);
    }
    console.error("[x402] Full error object:", error);
    return NextResponse.json({ error: "Payment processing error", message }, { status: 500 });
  }
}