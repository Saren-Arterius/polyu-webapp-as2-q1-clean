import socketIO from 'socket.io';
import {injectAuthUser} from './auth';
import {findGameState, ChessBoard} from './chess-board';
import {promisedRedisLock} from './lock';
import {redis, knex} from '../common';

let socketInfo = {};
let io;

const getOnlineUserCount = () => {
  let visitors = {};
  Object.values(io.engine.clients).forEach((s) => {
    let info = socketInfo[s.id];
    visitors[(info.auth && info.auth.user_id) || s.id] = true;
  });
  // console.log(visitors);
  return Object.keys(visitors).length;
};

const getCookie = (cookie, name) => {
  let value = `; ${cookie}`;
  let parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
};

export const initIO = (app) => {
  io = socketIO(app);
  io.on('connection', async (socket, next) => {
    let info = {};
    let auth = getCookie(socket.handshake.headers.cookie, 'authorization');
    if (auth) {
      await injectAuthUser(info, auth);
    }
    socketInfo[socket.id] = info;
    [socket.auth, socket.user] = [info.auth, info.user];
    console.log(`${info.user ? info.user.username : 'guest'} connected`);
    io.to('dashboard/').emit('info', {
      online_users: getOnlineUserCount()
    });

    socket.on('join', async (data) => {
      let room = `${data.type}/${data.value}`;
      socket.join(room);
      if (data.type === 'dashboard') {
        socket.emit('info', {
          online_users: getOnlineUserCount()
        });
      }
    });

    socket.on('game_action', async (data) => {
      if (!data.game_session_id) {
        socket.emit('game_state', {
          error: 'GAME_NOT_FOUND'
        });
        return;
      }
      let lock = await promisedRedisLock(`game:action:${data.game_session_id}`);
      let key = `game:state:${data.game_session_id}`;
      let gameState = await findGameState(data.game_session_id);
      let broadcast = false;
      let hasWinner = false;
      let cb = new ChessBoard(gameState);
      if (data.type === 'game_state' || gameState.error || !socket.user || gameState.winner) {
        broadcast = false;
      } else if (data.type === 'join_game') {
        let error = await cb.joinGame(socket.user);
        if (error) {
          socket.emit('error_message', {
            error
          });
        } else {
          await knex('game_session')
            .update({
              guest_user_id: socket.user.user_id
            })
            .where('game_session_id', data.game_session_id);
          broadcast = true;
        }
      } else if (data.type === 'move') {
        let error = await cb.processUserMove(socket.user.user_id, data.src_xy, data.dest_xy);
        if (error) {
          socket.emit('error_message', {
            error
          });
        } else {
          broadcast = true;
        }
      } else if (data.type === 'abandon') {
        if (socket.user.user_id === gameState.host.user_id) {
          if (!gameState.guest) {
            // Delete everything about this game session
            await redis.del(key);
            await knex('game_session')
              .delete()
              .where('game_session_id', data.game_session_id);
            io.to(`game/${data.game_session_id}`).emit('game_state', {
              error: 'ABANDONED'
            });
            await lock.release();
            return;
          }
          gameState.error = 'ABANDONED';
          gameState.winner = 2;
          hasWinner = true;
        } else if (socket.user.user_id === gameState.guest.user_id) {
          gameState.error = 'ABANDONED';
          gameState.winner = 1;
          hasWinner = true;
        }
      }
      hasWinner |= (await cb.checkChickenDinner());
      if (hasWinner) {
        await knex('game_session')
          .update({
            host_is_winner: gameState.winner === 1
          })
          .where('game_session_id', data.game_session_id);
        await redis.expire(key, 300);
      }
      await redis.set(key, JSON.stringify(gameState));
      if (broadcast || hasWinner) {
        io.to(`game/${data.game_session_id}`)
          .emit('game_state', gameState);
        console.log('emit!');
      } else {
        socket.emit('game_state', gameState);
      }
      await lock.release();
    });

    socket.on('disconnect', (data) => {
      delete socketInfo[socket.id];
      io.to('dashboard/').emit('info', {
        online_users: getOnlineUserCount()
      });
    });
  });
};

export const getIO = () => {
  return io;
};

