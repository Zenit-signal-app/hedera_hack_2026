import { describe, expect, it } from "vitest";

import { addEdge, type AdjacencyGraph } from "../mirrorPoolGraph";
import { adjacencyToUndirectedPairs, findBridgeTokensByIntersection } from "../bridgeTokenDiscovery";

describe("bridgeTokenDiscovery", () => {
  const USDC = "0x0000000000000000000000000000000000000001";
  const WHBAR = "0x0000000000000000000000000000000000000002";
  const PANGOLIN = "0x0000000000000000000000000000000000000003";
  const SAUCE = "0x0000000000000000000000000000000000000004";

  it("intersection: chỉ PANGOLIN nối được USDC→PANGOLIN→WHBAR", () => {
    const pairs = [
      { token0: USDC, token1: WHBAR },
      { token0: USDC, token1: PANGOLIN },
      { token0: WHBAR, token1: PANGOLIN },
      { token0: WHBAR, token1: SAUCE },
    ];
    const bridges = findBridgeTokensByIntersection(pairs, USDC, WHBAR);
    expect(bridges.map((a) => a.toLowerCase())).toEqual([PANGOLIN.toLowerCase()]);
  });

  it("adjacencyToUndirectedPairs dedupes edges", () => {
    const adj: AdjacencyGraph = new Map();
    addEdge(adj, USDC, PANGOLIN);
    addEdge(adj, WHBAR, PANGOLIN);
    const pairs = adjacencyToUndirectedPairs(adj);
    expect(pairs).toHaveLength(2);
  });
});
