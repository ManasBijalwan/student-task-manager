import { pool } from '../db.js';
import { taskSelect } from '../utils/taskValidation.js';

function addDays(dateValue, days) {
  const date = new Date(`${dateValue}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function nextOccurrenceDate(dateValue, recurrence, anchorDate = dateValue) {
  const current = new Date(`${dateValue}T00:00:00Z`);
  const anchor = new Date(`${anchorDate}T00:00:00Z`);
  if (recurrence === 'daily') current.setUTCDate(current.getUTCDate() + 1);
  else if (recurrence === 'weekly') current.setUTCDate(current.getUTCDate() + 7);
  else if (recurrence === 'monthly') {
    const day = anchor.getUTCDate();
    const monthStart = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 1));
    current.setTime(monthStart.getTime());
    current.setUTCDate(Math.min(day, new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 0)).getUTCDate()));
  } else if (recurrence === 'yearly') {
    const month = anchor.getUTCMonth(); const day = anchor.getUTCDate();
    current.setUTCFullYear(current.getUTCFullYear() + 1, month, 1);
    current.setUTCDate(Math.min(day, new Date(Date.UTC(current.getUTCFullYear(), month + 1, 0)).getUTCDate()));
  } else return null;
  return current.toISOString().slice(0, 10);
}

function localToday(timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export async function materializeRecurringOccurrences(db, root) {
  if (!root || root.recurrence === 'none' || !root.dueDate) return;
  const existing = await db.query(
    `SELECT MAX(due_date)::text AS "lastDate" FROM tasks
     WHERE user_id = $1 AND (id = $2 OR recurrence_series_id = $2)`, [root.userId, root.id]
  );
  let date = existing.rows[0].lastDate || root.dueDate;
  const today = localToday(root.timeZone || 'Asia/Kolkata');
  const horizon = addDays(today > root.dueDate ? today : root.dueDate, 90);
  const end = root.recurrenceEndDate && root.recurrenceEndDate < horizon ? root.recurrenceEndDate : horizon;

  const dates = [];
  while ((date = nextOccurrenceDate(date, root.recurrence, root.dueDate)) && date <= end) dates.push(date);
  if (!dates.length) return;

  const inserted = await db.query(
    `INSERT INTO tasks
       (user_id, title, description, subject, priority, status, due_date, due_time, time_zone,
        recurrence, recurrence_end_date, recurrence_series_id, notify_me)
     SELECT $1, $2, $3, $4, $5, 'pending', occurrence_date, $6, $7, $8, $9, $10, $11
     FROM UNNEST($12::date[]) AS dates(occurrence_date)
     RETURNING ${taskSelect()}`,
    [root.userId, root.title, root.description, root.subject, root.priority, root.dueTime,
      root.timeZone, root.recurrence, root.recurrenceEndDate, root.id, root.notifyMe === true, dates]
  );
  await db.query(
    `INSERT INTO task_history (user_id, task_id, task_title, action, new_status, details)
     SELECT $1, created.id, $2, 'recurrence_created', 'pending',
       jsonb_build_object('recurrence', $3::text, 'dueDate', created.due_date::text)
     FROM UNNEST($4::bigint[], $5::date[]) AS created(id, due_date)`,
    [root.userId, root.title, root.recurrence, inserted.rows.map((item) => item.id), inserted.rows.map((item) => item.dueDate)]
  );
}

export async function maintainRecurringHorizon() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const roots = await client.query(
      `SELECT id, user_id AS "userId", title, description, subject, priority, due_date::text AS "dueDate",
        due_time::text AS "dueTime", time_zone AS "timeZone", recurrence,
        recurrence_end_date::text AS "recurrenceEndDate", notify_me AS "notifyMe"
       FROM tasks WHERE recurrence <> 'none' AND recurrence_series_id IS NULL
       FOR UPDATE SKIP LOCKED`
    );
    for (const root of roots.rows) await materializeRecurringOccurrences(client, root);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { await client.release(); }
}
