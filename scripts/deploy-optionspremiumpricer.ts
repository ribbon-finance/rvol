import hre from "hardhat";
import { Command } from "commander";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const program = new Command();
program.version("0.0.1");
program.option(
  "-p, --pool <pool>",
  "Univ3 Pool",
  "0x0000000000000000000000000000000000000000"
);
program.option(
  "-v, --volatilityOracle <volatilityOracle>",
  "Volatility Oracle",
  "0x0000000000000000000000000000000000000000"
);
program.option(
  "-po, --priceOracle <priceOracle>",
  "Price Oracle",
  "0x0000000000000000000000000000000000000000"
);
program.option(
  "-so, --stablesOracle <stablesOracle>",
  "Stables Oracle",
  "0x0000000000000000000000000000000000000000"
);

program.parse(process.argv);

export default async function main(hre: HardhatRuntimeEnvironment) {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;

  // We get the contract to deploy
  const OptionsPremiumPricer = await hre.ethers.getContractFactory(
    "OptionsPremiumPricer",
    deployer
  );

  const optionsPremiumPricer = await OptionsPremiumPricer.deploy(
    program.pool,
    program.volatilityOracle,
    program.priceOracle,
    program.stablesOracle
  );

  await optionsPremiumPricer.deployed();

  console.log(
    `\nOptions Premium Pricer is deployed at ${optionsPremiumPricer.address}, verify with https://etherscan.io/address/${optionsPremiumPricer.address}\n`
  );

  await optionsPremiumPricer.deployTransaction.wait(5);

  await hre.run("verify:verify", {
    address: optionsPremiumPricer.address,
    constructorArguments: [
      program.pool,
      program.volatilityOracle,
      program.priceOracle,
      program.stablesOracle,
    ],
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
