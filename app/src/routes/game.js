import express from 'express';
import {requireUserOrRedirect, requireAuthOrRedirect} from '../utils/auth';
import {knex} from '../common';
import {promisedRedisLock} from '../utils/lock';
import {getCurrentGameSession} from '../utils/player';

const router = express.Router();

router.get('/:game_session_id', requireUserOrRedirect, async (req, res, next) => {
  res.render('game-play', {
    req
  });
});

router.get('/', requireUserOrRedirect, async (req, res, next) => {
  let rows = (await knex.raw(`
  SELECT 
    game_session_id, 
    game_session.created_at AS session_created_at,
    host_user_id, 
    guest_user_id, 
    host_u.username AS host_username, 
    guest_u.username AS guest_username FROM game_session
  LEFT JOIN "user" AS host_u ON host_user_id = host_u.user_id
  LEFT JOIN "user" AS guest_u ON guest_user_id = guest_u.user_id
  WHERE host_is_winner IS NULL
  ORDER BY CASE
    WHEN guest_user_id IS NULL THEN 0
    WHEN guest_user_id IS NOT NULL THEN 1
  END ASC, game_session.created_at ASC
  `)).rows;
  let sess = null;
  if (req.user) {
    sess = await getCurrentGameSession(req.user.user_id);
  }
  res.render('game', {
    req,
    rows,
    sess
  });
});

router.post('/', requireAuthOrRedirect, requireUserOrRedirect, async (req, res, next) => {
  let lock = await promisedRedisLock(`game:join:${req.user.user_id}`);
  let sess = await getCurrentGameSession(req.user.user_id);
  if (sess) {
    await lock.release();
    res.redirect(`/game/${sess.game_session_id}`);
    return;
  }
  let [gameSessionID] = await knex('game_session').insert({
    host_user_id: req.user.user_id
  }, 'game_session_id');
  await lock.release();
  res.redirect(`/game/${gameSessionID}`);
});

module.exports = router;
