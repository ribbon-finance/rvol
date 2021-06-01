import { BigNumber } from "ethers";

export const stdev = (values: BigNumber[]) => {
  const sum = values.reduce((a, b) => {
    return a.add(b);
  }, BigNumber.from(0));

  const len = BigNumber.from(values.length);
  const mean = sum.div(len);

  const sumOfErrors = values.reduce((a, b) => {
    const errorSquared = b.sub(mean).pow(BigNumber.from(2));
    return a.add(errorSquared);
  }, BigNumber.from(0));

  return Math.sqrt(sumOfErrors.div(len).toNumber());
};
