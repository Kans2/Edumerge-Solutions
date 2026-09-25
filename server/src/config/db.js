const mongoose = require('mongoose');
const env = require('./env');
const logger = require('./logger');

mongoose.set('strictQuery', true);

async function connectDB(uri = env.MONGO_URI) {
  try {
    const conn = await mongoose.connect(uri, { maxPoolSize: 25, serverSelectionTimeoutMS: 10000 });
    logger.info(`MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
    return conn;
  } catch (err) {
    logger.error({ err }, 'MongoDB connection failed');
    process.exit(1);
  }
}

const disconnectDB = () => mongoose.connection.close();
module.exports = { connectDB, disconnectDB };
