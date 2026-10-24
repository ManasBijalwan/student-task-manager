import { pool } from '../db.js';
import { getAuthSessionCookie, verifyAuthSession } from '../security/authSession.js';

export async function requireAuth(req, res, next) {
  try {
    const token = getAuthSessionCookie(req);
    if (!token) return res.status(401).json({ message: 'Authentication is required.' });
    const session = await verifyAuthSession(token);
    if (!session) return res.status(401).json({ message: 'Your session has expired. Please sign in again.' });
    const result = await pool.query('SELECT id, name, email FROM users WHERE id = $1', [session.id]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ message: 'Your account could not be found.' });
    req.user = { id: user.id, name: user.name, email: user.email };
    next();
  } catch {
    return res.status(500).json({ message: 'Could not verify your account.' });
  }
}
