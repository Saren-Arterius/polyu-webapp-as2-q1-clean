import md5 from 'md5';
import {CONFIG} from '../config';
import {
  firebaseInstance,
  knex
} from '../common';

export const requireAuthOrRedirect = (req, res, next) => {
  if (!req.auth) {
    return res.redirect(`${CONFIG.entry_path}/login`);
  }
  return next();
};

export const requireUserOrRedirect = async (req, res, next) => {
  if (!req.auth) {
    return next();
  }
  if (!req.user) {
    return res.redirect(`${CONFIG.entry_path}/profile`);
  }
  return next();
};

export const injectAuthUser = async (obj, token) => {
  try {
    obj.auth = await firebaseInstance.auth().verifyIdToken(token);
    obj.auth.email_md5 = md5(obj.auth.email);
    [obj.user] = (await knex('user').select().where('user_id', obj.auth.user_id));
  } catch (e) {
    obj.auth = null;
    obj.user = null;
  }
};
