// auth.js (ESM)
import jwt from 'jsonwebtoken';

/**
 * Issue a JWT for a user. Not required by server.js if it signs inline,
 * but exported for convenience.
 */
export function issueToken({ id, email }, opts = {}) {
  const secret = process.env.JWT_SECRET || process.env.HBUK_JWT_SECRET;
  if (!secret) throw new Error('JWT secret not configured');
  // 1h default unless overridden
  const expiresIn = opts.expiresIn || '1h';
  return jwt.sign({ sub: String(id), email }, secret, { expiresIn });
}

/**
 * Extract Bearer token from Authorization header.
 */
export function getTokenFromHeader(req) {
  const hdr = req.headers['authorization'] || req.headers['Authorization'];
  if (!hdr) return null;
  const [scheme, token] = String(hdr).split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token.trim();
}

/**
 * Strict auth: 401 if no token, 403 if invalid/expired.
 * Sets req.user = decoded payload on success.
 */
export function authenticateToken(req, res, next) {
  const token = getTokenFromHeader(req);
  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization token' });
  }
  const secret = process.env.JWT_SECRET || process.env.HBUK_JWT_SECRET;
  if (!secret) {
    return res.status(500).json({ error: 'JWT secret not configured' });
  }
  try {
    const decoded = jwt.verify(token, secret);
    req.user = decoded; // contains { sub, email, iat, exp }
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Optional auth: attaches req.user if token is valid; otherwise continues.
 */
export function optionalAuth(req, _res, next) {
  const token = getTokenFromHeader(req);
  if (!token) return next();
  const secret = process.env.JWT_SECRET || process.env.HBUK_JWT_SECRET;
  if (!secret) return next();
  try {
    req.user = jwt.verify(token, secret);
  } catch (_e) {
    // ignore invalid token for optional auth
  }
  next();
} 