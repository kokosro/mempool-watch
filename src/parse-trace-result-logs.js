const { ethers } = require('ethers');

module.exports = (logs, hash) => logs.map((x, idx) => {
  try {
    x.address = ethers.utils.getAddress(ethers.utils.hexlify(Object.values(x.address)));
  } catch (e) {
    return null;
  }
  try {
    x.data = ethers.utils.hexlify(Object.values(x.data));
  } catch (e) {
    return null;
  }
  x.transactionHash = hash;
  x.logIndex = idx;
  x.topics = x.topics.map((topic) => ethers.utils.hexZeroPad(ethers.BigNumber.from(topic).toHexString(), 32));
  return x;
}).filter((x) => !!x);
