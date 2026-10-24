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
  const timestamp = new Date(`${dateKey(task.dueDate)}T${task.dueTime ? formatTime(task.dueTime) : '23:59'}:00`).getTime();
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
