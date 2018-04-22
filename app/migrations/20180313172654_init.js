exports.up = (knex, Promise) => {
  const currentUnixMSRaw = knex.raw("ROUND(EXTRACT(EPOCH FROM NOW() AT TIME ZONE 'UTC') * 1000)");
  const uuidRaw = knex.raw('uuid_generate_v4()');
  return Promise.all([
    knex.schema.createTable('user', (table) => {
      table.string('user_id').primary();
      table.string('username', 20).unique().notNullable();
      table.string('email', 254).unique().notNullable();
      table.enu('gender', ['MALE', 'FEMALE', 'OTHER']);
      table.integer('birth_year').notNullable();
      table.float('latitude', 14, 10).notNullable();
      table.float('longitude', 14, 10).notNullable();
      table.bigInteger('created_at').notNullable().defaultTo(currentUnixMSRaw);
      table.index('created_at');
      table.index('birth_year');
      table.index('gender');
      table.index(['latitude', 'longitude']);
    }),
    knex.schema.createTable('game_session', (table) => {
      table.uuid('game_session_id').primary().defaultTo(uuidRaw);
      table.string('host_user_id').notNullable();
      table.string('guest_user_id');
      table.boolean('host_is_winner');
      table.bigInteger('created_at').notNullable().defaultTo(currentUnixMSRaw);
      table.index('created_at');
      table.index(['host_user_id', 'host_is_winner']);
      table.index(['guest_user_id', 'host_is_winner']);
      table.index(['host_is_winner']);
    })
  ]);
};

exports.down = (knex, Promise) => {
  return Promise.all([
    knex.schema.dropTable('user'),
    knex.schema.dropTable('game_session')
  ]);
};
