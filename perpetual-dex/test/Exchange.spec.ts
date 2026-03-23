import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

import type { Exchange, FixedRateSwapAdapter, MockERC20, MockV2Router, QuoteAggregator, UniswapV2LikeAdapter } from "../typechain-types";

describe("Exchange + adapters (V2-like + fixed-rate venue)", function () {
  const ADAPTER_V2 = ethers.encodeBytes32String("v2");
  const ADAPTER_FIXED = ethers.encodeBytes32String("fixed");

  async function deployFixture() {
    const [owner, alice] = await ethers.getSigners();

    const tokenA = (await ethers.deployContract("MockERC20", ["TokenA", "TKA", 18])) as unknown as MockERC20;
    const tokenB = (await ethers.deployContract("MockERC20", ["TokenB", "TKB", 18])) as unknown as MockERC20;
    await tokenA.waitForDeployment();
    await tokenB.waitForDeployment();

    const tokenAAddr = await tokenA.getAddress();
    const tokenBAddr = await tokenB.getAddress();

    const router = (await ethers.deployContract("MockV2Router", [tokenAAddr, tokenBAddr])) as unknown as MockV2Router;
    await router.waitForDeployment();

    const liquidity = ethers.parseEther("1000000");
    await tokenA.mint(await router.getAddress(), liquidity);
    await tokenB.mint(await router.getAddress(), liquidity);
    await router.syncReservesFromBalances();

    const exchange = (await ethers.deployContract("Exchange", [owner.address])) as unknown as Exchange;
    await exchange.waitForDeployment();
    const exchangeAddr = await exchange.getAddress();

    const v2Adapter = (await ethers.deployContract("UniswapV2LikeAdapter", [
      owner.address,
      exchangeAddr,
      await router.getAddress(),
      0,
    ])) as unknown as UniswapV2LikeAdapter;
    await v2Adapter.waitForDeployment();

    const fixedAdapter = (await ethers.deployContract("FixedRateSwapAdapter", [
      owner.address,
      exchangeAddr,
      tokenAAddr,
      tokenBAddr,
      ethers.parseEther("1"),
      ethers.parseEther("1"),
      0,
    ])) as unknown as FixedRateSwapAdapter;
    await fixedAdapter.waitForDeployment();

    await tokenB.mint(await fixedAdapter.getAddress(), ethers.parseEther("5000000"));

    await exchange.setAdapter(ADAPTER_V2, await v2Adapter.getAddress(), true);
    await exchange.setAdapter(ADAPTER_FIXED, await fixedAdapter.getAddress(), true);

    const quoteAggregator = (await ethers.deployContract("QuoteAggregator", [exchangeAddr])) as unknown as QuoteAggregator;
    await quoteAggregator.waitForDeployment();

    const userIn = ethers.parseEther("10000");
    await tokenA.mint(alice.address, userIn);
    await tokenA.connect(alice).approve(exchangeAddr, userIn);

    return {
      owner,
      alice,
      tokenA,
      tokenB,
      router,
      exchange,
      v2Adapter,
      fixedAdapter,
      quoteAggregator,
      userIn,
    };
  }

  function swapParams(
    adapterId: string,
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint,
    minOut: bigint,
    recipient: string,
    deadline: bigint,
    adapterData: string
  ) {
    return {
      adapterId,
      tokenIn,
      tokenOut,
      amountIn,
      minAmountOut: minOut,
      recipient,
      deadline,
      adapterData,
    };
  }

  it("setAdapter wires both venues", async function () {
    const { exchange, v2Adapter, fixedAdapter } = await loadFixture(deployFixture);
    const v2 = await exchange.adapters(ADAPTER_V2);
    const fx = await exchange.adapters(ADAPTER_FIXED);
    expect(v2.adapter).to.equal(await v2Adapter.getAddress());
    expect(v2.active).to.equal(true);
    expect(fx.adapter).to.equal(await fixedAdapter.getAddress());
    expect(fx.active).to.equal(true);
  });

  it("quote() matches QuoteAggregator and fixed-rate math", async function () {
    const { exchange, quoteAggregator, tokenA, tokenB, alice } = await loadFixture(deployFixture);
    const amountIn = ethers.parseEther("100");
    const deadline = BigInt(await time.latest()) + 3600n;

    const params = swapParams(
      ADAPTER_FIXED,
      await tokenA.getAddress(),
      await tokenB.getAddress(),
      amountIn,
      0n,
      alice.address,
      deadline,
      "0x"
    );

    const q1 = await exchange.quote.staticCall(params);
    const q2 = await quoteAggregator.quote.staticCall(params);
    expect(q1).to.equal(amountIn);
    expect(q2).to.equal(amountIn);
  });

  it("swap (fixed-rate venue): succeeds when minAmountOut <= quoted", async function () {
    const { exchange, tokenA, tokenB, alice } = await loadFixture(deployFixture);
    const amountIn = ethers.parseEther("50");
    const deadline = BigInt(await time.latest()) + 3600n;
    const quoted = await exchange.quote.staticCall(
      swapParams(
        ADAPTER_FIXED,
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        amountIn,
        0n,
        alice.address,
        deadline,
        "0x"
      )
    );

    const balBefore = await tokenB.balanceOf(alice.address);
    await exchange.connect(alice).swap(
      swapParams(
        ADAPTER_FIXED,
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        amountIn,
        quoted,
        alice.address,
        deadline,
        "0x"
      )
    );
    const balAfter = await tokenB.balanceOf(alice.address);
    expect(balAfter - balBefore).to.equal(quoted);
  });

  it("swap (fixed-rate venue): reverts when slippage too tight (Exchange SwapTooSmall)", async function () {
    const { exchange, tokenA, tokenB, alice } = await loadFixture(deployFixture);
    const amountIn = ethers.parseEther("25");
    const deadline = BigInt(await time.latest()) + 3600n;
    const quoted = await exchange.quote.staticCall(
      swapParams(
        ADAPTER_FIXED,
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        amountIn,
        0n,
        alice.address,
        deadline,
        "0x"
      )
    );

    await expect(
      exchange.connect(alice).swap(
        swapParams(
          ADAPTER_FIXED,
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          amountIn,
          quoted + 1n,
          alice.address,
          deadline,
          "0x"
        )
      )
    ).to.be.revertedWithCustomError(exchange, "SwapTooSmall");
  });

  it("swap (V2-like venue): succeeds with loose minAmountOut", async function () {
    const { exchange, tokenA, tokenB, router, alice } = await loadFixture(deployFixture);
    const amountIn = ethers.parseEther("100");
    const deadline = BigInt(await time.latest()) + 3600n;

    const quoted = await exchange.quote.staticCall(
      swapParams(
        ADAPTER_V2,
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        amountIn,
        0n,
        alice.address,
        deadline,
        "0x"
      )
    );

    const balBefore = await tokenB.balanceOf(alice.address);
    await exchange.connect(alice).swap(
      swapParams(
        ADAPTER_V2,
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        amountIn,
        quoted,
        alice.address,
        deadline,
        "0x"
      )
    );
    const balAfter = await tokenB.balanceOf(alice.address);
    expect(balAfter - balBefore).to.equal(quoted);

    const rA = await router.reserveA();
    const rB = await router.reserveB();
    expect(rA).to.be.gt(0n);
    expect(rB).to.be.gt(0n);
  });

  it("swap (V2-like venue): reverts when router cannot meet minAmountOut (slippage)", async function () {
    const { exchange, tokenA, tokenB, alice, router } = await loadFixture(deployFixture);
    const amountIn = ethers.parseEther("10");
    const deadline = BigInt(await time.latest()) + 3600n;

    const quoted = await exchange.quote.staticCall(
      swapParams(
        ADAPTER_V2,
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        amountIn,
        0n,
        alice.address,
        deadline,
        "0x"
      )
    );

    await expect(
      exchange.connect(alice).swap(
        swapParams(
          ADAPTER_V2,
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          amountIn,
          quoted + ethers.parseEther("999999"),
          alice.address,
          deadline,
          "0x"
        )
      )
    ).to.be.revertedWithCustomError(router, "Slippage");
  });
});
