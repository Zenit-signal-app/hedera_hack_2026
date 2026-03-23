import {
  type DAppSigner,
  DAppConnector,
  HederaChainId,
  HederaJsonRpcMethod,
  HederaSessionEvent,
  type ExtensionData,
} from "@hashgraph/hedera-wallet-connect";
import {
  AccountId,
  ContractExecuteTransaction,
  ContractId,
  LedgerId,
  TokenAssociateTransaction,
  TokenId,
  TransferTransaction,
} from "@hiero-ledger/sdk";
import { Hbar } from "@hashgraph/sdk";
import { Interface } from "ethers";
import type { SessionTypes, SignClientTypes } from "@walletconnect/types";

import { WEIBARS_PER_TINYBAR } from "@/lib/aggregatorWhbarWrap";

const HASHPACK_EXTENSION_ID = "gjagmgiddbbciopjhllkdnddhcglnemk";

function isMainnetEvm(): boolean {
  try {
    return (
      (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_HEDERA_EVM_NETWORK?.trim().toLowerCase() ===
      "mainnet"
    );
  } catch {
    return false;
  }
}

export function getHederaMirrorRestBase(): string {
  try {
    const v = (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_HEDERA_MIRROR_REST;
    if (v && typeof v === "string" && v.trim()) return v.trim().replace(/\/$/, "");
  } catch {
    /* ignore */
  }
  return isMainnetEvm() ? "https://mainnet.mirrornode.hedera.com" : "https://testnet.mirrornode.hedera.com";
}

/** @deprecated use getHederaMirrorRestBase — kept for call sites */
function getMirrorBase(): string {
  return getHederaMirrorRestBase();
}

/**
 * SDK TransactionId string → mirror REST id (e.g. `0.0.123@456.789` → `0.0.123-456-789`).
 * Avoids `TransactionResponse.getReceipt(Client)` which can hit DAppSigner bugs (e.g. getByKey query).
 */
function hederaTxIdToMirrorPath(id: string): string {
  const s = id.trim();
  const at = s.indexOf("@");
  if (at === -1) return s;
  const account = s.slice(0, at);
  const rest = s.slice(at + 1);
  const dot = rest.indexOf(".");
  const secs = dot === -1 ? rest : rest.slice(0, dot);
  const nano = dot === -1 ? "0" : rest.slice(dot + 1);
  return `${account}-${secs}-${nano}`;
}

async function waitForContractResultMirror(mirrorBase: string, mirrorPath: string): Promise<string> {
  const encoded = encodeURIComponent(mirrorPath);
  const maxAttempts = 45;
  const intervalMs = 1000;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const url = `${mirrorBase}/api/v1/contracts/results/${encoded}`;
      const r = await fetch(url);
      if (r.ok || r.status === 206) {
        const data = (await r.json()) as { result?: string };
        if (data.result) return data.result;
      }
    } catch {
      /* retry */
    }
    await new Promise((res) => setTimeout(res, intervalMs));
  }
  throw new Error("Timed out waiting for contract result on mirror node.");
}

async function waitForTransactionResultMirror(mirrorBase: string, mirrorPath: string): Promise<string> {
  const encoded = encodeURIComponent(mirrorPath);
  const maxAttempts = 45;
  const intervalMs = 1000;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const url = `${mirrorBase}/api/v1/transactions/${encoded}`;
      const r = await fetch(url);
      if (r.ok) {
        const data = (await r.json()) as { transactions?: { result?: string }[] };
        const result = data.transactions?.[0]?.result;
        if (result) return result;
      }
    } catch {
      /* retry */
    }
    await new Promise((res) => setTimeout(res, intervalMs));
  }
  throw new Error("Timed out waiting for transaction on mirror node.");
}

function isUserRejectedError(e: unknown): boolean {
  const s = e instanceof Error ? e.message : JSON.stringify(e);
  return /USER_REJECT|user reject|user denied|rejected request|4001/i.test(s);
}

type ConnectResult = {
  accountId: string;
  walletName: string;
};

class HashgraphWalletConnectService {
  private connector: DAppConnector | null = null;
  private extensions: ExtensionData[] = [];
  private signer: DAppSigner | null = null;
  private accountId = "";
  private evmAddress = "";
  private contractIdCache = new Map<string, ContractId>();

  private metadata: SignClientTypes.Metadata = {
    name: "Zenit Perpetual DEX",
    description: "Perpetual DEX on Hedera",
    url: typeof window !== "undefined" ? this.getSafeAppUrl(window.location) : "http://localhost:3000",
    icons: ["https://hashpack.app/img/logo512.png"],
  };

  private withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
    ]);
  }

  private getSafeAppUrl(loc: Location): string {
    if (loc.hostname === "127.0.0.1") {
      return `http://localhost:${loc.port || "3000"}`;
    }
    return loc.origin;
  }

  async init(): Promise<ExtensionData[]> {
    if (this.connector) return this.extensions;

    const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "zenit-perp-dex";
    if (!projectId || projectId === "zenit-perp-dex" || projectId === "your_project_id") {
      throw new Error("Missing VITE_WALLETCONNECT_PROJECT_ID. Create one at cloud.walletconnect.com");
    }
    const network = isMainnetEvm() ? LedgerId.MAINNET : LedgerId.TESTNET;
    const chains = network === LedgerId.MAINNET ? [HederaChainId.Mainnet] : [HederaChainId.Testnet];

    this.connector = new DAppConnector(
      this.metadata,
      network,
      projectId,
      Object.values(HederaJsonRpcMethod),
      [HederaSessionEvent.ChainChanged, HederaSessionEvent.AccountsChanged],
      chains,
    );

    await this.withTimeout(
      this.connector.init({ logger: "error" }),
      15000,
      "WalletConnect init timeout. Check internet and projectId",
    );
    this.extensions = (this.connector.extensions ?? []).filter((ext) => ext.available);
    return this.extensions;
  }

  getExtensions(): ExtensionData[] {
    return this.extensions;
  }

  async restoreSession(): Promise<{ accountId: string; evmAddress: string } | null> {
    await this.init();
    if (!this.connector) return null;
    const signer = this.connector.signers?.[0];
    if (!signer) {
      this.clearLocalSession();
      return null;
    }
    const accountId = signer.getAccountId().toString();
    const evmAddress = await this.resolveEvmAddress(accountId);
    this.signer = signer;
    this.accountId = accountId;
    this.evmAddress = evmAddress;
    this.persistLocalSession();
    return { accountId, evmAddress };
  }

  async connectHashPack(): Promise<ConnectResult> {
    await this.init();
    if (!this.connector) throw new Error("WalletConnect not initialized");

    const hashPackExt =
      this.extensions.find((e) => e.id === HASHPACK_EXTENSION_ID) ??
      this.extensions.find((e) => String(e.name ?? "").toLowerCase().includes("hashpack"));

    const connectPromise: Promise<SessionTypes.Struct> = hashPackExt
      ? this.connector.connectExtension(hashPackExt.id)
      : this.connector.openModal();
    const session = await this.withTimeout(
      connectPromise,
      30000,
      "HashPack connection timeout. Ensure extension is unlocked and try on http://localhost",
    );

    const sessionAccount = session.namespaces?.hedera?.accounts?.[0];
    const accountId = sessionAccount?.split(":").pop();
    if (!accountId) throw new Error("No Hedera account returned from HashPack");

    AccountId.fromString(accountId);
    this.accountId = accountId;
    this.signer = this.connector.getSigner(AccountId.fromString(accountId));
    this.evmAddress = await this.resolveEvmAddress(accountId);
    this.persistLocalSession();

    return {
      accountId,
      walletName: hashPackExt?.name || "HashPack",
    };
  }

  async disconnect(): Promise<void> {
    if (!this.connector) return;
    await this.connector.disconnectAll();
    this.signer = null;
    this.accountId = "";
    this.evmAddress = "";
    this.clearLocalSession();
  }

  isConnected(): boolean {
    return Boolean(this.signer && this.accountId);
  }

  getAccountId(): string {
    return this.accountId;
  }

  getEvmAddress(): string {
    return this.evmAddress;
  }

  async executeContractCall(
    contractEvmAddress: string,
    abi: readonly any[],
    functionName: string,
    args: readonly unknown[],
    gas = 1_200_000,
  ): Promise<string> {
    if (!this.signer || !this.accountId) throw new Error("HashPack signer is not connected");
    const iface = new Interface(abi as any);
    const calldata = iface.encodeFunctionData(functionName, [...args]);
    const contractId = await this.resolveContractId(contractEvmAddress);
    const tx = new ContractExecuteTransaction()
      .setContractId(contractId)
      .setGas(gas)
      .setFunctionParameters(Buffer.from(calldata.slice(2), "hex"));
    let response;
    try {
      response = await this.signer.call(tx);
    } catch (e) {
      if (isUserRejectedError(e)) {
        throw new Error("Transaction was rejected in the wallet.");
      }
      throw e;
    }
    if (!response?.transactionId) {
      throw new Error(`Contract call failed: ${functionName}`);
    }
    const txIdStr = response.transactionId.toString();
    const mirrorPath = hederaTxIdToMirrorPath(txIdStr);
    const st = await waitForContractResultMirror(getMirrorBase(), mirrorPath);
    if (st !== "SUCCESS") {
      const hint =
        st === "CONTRACT_REVERT_EXECUTED"
          ? " (contract reverted — check Approve, token association, balance, gas, and that the contract address matches deployment)"
          : "";
      throw new Error(`Contract call failed: ${st}${hint}`);
    }
    return txIdStr;
  }

  /**
   * Gọi hàm **payable** (ví dụ `deposit()` trên WHBAR) — gửi HBAR native vào contract.
   * @param payableTinybars Số **tinybars** (8 decimals) cần gửi (khớp mint WHBAR).
   */
  async executePayableContractCall(
    contractEvmAddress: string,
    abi: readonly any[],
    functionName: string,
    args: readonly unknown[],
    payableTinybars: bigint,
    gas = 2_000_000,
  ): Promise<string> {
    if (!this.signer || !this.accountId) throw new Error("HashPack signer is not connected");
    if (payableTinybars <= 0n) throw new Error("Payable amount must be positive");
    const iface = new Interface(abi as any);
    const calldata = iface.encodeFunctionData(functionName, [...args]);
    const contractId = await this.resolveContractId(contractEvmAddress);
    const tx = new ContractExecuteTransaction()
      .setContractId(contractId)
      .setGas(gas)
      .setFunctionParameters(Buffer.from(calldata.slice(2), "hex"))
      .setPayableAmount(Hbar.fromTinybars(payableTinybars.toString()));
    let response;
    try {
      response = await this.signer.call(tx);
    } catch (e) {
      if (isUserRejectedError(e)) {
        throw new Error("Transaction was rejected in the wallet.");
      }
      throw e;
    }
    if (!response?.transactionId) {
      throw new Error(`Contract call failed: ${functionName}`);
    }
    const txIdStr = response.transactionId.toString();
    const mirrorPath = hederaTxIdToMirrorPath(txIdStr);
    const st = await waitForContractResultMirror(getMirrorBase(), mirrorPath);
    if (st !== "SUCCESS") {
      const hint =
        st === "CONTRACT_REVERT_EXECUTED"
          ? " (contract reverted — check WHBAR wrap amount, gas, token association)"
          : "";
      throw new Error(`Contract call failed: ${st}${hint}`);
    }
    return txIdStr;
  }

  /**
   * Payable contract call với **msg.value** (weibars 18 decimals) — dùng cho SaucerSwap `swapExactETHForTokens*`.
   * Hedera SDK nhận **tinybars**; chuyển: `tinybars = valueWei / 10^10`.
   */
  async executePayableContractCallWithValueWei(
    contractEvmAddress: string,
    abi: readonly any[],
    functionName: string,
    args: readonly unknown[],
    valueWei: bigint,
    gas = 8_000_000,
  ): Promise<string> {
    if (!this.signer || !this.accountId) throw new Error("HashPack signer is not connected");
    if (valueWei <= 0n) throw new Error("Payable value must be positive");
    const tinybars = valueWei / WEIBARS_PER_TINYBAR;
    if (tinybars <= 0n) throw new Error("Payable value too small (must be ≥ 1 tinybar in weibar units)");

    console.log("[HashPack] executePayableContractCallWithValueWei:", {
      contract: contractEvmAddress,
      function: functionName,
      valueWei: valueWei.toString(),
      tinybars: tinybars.toString(),
      gas,
    });

    const iface = new Interface(abi as any);
    const calldata = iface.encodeFunctionData(functionName, [...args]);
    const contractId = await this.resolveContractId(contractEvmAddress);
    const tx = new ContractExecuteTransaction()
      .setContractId(contractId)
      .setGas(gas)
      .setFunctionParameters(Buffer.from(calldata.slice(2), "hex"))
      .setPayableAmount(Hbar.fromTinybars(tinybars.toString()));

    console.log("[HashPack] Transaction prepared:", {
      contractId: contractId.toString(),
      payableAmount: tinybars.toString() + " tinybars",
    });

    let response;
    try {
      response = await this.signer.call(tx);
    } catch (e) {
      if (isUserRejectedError(e)) {
        throw new Error("Transaction was rejected in the wallet.");
      }
      throw e;
    }
    if (!response?.transactionId) {
      throw new Error(`Contract call failed: ${functionName}`);
    }
    const txIdStr = response.transactionId.toString();
    const mirrorPath = hederaTxIdToMirrorPath(txIdStr);
    const st = await waitForContractResultMirror(getMirrorBase(), mirrorPath);
    if (st !== "SUCCESS") {
      const hint =
        st === "CONTRACT_REVERT_EXECUTED"
          ? " (contract reverted — check path[0]==WHBAR, output token associated, slippage, native HBAR balance)"
          : "";
      throw new Error(`Contract call failed: ${st}${hint}`);
    }
    return txIdStr;
  }

  async transferHtsTokenToDex(tokenId: string, dexEvmAddress: string, amountRaw: bigint): Promise<string> {
    if (!this.signer || !this.accountId) throw new Error("HashPack signer is not connected");
    if (amountRaw <= 0n) throw new Error("Transfer amount must be greater than zero");
    if (amountRaw > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error("Transfer amount is too large");
    }
    const from = AccountId.fromString(this.accountId);
    const to = await this.resolveDexAccountId(dexEvmAddress);
    const tx = new TransferTransaction()
      .addTokenTransfer(TokenId.fromString(tokenId), from, -Number(amountRaw))
      .addTokenTransfer(TokenId.fromString(tokenId), to, Number(amountRaw));
    let response;
    try {
      response = await this.signer.call(tx);
    } catch (e) {
      if (isUserRejectedError(e)) throw new Error("Transaction was rejected in the wallet.");
      throw e;
    }
    if (!response?.transactionId) {
      throw new Error("HTS transfer failed");
    }
    const txIdStr = response.transactionId.toString();
    const mirrorPath = hederaTxIdToMirrorPath(txIdStr);
    const st = await waitForTransactionResultMirror(getMirrorBase(), mirrorPath);
    if (st !== "SUCCESS") {
      throw new Error(`HTS transfer failed: ${st}`);
    }
    return txIdStr;
  }

  /**
   * Associate the connected Hedera account with an HTS token (e.g. zUSDC).
   * Required before ERC-20 `approve` / `transfer` on the HTS facade often works reliably in HashPack.
   * No-op if already associated (returns "already-associated").
   */
  async associateHtsToken(tokenId: string): Promise<string> {
    if (!this.signer || !this.accountId) throw new Error("HashPack signer is not connected");
    const tx = new TokenAssociateTransaction()
      .setAccountId(AccountId.fromString(this.accountId))
      .setTokenIds([TokenId.fromString(tokenId)]);
    try {
      let response;
      try {
        response = await this.signer.call(tx);
      } catch (err) {
        if (isUserRejectedError(err)) throw new Error("Transaction was rejected in the wallet.");
        throw err;
      }
      if (!response?.transactionId) throw new Error("Token associate failed");
      const txIdStr = response.transactionId.toString();
      const mirrorPath = hederaTxIdToMirrorPath(txIdStr);
      const st = await waitForTransactionResultMirror(getMirrorBase(), mirrorPath);
      if (st !== "SUCCESS") {
        throw new Error(`Token associate failed: ${st}`);
      }
      return txIdStr;
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (/ALREADY_ASSOCIATED|already associated|179|TOKEN_ALREADY_ASSOCIATED/i.test(m)) {
        return "already-associated";
      }
      throw e;
    }
  }

  private async resolveEvmAddress(accountId: string): Promise<string> {
    const base = getHederaMirrorRestBase();
    const resp = await fetch(`${base}/api/v1/accounts/${accountId}`);
    if (!resp.ok) {
      throw new Error(
        `Cannot resolve account from mirror (${isMainnetEvm() ? "mainnet" : "testnet"}). Check VITE_HEDERA_EVM_NETWORK and VITE_HEDERA_MIRROR_REST.`,
      );
    }
    const data = (await resp.json()) as { evm_address?: string };
    const evm = data?.evm_address;
    if (!evm || !/^0x[0-9a-fA-F]{40}$/.test(evm)) throw new Error("Mirror node did not return EVM address");
    return evm;
  }

  /**
   * Mirror `/api/v1/contracts/{evm}` often has no entry for HTS long-zero ERC-20 addresses.
   * In that case Hedera SDK can still build a ContractId from the EVM address (shard 0, realm 0).
   */
  private async resolveContractId(contractEvmAddress: string): Promise<ContractId> {
    const key = contractEvmAddress.toLowerCase();
    const cached = this.contractIdCache.get(key);
    if (cached) return cached;

    const mirrorBase = getHederaMirrorRestBase();
    try {
      const resp = await fetch(`${mirrorBase}/api/v1/contracts/${contractEvmAddress}`);
      if (resp.ok) {
        const data = (await resp.json()) as { contract_id?: string };
        if (data.contract_id) {
          const contractId = ContractId.fromString(data.contract_id);
          this.contractIdCache.set(key, contractId);
          return contractId;
        }
      }
    } catch {
      // fall through to fromEvmAddress
    }

    try {
      const contractId = ContractId.fromEvmAddress(0, 0, contractEvmAddress);
      this.contractIdCache.set(key, contractId);
      return contractId;
    } catch {
      throw new Error(`Cannot resolve contract id: ${contractEvmAddress}`);
    }
  }

  private async resolveDexAccountId(contractEvmAddress: string): Promise<AccountId> {
    const mirrorBase = getHederaMirrorRestBase();
    try {
      const resp = await fetch(`${mirrorBase}/api/v1/contracts/${contractEvmAddress}`);
      if (resp.ok) {
        const data = (await resp.json()) as { contract_id?: string };
        if (data.contract_id) {
          return AccountId.fromString(data.contract_id);
        }
      }
    } catch {
      // fall through
    }
    try {
      return AccountId.fromEvmAddress(0, 0, contractEvmAddress);
    } catch {
      throw new Error(`Cannot resolve contract account id: ${contractEvmAddress}`);
    }
  }

  private persistLocalSession(): void {
    if (typeof window === "undefined") return;
    localStorage.setItem("zenit:wallet:accountId", this.accountId);
    localStorage.setItem("zenit:wallet:evmAddress", this.evmAddress);
    window.dispatchEvent(new CustomEvent("zenit-hashgraph-wallet", { detail: { accountId: this.accountId, evmAddress: this.evmAddress } }));
  }

  private clearLocalSession(): void {
    if (typeof window === "undefined") return;
    localStorage.removeItem("zenit:wallet:accountId");
    localStorage.removeItem("zenit:wallet:evmAddress");
    window.dispatchEvent(new CustomEvent("zenit-hashgraph-wallet", { detail: { accountId: "", evmAddress: "" } }));
  }
}

export const hashgraphWalletConnect = new HashgraphWalletConnectService();

