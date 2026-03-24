const { HDNodeWallet } = require("ethers");
const readline = require("readline");

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt) =>
    new Promise((resolve) => rl.question(prompt, resolve));

  const seed = await question("Enter your seed phrase: ");
  rl.close();

  const wallet = HDNodeWallet.fromPhrase(seed.trim(), undefined, "m/44'/60'/0'/0/0");

  console.log("Address:    ", wallet.address);
  console.log("Private key:", wallet.privateKey);
}

main().catch((error) => {
  console.error("Failed to derive key:", error);
  process.exit(1);
});
