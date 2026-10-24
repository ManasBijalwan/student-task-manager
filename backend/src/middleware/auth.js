import bcrypt from 'bcryptjs';
import { pool } from '../db.js';

export async function requireAuth(req, res, next) {
  const authorization = req.headers.authorization || '';
  const match = authorization.match(/^Basic\s+(.+)$/i);
  if (!match) {
    return res.status(401).json({ message: 'Authentication is required.' });
  }

  try {
    const decoded = Buffer.from(match[1], 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator < 1) return res.status(401).json({ message: 'Email or password is incorrect.' });
    const email = decoded.slice(0, separator).trim().toLowerCase();
    const password = decoded.slice(separator + 1);
    const result = await pool.query(
      'SELECT id, name, email, password_hash FROM users WHERE email = $1',
      [email]
    );
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ message: 'Email or password is incorrect.' });
    }
    req.user = { id: user.id, name: user.name, email: user.email };
    next();
  } catch {
    return res.status(500).json({ message: 'Could not verify your account.' });
  }
}
