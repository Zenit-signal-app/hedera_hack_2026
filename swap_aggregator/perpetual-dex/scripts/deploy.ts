import { ethers } from "hardhat";

const ZUSDC_ADDRESS = process.env.zUSDC_Smartcontract || process.env.ZUSDC_ADDRESS || "0x277E42B9454fB36A7Eaa52D4cE332bEF71dd017a";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type TxOverrides = { nonce?: number; type?: number; gasPrice?: bigint; gasLimit?: bigint };

async function deployWithRetry<T>(
  fn: (overrides?: TxOverrides) => Promise<T>,
  signerAddress: string,
  maxRetries = 4
): Promise<T> {
  const provider = ethers.provider;
  const feeData = await provider.getFeeData();
  const baseOverrides: TxOverrides = {
    type: 0,
    gasPrice: feeData.gasPrice ?? ethers.parseUnits("50", "gwei"),
    gasLimit: 10_000_000n,
  };
  for (let i = 0; i < maxRetries; i++) {
    try {
      const overrides =
        i > 0
          ? {
              ...baseOverrides,
              nonce: (await provider.getTransactionCount(signerAddress, "pending")) + i,
            }
          : { ...baseOverrides };
      return await fn(overrides);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if ((msg.includes("Transaction Already Imported") || msg.includes("nonce")) && i < maxRetries - 1) {
        console.log(`Retry ${i + 2}/${maxRetries} (bumping nonce) in 20s...`);
        await sleep(20000);
        continue;
      }
      throw e;
    }
  }
  throw new Error("Max retries exceeded");
}

async function main() {
  const zusdc = ZUSDC_ADDRESS;
  if (!zusdc) {
    throw new Error("ZUSDC_ADDRESS or zUSDC_Smartcontract required in .env");
  }

  const [signer] = await ethers.getSigners();
  console.log("Deployer:", signer.address);
  console.log("Using zUSDC at:", zusdc);

  const RewardContract = await ethers.getContractFactory("RewardContract");
  const reward = await deployWithRetry(
    (o) => RewardContract.deploy(zusdc, o ?? {}),
    signer.address
  );
  await reward.waitForDeployment();
  const rewardAddress = await reward.getAddress();
  console.log("RewardContract deployed to:", rewardAddress);

  await sleep(2000);
  const Oracle = await ethers.getContractFactory("ZenitOracle");
  const oracle = await deployWithRetry(
    (o) => Oracle.deploy(o ?? {}),
    signer.address
  );
  await oracle.waitForDeployment();
  const oracleAddress = await oracle.getAddress();
  console.log("ZenitOracle deployed to:", oracleAddress);

  await sleep(3000);
  const PerpetualDEX = await ethers.getContractFactory("PerpetualDEX");
  const dex = await deployWithRetry(
    (o) => PerpetualDEX.deploy(zusdc, rewardAddress, oracleAddress, o ?? {}),
    signer.address
  );
  await dex.waitForDeployment();
  const dexAddress = await dex.getAddress();
  console.log("PerpetualDEX deployed to:", dexAddress);

  await sleep(2000);
  const tx = await deployWithRetry(
    (o) => reward.setDEXContractAddress(dexAddress, o ?? {}),
    signer.address
  );
  await tx.wait();
  console.log("RewardContract.setDEXContractAddress called");

  console.log("\n--- frontend/.env ---");
  console.log(`VITE_PERP_DEX_ADDRESS=${dexAddress}`);
  console.log(`VITE_DEX_ADDRESS=${dexAddress}`);
  console.log(`VITE_TOKEN_ADDRESS=${zusdc}`);
  console.log(`VITE_REWARD_ADDRESS=${rewardAddress}`);
  console.log(`VITE_ORACLE_ADDRESS=${oracleAddress}`);
  console.log("\n--- keeper/.env ---");
  console.log(`PERP_DEX_ADDRESS="${dexAddress}"`);
  console.log(`TOKEN_ADDRESS="${zusdc}"`);
  console.log(`ORACLE_ADDRESS="${oracleAddress}"`);
  console.log("\n--- For setKeeper script ---");
  console.log(`DEX_ADDRESS=${dexAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
