"use client";

import { useEffect } from "react";
import { fetchAndMergeChains } from "@/services/chainServices";

let fetched = false;

/** Runs once on app mount to fetch server chain IDs and merge into CHAIN_DEFINITIONS. */
export default function ChainInitializer() {
	useEffect(() => {
		if (!fetched) {
			fetched = true;
			fetchAndMergeChains();
		}
	}, []);

	return null;
}
