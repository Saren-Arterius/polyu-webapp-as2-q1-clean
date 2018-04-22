#!/usr/bin/env node
import http from 'http';
import app from '../app';
import {initIO} from '../utils/io-handler';

const normalizePort = (val) => {
  let port = parseInt(val, 10);
  if (isNaN(port)) {
    return val;
  }
  if (port >= 0) {
    return port;
  }
  return false;
};

let port = normalizePort(process.env.PORT || '3000');
app.set('port', port);

let server = http.createServer(app);
server.on('error', (error) => {
  if (error.syscall !== 'listen') {
    throw error;
  }
  let bind = typeof port === 'string' ? `Pipe ${port}` : `Port ${port}`;
  // handle specific listen errors with friendly messages
  switch (error.code) {
    case 'EACCES':
      console.error(`${bind} requires elevated privileges`);
      process.exit(1);
    case 'EADDRINUSE':
      console.error(`${bind} is already in use`);
      process.exit(1);
    default:
      throw error;
  }
});
server.on('listening', () => {
  let addr = server.address();
  let bind = typeof addr === 'string' ? `pipe ${addr}` : `port ${addr.port}`;
  console.log(`Listening on ${bind}`);
});
server.listen(port);
initIO(server);

