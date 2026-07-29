const JWTUtils = require('../utils/jwtUtils');
const { ROLES } = require('../constants');
const asyncHandler = require('../utils/asyncHandler');

const adminMiddleware = asyncHandler(async (_req, _res, next) => {
  const user = await JWTUtils.verifyUserFromHeader(_req, ROLES.ADMIN);
  _req.user = user;
  next();
});

module.exports = adminMiddleware;
