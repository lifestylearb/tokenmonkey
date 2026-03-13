import { ethers, run, network } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying MNKY token with account:", deployer.address);
  console.log(
    "Account balance:",
    ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
    "ETH"
  );

  const MNKY = await ethers.getContractFactory("MNKY");
  const mnky = await MNKY.deploy(deployer.address);
  await mnky.waitForDeployment();

  const contractAddress = await mnky.getAddress();
  console.log("MNKY token deployed to:", contractAddress);
  console.log(
    "Initial supply:",
    ethers.formatEther(await mnky.totalSupply()),
    "MNKY"
  );

  // Verify on Etherscan (skip for local/hardhat network)
  if (network.name !== "hardhat" && network.name !== "localhost") {
    console.log("Waiting for block confirmations before verification...");
    // Wait for 5 block confirmations so Etherscan can index the contract
    const deployTx = mnky.deploymentTransaction();
    if (deployTx) {
      await deployTx.wait(5);
    }

    console.log("Verifying contract on Etherscan...");
    try {
      await run("verify:verify", {
        address: contractAddress,
        constructorArguments: [deployer.address],
      });
      console.log("Contract verified on Etherscan!");
    } catch (error: any) {
      if (error.message.includes("Already Verified")) {
        console.log("Contract is already verified on Etherscan.");
      } else {
        console.error("Etherscan verification failed:", error.message);
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
