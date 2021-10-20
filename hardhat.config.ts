import { task } from "hardhat/config";
import "@nomiclabs/hardhat-waffle";
import "hardhat-log-remover";
import "@nomiclabs/hardhat-etherscan";

require("dotenv").config();

process.env.TEST_MNEMONIC =
  "test test test test test test test test test test test junk";

export default {
  accounts: {
    mnemonic: process.env.TEST_MNEMONIC,
  },
  solidity: {
    version: "0.7.3",
    settings: {
      optimizer: {
        runs: 200,
        enabled: true,
      },
    },
  },
  networks: {
    hardhat: {
      forking: {
        url: process.env.TEST_URI,
        gasLimit: 8e6,
        blockNumber: 12529250,
      },
    },
    mainnet: {
      url: process.env.MAINNET_URI,
      accounts: {
        mnemonic: process.env.MNEMONIC,
      },
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
  mocha: {
    timeout: 500000,
  },
};
