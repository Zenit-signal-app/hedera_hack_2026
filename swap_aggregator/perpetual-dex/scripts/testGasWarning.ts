/**
 * Test Gas Warning Logic
 * Simulates different HBAR amounts to verify gas warning behavior
 */

// Simulate the gas warning logic from LiquidityAggregator.tsx
function testGasWarning(amountHbar: number, balanceHbar: number): string | null {
  const amountWei = BigInt(Math.floor(amountHbar * 1e18));
  const balanceWei = BigInt(Math.floor(balanceHbar * 1e18));
  const gasBufferWei = 5n * 10n ** 18n; // 5 HBAR buffer
  const totalNeeded = amountWei + gasBufferWei;

  if (balanceWei < totalNeeded) {
    const maxSwappable = balanceWei > gasBufferWei ? balanceWei - gasBufferWei : 0n;

    if (maxSwappable <= 0n) {
      return "⚠️ Need at least 5 HBAR for gas fees. Please add more HBAR to your wallet.";
    }

    const maxHbar = Number(maxSwappable) / 1e18;
    return `⚠️ Amount too high. Maximum swappable: ${maxHbar.toFixed(2)} HBAR (leaving 5 HBAR for gas fees).`;
  } else if (balanceWei < totalNeeded + 2n * 10n ** 18n) {
    // Warning if balance will be < 7 HBAR after swap
    return "ℹ️ Low HBAR balance. Consider leaving more HBAR for future transactions.";
  }

  return null; // No warning
}

// Test cases
const testCases = [
  { amount: 5, balance: 39, description: "Normal swap - plenty of balance" },
  { amount: 10, balance: 39, description: "Medium swap - comfortable balance" },
  { amount: 20, balance: 39, description: "Large swap - still safe" },
  { amount: 30, balance: 39, description: "Very large swap - low balance warning" },
  { amount: 34, balance: 39, description: "Near maximum - low balance warning" },
  { amount: 35, balance: 39, description: "Above maximum - amount too high" },
  { amount: 38, balance: 39, description: "Way above maximum - amount too high" },
  { amount: 10, balance: 15, description: "Moderate balance - safe" },
  { amount: 10, balance: 14, description: "Low balance - warning" },
  { amount: 10, balance: 12, description: "Very low balance - amount too high" },
  { amount: 5, balance: 8, description: "Barely enough - amount too high" },
  { amount: 3, balance: 7, description: "Just under limit - low balance warning" },
  { amount: 1, balance: 5, description: "Minimum balance - no warning" },
  { amount: 1, balance: 4, description: "Below minimum - need more HBAR" },
  { amount: 10, balance: 3, description: "Insufficient balance - need more HBAR" },
];

console.log("=== Gas Warning Test Results ===\n");
console.log("Current wallet balance: ~39 HBAR\n");

testCases.forEach((test, index) => {
  const warning = testGasWarning(test.amount, test.balance);
  const status = warning ? (warning.startsWith("⚠️") ? "❌ BLOCKED" : "⚠️ WARNING") : "✅ OK";

  console.log(`Test ${index + 1}: ${test.description}`);
  console.log(`  Input: ${test.amount} HBAR | Balance: ${test.balance} HBAR`);
  console.log(`  Status: ${status}`);
  if (warning) {
    console.log(`  Message: ${warning}`);
  }
  console.log("");
});

// Summary
console.log("=== Summary ===");
console.log("Gas Buffer: 5 HBAR (always reserved)");
console.log("Low Balance Threshold: 7 HBAR remaining after swap");
console.log("");
console.log("Warning Levels:");
console.log("  ✅ OK: Balance > Amount + 7 HBAR");
console.log("  ℹ️ INFO: Balance between Amount + 5 HBAR and Amount + 7 HBAR");
console.log("  ⚠️ WARNING: Balance < Amount + 5 HBAR (shows max swappable)");
console.log("  ❌ BLOCKED: Balance < 5 HBAR (cannot swap)");
