import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { taskSelect, validateTask } from '../utils/taskValidation.js';
import { materializeRecurringOccurrences, nextOccurrenceDate } from '../services/recurringTasks.js';

const router = Router();
router.use(requireAuth);

async function writeHistory(db, { userId, taskId, title, action, previousStatus = null, newStatus = null, details = {} }) {
  await db.query(
    `INSERT INTO task_history
      (user_id, task_id, task_title, action, previous_status, new_status, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [userId, taskId, title, action, previousStatus, newStatus, JSON.stringify(details)]
  );
}

router.get('/history', async (req, res, next) => {
  try {
    const [tasks, events] = await Promise.all([
      pool.query(`SELECT ${taskSelect()} FROM tasks WHERE user_id = $1
        ORDER BY due_date ASC NULLS LAST, due_time ASC NULLS LAST, created_at DESC`, [req.user.id]),
      pool.query(`SELECT id, task_id AS "taskId", task_title AS "taskTitle", action,
          previous_status AS "previousStatus", new_status AS "newStatus",
          occurred_at AS "occurredAt", details
        FROM task_history WHERE user_id = $1 ORDER BY occurred_at DESC LIMIT 100`, [req.user.id])
    ]);
    res.json({ tasks: tasks.rows, events: events.rows });
  } catch (error) { next(error); }
});

router.get('/', async (req, res, next) => {
  try {
    const clauses = ['user_id = $1'];
    const values = [req.user.id];
    const add = (sql, value) => { values.push(value); clauses.push(sql.replace('?', `$${values.length}`)); };
    if (req.query.status === 'overdue') clauses.push("status <> 'completed' AND due_date IS NOT NULL AND (due_date + COALESCE(due_time, TIME '23:59:59')) < (NOW() AT TIME ZONE time_zone)");
    else if (req.query.status && ['pending', 'completed'].includes(req.query.status)) add('status = ?', req.query.status);
    if (req.query.priority && ['low', 'medium', 'high'].includes(req.query.priority)) add('priority = ?', req.query.priority);
    if (req.query.subject) add('LOWER(subject) = LOWER(?)', req.query.subject);
    if (req.query.search) {
      values.push(`%${req.query.search}%`, `%${req.query.search}%`);
      clauses.push(`(title ILIKE $${values.length - 1} OR description ILIKE $${values.length})`);
    }
    const order = req.query.sort === 'oldest'
      ? 'due_date ASC NULLS LAST, due_time ASC NULLS LAST, created_at ASC'
      : 'due_date ASC NULLS LAST, due_time ASC NULLS LAST, created_at DESC';
    const result = await pool.query(`SELECT ${taskSelect()} FROM tasks WHERE ${clauses.join(' AND ')} ORDER BY ${order}`, values);
    res.json({ tasks: result.rows });
  } catch (error) { next(error); }
});

router.post('/', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { task, error } = validateTask(req.body);
    if (error) return res.status(400).json({ message: error });
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO tasks
        (user_id, title, description, subject, priority, status, due_date, due_time, time_zone, recurrence, recurrence_end_date, notify_me)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING ${taskSelect()}`,
      [req.user.id, task.title, task.description, task.subject, task.priority, task.status,
        task.dueDate, task.dueTime, task.timeZone, task.recurrence, task.recurrenceEndDate, task.notifyMe]
    );
    const created = result.rows[0];
    await materializeRecurringOccurrences(client, { ...created, userId: req.user.id });
    await writeHistory(client, { userId: req.user.id, taskId: created.id, title: created.title, action: 'created', newStatus: created.status });
    await client.query('COMMIT');
    res.status(201).json({ task: created });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    next(error);
  } finally { await client.release(); }
});

router.put('/:id', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { task, error } = validateTask(req.body);
    if (error) return res.status(400).json({ message: error });
    await client.query('BEGIN');
    const previous = await client.query('SELECT id, status FROM tasks WHERE id = $1 AND user_id = $2 FOR UPDATE', [req.params.id, req.user.id]);
    if (!previous.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Task not found.' });
    }
    await client.query(
      `UPDATE tasks SET title = $1, description = $2, subject = $3, priority = $4,
       due_date = $5::date, due_time = $6, time_zone = $7, recurrence = $8,
       recurrence_end_date = $9, notify_me = $10,
       updated_at = NOW()
       WHERE id = $11 AND user_id = $12`,
      [task.title, task.description, task.subject, task.priority, task.dueDate,
        task.dueTime, task.timeZone, task.recurrence, task.recurrenceEndDate,
        task.notifyMe, req.params.id, req.user.id]
    );
    const result = await client.query(`SELECT ${taskSelect()} FROM tasks WHERE id = $1 AND user_id = $2`, [req.params.id, req.user.id]);
    await writeHistory(client, { userId: req.user.id, taskId: result.rows[0].id, title: result.rows[0].title,
      action: 'updated', previousStatus: previous.rows[0].status, newStatus: result.rows[0].status });
    await client.query('COMMIT');
    res.json({ task: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    next(error);
  } finally { await client.release(); }
});

router.patch('/:id/status', async (req, res, next) => {
  const status = String(req.body.status ?? '').toLowerCase();
  if (!['pending', 'completed'].includes(status)) {
    return res.status(400).json({ message: 'Status must be pending or completed.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(`SELECT *, due_date::text AS recurrence_due_date,
      recurrence_end_date::text AS recurrence_end FROM tasks WHERE id = $1 AND user_id = $2 FOR UPDATE`, [req.params.id, req.user.id]);
    if (!current.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Task not found.' });
    }
    const old = current.rows[0];
    const seriesId = old.recurrence_series_id || old.id;
    const root = await client.query('SELECT id, due_date::text AS "anchorDate" FROM tasks WHERE id = $1 AND user_id = $2 FOR UPDATE', [seriesId, req.user.id]);
    const updated = await client.query(
      `UPDATE tasks SET status = $1::varchar,
       completed_at = CASE WHEN $2::boolean THEN NOW() ELSE NULL END,
       updated_at = NOW() WHERE id = $3 AND user_id = $4 RETURNING ${taskSelect()}`,
      [status, status === 'completed', req.params.id, req.user.id]
    );
    const task = updated.rows[0];
    if (old.status !== status) {
      await writeHistory(client, { userId: req.user.id, taskId: task.id, title: task.title,
        action: 'status_changed', previousStatus: old.status, newStatus: status });
    }
    let nextTask = null;
    if (status === 'completed' && old.status !== 'completed' && old.recurrence !== 'none' && old.recurrence_due_date) {
      const nextDate = nextOccurrenceDate(old.recurrence_due_date, old.recurrence, root.rows[0]?.anchorDate || old.recurrence_due_date);
      if (nextDate && (!old.recurrence_end || nextDate <= old.recurrence_end)) {
        const existing = await client.query(
          `SELECT ${taskSelect()} FROM tasks WHERE user_id = $1 AND due_date = $2::date
           AND (id = $3 OR recurrence_series_id = $3) LIMIT 1`,
          [req.user.id, nextDate, seriesId]
        );
        const created = existing.rowCount ? existing : await client.query(
          `INSERT INTO tasks
            (user_id, title, description, subject, priority, status, due_date, due_time, time_zone,
             recurrence, recurrence_end_date, recurrence_series_id, notify_me)
           VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, $9, $10, COALESCE($11::bigint, $12::bigint), $13)
           RETURNING ${taskSelect()}`,
          [req.user.id, old.title, old.description, old.subject, old.priority, nextDate,
            old.due_time, old.time_zone, old.recurrence, old.recurrence_end_date, old.recurrence_series_id, old.id, old.notify_me]
        );
        nextTask = created.rows[0];
        if (!existing.rowCount) {
          await writeHistory(client, { userId: req.user.id, taskId: nextTask.id, title: nextTask.title,
            action: 'recurrence_created', newStatus: 'pending', details: { recurrence: old.recurrence } });
        }
      }
    }
    await client.query('COMMIT');
    res.json({ task, nextTask });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    next(error);
  } finally { await client.release(); }
});

router.delete('/:id', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query('SELECT id, title, status FROM tasks WHERE id = $1 AND user_id = $2 FOR UPDATE', [req.params.id, req.user.id]);
    if (!existing.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Task not found.' });
    }
    const task = existing.rows[0];
    await writeHistory(client, { userId: req.user.id, taskId: task.id, title: task.title,
      action: 'deleted', previousStatus: task.status });
    await client.query('DELETE FROM tasks WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    await client.query('COMMIT');
    res.status(204).end();
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    next(error);
  } finally { await client.release(); }
});

export default router;
