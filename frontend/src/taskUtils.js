export function dateKey(value) {
  if (!value) return '';
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(value).slice(0, 10);
}

export function formatTime(value) {
  return value ? String(value).slice(0, 5) : '';
}

export function dueTimestamp(task) {
  if (!task.dueDate) return null;
  const [year, month, day] = dateKey(task.dueDate).split('-').map(Number);
  const [hour, minute] = (task.dueTime ? formatTime(task.dueTime) : '23:59').split(':').map(Number);
  if (![year, month, day, hour, minute].every(Number.isFinite)) return null;

  const timeZone = task.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const target = Date.UTC(year, month - 1, day, hour, minute);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  });

  // Convert the task's wall-clock deadline in its own time zone to a UTC timestamp.
  let timestamp = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(timestamp)).map(({ type, value }) => [type, value]));
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour), Number(parts.minute), Number(parts.second));
    const adjustment = target - represented;
    timestamp += adjustment;
    if (adjustment === 0) break;
  }
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function formatDuration(milliseconds) {
  const minutes = Math.max(1, Math.ceil(milliseconds / 60_000));
  if (minutes <= 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours} ${hours === 1 ? 'hour' : 'hours'}${remainingMinutes ? ` ${remainingMinutes} ${remainingMinutes === 1 ? 'minute' : 'minutes'}` : ''}`;
}

export function remainingLabel(deadline, now = Date.now()) {
  const remaining = deadline - now;
  if (remaining > 0) return `due in ${formatDuration(remaining)}`;
  if (remaining === 0) return 'due now';
  return `overdue by ${formatDuration(-remaining)}`;
}

export function reminderOffsets(priority) {
  if (priority === 'high') return [{ label: '24 hours', ms: 24 * 60 * 60 * 1000 }, { label: '1 hour', ms: 60 * 60 * 1000 }];
  if (priority === 'medium') return [{ label: '12 hours', ms: 12 * 60 * 60 * 1000 }, { label: '1 hour', ms: 60 * 60 * 1000 }];
  return [{ label: '1 hour', ms: 60 * 60 * 1000 }];
}

export function completionStreak(tasks) {
  const completed = tasks.filter((task) => task.status === 'completed' && task.dueDate && task.completedAt)
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
  let streak = 0;
  for (const task of completed) {
    if (!task.completedOnTime) break;
    streak += 1;
  }
  return streak;
}
