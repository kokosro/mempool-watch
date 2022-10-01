const { ethers } = require('ethers');

module.exports = (tx) => {
  const v = ethers.utils.hexStripZeros(tx.value.toHexString());
  return {
    from: tx.from,
    to: tx.to,
    value: v === '0x' ? '0x0' : v,
    gasprice: ethers.utils.hexStripZeros(tx.gasPrice.toHexString()),
    gas: ethers.utils.hexStripZeros(tx.gasLimit.toHexString()),
    data: tx.data,
  };
};
