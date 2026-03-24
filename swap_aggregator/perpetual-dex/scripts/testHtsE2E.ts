import { config as loadEnv } from "dotenv";
import { ethers } from "ethers";
import { AccountId, Client, PrivateKey, TokenId, TransferTransaction } from "@hashgraph/sdk";

loadEnv({ path: "frontend/.env" });
loadEnv({ path: "keeper/.env" });

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function resolveAccountIdFromMirror(evmAddress: string): Promise<string> {
  const url = `https://testnet.mirrornode.hedera.com/api/v1/accounts/${evmAddress}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Mirror resolve failed: ${resp.status}`);
  const data = (await resp.json()) as { account?: string };
  if (!data.account) throw new Error("Mirror did not return account id");
  return data.account;
}

async function resolveContractAccountIdFromMirror(evmAddress: string): Promise<string> {
  const url = `https://testnet.mirrornode.hedera.com/api/v1/contracts/${evmAddress}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Mirror contract resolve failed: ${resp.status}`);
  const data = (await resp.json()) as { contract_id?: string };
  if (!data.contract_id) throw new Error("Mirror did not return contract_id");
  return data.contract_id;
}

function parseKey(raw: string): PrivateKey {
  try {
    return PrivateKey.fromStringECDSA(raw);
  } catch {
    return PrivateKey.fromStringED25519(raw);
  }
}

async function main() {
  const rpcUrl = process.env.HEDERA_TESTNET_RPC_URL?.trim() || required("POLKADOT_TESTNET_RPC_URL");
  const traderKey = required("PRIVATE_KEY");
  const oracleKey = required("KEEPER_PRIVATE_KEY");

  const dexAddress = required("VITE_PERP_DEX_ADDRESS");
  const oracleAddress = required("VITE_ORACLE_ADDRESS");
  const tokenId = process.env.FAUCET_HTS_TOKEN_ID?.trim() || required("VITE_ZUSDC_TOKEN_ID");

  const provider = new ethers.JsonRpcProvider(rpcUrl, { chainId: 296, name: "hedera-testnet" });
  provider.pollingInterval = 4000;
  const trader = new ethers.Wallet(traderKey, provider);
  const oracleUpdater = new ethers.Wallet(oracleKey, provider);

  const traderAccountId = await resolveAccountIdFromMirror(trader.address);
  const dexAccountId = await resolveContractAccountIdFromMirror(dexAddress);
  const balResp = await fetch(
    `https://testnet.mirrornode.hedera.com/api/v1/accounts/${traderAccountId}/tokens?token.id=${tokenId}`,
  );
  const balData = balResp.ok
    ? ((await balResp.json()) as { tokens?: Array<{ balance?: number; token_id?: string }> })
    : { tokens: [] };
  let tokenBal = balData.tokens?.[0]?.balance ?? 0;
  console.log("Trader:", trader.address, traderAccountId, "tokenBalance(raw):", tokenBal);

  const marginAmount = ethers.parseUnits("10", 8);
  if (tokenBal < Number(marginAmount)) {
    const faucetId = AccountId.fromString(required("FAUCET_ACCOUNT_ID"));
    const faucetKey = parseKey(required("FAUCET_PRIVATE_KEY"));
    const client = Client.forTestnet();
    client.setOperator(faucetId, faucetKey);
    const tx = await new TransferTransaction()
      .addTokenTransfer(TokenId.fromString(tokenId), faucetId, -Number(marginAmount))
      .addTokenTransfer(TokenId.fromString(tokenId), AccountId.fromString(traderAccountId), Number(marginAmount))
      .freezeWith(client);
    const signed = await tx.sign(faucetKey);
    const res = await signed.execute(client);
    const receipt = await res.getReceipt(client);
    console.log("topup tx status:", receipt.status.toString(), "txId:", res.transactionId.toString());
    client.close();
    tokenBal = Number(marginAmount);
  }

  const oracleAbi = [
    "function updater() view returns (address)",
    "function setPrice(bytes32 market, uint256 priceE18)",
  ];
  const dexAbi = [
    "function deposit(uint256 amount)",
    "function openPosition(bytes32 market, uint256 amount, uint8 positionType, uint8 leverage)",
    "function balanceOf(address user) view returns (uint256)",
    "function getCurrentPosition(address user, bytes32 market) view returns (uint256 amount, uint8 position, uint8 leverage, uint256 entryPriceE18)",
  ];
  const oracle = new ethers.Contract(oracleAddress, oracleAbi, oracleUpdater);
  const dex = new ethers.Contract(dexAddress, dexAbi, trader);

  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice ?? ethers.parseUnits("1000", "gwei");
  const market = ethers.encodeBytes32String("HBARUSD");
  const oraclePrice = ethers.parseUnits("0.1000", 18);

  const updater = (await oracle.updater()) as string;
  console.log("oracle updater on-chain:", updater, "script signer:", oracleUpdater.address);
  if (updater.toLowerCase() === oracleUpdater.address.toLowerCase()) {
    const txSetPrice = await oracle.setPrice(market, oraclePrice, {
      type: 0,
      gasPrice,
      gasLimit: 1_000_000n,
    });
    await txSetPrice.wait();
    console.log("setPrice tx:", txSetPrice.hash);
  } else {
    console.log("skip setPrice: signer is not updater");
  }

  const traderClient = Client.forTestnet();
  traderClient.setOperator(AccountId.fromString(traderAccountId), parseKey(traderKey));
  const htsTransferToDex = await new TransferTransaction()
    .addTokenTransfer(TokenId.fromString(tokenId), AccountId.fromString(traderAccountId), -Number(marginAmount))
    .addTokenTransfer(TokenId.fromString(tokenId), AccountId.fromString(dexAccountId), Number(marginAmount))
    .freezeWith(traderClient);
  const signedHts = await htsTransferToDex.sign(parseKey(traderKey));
  const transferRes = await signedHts.execute(traderClient);
  const transferReceipt = await transferRes.getReceipt(traderClient);
  console.log("hts transfer to dex:", transferReceipt.status.toString(), transferRes.transactionId.toString());
  traderClient.close();

  console.log("sending deposit sync...");
  const txDeposit = await dex.deposit(marginAmount, {
    type: 0,
    gasPrice,
    gasLimit: 1_500_000n,
  });
  await txDeposit.wait();
  console.log("deposit tx:", txDeposit.hash);

  console.log("sending openPosition...");
  const txOpen = await dex.openPosition(market, marginAmount, 0, 5, {
    type: 0,
    gasPrice,
    gasLimit: 2_000_000n,
  });
  await txOpen.wait();
  console.log("openPosition tx:", txOpen.hash);

  const inDexBalance = await dex.balanceOf(trader.address);
  const position = await dex.getCurrentPosition(trader.address, market);
  console.log("DEX balance(raw):", inDexBalance.toString());
  console.log("Position:", {
    amount: position.amount.toString(),
    side: Number(position.position),
    leverage: Number(position.leverage),
    entryPriceE18: position.entryPriceE18.toString(),
  });

}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

