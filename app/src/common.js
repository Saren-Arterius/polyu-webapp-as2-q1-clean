import Redis from 'ioredis';
import firebase from 'firebase-admin';
import {CONFIG} from './config';

export const firebaseInstance = firebase.initializeApp({
  credential: firebase.credential.cert(CONFIG.firebase.credential),
  databaseURL: CONFIG.firebase.databaseURL
});

const knexConfig = Object.assign({}, CONFIG.knex);
knexConfig.pool = {
  afterCreate (connection, callback) {
    connection.query(`SET TIME ZONE "${CONFIG.timezone.postgres}"`, (err) => {
      callback(err, connection);
    });
  }
};

export const knex = require('knex')(knexConfig);

export const redis = new Redis(CONFIG.redis);
