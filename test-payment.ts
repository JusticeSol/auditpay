import { GatewayClient } from "@circle-fin/x402-batching/client";

async function main() {
  const gateway = new GatewayClient({
    chain: "arcTestnet",
    privateKey: process.env.BUYER_PRIVATE_KEY as `0x${string}`,
  });

  console.log("Depositing USDC into Gateway balance...");
  const depositResult = await gateway.deposit("1.00");
  console.log("Deposit complete:", depositResult);

  console.log("Paying for Solidity review...");

  const testCode = `
pragma solidity ^0.8.0;

contract VulnerableBank {
    mapping(address => uint256) public balances;

    function deposit() public payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw(uint256 amount) public {
        require(balances[msg.sender] >= amount, "Insufficient balance");
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");
        balances[msg.sender] -= amount;
    }
}
`;

  const result = await gateway.pay("http://localhost:3000/api/review", {
    method: "POST",
    body: { code: testCode },
  });

  console.log("Payment result:");
  console.dir(result, { depth: null });

  console.log("\nReview response:");
  console.dir(result.data, { depth: null });
}

main().catch((err) => {
  console.error("Payment failed:", err);
  process.exit(1);
});