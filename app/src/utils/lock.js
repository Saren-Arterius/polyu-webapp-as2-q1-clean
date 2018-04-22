import Redis from 'redis';
import RedisLock from 'redis-lock';

import {CONFIG} from '../config';
import {redis} from '../common';

const redisClient = Redis.createClient(CONFIG.redis);
const redisLock = RedisLock(redisClient);

export const promisedRedisLock = async (key) => {
  return new Promise(async (resolve) => {
    redisLock(key, (done) => {
      resolve({
        release: done
      });
    });
  });
};

export const redisAtomicManipulateString = async (key, manipulate) => {
  const lock = await promisedRedisLock(`l:${key}`);
  const val = await redis.get(key);
  let newVal;
  try {
    if (manipulate) {
      newVal = await manipulate(val);
    }
  } catch (e) {
    await lock.release();
    throw e;
  }
  if (newVal && newVal.constructor === Array) {
    await lock.release();
    return newVal;
  }
  if (newVal) {
    await redis.setAsync(key, newVal);
    await lock.release();
    return newVal;
  }
  await lock.release();
  return val;
};
