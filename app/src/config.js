exports.CONFIG = {
  timezone: {
    postgres: 'Asia/Hong_Kong',
    tzoffset: 8 * 60 * 60 * 1000 // base.pug also
  },
  redis: {
    port: 6379, // Redis port
    host: 'redis', // Redis host
    family: 4, // 4 (IPv4) or 6 (IPv6)
    db: 0
  },
  knex: {
    client: 'pg',
    connection: {
      host: 'postgres',
      user: 'postgres',
      password: 'password',
      database: 'surakarta_game'
    }
  },
  firebase: {
    // REDACTED
  },
  entry_path: '' // Change views/templates/base.pug, public/assets/app/js/config.js as well
};
