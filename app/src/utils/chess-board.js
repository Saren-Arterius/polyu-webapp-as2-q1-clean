import md5 from 'md5';
import {getRankings, getCurrentGameSession} from './player';
import {knex, redis} from '../common';
import {promisedRedisLock} from './lock';

const BOARD_ROW_COUNT = 6;
const TURN_TIME_MS = 3 * 60 * 1000;

const SearchDirection = {
  UP: 0,
  LEFT: 1,
  DOWN: 2,
  RIGHT: 3
};

const LoopDestination = {
  // Cyan
  '1,0,0': [0, 1, SearchDirection.RIGHT],
  '0,1,1': [1, 0, SearchDirection.DOWN],
  '4,0,0': [5, 1, SearchDirection.LEFT],
  '5,1,3': [4, 0, SearchDirection.DOWN],
  '0,4,1': [1, 5, SearchDirection.UP],
  '1,5,2': [0, 4, SearchDirection.RIGHT],
  '5,4,3': [4, 5, SearchDirection.UP],
  '4,5,2': [5, 4, SearchDirection.LEFT],

  // Green
  '2,0,0': [0, 2, SearchDirection.RIGHT],
  '0,2,1': [2, 0, SearchDirection.DOWN],
  '3,0,0': [5, 2, SearchDirection.LEFT],
  '5,2,3': [3, 0, SearchDirection.DOWN],
  '0,3,1': [2, 5, SearchDirection.UP],
  '2,5,2': [0, 3, SearchDirection.RIGHT],
  '5,3,3': [3, 5, SearchDirection.UP],
  '3,5,2': [5, 3, SearchDirection.LEFT]
};

export const gameStateTemplate = {
  error: null, // GAME_ALREADY_ENDED, GAME_NOT_FOUND, ABANDONED
  host: {
    user_id: 'axTvlRjVKufmzTqiPCBmZRXWsyj2',
    username: 'nekomata_saren',
    email_md5: 'cef640b4420bd65002ea8919bd9693d6',
    ranking: 1,
    score: 10
  },
  guest: {
    user_id: 'axTvlRjVKufmzTqiPCBmZRXWsyj112',
    username: 'nekomata_saren11',
    email_md5: 'cef640b4420bd65002ea8919bd9693d6',
    ranking: 2,
    score: 20
  },
  turn: 1,
  board: [
    [2, 2, 2, 2, 2, 2],
    [2, 2, 2, 2, 2, 2],
    [0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0],
    [1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1]
  ],
  deadline: 15242555070000,
  syncing: false,
  winner: null
};

export class ChessBoard {
  constructor (gameState) {
    /** @type {gameStateTemplate} */
    this.gameState = gameState;
  }
  processUserMove (userID, srcXY, destXY) {
    if (!this.isUserTurn(userID)) return 'Not your turn.';
    let possibleMovements = this.calcPossibleMovements(...srcXY);
    if (possibleMovements[destXY]) {
      let [srcX, srcY] = srcXY;
      let [destX, destY] = destXY;
      let chess = this.gameState.board[srcY][srcX];
      this.gameState.board[srcY][srcX] = 0;
      this.gameState.board[destY][destX] = chess;
      this.gameState.turn = this.gameState.turn === 1 ? 2 : 1;
      this.gameState.deadline = Date.now() + TURN_TIME_MS;
      return null;
    }
    return 'Invalid chess movement.';
  }
  isUserTurn (userID) {
    if (Date.now() > this.gameState.deadline) {
      return false;
    }
    if (this.gameState.winner) {
      return false;
    }
    if (!this.gameState.host || !this.gameState.guest) {
      return false;
    }
    if (this.gameState.turn === 1 && userID === this.gameState.host.user_id) {
      return true;
    }
    if (this.gameState.turn === 2 && userID === this.gameState.guest.user_id) {
      return true;
    }
    return false;
  }
  getAllowedSearchDirections (x, y) {
    if (x === y && (x === 0 || x === BOARD_ROW_COUNT - 1)) {
      return [];
    }
    if (x === 0 || x === BOARD_ROW_COUNT - 1) {
      return [SearchDirection.LEFT, SearchDirection.RIGHT];
    }
    if (y === 0 || y === BOARD_ROW_COUNT - 1) {
      return [SearchDirection.UP, SearchDirection.DOWN];
    }
    return Object.values(SearchDirection);
  }
  isInvalid (x, y) {
    return x < 0 || x > BOARD_ROW_COUNT - 1 || y < 0 || y > BOARD_ROW_COUNT - 1;
  }
  calcPossibleMovements (x, y) {
    let movements = {};
    if (this.isInvalid(x, y)) return movements;
    for (let i = -1; i < 2; i++) {
      for (let j = -1; j < 2; j++) {
        let [searchX, searchY] = [x + i, y + j];
        if (this.isInvalid(searchX, searchY)) {
          continue;
        }
        if (this.gameState.board[searchY][searchX] !== 0) {
          continue;
        }
        movements[[searchX, searchY]] = true;
      }
    }
    let self = this.gameState.board[y][x];
    this.getAllowedSearchDirections(x, y).forEach(async (direction) => {
      let [searchX, searchY, loopCount] = [x, y, 0];
      let shouldStop = () => {
        let isAtInitialPosition = searchX === x && searchY === y;
        if (!isAtInitialPosition && this.gameState.board[searchY][searchX] === self) {
          return true;
        }
        if (this.gameState.board[searchY][searchX] !== 0 && this.gameState.board[searchY][searchX] !== self) {
          if (loopCount >= 1) {
            movements[[searchX, searchY]] = true;
          }
          return true;
        }
        if (loopCount === 4 && isAtInitialPosition) {
          return true;
        }
        return false;
      };
      while (this) {
        let loopDest = LoopDestination[[searchX, searchY, direction]];
        if (loopDest) {
          loopCount++;
          [searchX, searchY, direction] = loopDest;
        } else {
          switch (direction) {
            case SearchDirection.UP:
              searchY--;
              break;
            case SearchDirection.LEFT:
              searchX--;
              break;
            case SearchDirection.DOWN:
              searchY++;
              break;
            case SearchDirection.RIGHT:
              searchX++;
              break;
            default:
              break;
          }
        }
        if (shouldStop()) {
          break;
        }
      }
    });
    return movements;
  }
  checkChickenDinner () {
    if (this.gameState.winner) {
      return false;
    }
    if (this.gameState.deadline && Date.now() > this.gameState.deadline) {
      this.gameState.winner = this.gameState.turn === 1 ? 2 : 1;
      console.log('Deadline!');
      return true;
    }
    let chesses = [].concat(...this.gameState.board);
    if (chesses.every(c => c === 0 || c === 1)) {
      this.gameState.winner = 1;
      return true;
    }
    if (chesses.every(c => c === 0 || c === 2)) {
      this.gameState.winner = 2;
      return true;
    }
    return false;
  }
  async joinGame (guestUser) {
    if (this.gameState.host.user_id === guestUser.user_id) {
      return 'You cannot join your own game';
    }
    if (this.gameState.guest) {
      return 'There is already a challenger in this game.';
    }
    // TODO: Check if user is in other game
    let sess = await getCurrentGameSession(guestUser.user_id);
    if (sess) {
      return 'You are already in a game.';
    }
    let [row] = (await getRankings(guestUser.user_id));
    this.gameState.guest = {
      user_id: guestUser.user_id,
      username: guestUser.username,
      email_md5: md5(guestUser.email),
      ranking: (row && row.rank) || 0,
      score: (row && row.score) || 0
    };
    this.gameState.deadline = Date.now() + TURN_TIME_MS;
    return null;
  }
}

export const newGameState = async (hostUser) => {
  let [row] = (await getRankings(hostUser.user_id));
  return {
    error: null, // GAME_ALREADY_ENDED, GAME_NOT_FOUND, ABANDONED
    host: {
      user_id: hostUser.user_id,
      username: hostUser.username,
      email_md5: md5(hostUser.email),
      ranking: (row && row.rank) || 0,
      score: (row && row.score) || 0
    },
    guest: null,
    turn: 1,
    board: [
      [2, 2, 2, 2, 2, 2],
      [2, 2, 2, 2, 2, 2],
      [0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0],
      [1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1]
    ],
    deadline: null,
    syncing: false,
    winner: null
  };
};

export const findGameState = async (gameSessionID) => {
  let lock = await promisedRedisLock(`game:lock:find:${gameSessionID}`);
  let key = `game:state:${gameSessionID}`;
  let json = await redis.get(key);
  if (json) {
    await lock.release();
    return JSON.parse(json);
  }
  let [row] = (await knex('game_session')
    .select()
    .join('user', 'game_session.host_user_id', '=', 'user.user_id')
    .where('game_session_id', gameSessionID));
  if (!row) {
    await lock.release();
    return {
      error: 'GAME_NOT_FOUND'
    };
  }
  if (row.host_is_winner !== null) {
    await lock.release();
    return {
      error: 'GAME_ALREADY_ENDED'
    };
  }
  let gs = await newGameState(row);
  await redis.set(key, JSON.stringify(gs));
  await lock.release();
  return gs;
};
