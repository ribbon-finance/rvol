import hre from "hardhat";
import { Command } from "commander";

const program = new Command();
program.version("0.0.1");
// default is 12 hours period
program.option("-p, --period <period>", "Period", "43200");

program.parse(process.argv);

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;

  // We get the contract to deploy
  const VolOracle = await hre.ethers.getContractFactory(
    network === "kovan" ? "TestVolOracle" : "VolOracle",
    deployer
  );

  const volOracle = await VolOracle.deploy(program.period);

  await volOracle.deployed();

  console.log(
    `\nVolatility Oracle is deployed at ${volOracle.address}, verify with https://etherscan.io/proxyContractChecker?a=${volOracle.address}\n`
  );

  await volOracle.deployTransaction.wait(5);

  await hre.run("verify:verify", {
    address: volOracle.address,
    constructorArguments: [program.period],
  });
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
