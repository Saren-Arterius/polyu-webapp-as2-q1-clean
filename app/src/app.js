import express from 'express';
import cors from 'cors';
import path from 'path';
import logger from 'morgan';
import cookieParser from 'cookie-parser';
import bodyParser from 'body-parser';

import {injectAuthUser} from './utils/auth';

const app = express();

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');
app.set('view cache', false);

app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
  extended: false
}));
app.use(cookieParser());
app.use(cors({
  origin: true
}));
app.use(express.static(path.join(__dirname, 'public')));

app.use(async (req, res, next) => {
  await injectAuthUser(req, req.headers.authorization || req.cookies.authorization || req.query.authorization);
  return next();
});

app.use('/', require('./routes/index'));

app.use((req, res, next) => {
  let err = new Error('NOT_FOUND');
  err.status = 404;
  next(err);
});

app.use((err, req, res, next) => {
  console.log(err);
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};
  res.status(err.status || 500);
  return res.render('error');
});

process.on('unhandledRejection', (e) => {
  console.log(e);
});

module.exports = app;
