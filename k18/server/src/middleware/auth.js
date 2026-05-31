const jwt = require('jsonwebtoken');
const config = require('../config');

function generateToken(userId, role, name) {
  return jwt.sign(
    { userId, role, name },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwt.secret);
  } catch (err) {
    return null;
  }
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  const decoded = verifyToken(token);

  if (!decoded) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  req.user = decoded;
  next();
}

function socketAuthMiddleware(socket, next) {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication error'));
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return next(new Error('Authentication error'));
  }

  socket.user = decoded;
  next();
}

module.exports = {
  generateToken,
  verifyToken,
  authMiddleware,
  socketAuthMiddleware,
};
