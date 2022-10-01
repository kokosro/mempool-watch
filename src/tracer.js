const tracer = `
{
  data: { logs: [], errors: [] },
  fault: function(log){
    this.data.errors.push(log.getError());
  },
  step: function(log){
    if(log.getError()){
      this.data.errors.push(log.getError());
    } else {
      const topicCount = (log.op.toString().match(/LOG(\\d)/) || [])[1];
      if (topicCount) {
        var res = {
          address: log.contract.getAddress(),
          topics: [],
          data: log.memory.slice(parseInt(log.stack.peek(0)), parseInt(log.stack.peek(0)) + parseInt(log.stack.peek(1))),
        };
        for (var i = 0; i < topicCount; i++) {
          res.topics.push(log.stack.peek(2 + i));
        }
        this.data.logs.push(res);
      }
    }
  },
  result: function(ctx){
    return this.data;
  }
}`;

module.exports = tracer;
