import { config as loadEnv } from "dotenv";
import { ethers } from "ethers";
import {
  AccountId,
  Client,
  ContractId,
  ContractExecuteTransaction,
  ContractFunctionParameters,
  ContractUpdateTransaction,
  Hbar,
  PrivateKey,
  TokenAssociateTransaction,
  TokenId,
} from "@hashgraph/sdk";

loadEnv({ path: "frontend/.env" });
loadEnv({ path: "keeper/.env" });

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function parseKey(raw: string): PrivateKey {
  try {
    return PrivateKey.fromStringECDSA(raw);
  } catch {
    return PrivateKey.fromStringED25519(raw);
  }
}

async function resolveContractIdFromMirror(address: string): Promise<ContractId> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error(`Invalid EVM contract address: ${address}`);
  }
  const resp = await fetch(`https://testnet.mirrornode.hedera.com/api/v1/contracts/${address}`);
  if (!resp.ok) throw new Error(`Mirror contract resolve failed ${address}: ${resp.status}`);
  const data = (await resp.json()) as { contract_id?: string };
  if (!data.contract_id) throw new Error(`Missing contract_id for ${address}`);
  return ContractId.fromString(data.contract_id);
}

async function main() {
  const operatorKeyRaw =
    process.env.OPERATOR_KEY?.trim() || process.env.PRIVATE_KEY?.trim() || required("KEEPER_PRIVATE_KEY");
  const operatorKey = parseKey(operatorKeyRaw);
  const operatorWallet = new ethers.Wallet(operatorKeyRaw.startsWith("0x") ? operatorKeyRaw : `0x${operatorKeyRaw}`);
  const mirrorResp = await fetch(
    `https://testnet.mirrornode.hedera.com/api/v1/accounts/${operatorWallet.address}`,
  );
  if (!mirrorResp.ok) throw new Error(`Cannot resolve operator account id: ${mirrorResp.status}`);
  const mirrorData = (await mirrorResp.json()) as { account?: string };
  if (!mirrorData.account) throw new Error("Mirror did not return operator account id");
  const operatorId = AccountId.fromString(mirrorData.account);
  const tokenId = TokenId.fromString(
    process.env.FAUCET_HTS_TOKEN_ID?.trim() || required("VITE_ZUSDC_TOKEN_ID"),
  );

  const dexAddress = required("VITE_PERP_DEX_ADDRESS");
  const rewardAddress = required("VITE_REWARD_ADDRESS");

  const dexContractId = await resolveContractIdFromMirror(dexAddress);
  const rewardContractId = await resolveContractIdFromMirror(rewardAddress);
  const dexAsAccount = AccountId.fromString(dexContractId.toString());
  const rewardAsAccount = AccountId.fromString(rewardContractId.toString());

  const client = Client.forTestnet();
  client.setOperator(operatorId, operatorKey);
  client.setDefaultMaxTransactionFee(new Hbar(20));

  console.log("Operator:", operatorId.toString());
  console.log("Token:", tokenId.toString());
  console.log("DEX contractId:", dexContractId.toString());
  console.log("Reward contractId:", rewardContractId.toString());

  for (const contractId of [dexContractId, rewardContractId]) {
    try {
      const tx = await new ContractUpdateTransaction()
        .setContractId(contractId)
        .setMaxAutomaticTokenAssociations(-1)
        .freezeWith(client);
      const signed = await tx.sign(operatorKey);
      const res = await signed.execute(client);
      const receipt = await res.getReceipt(client);
      console.log("setMaxAutomaticTokenAssociations", contractId.toString(), receipt.status.toString());
    } catch (err) {
      console.log(
        "setMaxAutomaticTokenAssociations skipped",
        contractId.toString(),
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  for (const accountId of [dexAsAccount, rewardAsAccount]) {
    try {
      const tx = await new TokenAssociateTransaction()
        .setAccountId(accountId)
        .setTokenIds([tokenId])
        .freezeWith(client);
      const signed = await tx.sign(operatorKey);
      const res = await signed.execute(client);
      const receipt = await res.getReceipt(client);
      console.log("associate", accountId.toString(), receipt.status.toString());
    } catch (err) {
      console.log(
        "TokenAssociateTransaction skipped",
        accountId.toString(),
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  for (const [contractId, fn] of [
    [dexContractId, "associateTradingToken"],
    [rewardContractId, "associateRewardToken"],
  ] as const) {
    try {
      const tx = await new ContractExecuteTransaction()
        .setContractId(contractId)
        .setGas(1_500_000)
        .setFunction(fn, new ContractFunctionParameters())
        .freezeWith(client);
      const signed = await tx.sign(operatorKey);
      const res = await signed.execute(client);
      const receipt = await res.getReceipt(client);
      console.log("ContractExecute", contractId.toString(), fn, receipt.status.toString());
    } catch (err) {
      console.log(
        "ContractExecute failed",
        contractId.toString(),
        fn,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  client.close();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

