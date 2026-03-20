import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const Token = await ethers.getContractFactory("zUSDC");
  const feeData = await ethers.provider.getFeeData();
  const gasPrice = feeData.gasPrice ?? ethers.parseUnits("50", "gwei");
  const token = await Token.deploy({
    type: 0,
    gasPrice,
    gasLimit: 8_000_000n,
  });
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();

  console.log("zUSDC deployed to:", tokenAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

