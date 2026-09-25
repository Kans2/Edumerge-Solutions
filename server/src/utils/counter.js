const Counter = require('../models/Counter');

async function nextSequence(key, session = null) {
  const opts = { new: true, upsert: true, setDefaultsOnInsert: true };
  if (session) opts.session = session;
  const doc = await Counter.findOneAndUpdate({ key }, { $inc: { seq: 1 } }, opts);
  return doc.seq;
}
module.exports = { nextSequence };
