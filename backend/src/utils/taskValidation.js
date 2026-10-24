const priorities = new Set(['low', 'medium', 'high']);
const statuses = new Set(['pending', 'completed']);
const recurrences = new Set(['none', 'daily', 'weekly', 'monthly', 'yearly']);

export function validateTask(payload) {
  const task = {
    title: String(payload.title ?? '').trim(),
    description: String(payload.description ?? '').trim(),
    subject: String(payload.subject ?? '').trim(),
    priority: String(payload.priority ?? 'medium').toLowerCase(),
    status: String(payload.status ?? 'pending').toLowerCase(),
    dueDate: payload.dueDate || null,
    dueTime: payload.dueTime || null,
    timeZone: String(payload.timeZone || 'Asia/Kolkata'),
    recurrence: String(payload.recurrence ?? 'none').toLowerCase(),
    recurrenceEndDate: payload.recurrenceEndDate || null,
    notifyMe: payload.notifyMe === true
  };

  if (!task.title || task.title.length > 160) return { error: 'A title of up to 160 characters is required.' };
  if (!task.subject || task.subject.length > 100) return { error: 'A subject of up to 100 characters is required.' };
  if (!priorities.has(task.priority)) return { error: 'Priority must be low, medium, or high.' };
  if (!statuses.has(task.status)) return { error: 'Status must be pending or completed.' };
  if (task.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(task.dueDate)) return { error: 'Due date must use YYYY-MM-DD.' };
  if (task.dueTime && !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(task.dueTime)) return { error: 'Due time must use 24-hour HH:MM format.' };
  if (task.dueTime && !task.dueDate) return { error: 'A due date is required when a due time is set.' };
  try { new Intl.DateTimeFormat('en-US', { timeZone: task.timeZone }); }
  catch { return { error: 'A valid time zone is required.' }; }
  if (task.dueDate) {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: task.timeZone }).format(new Date());
    if (task.dueDate < today) return { error: 'Choose today or a future date for the deadline.' };
  }
  if (!recurrences.has(task.recurrence)) return { error: 'Recurrence must be none, daily, weekly, monthly, or yearly.' };
  if (task.recurrence !== 'none' && !task.dueDate) return { error: 'A due date is required for recurring tasks.' };
  if (task.recurrenceEndDate && !/^\d{4}-\d{2}-\d{2}$/.test(task.recurrenceEndDate)) return { error: 'Recurrence end date must use YYYY-MM-DD.' };
  if (task.recurrenceEndDate && task.dueDate && task.recurrenceEndDate < task.dueDate) return { error: 'Recurrence end date must be on or after the due date.' };
  return { task };
}

export function taskSelect() {
  return `
    id, title, description, subject, priority, status, due_date::text AS "dueDate",
    due_time::text AS "dueTime", time_zone AS "timeZone", recurrence, recurrence_end_date::text AS "recurrenceEndDate",
    recurrence_series_id AS "recurrenceSeriesId", notify_me AS "notifyMe", completed_at AS "completedAt",
    created_at AS "createdAt", updated_at AS "updatedAt",
    CASE WHEN status = 'completed' AND completed_at IS NOT NULL AND due_date IS NOT NULL
      THEN completed_at <= ((due_date + COALESCE(due_time, TIME '23:59:59')) AT TIME ZONE time_zone)
      ELSE false END AS "completedOnTime",
    CASE WHEN status <> 'completed' AND due_date IS NOT NULL
      AND (due_date + COALESCE(due_time, TIME '23:59:59')) < (NOW() AT TIME ZONE time_zone)
      THEN true ELSE false END AS overdue
  `;
}
