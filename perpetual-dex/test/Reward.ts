import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";
import {
  PositionType,
  FixtureData,
  CalculateRewardRequest,
} from "../test-helpers/models";
import { Signer } from "ethers";
import { calculateEstimatedReward } from "../test-helpers/reward-helpers";

const REWARD_PERIOD = 2592000; // 30 days;

describe("Reward", function () {
  // Hold the fixture data
  let fixture: FixtureData;

  async function prepareContractsForTesting() {
    // Deploy trading token contract
    const token = await ethers.deployContract("Token");
    await token.waitForDeployment();

    // Deploy reward token contract
    const rewardToken = await ethers.deployContract("RewardToken");
    await rewardToken.waitForDeployment();

    const tokenAddress = await token.getAddress();
    const rewardTokenAddress = await rewardToken.getAddress();

    // Deploy reward contract
    const rewardContract = await ethers.deployContract("RewardContract", [
      rewardTokenAddress,
    ]);
    await rewardContract.waitForDeployment();

    const rewardContractAddress = await rewardContract.getAddress();

    // Deploy dex contract
    const dex = await ethers.deployContract("PerpetualDEX", [
      tokenAddress,
      rewardContractAddress,
    ]);
    await dex.waitForDeployment();

    const dexAddress = await dex.getAddress();

    const tx = await rewardContract.setDEXContractAddress(dexAddress);
    await tx.wait();

    // Contracts are deployed using the first signer/account by default
    const [
      owner,
      traderOne,
      traderTwo,
      traderThree,
      traderFour,
    ] = await ethers.getSigners();

    // Transfer tokens to traders
    const amount = ethers.parseEther("1000000"); // 1 million
    const traderOneTokenTx = await token.transfer(traderOne.address, amount);
    await traderOneTokenTx.wait();

    const traderTwoTokenTx = await token.transfer(traderFour.address, amount);
    await traderTwoTokenTx.wait();

    const traderThreeTokenTx = await token.transfer(
      traderThree.address,
      amount
    );
    await traderThreeTokenTx.wait();

    const traderFourTokenTx = await token.transfer(traderTwo.address, amount);
    await traderFourTokenTx.wait();

    // transfer reward token to reward contract
    await rewardToken.transfer(
      rewardContractAddress,
      ethers.parseEther("10000000") //  10 million
    );

    // set token allowances for traders on dex
    const traderOneApproveTx = await token
      .connect(traderOne)
      .approve(dexAddress, amount);
    await traderOneApproveTx.wait();
    const traderTwoApproveTx = await token
      .connect(traderTwo)
      .approve(dexAddress, amount);
    await traderTwoApproveTx.wait();
    const traderThreeApproveTx = await token
      .connect(traderThree)
      .approve(dexAddress, amount);
    await traderThreeApproveTx.wait();
    const traderFourApproveTx = await token
      .connect(traderFour)
      .approve(dexAddress, amount);
    await traderFourApproveTx.wait();

    // deposit tokens
    const depositAmount = ethers.parseEther("500000");

    const depositTx1 = await dex.connect(traderOne).deposit(depositAmount);
    await depositTx1.wait();

    const depositTx2 = await dex.connect(traderTwo).deposit(depositAmount);
    await depositTx2.wait();

    const depositTx3 = await dex.connect(traderThree).deposit(depositAmount);
    await depositTx3.wait();

    const depositTx4 = await dex.connect(traderFour).deposit(depositAmount);
    await depositTx4.wait();

    return {
      dex,
      token,
      rewardToken,
      rewardContract,
      owner,
      traderOne,
      traderTwo,
      traderThree,
      traderFour,
    };
  }

  describe("setUserReward()", function () {
    it("Should revert if the caller is not the dex contract", async function () {
      fixture = await loadFixture(prepareContractsForTesting);

      const { traderOne, rewardContract } = fixture;

      const traderOneAddress = await traderOne.getAddress();

      await expect(
        rewardContract.setUserReward(100n, traderOneAddress)
      ).to.be.revertedWith("Only DEX contract");
    });
  });

  describe("getCumulativeTraderVolumeByMarket()", function () {
    it("Should return the cumulative market volume correct for a trader after open 1 position", async function () {
      fixture = await loadFixture(prepareContractsForTesting);

      const { rewardContract, traderOne } = fixture;

      const positionAmount = ethers.toBigInt(100000);
      const leverage = ethers.toBigInt(10);
      const positionType = PositionType.Long;

      await openPosition(positionAmount, positionType, leverage, traderOne);

      const currentSeason = await rewardContract.currentRewardSeason();

      const traderOneAddress = await traderOne.getAddress();

      const traderOneVolume = await rewardContract.getCumulativeTraderVolumeByMarket(
        currentSeason,
        traderOneAddress
      );
      expect(traderOneVolume).to.equal(positionAmount * leverage);
    });

    it("Should return the cumulative market volume correct for a trader after increase position", async function () {
      fixture = await loadFixture(prepareContractsForTesting);

      const { rewardContract, traderOne } = fixture;

      const positionAmount = ethers.toBigInt(100000);
      const leverage = ethers.toBigInt(10);
      const positionType = PositionType.Long;

      await openPosition(positionAmount, positionType, leverage, traderOne);
      await increasePosition(5000n, traderOne);

      const currentSeason = await rewardContract.currentRewardSeason();

      const traderOneAddress = await traderOne.getAddress();

      const traderOneVolume = await rewardContract.getCumulativeTraderVolumeByMarket(
        currentSeason,
        traderOneAddress
      );

      const totalVolume = positionAmount * leverage + 5000n * leverage;

      expect(traderOneVolume).to.equal(totalVolume);
    });

    it("Should return the cumulative market volume correct for a trader after close all position", async function () {
      fixture = await loadFixture(prepareContractsForTesting);

      const { rewardContract, traderOne } = fixture;

      const positionAmount = ethers.toBigInt(100000);
      const leverage = ethers.toBigInt(10);
      const positionType = PositionType.Long;

      await openPosition(positionAmount, positionType, leverage, traderOne);
      await closePosition(positionAmount, traderOne);

      const currentSeason = await rewardContract.currentRewardSeason();

      const traderOneAddress = await traderOne.getAddress();

      const traderOneVolume = await rewardContract.getCumulativeTraderVolumeByMarket(
        currentSeason,
        traderOneAddress
      );

      const totalVolume = positionAmount * leverage * 2n;

      expect(traderOneVolume).to.equal(totalVolume);
    });

    it("Should return the cumulative market volume correct for a trader after close partial position", async function () {
      fixture = await loadFixture(prepareContractsForTesting);

      const { rewardContract, traderOne } = fixture;

      const positionAmount = ethers.toBigInt(100000);
      const leverage = ethers.toBigInt(10);
      const positionType = PositionType.Long;
      const positionCloseAmount = 5000n;

      await openPosition(positionAmount, positionType, leverage, traderOne);
      await closePosition(positionCloseAmount, traderOne);

      const currentSeason = await rewardContract.currentRewardSeason();

      const traderOneAddress = await traderOne.getAddress();

      const traderOneVolume = await rewardContract.getCumulativeTraderVolumeByMarket(
        currentSeason,
        traderOneAddress
      );

      const totalVolume =
        positionAmount * leverage + positionCloseAmount * leverage;

      expect(traderOneVolume).to.equal(totalVolume);
    });

    it("Should return the cumulative market volume correct for a trader after close partial position and increase position", async function () {
      fixture = await loadFixture(prepareContractsForTesting);

      const { rewardContract, traderOne } = fixture;

      const positionAmount = ethers.toBigInt(100000);
      const leverage = ethers.toBigInt(10);
      const positionType = PositionType.Long;
      const positionCloseAmount = 5000n;
      const positionIncreaseAmount = 5000n;

      await openPosition(positionAmount, positionType, leverage, traderOne);
      await closePosition(positionCloseAmount, traderOne);
      await increasePosition(positionIncreaseAmount, traderOne);

      const currentSeason = await rewardContract.currentRewardSeason();

      const traderOneAddress = await traderOne.getAddress();

      const traderOneVolume = await rewardContract.getCumulativeTraderVolumeByMarket(
        currentSeason,
        traderOneAddress
      );

      const totalVolume =
        positionAmount * leverage +
        positionCloseAmount * leverage +
        positionIncreaseAmount * leverage;

      expect(traderOneVolume).to.equal(totalVolume);
    });

    it("Should return the cumulative market volume correct for a trader after closing all position in two steps", async function () {
      fixture = await loadFixture(prepareContractsForTesting);

      const { rewardContract, traderOne } = fixture;

      const positionAmount = 10000n;
      const leverage = ethers.toBigInt(10);
      const positionType = PositionType.Long;
      const positionCloseAmount = positionAmount / 2n;

      await openPosition(positionAmount, positionType, leverage, traderOne);
      await closePosition(positionCloseAmount, traderOne);
      await closePosition(positionCloseAmount, traderOne);

      const currentSeason = await rewardContract.currentRewardSeason();

      const traderOneAddress = await traderOne.getAddress();

      const traderOneVolume = await rewardContract.getCumulativeTraderVolumeByMarket(
        currentSeason,
        traderOneAddress
      );

      const totalVolume = positionAmount * leverage * 2n;

      expect(traderOneVolume).to.equal(totalVolume);
    });

    it("Should reset the cumulative market volume for a trader after a new season starts", async function () {
      fixture = await loadFixture(prepareContractsForTesting);

      const { rewardContract, traderOne } = fixture;

      const positionAmount = 10000n;
      const leverage = ethers.toBigInt(10);
      const positionType = PositionType.Long;

      await openPosition(positionAmount, positionType, leverage, traderOne);

      const currentSeason = await rewardContract.currentRewardSeason();

      const traderOneAddress = await traderOne.getAddress();

      const traderOneVolume = await rewardContract.getCumulativeTraderVolumeByMarket(
        currentSeason,
        traderOneAddress
      );

      const totalVolume = positionAmount * leverage;

      expect(traderOneVolume).to.equal(totalVolume);

      await time.increase(REWARD_PERIOD + 5);

      const closeAmount = 5000n;

      await closePosition(closeAmount, traderOne);

      const newSeason = await rewardContract.currentRewardSeason();

      expect(newSeason).to.equal(currentSeason + 1n);

      const traderOneNewVolume = await rewardContract.getCumulativeTraderVolumeByMarket(
        newSeason,
        traderOneAddress
      );

      expect(traderOneNewVolume).to.equal(closeAmount * leverage);
    });

    it("Should calculate the cumulative market volume for all traders correctly", async function () {
      fixture = await loadFixture(prepareContractsForTesting);

      const { rewardContract, traderOne, traderTwo, traderThree } = fixture;

      const positionAmount = 10000n;
      const leverage = ethers.toBigInt(10);
      const positionType = PositionType.Long;

      await openPosition(positionAmount, positionType, leverage, traderOne);
      await openPosition(positionAmount, positionType, leverage, traderTwo);
      await openPosition(positionAmount, positionType, leverage, traderThree);

      const currentSeason = await rewardContract.currentRewardSeason();

      const traderOneAddress = await traderOne.getAddress();
      const traderTwoAddress = await traderTwo.getAddress();
      const traderThreeAddress = await traderThree.getAddress();

      const traderOneVolume = await rewardContract.getCumulativeTraderVolumeByMarket(
        currentSeason,
        traderOneAddress
      );
      const traderTwoVolume = await rewardContract.getCumulativeTraderVolumeByMarket(
        currentSeason,
        traderTwoAddress
      );
      const traderThreeVolume = await rewardContract.getCumulativeTraderVolumeByMarket(
        currentSeason,
        traderThreeAddress
      );

      const totalVolume = positionAmount * leverage;

      expect(traderOneVolume).to.equal(totalVolume);
      expect(traderTwoVolume).to.equal(totalVolume);
      expect(traderThreeVolume).to.equal(totalVolume);
    });
  });

  describe("getCumulativeVolumeByMarket()", function () {
    it("Should return the cumulative market volume correct for a reward season after open 1 position", async function () {
      fixture = await loadFixture(prepareContractsForTesting);

      const { rewardContract, traderOne } = fixture;

      const positionAmount = ethers.toBigInt(100000);
      const leverage = ethers.toBigInt(10);
      const positionType = PositionType.Long;

      await openPosition(positionAmount, positionType, leverage, traderOne);

      const currentSeason = await rewardContract.currentRewardSeason();

      const currentSeasonVolume = await rewardContract.getCumulativeVolumeByMarket(
        currentSeason
      );
      expect(currentSeasonVolume).to.equal(positionAmount * leverage);
    });

    it("Should return the cumulative market volume correct for a reward season after increase position", async function () {
      fixture = await loadFixture(prepareContractsForTesting);

      const { rewardContract, traderOne } = fixture;

      const positionAmount = ethers.toBigInt(100000);
      const leverage = ethers.toBigInt(10);
      const positionType = PositionType.Long;

      await openPosition(positionAmount, positionType, leverage, traderOne);
      await increasePosition(5000n, traderOne);

      const currentSeason = await rewardContract.currentRewardSeason();

      const currentSeasonVolume = await rewardContract.getCumulativeVolumeByMarket(
        currentSeason
      );

      const totalVolume = positionAmount * leverage + 5000n * leverage;

      expect(currentSeasonVolume).to.equal(totalVolume);
    });

    it("Should return the cumulative market volume correct for a reward season after close all position", async function () {
      fixture = await loadFixture(prepareContractsForTesting);

      const { rewardContract, traderOne } = fixture;

      const positionAmount = 10000n;
      const leverage = ethers.toBigInt(10);
      const positionType = PositionType.Long;

      await openPosition(positionAmount, positionType, leverage, traderOne);
      await closePosition(positionAmount, traderOne);

      const currentSeason = await rewardContract.currentRewardSeason();

      const currentSeasonVolume = await rewardContract.getCumulativeVolumeByMarket(
        currentSeason
      );

      const totalVolume = positionAmount * leverage * 2n;

      expect(currentSeasonVolume).to.equal(totalVolume);
    });

    it("Should return the cumulative market volume correct for a reward season after close partial position", async function () {
      fixture = await loadFixture(prepareContractsForTesting);

      const { rewardContract, traderOne, traderTwo } = fixture;

      const positionAmount = 10000n;
      const leverage = ethers.toBigInt(10);
      const positionType = PositionType.Long;
      const positionCloseAmount = 5000n;

      await openPosition(positionAmount, positionType, leverage, traderOne);
      await closePosition(positionCloseAmount, traderOne);

      await openPosition(positionAmount, positionType, leverage, traderTwo);
      await closePosition(positionCloseAmount, traderTwo);

      const currentSeason = await rewardContract.currentRewardSeason();

      const currentSeasonVolume = await rewardContract.getCumulativeVolumeByMarket(
        currentSeason
      );

      const totalVolumePerTrader =
        positionAmount * leverage + positionCloseAmount * leverage;

      expect(currentSeasonVolume).to.equal(totalVolumePerTrader * 2n);
    });

    it("Should return the cumulative market volume correct for a reward season after close partial position and increase position", async function () {
      fixture = await loadFixture(prepareContractsForTesting);

      const { rewardContract, traderOne, traderTwo } = fixture;

      const positionAmount = 10000n;
      const leverage = ethers.toBigInt(10);
      const positionType = PositionType.Long;
      const positionCloseAmount = 5000n;
      const positionIncreaseAmount = 5000n;

      await openPosition(positionAmount, positionType, leverage, traderOne);
      await closePosition(positionCloseAmount, traderOne);
      await increasePosition(positionIncreaseAmount, traderOne);

      await openPosition(positionAmount, positionType, leverage, traderTwo);
      await closePosition(positionCloseAmount, traderTwo);
      await increasePosition(positionIncreaseAmount, traderTwo);

      const currentSeason = await rewardContract.currentRewardSeason();

      const currentSeasonVolume = await rewardContract.getCumulativeVolumeByMarket(
        currentSeason
      );

      const totalVolumePerTrader =
        positionAmount * leverage +
        positionCloseAmount * leverage +
        positionIncreaseAmount * leverage;

      expect(currentSeasonVolume).to.equal(totalVolumePerTrader * 2n);
    });

    it("Should return the cumulative market volume correct for a reward season after closing all position in two steps", async function () {
      fixture = await loadFixture(prepareContractsForTesting);

      const { rewardContract, traderOne, traderTwo } = fixture;

      const positionAmount = 10000n;
      const leverage = ethers.toBigInt(10);
      const positionType = PositionType.Long;
      const positionCloseAmount = positionAmount / 2n;

      await openPosition(positionAmount, positionType, leverage, traderOne);
      await closePosition(positionCloseAmount, traderOne);
      await closePosition(positionCloseAmount, traderOne);

      await openPosition(positionAmount, positionType, leverage, traderTwo);
      await closePosition(positionCloseAmount, traderTwo);
      await closePosition(positionCloseAmount, traderTwo);

      const currentSeason = await rewardContract.currentRewardSeason();

      const currentSeasonVolume = await rewardContract.getCumulativeVolumeByMarket(
        currentSeason
      );

      const totalVolume = positionAmount * leverage * 4n;

      expect(currentSeasonVolume).to.equal(totalVolume);
    });

    it("Should reset the cumulative market volume for a reward season after a new season starts", async function () {
      fixture = await loadFixture(prepareContractsForTesting);

      const { rewardContract, traderOne, traderTwo } = fixture;

      const positionAmount = 10000n;
      const leverage = ethers.toBigInt(10);
      const positionType = PositionType.Long;

      await openPosition(positionAmount, positionType, leverage, traderOne);

      const currentSeason = await rewardContract.currentRewardSeason();

      const currentSeasonVolume = await rewardContract.getCumulativeVolumeByMarket(
        currentSeason
      );

      const totalVolume = positionAmount * leverage;

      expect(currentSeasonVolume).to.equal(totalVolume);

      await time.increase(REWARD_PERIOD + 5);

      const closeAmount = 5000n;

      await closePosition(closeAmount, traderOne);

      await openPosition(positionAmount, positionType, leverage, traderTwo);
      await closePosition(closeAmount, traderTwo);

      const newSeason = await rewardContract.currentRewardSeason();

      expect(newSeason).to.equal(currentSeason + 1n);

      const newSeasonVolume = await rewardContract.getCumulativeVolumeByMarket(
        newSeason
      );

      const totalVolumeForNewSeason =
        closeAmount * leverage +
        positionAmount * leverage +
        closeAmount * leverage;

      expect(newSeasonVolume).to.equal(totalVolumeForNewSeason);
    });
  });

  describe("claimReward()", function () {
    it("Should revert if there is no reward to claim", async function () {
      fixture = await loadFixture(prepareContractsForTesting);

      const { traderOne } = fixture;

      await expect(claimRewardForTrader(traderOne)).to.be.revertedWith(
        "No reward to claim"
      );
    });

    it("Should Solve The Example Case", async function () {
      fixture = await loadFixture(prepareContractsForTesting);

      const { traderOne, traderTwo, traderThree, traderFour } = fixture;

      const TEN_THOUSAND_ETHER = ethers.parseEther("10000");
      const FIVE_THOUSAND_ETHER = ethers.parseEther("5000");
      const TEN_LEVERAGE = 10n;
      const FIVE_LEVERAGE = 5n;

      await openPosition(
        TEN_THOUSAND_ETHER,
        PositionType.Long,
        TEN_LEVERAGE,
        traderOne
      );
      await openPosition(
        TEN_THOUSAND_ETHER,
        PositionType.Short,
        FIVE_LEVERAGE,
        traderTwo
      );
      await openPosition(
        TEN_THOUSAND_ETHER,
        PositionType.Long,
        TEN_LEVERAGE,
        traderThree
      );
      await closePosition(FIVE_THOUSAND_ETHER, traderTwo);

      // calculate trader volumes and market volume for first market
      const traderOneVolumeFirstMarket = TEN_THOUSAND_ETHER * TEN_LEVERAGE;
      const traderTwoVolumeFirstMarket =
        (TEN_THOUSAND_ETHER + FIVE_THOUSAND_ETHER) * FIVE_LEVERAGE;
      const traderThreeVolumeFirstMarket = TEN_THOUSAND_ETHER * TEN_LEVERAGE;
      const firstMarketVolume =
        traderOneVolumeFirstMarket +
        traderTwoVolumeFirstMarket +
        traderThreeVolumeFirstMarket;

      // increase time to second market
      await time.increase(REWARD_PERIOD + 5);

      await openPosition(
        TEN_THOUSAND_ETHER,
        PositionType.Short,
        TEN_LEVERAGE,
        traderFour
      );
      await closePosition(FIVE_THOUSAND_ETHER, traderTwo);

      // calculate trader volumes and market volume for second market
      const traderFourVolumeForSecondMarket = TEN_THOUSAND_ETHER * TEN_LEVERAGE;
      const traderTwoVolumeForSecondMarket =
        FIVE_THOUSAND_ETHER * FIVE_LEVERAGE;
      const secondMarketVolume =
        traderFourVolumeForSecondMarket + traderTwoVolumeForSecondMarket;

      // increase time to third market
      await time.increase(REWARD_PERIOD + 5);

      await closePosition(TEN_THOUSAND_ETHER, traderOne);

      // calculate trader volumes and market volume for third market
      const traderOneVolumeForThirdMarket = TEN_THOUSAND_ETHER * TEN_LEVERAGE;
      const thirdMarketVolume = traderOneVolumeForThirdMarket;

      // increase time to fourth market
      await time.increase(REWARD_PERIOD + 5);

      // no trade happened in fourth market

      // increase time to fifth market
      await time.increase(REWARD_PERIOD + 5);

      // calculate expected reward for each trader
      const expectedRewardRequestForTraderOne: CalculateRewardRequest[] = [
        {
          traderVolume: traderOneVolumeFirstMarket,
          marketVolume: firstMarketVolume,
        },
        {
          traderVolume: traderOneVolumeForThirdMarket,
          marketVolume: thirdMarketVolume,
        },
      ];

      const expectedRewardForTraderOne = calculateEstimatedReward(
        expectedRewardRequestForTraderOne
      );

      const expectedRewardRequestForTraderTwo: CalculateRewardRequest[] = [
        {
          traderVolume: traderTwoVolumeFirstMarket,
          marketVolume: firstMarketVolume,
        },
        {
          traderVolume: traderTwoVolumeForSecondMarket,
          marketVolume: secondMarketVolume,
        },
      ];

      const expectedRewardForTraderTwo = calculateEstimatedReward(
        expectedRewardRequestForTraderTwo
      );

      const expectedRewardRequestForTraderThree: CalculateRewardRequest[] = [
        {
          traderVolume: traderThreeVolumeFirstMarket,
          marketVolume: firstMarketVolume,
        },
      ];

      const expectedRewardForTraderThree = calculateEstimatedReward(
        expectedRewardRequestForTraderThree
      );

      const expectedRewardRequestForTraderFour: CalculateRewardRequest[] = [
        {
          traderVolume: traderFourVolumeForSecondMarket,
          marketVolume: secondMarketVolume,
        },
      ];

      const expectedRewardForTraderFour = calculateEstimatedReward(
        expectedRewardRequestForTraderFour
      );

      // claim reward for traders
      const traderOneRewardTokenAmount = await claimRewardForTrader(traderOne);
      const traderTwoRewardTokenAmount = await claimRewardForTrader(traderTwo);
      const traderThreeRewardTokenAmount = await claimRewardForTrader(
        traderThree
      );
      const traderFourRewardTokenAmount = await claimRewardForTrader(
        traderFour
      );

      // check if the actual token rewards are the same with the expected rewards
      expect(traderOneRewardTokenAmount).to.equal(expectedRewardForTraderOne);
      expect(traderTwoRewardTokenAmount).to.equal(expectedRewardForTraderTwo);
      expect(traderThreeRewardTokenAmount).to.equal(
        expectedRewardForTraderThree
      );
      expect(traderFourRewardTokenAmount).to.equal(expectedRewardForTraderFour);
    });

    it("Should emit RewardClaimed event", async function () {
      fixture = await loadFixture(prepareContractsForTesting);

      const { traderOne, traderTwo } = fixture;

      const TEN_THOUSAND_ETHER = ethers.parseEther("10000");
      const FIVE_THOUSAND_ETHER = ethers.parseEther("10000");
      const TEN_LEVERAGE = 10n;

      await openPosition(
        TEN_THOUSAND_ETHER,
        PositionType.Long,
        TEN_LEVERAGE,
        traderOne
      );
      await closePosition(FIVE_THOUSAND_ETHER, traderOne);
      await openPosition(
        FIVE_THOUSAND_ETHER,
        PositionType.Long,
        TEN_LEVERAGE,
        traderTwo
      );

      const traderOneVolumeFirstMarket =
        (TEN_THOUSAND_ETHER + FIVE_THOUSAND_ETHER) * TEN_LEVERAGE;
      const traderTwoVolumeFirstMarket = FIVE_THOUSAND_ETHER * TEN_LEVERAGE;
      const firstMarketVolume =
        traderOneVolumeFirstMarket + traderTwoVolumeFirstMarket;

      await time.increase(REWARD_PERIOD + 5);

      const expectedRewardRequestForTraderOne: CalculateRewardRequest[] = [
        {
          traderVolume: traderOneVolumeFirstMarket,
          marketVolume: firstMarketVolume,
        },
      ];

      const expectedRewardForTraderOne = calculateEstimatedReward(
        expectedRewardRequestForTraderOne
      );

      const traderOneAddress = await traderOne.getAddress();

      await expect(fixture.rewardContract.connect(traderOne).claimReward())
        .to.emit(fixture.rewardContract, "RewardClaimed")
        .withArgs(traderOneAddress, expectedRewardForTraderOne);
    });

    it("Should claim reward twice for the same trader", async function () {
      fixture = await loadFixture(prepareContractsForTesting);

      const { traderOne } = fixture;

      const FIFTY_THOUSAND_ETHER = ethers.parseEther("50000");
      const FIVE_THOUSAND_ETHER = ethers.parseEther("5000");
      const TEN_LEVERAGE = 10n;

      await openPosition(
        FIFTY_THOUSAND_ETHER,
        PositionType.Long,
        TEN_LEVERAGE,
        traderOne
      );
      await closePosition(FIVE_THOUSAND_ETHER, traderOne);

      const traderOneVolumeFirstMarket =
        (FIFTY_THOUSAND_ETHER + FIVE_THOUSAND_ETHER) * TEN_LEVERAGE;
      const firstMarketVolume = traderOneVolumeFirstMarket;

      await time.increase(REWARD_PERIOD + 5);

      const expectedRewardRequestForTraderOne: CalculateRewardRequest[] = [
        {
          traderVolume: traderOneVolumeFirstMarket,
          marketVolume: firstMarketVolume,
        },
      ];

      const expectedRewardForTraderOne = calculateEstimatedReward(
        expectedRewardRequestForTraderOne
      );

      const traderOneRewardTokenAmountFirstClaim = await claimRewardForTrader(
        traderOne
      );

      expect(traderOneRewardTokenAmountFirstClaim).to.equal(
        expectedRewardForTraderOne
      );

      await time.increase(REWARD_PERIOD + 5);

      await closePosition(FIVE_THOUSAND_ETHER, traderOne);
      await closePosition(FIVE_THOUSAND_ETHER, traderOne);

      const traderOneVolumeThirdMarket =
        FIVE_THOUSAND_ETHER * 2n * TEN_LEVERAGE;

      const thirdMarketVolume = traderOneVolumeThirdMarket;

      await time.increase(REWARD_PERIOD + 5);

      const expectedRewardRequestForTraderOneThirdMarket: CalculateRewardRequest[] = [
        {
          traderVolume: traderOneVolumeThirdMarket,
          marketVolume: thirdMarketVolume,
        },
      ];

      const expectedRewardForTraderOneThirdMarket = calculateEstimatedReward(
        expectedRewardRequestForTraderOneThirdMarket
      );

      const traderOneRewardTokenAmountSecondClaim = await claimRewardForTrader(
        traderOne
      );

      expect(
        traderOneRewardTokenAmountSecondClaim -
          traderOneRewardTokenAmountFirstClaim
      ).to.equal(expectedRewardForTraderOneThirdMarket);
    });
  });

  /**
   * Opens a trading position with specified parameters.
   *
   * @async
   * @function openPosition
   * @param {bigint} positionAmount - The amount for the position.
   * @param {PositionType} positionType - The type of position (e.g., LONG, SHORT).
   * @param {bigint} leverage - The leverage amount for the position.
   * @param {Signer} trader - The trader's signer object, used for transaction signing.
   * @throws Will throw an error if the transaction fails.
   */
  async function openPosition(
    positionAmount: bigint,
    positionType: PositionType,
    leverage: bigint,
    trader: Signer
  ) {
    const tx = await fixture.dex
      .connect(trader)
      .openPosition(positionAmount, positionType, leverage);
    await tx.wait();
  }

  /**
   * Increases an existing trading position by a specified amount.
   *
   * @async
   * @function increasePosition
   * @param {bigint} positionAmount - The additional amount to increase the position by.
   * @param {Signer} trader - The trader's signer object, used for transaction signing.
   * @throws Will throw an error if the transaction fails.
   */
  async function increasePosition(positionAmount: bigint, trader: Signer) {
    const tx = await fixture.dex
      .connect(trader)
      .increasePosition(positionAmount);
    await tx.wait();
  }

  /**
   * Closes a trading position of a specified amount.
   *
   * @async
   * @function closePosition
   * @param {bigint} positionAmount - The amount of the position to be closed.
   * @param {Signer} trader - The trader's signer object, used for transaction signing.
   * @throws Will throw an error if the transaction fails.
   */
  async function closePosition(positionAmount: bigint, trader: Signer) {
    const tx = await fixture.dex.connect(trader).closePosition(positionAmount);
    await tx.wait();
  }

  /**
   * Claims a reward for a given trader and returns the current reward token amount for trader.
   *
   * @async
   * @function claimRewardForTrader
   * @param {Signer} trader - The trader's signer object, used for transaction signing.
   * @returns {Promise<bigint>} The current amount of reward token trader has.
   * @throws Will throw an error if the transaction fails.
   */
  async function claimRewardForTrader(trader: Signer): Promise<bigint> {
    const tx = await fixture.rewardContract.connect(trader).claimReward();
    await tx.wait();

    return await fixture.rewardToken.balanceOf(await trader.getAddress());
  }
});
