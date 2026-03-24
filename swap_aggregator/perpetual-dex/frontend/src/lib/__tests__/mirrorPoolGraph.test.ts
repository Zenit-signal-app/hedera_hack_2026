import { describe, expect, it } from "vitest";

import { addEdge, findPathsBfs, type AdjacencyGraph } from "../mirrorPoolGraph";

describe("findPathsBfs", () => {
  it("finds direct and 2-hop paths", () => {
    const adj: AdjacencyGraph = new Map();
    const A = "0x1000000000000000000000000000000000000001";
    const B = "0x2000000000000000000000000000000000000002";
    const C = "0x3000000000000000000000000000000000000003";
    addEdge(adj, A, B);
    addEdge(adj, B, C);

    const p0 = findPathsBfs(adj, A, B, 4);
    expect(p0.some((p) => p.length === 2)).toBe(true);

    const p1 = findPathsBfs(adj, A, C, 4);
    expect(p1.some((p) => p.length === 3)).toBe(true);
  });
});
