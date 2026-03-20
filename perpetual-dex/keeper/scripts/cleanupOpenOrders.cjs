/* eslint-disable no-console */
const { PrismaClient } = require("@prisma/client");

function keyOf(o) {
  return `${String(o.walletAddress).toLowerCase()}:${o.market}`;
}

function score(o) {
  // Prefer records that have an openTxHash, then newest createdAt, then newest updatedAt
  const hasTx = o.openTxHash ? 1 : 0;
  const created = o.createdAt ? new Date(o.createdAt).getTime() : 0;
  const updated = o.updatedAt ? new Date(o.updatedAt).getTime() : 0;
  return hasTx * 10 ** 15 + created * 10 ** 3 + (updated % 1000);
}

async function main() {
  const prisma = new PrismaClient();
  await prisma.$connect();

  const opens = await prisma.order.findMany({
    where: { status: "Open" },
    orderBy: [{ createdAt: "desc" }],
  });

  const groups = new Map();
  for (const o of opens) {
    const k = keyOf(o);
    const arr = groups.get(k) ?? [];
    arr.push(o);
    groups.set(k, arr);
  }

  const toDelete = [];
  const kept = [];

  for (const [k, arr] of groups.entries()) {
    if (arr.length <= 1) continue;
    arr.sort((a, b) => score(b) - score(a));
    const keep = arr[0];
    kept.push({ key: k, keepId: keep.id, keepOpenTxHash: keep.openTxHash ?? null, count: arr.length });
    for (const extra of arr.slice(1)) toDelete.push(extra.id);
  }

  if (toDelete.length === 0) {
    console.log("No duplicate Open orders found. Nothing to delete.");
    await prisma.$disconnect();
    return;
  }

  console.log("Duplicate Open orders detected. Keeping:");
  for (const k of kept) console.log(`- ${k.key} keep=${k.keepId} openTxHash=${k.keepOpenTxHash} (had ${k.count})`);
  console.log(`Deleting ${toDelete.length} Open order rows...`);

  await prisma.$transaction(
    toDelete.map((id) => prisma.order.delete({ where: { id } })),
  );

  console.log("Cleanup complete.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Cleanup failed:", e);
  process.exit(1);
});

