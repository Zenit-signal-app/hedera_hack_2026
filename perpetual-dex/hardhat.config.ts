import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config({ path: "frontend/.env" });

/** Single deployer key for Hardhat `ethers.getSigners()[0]`. */
function accountsFromEnv(primary: string | undefined, fallback?: string | undefined): string[] {
  const k = primary?.trim() || fallback?.trim();
  if (!k) return [];
  return [k];
}

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.27",
    settings: { evmVersion: "cancun" },
  },
  networks: {
    hederaMainnet: {
      url: process.env.HEDERA_MAINNET_RPC_URL ?? "https://mainnet.hashio.io/api",
      chainId: 295,
      /** Prefer dedicated mainnet key; else `PRIVATE_KEY` (backward compatible). */
      accounts: accountsFromEnv(process.env.HEDERA_MAINNET_PRIVATE_KEY, process.env.PRIVATE_KEY),
    },
    hederaTestnet: {
      url: process.env.HEDERA_TESTNET_RPC_URL ?? "https://testnet.hashio.io/api",
      chainId: 296,
      /** Prefer `HEDERA_TESTNET_PRIVATE_KEY` for testnet-only wallet; else `PRIVATE_KEY`. */
      accounts: accountsFromEnv(process.env.HEDERA_TESTNET_PRIVATE_KEY, process.env.PRIVATE_KEY),
    },
    polkadotTestnet: {
      url: process.env.POLKADOT_TESTNET_RPC_URL ?? "https://testnet.hashio.io/api",
      chainId: 420420417,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY.trim()] : [],
    },
  },
};

export default config;
