import api from "@/axios/axiosInstance";
import { CHAIN_DEFINITIONS, ServerChain } from "@/lib/constant";

let chainsPromise: Promise<void> | null = null;

/** Fetch all chains from the server and merge their numeric IDs into CHAIN_DEFINITIONS by slug. */
export function fetchAndMergeChains(): Promise<void> {
	if (!chainsPromise) {
		chainsPromise = (async () => {
			try {
				const response = await api.get<ServerChain[]>("/chains");
				const serverChains = response.data;

				for (const serverChain of serverChains) {
					const def = CHAIN_DEFINITIONS.find((c) => c.id === serverChain.slug);
					if (def) {
						def.serverChainId = serverChain.id;
					}
				}
			} catch (error) {
				chainsPromise = null; // allow retry on failure
				console.error("Failed to fetch chains:", error);
			}
		})();
	}
	return chainsPromise;
}

/** Get the server numeric chain ID for a given chain slug. Ensures chains are fetched first. */
export async function getServerChainId(slug: string): Promise<number | undefined> {
	await fetchAndMergeChains();
	return CHAIN_DEFINITIONS.find((c) => c.id === slug)?.serverChainId;
}
