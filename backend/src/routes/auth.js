import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/register', async (req, res, next) => {
  try {
    const name = String(req.body.name ?? '').trim();
    const email = String(req.body.email ?? '').trim().toLowerCase();
    const password = String(req.body.password ?? '');
    if (!name || name.length > 80 || !emailPattern.test(email) || password.length < 8) {
      return res.status(400).json({ message: 'Enter a name, valid email, and password of at least 8 characters.' });
    }
    // const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email',
      [name, email, password]
    );
    const user = result.rows[0];
    res.status(201).json({ user });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ message: 'An account with that email already exists.' });
    next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body.email ?? '').trim().toLowerCase();
    const password = String(req.body.password ?? '');
    const result = await pool.query('SELECT id, name, email, password_hash FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ message: 'Email or password is incorrect.' });
    }
    res.json({ user: { id: user.id, name: user.name, email: user.email } });
  } catch (error) { next(error); }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query('SELECT id, name, email FROM users WHERE id = $1', [req.user.id]);
    if (!result.rowCount) return res.status(404).json({ message: 'User not found.' });
    res.json({ user: result.rows[0] });
  } catch (error) { next(error); }
});

export default router;
