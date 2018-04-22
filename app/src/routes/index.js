import express from 'express';

import {knex} from '../common';
import {CONFIG} from '../config';
import {requireUserOrRedirect} from '../utils/auth';
import {handleCumulativeDateFigures, rowsToDateFigures} from '../utils/stats';
import {getRankings} from '../utils/player';

const router = express.Router();

['profile', 'game'].forEach((r) => {
  router.use(`/${r}`, require(`./${r}`));
});

router.get('/login', requireUserOrRedirect, async (req, res, next) => {
  if (req.user) {
    return res.redirect(`${CONFIG.entry_path}/`);
  }
  return res.render('login');
});

router.get('/ranking', requireUserOrRedirect, async (req, res, next) => {
  let tables = await Promise.all([
    getRankings(),
    getRankings(null, `WHERE birth_year >= ${new Date().getFullYear() - 30}`),
    getRankings(null, `WHERE birth_year < ${new Date().getFullYear() - 30}`),
    getRankings(null, 'WHERE gender = \'MALE\''),
    getRankings(null, 'WHERE gender = \'FEMALE\'')
  ]);
  return res.render('ranking', {
    req,
    tables
  });
});


router.get('/', requireUserOrRedirect, async (req, res, next) => {
  let now = new Date();
  let fromDate = now.getTime() - (15 * 24 * 60 * 60 * 1000);
  let sql = (table, cond = '') => `SELECT * FROM
    (SELECT to_char(to_timestamp(created_at / 1000), 'YYYY-MM-DD') AS date,
            sum(count(created_at)) OVER (ORDER BY to_char(to_timestamp(created_at / 1000), 'YYYY-MM-DD')) AS figure
    FROM "${table}"
    ${cond}
    GROUP BY date
    ) AS t
  WHERE extract(epoch FROM to_timestamp(t.date, 'YYYY-MM-DD')) >= ? - 86400;`;
  let rows = (await knex.raw(sql('user'), [Math.round(fromDate / 1000)])).rows;
  let usersCumFigures = rowsToDateFigures(rows, 14, now);
  handleCumulativeDateFigures(usersCumFigures[1]);

  rows =
      (await knex.raw(
        sql('game_session', 'WHERE host_is_winner IS NOT NULL'),
        [Math.round(fromDate / 1000)]
      )).rows;
  let gamesCumFigures = rowsToDateFigures(rows, 14, now);
  handleCumulativeDateFigures(gamesCumFigures[1]);

  let [ongoingGames] = await knex('game_session')
    .select(knex.raw('count(game_session_id) AS cnt'))
    .whereNull('host_is_winner');
  console.log(11111111111, ongoingGames);
  res.render('index', {
    req,
    report_data: {
      dates: usersCumFigures[0],
      users_cum_figures: usersCumFigures[1],
      games_cum_figures: gamesCumFigures[1]
    },
    ongoing_games: parseInt(ongoingGames.cnt, 10)
  });
});

module.exports = router;
