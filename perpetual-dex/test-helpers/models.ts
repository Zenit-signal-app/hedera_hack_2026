import { Signer } from "ethers";
import {
  PerpetualDEX,
  Token,
  RewardToken,
  RewardContract,
} from "../typechain-types";

export enum PositionType {
  Long,
  Short,
}

export type Position = {
  amount: bigint;
  position: PositionType;
  leverage: bigint;
};

export type CalculateProfitResponse = {
  liquidated: boolean;
  profit: bigint;
};

export type FixtureData = {
  dex: PerpetualDEX;
  token: Token;
  rewardToken: RewardToken;
  rewardContract: RewardContract;
  owner: Signer;
  traderOne: Signer;
  traderTwo: Signer;
  traderThree: Signer;
  traderFour: Signer;
};

export type CalculateRewardRequest = {
  traderVolume: bigint;
  marketVolume: bigint;
};
