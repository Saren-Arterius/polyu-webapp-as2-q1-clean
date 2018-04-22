import {knex} from '../common';

export const getRankings = async (whereUserID, whereFilterCond = '') => {
  let whereStmt = whereUserID ? 'WHERE user_id = ? LIMIT 1' : '';
  let sql = `
    SELECT * FROM (
      SELECT 
        row_number() OVER () AS rank, 
        * 
      FROM (
        SELECT 
          *, 
          wins * 2 - loses AS score 
        FROM (
          SELECT 
            user_id, 
            username, 
            "user".created_at, 
            count(game_session_id) FILTER (WHERE (host_user_id = "user".user_id) = host_is_winner) AS wins,
            count(game_session_id) FILTER (WHERE (guest_user_id = "user".user_id) = host_is_winner) AS loses,
            max(game_session.created_at) AS last_played
          FROM "user" 
          JOIN game_session 
            ON (host_user_id = "user".user_id) OR (guest_user_id = "user".user_id)
          ${whereFilterCond}
          GROUP BY user_id
        ) AS t
        ORDER BY score DESC, created_at DESC
      ) AS t1
    ) AS t2
    ${whereStmt}
  `;
  let rows;
  if (whereUserID) {
    rows = (await knex.raw(sql, [whereUserID])).rows;
  } else {
    rows = (await knex.raw(sql)).rows;
  }
  return rows;
};

export const getCurrentGameSession = async (whereUserID) => {
  let [sess] = await knex('game_session')
    .where(function () {
      this.where('host_user_id', whereUserID)
        .orWhere('guest_user_id', whereUserID);
    })
    .andWhere(function () {
      this.whereNull('host_is_winner');
    });
  return sess;
};

