const JWTUtils = require('../utils/jwtUtils');
const { AppError } = require('../errors/AppError');
const asyncHandler = require('../utils/asyncHandler');

const authMiddleware = asyncHandler(async (req, _res, next) => {
  try {
    const user = await JWTUtils.verifyUserFromHeader(req);
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
});

module.exports = authMiddleware;
