import { getGasPrice } from "./helpers/getGasPrice";
import { formatUnits } from "ethers/lib/utils";
import { HardhatRuntimeEnvironment } from "hardhat/types";

// Command can be run with
// > yarn hardhat deploy-optionspremiumpricer --network mainnet --pool 0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8 --underlying 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419 --stables 0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6 --volatility 0x8eB47e59E0C03A7D1BFeaFEe6b85910Cefd0ee99
export default async function deployOptionsPremiumPricer(
  args: {
    pool: string;
    volatility: string;
    underlying: string;
    stables: string;
  },
  hre: HardhatRuntimeEnvironment
) {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;
  const gasPrice = await getGasPrice();

  console.log(
    `Deploying to ${network} with ${formatUnits(gasPrice, "gwei")} gwei`
  );

  // We get the contract to deploy
  const OptionsPremiumPricer = await hre.ethers.getContractFactory(
    "OptionsPremiumPricer",
    deployer
  );

  const optionsPremiumPricer = await OptionsPremiumPricer.deploy(
    args.pool,
    args.volatility,
    args.underlying,
    args.stables,
    { gasPrice }
  );

  await optionsPremiumPricer.deployed();

  console.log(
    `\nOptions Premium Pricer is deployed at ${optionsPremiumPricer.address}, verify with https://etherscan.io/address/${optionsPremiumPricer.address}\n`
  );

  await optionsPremiumPricer.deployTransaction.wait(5);

  await hre.run("verify:verify", {
    address: optionsPremiumPricer.address,
    constructorArguments: [
      args.pool,
      args.volatility,
      args.underlying,
      args.stables,
    ],
  });
}
