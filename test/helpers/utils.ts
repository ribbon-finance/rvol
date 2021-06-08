import { network } from "hardhat";
require("dotenv").config();

export const changeNetworkFork = async (blockNumber: number) => {
  await network.provider.request({
    method: "hardhat_reset",
    params: [
      {
        forking: {
          jsonRpcUrl: process.env.TEST_URI,
          blockNumber,
        },
      },
    ],
  });
};
