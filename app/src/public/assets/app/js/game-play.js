/* globals document, window, gameSessionID, myUserID, socket, $ */
const GAME_BASE_WIDTH = 11;
const GAME_BASE_HEIGHT = 12;
const RESOLTION_MUL = Math.min((window.innerHeight / GAME_BASE_HEIGHT) * 0.7, ($('.card-body').width() / GAME_BASE_WIDTH) * 0.9);
const DEFAULT_MONITOR_FPS = 60;
const FRAME_DROPS = 0;
const BOARD_ROW_COUNT = 6;

const Color = {
  CYAN: '#00bcd4',
  RED: '#f44336',
  GREEN: '#8bc34a',
  BLUE: '#2196f3',
  AMBER: '#ffc107',
  WHITE: '#ffffff',
  BROWN: '#795548',
  DARK_TEXT: 'rgba(0, 0, 0, 0.8)',
  TRANSPARENT: 'rgba(0, 0, 0, 0)',
  DARK_TRANSPARENT: 'rgba(0, 0, 0, 0.5)',
  WHITE_TRANSPARENT: 'rgba(255, 255,255, 0.8)',
  GREEN_TRANSPARENT: 'rgba(55, 76, 29, 0.5)'
};

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

const localizeErrorMessage = (msg) => {
  // GAME_ALREADY_ENDED, GAME_NOT_FOUND, ABANDONED
  switch (msg) {
    case 'GAME_ALREADY_ENDED':
      return 'This game is already ended.';
    case 'GAME_NOT_FOUND':
      return 'This game is not found. Please check your URL.';
    case 'ABANDONED':
      return 'A player has gave up';
    default:
      return 'Unknown error';
  }
};

const dp = (d) => {
  return d * RESOLTION_MUL; // Pixel
};

const STROKE_LINE_WIDTH = dp(0.0625);
let lastFakeTouchEvent;
let gameState = {
  error: null, // GAME_ALREADY_ENDED, GAME_NOT_FOUND
  host: null,
  guest: null,
  turn: null,
  board: [
    [2, 2, 2, 2, 2, 2],
    [2, 2, 2, 2, 2, 2],
    [0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0],
    [1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1]
  ],
  deadline: null,
  syncing: true,
  winner: null
};

class Utils {
  static isTouchDevice () {
    try {
      document.createEvent('TouchEvent');
      return true;
    } catch (e) {
      return false;
    }
  }
  static normalizeXY (s) {
    let [xS, yS] = s.split(',');
    return [window.parseInt(xS), window.parseInt(yS)];
  }
  static randomItem (arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }
  static fakeMouseEvent (touchEvent, canvas) {
    let touch = touchEvent.touches[0];
    if (!touch) {
      return lastFakeTouchEvent;
    }
    lastFakeTouchEvent = {
      canvasPosX: touch.pageX - canvas.offsetLeft,
      canvasPosY: touch.pageY - canvas.offsetTop
    };
    return lastFakeTouchEvent;
  }
}

class Entity {
  constructor (posX, posY) {
    this.posX = posX;
    this.posY = posY;
    this.fillStyle = Color.WHITE;
    /** @type {Game} */
    this.game = null;
  }
  setGame (game) {
    this.game = game;
    return this;
  }
  render () {
    this.game.ctx.fillStyle = this.fillStyle;
  }
  frameStep () {

  }
}

class StrokeEntity extends Entity {
  constructor (...args) {
    super(...args);
    this.strokeStyle = Color.AMBER;
  }
  render () {
    this.game.ctx.fillStyle = Color.TRANSPARENT;
    this.game.ctx.lineWidth = STROKE_LINE_WIDTH;
    this.game.ctx.strokeStyle = this.strokeStyle;
  }
}

class Circle270 extends StrokeEntity {
  constructor (posX, posY, radius, rotation) {
    super(posX, posY);
    this.radius = radius;
    this.rotation = rotation / 2;
  }
  render () {
    super.render();
    this.game.ctx.beginPath();
    this.game.ctx.arc(
      this.posX, this.posY, this.radius,
      (this.rotation + 0) * Math.PI, (this.rotation + 1.5) * Math.PI
    );
    this.game.ctx.stroke();
  }
}

class Paths extends StrokeEntity {
  constructor (posX, posY, movements) {
    super(posX, posY);
    this.movements = movements;
  }
  render () {
    super.render();
    this.game.ctx.beginPath();
    this.movements.forEach((mxy, i) => {
      if (mxy[0] === 1) {
        this.game.ctx.moveTo(this.posX + mxy[1], this.posY + mxy[2]);
      } else {
        this.game.ctx.lineTo(this.posX + mxy[1], this.posY + mxy[2]);
      }
    });
    this.game.ctx.stroke();
  }
}

class ChessBoard extends Entity {
  constructor (posX, posY, chessRadius, chessDistance, colorComp, colorPlayer, colorHint, hintRadius) {
    super(posX, posY);
    this.chessRadius = chessRadius;
    this.chessDistance = chessDistance;
    this.colorComp = colorComp;
    this.colorPlayer = colorPlayer;
    this.colorHint = colorHint;
    this.hintRadius = hintRadius;
    this.draggingChessXY = null;
    this.draggingChessDisplayXY = null;
    this.possibleMovements = null;
    this.dragTargetXY = null;
  }
  isMyTurn () {
    if (gameState.winner) {
      return false;
    }
    if (!gameState.host || !gameState.guest) {
      return false;
    }
    if (gameState.turn === 1 && myUserID === gameState.host.user_id) {
      return true;
    }
    if (gameState.turn === 2 && myUserID === gameState.guest.user_id) {
      return true;
    }
    return false;
  }
  getChessRenderXY (x, y, dragDependent = true) {
    if (dragDependent) {
      if (this.draggingChessXY && this.draggingChessXY[0] === x && this.draggingChessXY[1] === y) {
        return this.draggingChessDisplayXY;
      }
    }
    return [
      this.posX + (x * this.chessDistance),
      this.posY + (y * this.chessDistance)
    ];
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
  render () {
    super.render();
    for (let x = 0; x < BOARD_ROW_COUNT; x++) {
      for (let y = 0; y < BOARD_ROW_COUNT; y++) {
        let chessXY = this.getChessRenderXY(x, y, false);
        this.game.ctx.fillStyle = this.colorHint;
        this.game.ctx.beginPath();
        this.game.ctx.arc(chessXY[0], chessXY[1], this.hintRadius, 0, 2 * Math.PI);
        this.game.ctx.fill();
      }
    }
    for (let x = 0; x < BOARD_ROW_COUNT; x++) {
      for (let y = 0; y < BOARD_ROW_COUNT; y++) {
        if (gameState.board[y][x] === 2) {
          let chessXY = this.getChessRenderXY(x, y);
          this.game.ctx.fillStyle = this.colorComp;
          this.game.ctx.beginPath();
          this.game.ctx.arc(chessXY[0], chessXY[1], this.chessRadius, 0, 2 * Math.PI);
          this.game.ctx.fill();
        }
      }
    }
    for (let x = 0; x < BOARD_ROW_COUNT; x++) {
      for (let y = 0; y < BOARD_ROW_COUNT; y++) {
        if (gameState.board[y][x] === 1) {
          let chessXY = this.getChessRenderXY(x, y);
          this.game.ctx.fillStyle = this.colorPlayer;
          this.game.ctx.beginPath();
          this.game.ctx.arc(chessXY[0], chessXY[1], this.chessRadius, 0, 2 * Math.PI);
          this.game.ctx.fill();
        }
      }
    }
    for (let x = 0; x < BOARD_ROW_COUNT; x++) {
      for (let y = 0; y < BOARD_ROW_COUNT; y++) {
        if (gameState.board[y][x] === 1) {
          let chessXY = this.getChessRenderXY(x, y);
          this.game.ctx.fillStyle = this.colorPlayer;
          this.game.ctx.beginPath();
          this.game.ctx.arc(chessXY[0], chessXY[1], this.chessRadius, 0, 2 * Math.PI);
          this.game.ctx.fill();
        }
      }
    }
    if (this.draggingChessXY) {
      Object.keys(this.possibleMovements).map(Utils.normalizeXY).forEach((xy) => {
        let [x, y] = xy;
        let chessXY = this.getChessRenderXY(x, y, false);
        if (this.dragTargetXY && this.dragTargetXY[0] === x && this.dragTargetXY[1] === y) {
          this.game.ctx.fillStyle = Color.GREEN_TRANSPARENT;
        } else {
          this.game.ctx.fillStyle = Color.DARK_TRANSPARENT;
        }
        this.game.ctx.beginPath();
        this.game.ctx.arc(chessXY[0], chessXY[1], dp(0.48), 0, 2 * Math.PI);
        this.game.ctx.fill();
      });
    }
  }
  isInvalid (x, y) {
    return x < 0 || x > BOARD_ROW_COUNT - 1 || y < 0 || y > BOARD_ROW_COUNT - 1;
  }
  calcPossibleMovements (x, y) {
    let movements = {};
    for (let i = -1; i < 2; i++) {
      for (let j = -1; j < 2; j++) {
        let [searchX, searchY] = [x + i, y + j];
        if (this.isInvalid(searchX, searchY)) {
          continue;
        }
        if (gameState.board[searchY][searchX] !== 0) {
          continue;
        }
        movements[[searchX, searchY]] = true;
      }
    }
    let self = gameState.board[y][x];
    this.getAllowedSearchDirections(x, y).forEach(async (direction) => {
      let [searchX, searchY, loopCount] = [x, y, 0];
      let shouldStop = () => {
        let isAtInitialPosition = searchX === x && searchY === y;
        if (!isAtInitialPosition && gameState.board[searchY][searchX] === self) {
          return true;
        }
        if (gameState.board[searchY][searchX] !== 0 && gameState.board[searchY][searchX] !== self) {
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
  handleMouseCursor (e) {
    let posFromLayer = p => Math.floor((p - (dp(3) - (this.chessDistance / 2))) / this.chessDistance);
    let [x, y] = [posFromLayer(e.canvasPosX), posFromLayer(e.canvasPosY)];
    let invalidXY = this.isInvalid(x, y);
    let cursor = null;
    if (!invalidXY && gameState.board[y][x] === gameState.turn) {
      cursor = 'pointer';
    }
    if (this.draggingChessXY) {
      cursor = 'move';
    }
    if (cursor) {
      this.game.priorityCursor[1] = cursor;
    } else {
      delete this.game.priorityCursor[1];
    }
    return invalidXY ? null : [x, y];
  }
  onmousemove (e) {
    if (!this.isMyTurn()) return;
    if (this.draggingChessXY) {
      this.draggingChessDisplayXY = [e.canvasPosX, e.canvasPosY];
    }
    this.dragTargetXY = this.handleMouseCursor(e);
  }
  onmousedown (e) {
    if (!this.isMyTurn()) return;
    if (this.draggingChessXY) {
      return;
    }
    let xy = this.handleMouseCursor(e);
    if (!xy) {
      return;
    }
    let [srcX, srcY] = xy;
    if (gameState.board[srcY][srcX] === gameState.turn) {
      this.draggingChessDisplayXY = [e.canvasPosX, e.canvasPosY];
      this.draggingChessXY = xy;
      this.possibleMovements = this.calcPossibleMovements(srcX, srcY);
    }
  }
  onmouseup (e) {
    if (!this.isMyTurn()) return;
    let xy = this.handleMouseCursor(e);
    if (!xy) {
      this.draggingChessXY = null;
      return;
    }
    let [destX, destY] = xy;
    if (this.draggingChessXY && this.possibleMovements[xy]) {
      let [srcX, srcY] = this.draggingChessXY;
      let chess = gameState.board[srcY][srcX];
      gameState.board[srcY][srcX] = 0;
      gameState.board[destY][destX] = chess;

      gameState.syncing = true;
      socket.emit('game_action', {
        type: 'move',
        game_session_id: gameSessionID,
        src_xy: this.draggingChessXY,
        dest_xy: xy
      });
    }
    delete this.game.priorityCursor[1];
    this.draggingChessXY = null;
  }
}

class Button extends Entity {
  constructor (posX, posY, width, height, text, onClick, shouldBeHidden) {
    super(posX, posY);
    this.width = width;
    this.height = height;
    this.text = text;
    this.onClick = onClick;
    this.shouldBeHidden = shouldBeHidden;
  }
  isPointInShape (x, y) {
    if (this.shouldBeHidden && this.shouldBeHidden()) {
      return false;
    }
    return this.posX <= x && x <= this.posX + this.width &&
      this.posY <= y && y <= this.posY + this.height;
  }
  render () {
    if (this.shouldBeHidden && this.shouldBeHidden()) {
      return;
    }
    super.render();
    if (this.text) {
      this.game.ctx.fillRect(this.posX, this.posY, this.width, this.height);
      this.game.ctx.fillStyle = Color.WHITE;
      this.game.ctx.font = `${dp(0.25)}px Arial`;
      this.game.ctx.textAlign = 'center';
      this.game.ctx.fillText(
        this.text,
        this.posX + (this.width / 2),
        this.posY + (this.height / 2) + dp(0.1),
      );
    }
  }
}

class Avatar extends Button {
  constructor (posX, posY, width, height, text, onClick, shouldBeHidden, isReprHost) {
    super(posX, posY, width, height, text, onClick, shouldBeHidden);
    this.isReprHost = isReprHost;
    this.pendingImage = null;
    this.image = null;
  }
  render () {
    let user = this.isReprHost ? gameState.host : gameState.guest;
    if (user && !this.pendingImage) {
      this.pendingImage = new window.Image();
      this.pendingImage.src = `https://s.gravatar.com/avatar/${user.email_md5}?s=80&r=g`;
      this.pendingImage.onload = () => {
        this.image = this.pendingImage;
      };
    }
    if (this.shouldBeHidden && this.shouldBeHidden()) {
      return;
    }
    super.render();
    let dWidth = dp(1.5);
    if (this.image) {
      this.game.ctx.drawImage(
        this.image,
        this.posX,
        this.posY,
        this.width,
        this.height,
      );
    }
    if (user) {
      this.game.ctx.textAlign = this.isReprHost ? 'left' : 'right';
      this.game.ctx.fillStyle = this.isReprHost ? Color.BLUE : Color.RED;
      this.game.ctx.font = `${dp(0.5)}px Arial`;
      this.game.ctx.fillText(
        `@${user.username}`,
        this.isReprHost ? dWidth + (dp(0.125) * 2) : this.game.canvas.width - (dWidth + (dp(0.125) * 2)),
        this.isReprHost ? this.game.canvas.height - (dWidth - dp(0.25)) : (dp(0.125) * 4),
      );
      this.game.ctx.fillStyle = Color.DARK_TEXT;
      this.game.ctx.font = `${dp(0.25)}px Arial`;
      this.game.ctx.fillText(
        `Ranking: #${user.ranking}`,
        this.isReprHost ? dWidth + (dp(0.15) * 2) : this.game.canvas.width - (dWidth + (dp(0.15) * 2)),
        this.isReprHost ? this.game.canvas.height - (dWidth - dp(0.7)) : (dp(0.125) * 4) + dp(0.45),
      );
      this.game.ctx.fillText(
        `Score: ${user.score}`,
        this.isReprHost ? dWidth + (dp(0.15) * 2) : this.game.canvas.width - (dWidth + (dp(0.15) * 2)),
        this.isReprHost ? this.game.canvas.height - (dWidth - dp(1.0)) : (dp(0.125) * 4) + dp(0.75),
      );
      this.game.ctx.font = `${dp(0.35)}px Arial`;
      let txt;
      if (!myUserID) {
        txt = this.isReprHost ? 'Host' : 'Guest';
        this.game.ctx.fillStyle = Color.DARK_TRANSPARENT;
      } else {
        txt = myUserID === user.user_id ? 'You' : 'Rival';
        this.game.ctx.fillStyle = myUserID === user.user_id ? Color.DARK_TEXT : Color.DARK_TRANSPARENT;
      }
      this.game.ctx.fillText(
        txt,
        this.isReprHost ? dWidth + (dp(0.15) * 2) : this.game.canvas.width - (dWidth + (dp(0.15) * 2)),
        this.isReprHost ? this.game.canvas.height - (dWidth - dp(1.37)) : (dp(0.125) * 4) + dp(1.12),
      );
    } else if (!gameState.syncing && !this.isReprHost) {
      this.game.ctx.textAlign = 'center';
      this.game.ctx.fillStyle = Color.RED;
      this.game.ctx.font = `${dp(0.5)}px Arial`;
      this.game.ctx.fillText(
        myUserID === gameState.host.user_id ? 'Waiting for challenger...' : 'Host is waiting...',
        this.game.canvas.width / 2,
        dp(0.7),
      );
    }
  }
}

class GameMenu {
  constructor (game) {
    /** @type {Game} */
    this.game = game;
    this.logo = null;
    let logo = new window.Image();
    logo.src = '/assets/app/logo.png';
    logo.onload = () => {
      this.logo = logo;
    };
    this.initButtons();
  }
  initButtons () {
    this.joinButton = new Button(
      ((this.game.canvas.width / 2) - (dp(3) / 2)),
      this.game.canvas.height - (dp(0.78125) + dp(0.125)),
      dp(3), dp(0.78125), 'JOIN', () => {
        gameState.syncing = true;
        socket.emit('game_action', {
          type: 'join_game',
          game_session_id: gameSessionID
        });
      }, () => {
        if (gameState.syncing) return true;
        if (gameState.winner) return true;
        return !(!gameState.guest && myUserID && gameState.host && gameState.host.user_id !== myUserID);
      }
    ).setGame(this.game);
    this.joinButton.fillStyle = Color.BLUE;

    this.abandonButton = new Button(
      ((this.game.canvas.width / 2) - (dp(3) / 2)),
      this.game.canvas.height - (dp(0.78125) + dp(0.125)),
      dp(3), dp(0.78125), 'ABANDON', () => {
        gameState.syncing = true;
        socket.emit('game_action', {
          type: 'abandon',
          game_session_id: gameSessionID
        });
      }, () => {
        if (gameState.syncing) return true;
        if (gameState.winner) return true;
        return !((gameState.host && gameState.host.user_id === myUserID) ||
        (gameState.guest && gameState.guest.user_id === myUserID));
      }
    ).setGame(this.game);
    this.abandonButton.fillStyle = Color.RED;
    let aspect = 1;
    let dWidth = dp(1.5);
    this.hostAvatarButton = new Avatar(
      dp(0.125),
      this.game.canvas.height - dp(0.125) - dWidth,
      dWidth,
      dWidth * aspect,
      null,
      () => {
        window.location = `/profile/${gameState.host.user_id}`;
      },
      null,
      true
    ).setGame(this.game);
    this.guestAvatarButton = new Avatar(
      this.game.canvas.width - dp(0.125) - dWidth,
      dp(0.125),
      dWidth,
      dWidth * aspect,
      null,
      () => {
        window.location = `/profile/${gameState.guest.user_id}`;
      },
      null,
      false
    ).setGame(this.game);
    this.buttons = [this.joinButton, this.abandonButton, this.hostAvatarButton, this.guestAvatarButton];
  }
  renderIfNeeded () {
    if (gameState.error || gameState.syncing || gameState.winner) {
      this.renderMenu();
    }
    this.renderButtons();
  }
  renderMenuLogo () {
    if (this.logo) {
      let aspect = this.logo.height / this.logo.width;
      let dWidth = dp(3.125);
      this.game.ctx.drawImage(
        this.logo,
        (this.game.canvas.width / 2) - (dWidth / 2),
        dp(3.25),
        dWidth,
        dWidth * aspect,
      );
    }
  }
  renderMenu () {
    this.game.ctx.fillStyle = Color.WHITE_TRANSPARENT;
    this.game.ctx.fillRect(0, 0, this.game.canvas.width, this.game.canvas.height);
    if (gameState.syncing) {
      return;
    }
    this.renderMenuLogo();
    this.game.ctx.fillStyle = Color.DARK_TEXT;
    this.game.ctx.font = `${dp(0.375)}px Arial`;
    this.game.ctx.textAlign = 'center';
    [
      'Click \'Game List\' at sidebar to find more games.',
      gameState.error ? `Error: ${localizeErrorMessage(gameState.error)}` : 'You can always host your own game!'
    ].forEach((text, i) => {
      this.game.ctx.fillText(
        text,
        this.game.canvas.width / 2,
        (dp(8.75) + (dp(0.375) * i)),
      );
    });
    if (gameState.winner) {
      let msg;
      let winUser = gameState.winner === 1 ? gameState.host : gameState.guest;
      if (winUser.user_id === myUserID) {
        msg = 'Winner Winner Chicken Dinner!';
      } else if (gameState.host.user_id === myUserID || gameState.guest.user_id === myUserID) {
        msg = 'Better Luck Next Time!';
      } else {
        msg = `@${winUser.username} Is Having Chicken Dinner!`;
      }
      this.game.ctx.fillText(
        msg,
        this.game.canvas.width / 2,
        dp(2.375),
      );
    }
  }
  renderButtons () {
    this.buttons.forEach(b => b.render());
  }
  getRelatedButton (e) {
    let rel = null;
    this.buttons.some((btn) => {
      if (btn.isPointInShape(e.canvasPosX, e.canvasPosY)) {
        rel = btn;
        return true;
      }
      return false;
    });
    return rel;
  }
  onmousemove (e) {
    let btn = this.getRelatedButton(e);
    if (btn) {
      this.game.priorityCursor[3] = 'pointer';
    } else {
      delete this.game.priorityCursor[3];
    }
  }
  onmousedown (e) {
    let btn = this.getRelatedButton(e);
    if (btn) {
      btn.onClick();
    }
  }
  onmouseup (e) {

  }
}

class Game {
  constructor (settings) {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    this.canvas.width = dp(GAME_BASE_WIDTH);
    this.canvas.height = dp(GAME_BASE_HEIGHT);
    this.menu = new GameMenu(this);
    this.canvas.onmousemove = (e) => {
      let rect = this.canvas.getBoundingClientRect();
      [e.canvasPosX, e.canvasPosY] = [e.clientX - rect.left, e.clientY - rect.top];
      this.menu.onmousemove(e);
      this.chessBoard.onmousemove(e);
    };
    this.canvas.ontouchmove = (e) => {
      this.chessBoard.onmousemove(Utils.fakeMouseEvent(e, this.canvas));
    };
    this.canvas.onmousedown = (e) => {
      let rect = this.canvas.getBoundingClientRect();
      [e.canvasPosX, e.canvasPosY] = [e.clientX - rect.left, e.clientY - rect.top];
      this.menu.onmousedown(e);
      this.chessBoard.onmousedown(e);
    };
    this.canvas.ontouchstart = (e) => {
      this.chessBoard.onmousedown(Utils.fakeMouseEvent(e, this.canvas));
    };
    this.canvas.onmouseup = (e) => {
      let rect = this.canvas.getBoundingClientRect();
      [e.canvasPosX, e.canvasPosY] = [e.clientX - rect.left, e.clientY - rect.top];
      this.menu.onmouseup(e);
      this.chessBoard.onmouseup(e);
    };
    this.canvas.ontouchend = (e) => {
      this.chessBoard.onmouseup(Utils.fakeMouseEvent(e, this.canvas));
    };
    this.reset();
  }
  reset () {
    this.started = false;
    this.frameCallbacks = {};
    this.entities = [];
    /** @type {ChessBoard} */
    this.chessBoard = null;
    this.frame = 0;
    this.priorityCursor = {};
    this.lastNotify = 0;
    this.hostAvatar = null;
    this.guestAvatar = null;
    this.initEntities();
  }
  registerEntity (entity) {
    entity.setGame(this);
    this.entities.push(entity);
    return entity;
  }
  initEntities () {
    this.registerEntity(new Circle270(dp(3), dp(3), dp(2), 1)).strokeStyle = Color.GREEN;
    this.registerEntity(new Circle270(dp(3), dp(3), dp(1), 1)).strokeStyle = Color.CYAN;
    this.registerEntity(new Circle270(dp(8), dp(3), dp(2), 2)).strokeStyle = Color.GREEN;
    this.registerEntity(new Circle270(dp(8), dp(3), dp(1), 2)).strokeStyle = Color.CYAN;
    this.registerEntity(new Circle270(dp(8), dp(8), dp(2), 3)).strokeStyle = Color.GREEN;
    this.registerEntity(new Circle270(dp(8), dp(8), dp(1), 3)).strokeStyle = Color.CYAN;
    this.registerEntity(new Circle270(dp(3), dp(8), dp(2), 4)).strokeStyle = Color.GREEN;
    this.registerEntity(new Circle270(dp(3), dp(8), dp(1), 4)).strokeStyle = Color.CYAN;
    let pad = (STROKE_LINE_WIDTH / 2);
    this.registerEntity(new Paths(dp(3), dp(3), [
      [1, -pad, 0],
      [0, dp(5), 0],
      [0, dp(5), dp(5)],
      [0, 0, dp(5)],
      [0, 0, 0]
    ])).strokeStyle = Color.AMBER;
    this.registerEntity(new Paths(dp(3), dp(3), [
      [1, -pad, dp(1)],
      [0, dp(5) + (pad), dp(1)],
      [1, dp(4), dp(1)],
      [0, dp(4), -pad],
      [0, dp(4), dp(5) + pad],
      [1, dp(4), dp(4)],
      [0, dp(5) + pad, dp(4)],
      [0, -pad, dp(4)],
      [1, dp(1), dp(4)],
      [0, dp(1), dp(5) + pad],
      [0, dp(1), -pad]
    ])).strokeStyle = Color.CYAN;
    this.registerEntity(new Paths(dp(3), dp(3), [
      [1, -pad, dp(2)],
      [0, dp(5) + pad, dp(2)],
      [1, dp(3), dp(2)],
      [0, dp(3), -pad],
      [0, dp(3), dp(5) + pad],
      [1, dp(3), dp(3)],
      [0, dp(5) + pad, dp(3)],
      [0, -pad, dp(3)],
      [1, dp(2), dp(3)],
      [0, dp(2), dp(5) + pad],
      [0, dp(2), -pad]
    ])).strokeStyle = Color.GREEN;
    this.chessBoard = this.registerEntity(new ChessBoard(dp(3), dp(3), dp(0.375), dp(1), Color.RED, Color.BLUE, Color.BROWN, 4));
  }
  start () {
    if (this.started) {
      return;
    }
    this.startProcess();
    this.started = true;
  }
  scheduleNextRender (dropLeft) {
    window.requestAnimationFrame(() => {
      if (dropLeft > 0) {
        this.scheduleNextRender(dropLeft - 1);
      } else {
        this.dropLeft = FRAME_DROPS;
        this.startProcess();
      }
    });
  }
  startProcess () {
    this.nextFrame();
    this.render();
    this.scheduleNextRender(FRAME_DROPS);
  }
  render () {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.entities.forEach(e => e.render());
    this.renderGameInfo();
    this.menu.renderIfNeeded();
    this.canvas.style.cursor = this.priorityCursor[Math.max(...Object.keys(this.priorityCursor))] || 'auto';
  }
  renderGameInfo () {
    let timeLeft = Math.max(Math.ceil((gameState.deadline - Date.now()) / 1000), 0);
    if (timeLeft) {
      this.ctx.textAlign = 'right';
      this.ctx.fillStyle = gameState.turn === 1 ? Color.BLUE : Color.RED;
      this.ctx.font = `${dp(0.5)}px Arial`;
      this.ctx.fillText(
        `${timeLeft}`,
        this.canvas.width - dp(0.15),
        this.canvas.height - dp(0.15),
      );
    }
  }
  waitMS (ms) {
    return this.waitFrames(Math.ceil(ms / (1000 / DEFAULT_MONITOR_FPS)));
  }
  waitFrames (frames) {
    let targetFrame = this.frame + frames;
    return new Promise((resolve) => {
      let callbacks = this.frameCallbacks[targetFrame];
      if (!callbacks) {
        callbacks = [];
        this.frameCallbacks[targetFrame] = callbacks;
      }
      callbacks.push(() => {
        resolve();
      });
    });
  }
  nextFrame () {
    this.frame++;
    this.entities.map(e => e.frameStep(1 / DEFAULT_MONITOR_FPS));
    if (gameState.syncing) {
      this.priorityCursor[4] = 'progress';
    } else if (!gameState.syncing) {
      delete this.priorityCursor[4];
    }
    let now = Date.now();
    if (gameState.deadline && now > gameState.deadline + 1000 && now > this.lastNotify + 5000) {
      // Try notify server of deadline?
      this.lastNotify = now;
      socket.emit('game_action', {type: 'game_state', game_session_id: gameSessionID});
    }
    let callbacks = this.frameCallbacks[this.frame];
    if (callbacks) {
      callbacks.forEach(cb => cb());
      delete this.frameCallbacks[this.frame];
    }
  }
}


(() => {
  let game = new Game();
  game.start();

  socket.on('game_state', (data) => {
    gameState = Object.assign(gameState, data);
    console.log('game state updated', gameState);
    gameState.syncing = false;
    if (gameState.error === 'ABANDONED' && !gameState.winner) {
      window.location = '.';
    }
  });

  socket.on('error_message', (data) => {
    window.alert(data.error);
  });

  socket.emit('join', {type: 'game', value: gameSessionID});
  socket.emit('game_action', {type: 'game_state', game_session_id: gameSessionID});
})();

