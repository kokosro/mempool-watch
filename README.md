# @kokosro/mempool-watch

Watch pending transactions in mempool for any contract

## usage

```javascript

const { MempoolWatch } = require('@kokosro/mempool-watch');

// ... init ethers provider and contract to watch events for

// provider
// contract


const mempoolWatch = new MempoolWatch({ provider });

mempoolWatch.start();

mempoolWatch.subscribe(contract);

contract.mempool.on('ContractEvent', contractEventListener);


```
