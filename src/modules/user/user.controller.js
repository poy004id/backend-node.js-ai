'use strict';

const userService = require('./user.service');

async function getMe(req, res, next) {
  try {
    const profile = await userService.getMyProfile(req.user.user_id);
    return res.status(200).json(profile);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getMe,
};

