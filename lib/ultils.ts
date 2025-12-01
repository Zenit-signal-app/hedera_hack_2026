/* eslint-disable @typescript-eslint/no-explicit-any */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { HexBlob } from "@cardano-sdk/util";
import { Cardano } from "@cardano-sdk/core";
import { fromHex, C } from "lucid-cardano";
export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function absoluteUrl(path: string) {
	return `${process.env.NEXT_PUBLIC_APP_URL}${path}`;
}

type TType = {
	baseToken: string;
	quoteToken: string;
};

export function parseTokenPair(symbol: string): TType {
	if (!symbol || typeof symbol !== "string") {
		return {
			baseToken: "",
			quoteToken: "",
		};
	}

	const parts = symbol.split("_");

	if (parts.length !== 2) {
		return {
			baseToken: symbol,
			quoteToken: "",
		};
	}

	const baseToken = parts[0].toUpperCase();
	const quoteToken = parts[1].toUpperCase();

	return { baseToken, quoteToken };
}

export const convertUtxosToHex = (utxos: any) => {
	if (typeof utxos === "object" && utxos.tx_hash && utxos.output_index) {
		return `${utxos.tx_hash}#${utxos.output_index}`;
	}
	if (utxos.to_cbor) {
		return utxos.to_cbor();
	}

	return JSON.stringify(utxos);
};
export const convertHexToBech32 = (hexAddress: string): string | null => {
	const address = Cardano.Address.fromBytes(
		HexBlob.fromBytes(Buffer.from(hexAddress, "hex"))
	);
	return address.toBech32();
};
export const decodeAssetName = (hexName: string): string => {
    try {
        // Sử dụng Buffer của Node.js để chuyển Hex sang chuỗi ký tự
        const buffer = Buffer.from(hexName, 'hex'); 
        return buffer.toString('utf8');
    } catch (e) {
        console.error("Lỗi giải mã Asset Name Hex:", e);
        return hexName; // Trả về Hex nếu lỗi
    }
};
export function parseBalance(hexBalance: string) {
  const cborBytes = fromHex(hexBalance);

  // Decode CBOR thành class Value
  const value = C.Value.from_bytes(cborBytes);

  // ADA
  const lovelace = value.coin().to_str();
  const ada = (Number(lovelace) / 1_000_000).toString();

  const tokens: any[] = [];

  const multiasset = value.multiasset();
  if (multiasset) {
    const policies = multiasset.keys();
    for (let i = 0; i < policies.len(); i++) {
      const policyId = Buffer.from(policies.get(i).to_bytes()).toString("hex");

      const assets = multiasset.get(policies.get(i));
      const assetNames = assets.keys();

      for (let j = 0; j < assetNames.len(); j++) {
        const assetName = Buffer.from(
          assetNames.get(j).name()
        ).toString("hex");

        const quantity = assets.get(assetNames.get(j)).to_str();

        tokens.push({
          policyId,
          assetName: decodeAssetName(assetName),
          unit: policyId + assetName,
          quantity,
        });
      }
    }
  }

  return { ada, tokens };
}
