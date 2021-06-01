import { BigNumber } from "ethers";
import { BigNumber as BigNum } from "bignumber.js";
import { parseEther } from "ethers/lib/utils";

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

  // Using bignumber.js because it has the sqrt function
  const intermediate = new BigNum(sumOfErrors.div(len).toString())
    .sqrt()
    .integerValue()
    .toString();

  return BigNumber.from(intermediate);
};

export const pricesToReturns = (values: BigNumber[]) => {
  const returns = values.map((val, index) => {
    if (index === 0) return BigNumber.from(0);
    return wdiv(val, values[index - 1]);
  });
  return returns.filter((r) => !r.isZero());
};

export const wdiv = (x: BigNumber, y: BigNumber) => {
  return x
    .mul(parseEther("1"))
    .add(y.div(BigNumber.from("2")))
    .div(y);
};

export const wmul = (x: BigNumber, y: BigNumber) => {
  return x
    .mul(y)
    .add(parseEther("1").div(BigNumber.from("2")))
    .div(parseEther("1"));
};
