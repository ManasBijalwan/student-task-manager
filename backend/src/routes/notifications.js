import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, event_key AS "eventKey", task_id AS "taskId", title, message,
        priority, is_read AS read, created_at AS "createdAt"
       FROM task_notifications WHERE user_id = $1
       ORDER BY created_at DESC, id DESC LIMIT 100`,
      [req.user.id]
    );
    res.json({ notifications: result.rows });
  } catch (error) { next(error); }
});

router.post('/', async (req, res, next) => {
  const eventKey = String(req.body.eventKey ?? '').trim();
  const title = String(req.body.title ?? '').trim();
  const message = String(req.body.message ?? '').trim();
  const priority = String(req.body.priority ?? 'medium').toLowerCase();
  const taskId = req.body.taskId && /^\d+$/.test(String(req.body.taskId)) ? String(req.body.taskId) : null;
  if (!eventKey || eventKey.length > 240 || !title || title.length > 160 || !message || message.length > 1000 || !['low', 'medium', 'high'].includes(priority)) {
    return res.status(400).json({ message: 'A valid notification event key, title, message, and priority are required.' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO task_notifications (user_id, task_id, event_key, title, message, priority)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, event_key) DO UPDATE SET event_key = EXCLUDED.event_key
       RETURNING id, event_key AS "eventKey", task_id AS "taskId", title, message,
         priority, is_read AS read, created_at AS "createdAt"`,
      [req.user.id, taskId, eventKey, title, message, priority]
    );
    res.status(201).json({ notification: result.rows[0] });
  } catch (error) { next(error); }
});

router.patch('/read', async (req, res, next) => {
  try {
    await pool.query('UPDATE task_notifications SET is_read = true WHERE user_id = $1 AND is_read = false', [req.user.id]);
    res.json({ ok: true });
  } catch (error) { next(error); }
});

router.delete('/', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM task_notifications WHERE user_id = $1', [req.user.id]);
    res.status(204).end();
  } catch (error) { next(error); }
});

export default router;
