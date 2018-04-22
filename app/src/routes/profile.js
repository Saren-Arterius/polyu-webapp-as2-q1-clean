import express from 'express';
import md5 from 'md5';

import {knex} from '../common';
import {CONFIG} from '../config';
import {requireAuthOrRedirect, requireUserOrRedirect} from '../utils/auth';
import {handleCumulativeDateFigures, rowsToDateFigures} from '../utils/stats';

const router = express.Router();

router.get('/:user_id', requireUserOrRedirect, async (req, res, next) => {
  let [user] = await knex('user').select().where('user_id', req.params.user_id);
  if (!user) {
    return res.redirect(`${CONFIG.entry_path}/`);
  }
  user.email_md5 = md5(user.email);

  let now = new Date();
  let fromDate = now.getTime() - (15 * 24 * 60 * 60 * 1000);

  let sql = `SELECT * FROM
    (SELECT to_char(to_timestamp(created_at / 1000), 'YYYY-MM-DD') AS date,
            sum(count(host_is_winner)) OVER (ORDER BY to_char(to_timestamp(created_at / 1000), 'YYYY-MM-DD')) AS figure
    FROM game_session
    WHERE (host_user_id = ?
            AND host_is_winner = ?)
      OR (guest_user_id = ?
          AND host_is_winner = ?)
    GROUP BY date
    ) AS t
  WHERE extract(epoch FROM to_timestamp(t.date, 'YYYY-MM-DD')) >= ? - 86400;`;

  let rows =
      (await knex.raw(sql, [
        user.user_id, true, user.user_id, false, Math.round(fromDate / 1000)
      ])).rows;
  let winsCumFigures = rowsToDateFigures(rows, 14, now);
  handleCumulativeDateFigures(winsCumFigures[1]);

  rows = (await knex.raw(sql, [
    user.user_id, false, user.user_id, true, Math.round(fromDate / 1000)
  ])).rows;
  let losesCumFigures = rowsToDateFigures(rows, 14, now);
  handleCumulativeDateFigures(losesCumFigures[1]);

  let kdFigures = [];
  for (let i = 0; i < winsCumFigures[1].length; i++) {
    let total = winsCumFigures[1][i] + losesCumFigures[1][i];
    if (total === 0) {
      kdFigures[i] = 0;
    } else {
      kdFigures[i] = winsCumFigures[1][i] / total;
    }
  }
  let gameRecords =
      await knex('game_session')
      .select('*', 'game_session.created_at AS gs_created_at')
      .join(
        'user',
        function () {
          this.on('game_session.host_user_id', '=', 'user.user_id')
            .orOn('game_session.guest_user_id', '=', 'user.user_id');
        }
      )
      .whereNotNull('host_is_winner')
      .andWhereNot('user_id', user.user_id)
      .andWhere(function () {
        this.where('host_user_id', user.user_id)
          .orWhere('guest_user_id', user.user_id);
      });

  return res.render('profile-view', {
    req,
    user,
    report_data: {
      dates: winsCumFigures[0],
      wins_cum_figures: winsCumFigures[1],
      loses_cum_figures: losesCumFigures[1],
      kd_figures: kdFigures
    },
    game_records: gameRecords
  });
});

router.get('/', requireAuthOrRedirect, async (req, res, next) => {
  res.render('profile-edit', {req, user: req.user});
});

router.post('/', requireAuthOrRedirect, async (req, res, next) => {
  let data = {
    email: req.auth.email,
    username: req.body.username,
    gender: req.body.gender,
    birth_year: parseInt(req.body.birth_year, 10),
    latitude: parseFloat(req.body.latlng.split(',')[0]),
    longitude: parseFloat(req.body.latlng.split(',')[1])
  };
  let errors = [];
  if (!data.username.match(/^[A-Za-z0-9_]{3,20}$/)) {
    errors.push(`Incorrect username format: ${data.username}`);
  }
  if (['MALE', 'FEMALE', 'OTHER'].indexOf(data.gender) === -1) {
    errors.push(`Incorrect gender: ${data.gender}`);
  }
  if (data.birth_year < 1900 || data.birth_year > new Date().getFullYear()) {
    errors.push(`Incorrect birth year: ${data.birth_year}`);
  }
  if (isNaN(data.latitude) || isNaN(data.longitude)) {
    errors.push(`Incorrect geolocation: ${data.latitude},${data.longitude}`);
  }
  console.log(data);
  if (errors.length === 0) {
    try {
      if (req.user) {
        await knex('user').update(data).where('user_id', req.auth.user_id);
      } else {
        data.user_id = req.auth.user_id;
        await knex('user').insert(data).where('user_id', req.auth.user_id);
      }
    } catch (e) {
      console.log(e);
      errors.push(`Username (${data.username}) already in use.`);
    }
  }
  if (errors.length > 0) {
    res.render('profile-edit', {req, errors, user: data});
  } else {
    res.redirect(`${CONFIG.entry_path}/`);
  }
});

module.exports = router;
