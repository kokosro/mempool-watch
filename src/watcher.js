const EventsEmitter = require('events');
const { ethers } = require('ethers');
const tracer = require('./tracer');
const getTxInfo = require('./get-tx-info');
const parseTraceResultLogs = require('./parse-trace-result-logs');

class Watcher extends EventsEmitter {
  constructor({ provider, frequency = 200 }) {
    super();
    this.provider = provider;
    this.frequency = frequency;
    this.timer = 0;
    this.txDone = {};
    this.contracts = {};
    this.watchedAddresses = [];
    this.txHashes = {};
  }

  async start() {
    this.filterId = await this.provider.send('eth_newPendingTransactionFilter');
    this.run();
  }

  async subscribe(contract) {
    const address = ethers.utils.getAddress(contract.address);
    if (!this.contracts[address]) {
      this.contracts[address] = contract;
      this.contracts[address].mempool = new EventsEmitter();
      this.watchedAddresses.push(address);
    }
  }

  parseTrace({ hash, tx }) {
    return (result) => {
      if (this.txDone[hash]) {
        return;
      }
      if (result.errors.length > 0) {
        this.txDone[hash] = { error: result.errors[0] };
        return;
      }
      const logs = parseTraceResultLogs(result.logs, hash).filter(({ address }) => this.watchedAddresses.includes(address));
      if (logs.length > 0) {
        const parsedLogs = logs.map((log) => {
          const contract = this.contracts[log.address];
          return {
            ...contract.interface.parseLog({ data: log.data, topics: log.topics }),
            address: log.address,
          };
        });
        for (const log of parsedLogs) {
          const info = Object.fromEntries(Object.entries(log.args));
          info.transactionHash = hash;
          info.tx = tx;
          this.contracts[log.address].mempool.emit(log.name, ...log.args, info);
        }
      }
    };
  }

  txResult(hash) {
    return this.txDone[hash];
  }

  waitTx(tx) {
    const hash = tx.transactionHash || tx.hash;
    tx.wait().then((receipt) => {
      this.txDone[hash] = receipt;
    }).catch((error) => {
      this.txDone[hash] = { error: error.message, transactionHash: hash };
    });
  }

  check(txHash) {
    return (tx) => {
      if (!tx) {
        this.txDone[txHash] = { error: 'not-found', transactionHash: txHash };
        return;
      }
      this.waitTx(tx);
      const hash = tx.transactionHash || tx.hash;

      const txInfo = getTxInfo(tx);
      this.provider.send('debug_traceCall', [txInfo, 'latest', {
        tracer,
        enableMemory: true,
        enableReturnData: true,
        disableStorage: true,
      }]).then(this.parseTrace({ tx, hash }).bind(this));
    };
  }

  checkTxHash(hash) {
    if (this.txHashes[hash]) {
      return true;
    }
    this.txHashes[hash] = true;
    this.provider.getTransaction(hash).then(this.check(hash).bind(this)).catch((e) => {
      console.log(e);
    });
    return true;
  }

  scheduleRun(frequency = this.frequency) {
    clearTimeout(this.timer);
    this.timer = setTimeout(this.run.bind(this), frequency);
  }

  clearSchedule() {
    clearTimeout(this.timer);
    this.timer = 0;
  }

  async reinit() {
    this.clearSchedule();
    this.txHashes = {};
    this.filterId = await this.provider.send('eth_newPendingTransactionFilter');
    this.run();
  }

  run() {
    this.provider.send('eth_getFilterChanges', [this.filterId])
      .then((logs) => {
        logs.map(this.checkTxHash.bind(this));
      }).catch((e) => {
        console.log(e);
        this.reinit();
      });
    this.scheduleRun();
  }
}

module.exports = Watcher;
