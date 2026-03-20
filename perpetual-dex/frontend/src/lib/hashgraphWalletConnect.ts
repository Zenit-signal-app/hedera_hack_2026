import {
  type DAppSigner,
  DAppConnector,
  HederaChainId,
  HederaJsonRpcMethod,
  HederaSessionEvent,
  type ExtensionData,
} from "@hashgraph/hedera-wallet-connect";
import { AccountId, Client, ContractExecuteTransaction, ContractId, LedgerId, TokenId, TransferTransaction } from "@hiero-ledger/sdk";
import { Interface } from "ethers";
import type { SessionTypes, SignClientTypes } from "@walletconnect/types";

const HASHPACK_EXTENSION_ID = "gjagmgiddbbciopjhllkdnddhcglnemk";

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
    const network = (import.meta.env.HEDERA_TESTNET_RPC_URL as string | undefined)?.includes("mainnet")
      ? LedgerId.MAINNET
      : LedgerId.TESTNET;
    const chains =
      network === LedgerId.MAINNET ? [HederaChainId.Mainnet] : [HederaChainId.Testnet];

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
    const response = await this.signer.call(tx);
    if (!response?.transactionId) {
      throw new Error(`Contract call failed: ${functionName}`);
    }
    const receipt = await response.getReceipt(Client.forTestnet());
    if (receipt.status.toString() !== "SUCCESS") {
      throw new Error(`Contract call failed: ${receipt.status.toString()}`);
    }
    return response.transactionId.toString();
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
    const response = await this.signer.call(tx);
    if (!response?.transactionId) {
      throw new Error("HTS transfer failed");
    }
    const receipt = await response.getReceipt(Client.forTestnet());
    if (receipt.status.toString() !== "SUCCESS") {
      throw new Error(`HTS transfer failed: ${receipt.status.toString()}`);
    }
    return response.transactionId.toString();
  }

  private async resolveEvmAddress(accountId: string): Promise<string> {
    const resp = await fetch(`https://testnet.mirrornode.hedera.com/api/v1/accounts/${accountId}`);
    if (!resp.ok) throw new Error("Cannot resolve account from mirror node");
    const data = (await resp.json()) as { evm_address?: string };
    const evm = data?.evm_address;
    if (!evm || !/^0x[0-9a-fA-F]{40}$/.test(evm)) throw new Error("Mirror node did not return EVM address");
    return evm;
  }

  private async resolveContractId(contractEvmAddress: string): Promise<ContractId> {
    const key = contractEvmAddress.toLowerCase();
    const cached = this.contractIdCache.get(key);
    if (cached) return cached;
    const resp = await fetch(`https://testnet.mirrornode.hedera.com/api/v1/contracts/${contractEvmAddress}`);
    if (!resp.ok) throw new Error(`Cannot resolve contract id: ${contractEvmAddress}`);
    const data = (await resp.json()) as { contract_id?: string };
    if (!data.contract_id) throw new Error(`Missing contract_id for ${contractEvmAddress}`);
    const contractId = ContractId.fromString(data.contract_id);
    this.contractIdCache.set(key, contractId);
    return contractId;
  }

  private async resolveDexAccountId(contractEvmAddress: string): Promise<AccountId> {
    const resp = await fetch(`https://testnet.mirrornode.hedera.com/api/v1/contracts/${contractEvmAddress}`);
    if (!resp.ok) throw new Error(`Cannot resolve contract account id: ${contractEvmAddress}`);
    const data = (await resp.json()) as { contract_id?: string };
    if (!data.contract_id) throw new Error(`Missing contract_id for ${contractEvmAddress}`);
    return AccountId.fromString(data.contract_id);
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

