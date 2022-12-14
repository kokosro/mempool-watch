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
    this.contracts = {};
    this.watchedAddresses = [];
  }

  async start() {
    this.filterId = await this.provider.send('eth_newPendingTransactionFilter');
    this.run();
  }

  subscribe(contract) {
    const address = ethers.utils.getAddress(contract.address);
    if (!this.contracts[address]) {
      this.contracts[address] = contract;
      this.contracts[address].mempool = new EventsEmitter();
      this.watchedAddresses.push(address);
    }
  }

  parseTrace({ hash, tx }) {
    return (result) => {
      if (result.errors.length > 0) {
        this.emit('error', {
          transactionHash: hash,
          error: result.error[0],
        });
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

  waitTx(tx) {
    const hash = tx.transactionHash || tx.hash;
    tx.wait().then((receipt) => {

    }).catch((error) => {
      this.emit('error', { transactionHash: hash, error: error.message });
    });
  }

  check(txHash) {
    return (tx) => {
      if (!tx) {
        this.emit('error', { transactionHash: txHash, error: 'not-found' });
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
        timeout: '10s',
      }]).then(this.parseTrace({ tx, hash }).bind(this))
        .catch((e) => {
          this.emit('error', { transactionHash: hash, error: `trace-failed ${e.message}`, rerror: e });
        });
    };
  }

  checkTxHash(hash) {
    this.provider.getTransaction(hash).then(this.check(hash).bind(this)).catch((e) => {
      //      console.log(e);
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
    this.filterId = await this.provider.send('eth_newPendingTransactionFilter');
    this.run();
  }

  run() {
    this.provider.send('eth_getFilterChanges', [this.filterId])
      .then((logs) => {
        logs.map(this.checkTxHash.bind(this));
      }).catch((e) => {
        //        console.log(e);
        this.reinit();
      });
    this.scheduleRun();
  }
}

module.exports = Watcher;
