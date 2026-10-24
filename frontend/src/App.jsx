import { useEffect, useMemo, useState } from 'react';
import { request } from './api.js';
import { completionStreak, dateKey, dueTimestamp, formatTime, reminderOffsets, remainingLabel } from './taskUtils.js';

const emptyTask = { title: '', description: '', subject: '', priority: 'medium', dueDate: '', dueTime: '', timeZone: '', recurrence: 'none', recurrenceEndDate: '', notifyMe: true };

function notificationKey(email) {
  return `studyflow-notifications:${email}`;
}

function readLocalJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') || fallback; }
  catch { return fallback; }
}

function writeLocalJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function readLocalNotifications(email) {
  const saved = readLocalJson(notificationKey(email), []);
  return Array.isArray(saved) ? saved : [];
}

function readSavedAuth() {
  try {
    const saved = JSON.parse(sessionStorage.getItem('studyflow-auth') || 'null');
    if (saved?.user && !saved?.credentials) return saved;
  } catch {}
  sessionStorage.removeItem('studyflow-auth');
  return null;
}

function formatDate(value) {
  const key = dateKey(value);
  if (!key) return 'No date';
  const date = new Date(`${key}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 'No date';
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function todayKey() {
  return dateKey(new Date());
}

function statusLabel(task) {
  if (task.overdue && task.status !== 'completed') return 'Overdue';
  return task.status === 'completed' ? 'Completed' : 'Pending';
}

function Auth({ onLogin }) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const change = (event) => setForm({ ...form, [event.target.name]: event.target.value });

  async function submit(event) {
    event.preventDefault(); setError(''); setLoading(true);
    try {
      const data = await request(`/auth/${isRegistering ? 'register' : 'login'}`, { method: 'POST', body: form });
      onLogin(data);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }
  return <main className="auth-page">
    <section className="auth-panel"><p className="eyebrow">STUDENT TASK MANAGER</p><h1>Plan calmly.<br />Finish confidently.</h1><p>One focused place for classes, assignments, projects, and their deadlines.</p></section>
    <section className="auth-card"><h2>{isRegistering ? 'Create your account' : 'Welcome back'}</h2><p className="muted">{isRegistering ? 'Start keeping your academic work in one place.' : 'Sign in to see your study plan.'}</p>
      <form onSubmit={submit}>
        {isRegistering && <label>Name<input name="name" value={form.name} onChange={change} maxLength="80" required autoFocus /></label>}
        <label>Email<input name="email" type="email" value={form.email} onChange={change} required autoFocus={!isRegistering} /></label>
        <label>Password<input name="password" type="password" value={form.password} onChange={change} minLength="8" required /></label>
        {error && <p className="error">{error}</p>}<button className="primary" disabled={loading}>{loading ? 'Please wait...' : isRegistering ? 'Create account' : 'Sign in'}</button>
      </form>
      <button className="link-button" onClick={() => { setIsRegistering(!isRegistering); setError(''); }}>{isRegistering ? 'Already have an account? Sign in' : 'New here? Create an account'}</button>
    </section>
  </main>;
}

function TaskForm({ initialTask, onSave, onCancel }) {
  const [form, setForm] = useState(initialTask ? { ...emptyTask, ...initialTask, notifyMe: initialTask.notifyMe === true, dueTime: formatTime(initialTask.dueTime) } : emptyTask);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (event) => setForm({ ...form, [event.target.name]: event.target.value });
  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    if (!form.title.trim() || !form.subject.trim()) return setError('Title and subject are required.');
    if (form.dueDate && form.dueDate < todayKey()) return setError('Choose today or a future date for the deadline.');
    if (form.recurrenceEndDate && form.dueDate && form.recurrenceEndDate < form.dueDate) return setError('Repeat until must be on or after the deadline date.');
    if (form.dueTime && !form.dueDate) return setError('Choose a deadline date before adding a time.');
    if (form.recurrence !== 'none' && !form.dueDate) return setError('Recurring tasks need a due date.');
    setSaving(true);
    try {
      await onSave({ ...form, title: form.title.trim(), subject: form.subject.trim(), dueTime: form.dueTime || null,
        timeZone: form.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata',
        recurrenceEndDate: form.recurrenceEndDate || null });
    } finally { setSaving(false); }
  }
  return <form className="task-form" onSubmit={submit}>
    <h2>{initialTask ? 'Edit task' : 'Add a task'}</h2>
    <div className="form-grid">
      <label className="wide">Title<input name="title" value={form.title} onChange={set} maxLength="160" required autoFocus /></label>
      <label>Subject<input name="subject" value={form.subject} onChange={set} maxLength="100" required placeholder="e.g. Cloud Computing" /></label>
      <label>Priority<select name="priority" value={form.priority} onChange={set}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label>
      <label>Deadline date<input name="dueDate" type="date" min={todayKey()} value={form.dueDate || ''} onChange={set} /></label>
      <label>Deadline time<input name="dueTime" type="time" value={form.dueTime || ''} onChange={set} /></label>
      <label>Repeat<select name="recurrence" value={form.recurrence || 'none'} onChange={set}><option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></label>
      {form.recurrence !== 'none' && <label>Repeat until (optional)<input name="recurrenceEndDate" type="date" min={form.dueDate || undefined} value={form.recurrenceEndDate || ''} onChange={set} /></label>}
      <label className="notify-option wide"><input type="checkbox" checked={Boolean(form.notifyMe)} onChange={(event) => setForm({ ...form, notifyMe: event.target.checked })} /><span>Notify me about this task<span className="notify-help">{form.priority === 'high' ? 'High priority: 24 hours and 1 hour before the deadline.' : form.priority === 'medium' ? 'Medium priority: 12 hours and 1 hour before the deadline.' : 'Low priority: 1 hour before the deadline.'} Reminders appear in the notification list.</span></span></label>
      <label className="wide">Notes<textarea name="description" value={form.description} onChange={set} rows="3" maxLength="2000" placeholder="Optional details, links, or reminders" /></label>
    </div>
    {error && <p className="error">{error}</p>}<div className="form-actions"><button type="button" className="secondary" onClick={onCancel} disabled={saving}>Cancel</button><button className="primary" disabled={saving}>{saving ? 'Saving…' : initialTask ? 'Save changes' : 'Add task'}</button></div>
  </form>;
}

function Stat({ label, value, tone }) { return <div className={`stat ${tone || ''}`}><span>{label}</span><strong>{value}</strong></div>; }

function NotificationCenter({ notifications, open, onToggle, onMarkRead, onClear }) {
  const unread = notifications.filter((item) => !item.read).length;
  return <div className="notification-center">
    <button className="bell-button" type="button" onClick={onToggle} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} aria-expanded={open}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
      {unread > 0 && <span className="bell-count">{unread > 99 ? '99+' : unread}</span>}
    </button>
    {open && <section className="notification-popover" aria-label="Notifications">
      <div className="notification-heading"><div><h2>Notifications</h2><span>{unread ? `${unread} unread` : 'You’re all caught up'}</span></div><div>{unread > 0 && <button type="button" onClick={onMarkRead}>Mark read</button>}{notifications.length > 0 && <button type="button" className="clear-notifications" onClick={onClear}>Clear</button>}</div></div>
      <p className="notification-note">Priority reminders appear here as they come up.</p>
      {notifications.length ? <ul>{notifications.map((item) => <li className={item.read ? 'read' : 'unread'} key={item.id}>
        <span className={`notification-dot ${item.priority || 'medium'}`} />
        <div><strong>{item.title}</strong><p>{item.message}</p><small>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.createdAt))}</small></div>
      </li>)}</ul> : <p className="notification-empty">Task reminders will appear here while StudyFlow is open.</p>}
    </section>}
  </div>;
}

function TaskCard({ task, onStatusChange, onEdit, onDelete }) {
  return <article className={`task ${task.status === 'completed' ? 'done' : ''}`}>
    <div className="task-copy">
      <div className="task-title-row"><h3>{task.title}</h3><span className={`badge ${task.priority}`}>{task.priority}</span><span className={`status-pill ${task.overdue && task.status !== 'completed' ? 'overdue-pill' : task.status}`}>{statusLabel(task)}</span>{!task.notifyMe && <span className="notify-off-indicator" role="img" aria-label="Notifications off for this task" title="Notifications off for this task"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4M3 3l18 18" /></svg></span>}</div>
      {task.description && <p>{task.description}</p>}
      <div className="task-meta"><span>{task.subject}</span><span className={task.overdue ? 'overdue' : ''}>{task.overdue ? 'Overdue · ' : ''}{formatDate(task.dueDate)}{task.dueTime ? ` at ${formatTime(task.dueTime)}` : ''}</span>{task.recurrence !== 'none' && <span>Repeats {task.recurrence}</span>}</div>
    </div>
    <div className="task-actions"><label className="complete-toggle" title={task.status === 'completed' ? 'Mark as not completed' : 'Mark as completed'}><input type="checkbox" aria-label={`${task.status === 'completed' ? 'Uncomplete' : 'Complete'} ${task.title}`} checked={task.status === 'completed'} onChange={() => onStatusChange(task, task.status === 'completed' ? 'pending' : 'completed')} /><span>{task.status === 'completed' ? 'Completed' : 'Mark done'}</span></label><button onClick={() => onEdit(task)}>Edit</button><button className="danger" onClick={() => onDelete(task)}>Delete</button></div>
  </article>;
}

function recurringOccurrences(tasks, start, end) {
  const occurrences = new Map();
  const sorted = [...tasks].sort((a, b) => dateKey(a.dueDate).localeCompare(dateKey(b.dueDate)));
  const roots = sorted.filter((task) => task.recurrence !== 'none' && (!task.recurrenceSeriesId || Number(task.recurrenceSeriesId) === Number(task.id)));
  for (const root of roots) {
    if (!root.dueDate) continue;
    const anchor = new Date(`${dateKey(root.dueDate)}T00:00:00`);
    const last = root.recurrenceEndDate ? new Date(`${dateKey(root.recurrenceEndDate)}T00:00:00`) : end;
    for (let date = new Date(anchor); date <= end && date <= last; ) {
      if (date >= start) {
        const key = dateKey(date);
        const actual = sorted.find((candidate) => (Number(candidate.id) === Number(root.id) || Number(candidate.recurrenceSeriesId) === Number(root.id)) && dateKey(candidate.dueDate) === key);
        occurrences.set(`${root.id}-${key}`, { ...(actual || root), status: actual?.status || 'pending', overdue: actual?.overdue || false,
          completedAt: actual?.completedAt || null, id: `${root.id}-${key}`, dueDate: key, projected: !actual });
      }
      const next = new Date(date);
      if (root.recurrence === 'daily') next.setDate(next.getDate() + 1);
      else if (root.recurrence === 'weekly') next.setDate(next.getDate() + 7);
      else if (root.recurrence === 'monthly') {
        const dayOfMonth = next.getDate();
        next.setDate(1); next.setMonth(next.getMonth() + 1);
        next.setDate(Math.min(dayOfMonth, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
      } else {
        const monthOfYear = next.getMonth(); const dayOfMonth = next.getDate();
        next.setDate(1); next.setFullYear(next.getFullYear() + 1); next.setMonth(monthOfYear);
        next.setDate(Math.min(dayOfMonth, new Date(next.getFullYear(), monthOfYear + 1, 0).getDate()));
      }
      if (next <= date) break;
      date = next;
    }
  }
  for (const task of sorted) {
    if (task.recurrence === 'none' && task.dueDate) {
      const date = new Date(`${dateKey(task.dueDate)}T00:00:00`);
      if (date >= start && date <= end) occurrences.set(`${task.id}-${dateKey(task.dueDate)}`, { ...task, id: `${task.id}-${dateKey(task.dueDate)}` });
    }
  }
  return [...occurrences.values()];
}

function CalendarView({ tasks }) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay());
    const dayCount = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const weekCount = Math.ceil((first.getDay() + dayCount) / 7);
    return Array.from({ length: weekCount * 7 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
  }, [month]);
  const visibleStart = cells[0];
  const visibleEnd = cells[cells.length - 1];
  const calendarTasks = useMemo(() => recurringOccurrences(tasks, visibleStart, visibleEnd), [tasks, month]);
  const tasksByDate = useMemo(() => calendarTasks.reduce((map, task) => {
    const key = dateKey(task.dueDate);
    if (key) map.set(key, [...(map.get(key) || []), task]);
    return map;
  }, new Map()), [calendarTasks]);
  return <section className="calendar-panel">
    <div className="calendar-heading"><button className="secondary" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>←</button><h2>{new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(month)}</h2><button className="secondary" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>→</button><button className="link-button" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Today</button></div>
    <div className="calendar-grid">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <div className="calendar-weekday" key={day}>{day}</div>)}
      {cells.map((day) => {
        const key = dateKey(day);
        const dayTasks = [...(tasksByDate.get(key) || [])].sort((a, b) => (a.dueTime || '99:99').localeCompare(b.dueTime || '99:99'));
        const visibleTasks = dayTasks.slice(0, 3);
        return <div className={`calendar-day ${day.getMonth() !== month.getMonth() ? 'outside-month' : ''} ${key === todayKey() ? 'today' : ''}`} key={key}>
          <strong><span>{day.getDate()}</span></strong>
          <div className="calendar-day-tasks">{visibleTasks.map((task) => <div className={`calendar-task ${task.overdue ? 'overdue' : task.status}`} key={task.id} title={`${task.title}${task.dueTime ? ` · ${formatTime(task.dueTime)}` : ''}`}><span>{task.dueTime ? `${formatTime(task.dueTime)} ` : ''}{task.title}</span></div>)}
            {dayTasks.length > visibleTasks.length && <span className="calendar-more">+{dayTasks.length - visibleTasks.length} more</span>}
          </div>
        </div>;
      })}
    </div>
  </section>;
}

function Analytics({ tasks }) {
  const completed = tasks.filter((task) => task.status === 'completed').length;
  const overdue = tasks.filter((task) => task.overdue && task.status !== 'completed').length;
  const active = tasks.length - completed;
  const completion = tasks.length ? Math.round(completed / tasks.length * 100) : 0;
  const max = Math.max(tasks.length, 1);
  const priorities = ['high', 'medium', 'low'].map((priority) => ({ priority, count: tasks.filter((task) => task.priority === priority).length }));
  return <section className="analytics-panel"><div className="analytics-heading"><div><h2>Progress analytics</h2><p className="muted">A quick view of your workload and completion.</p></div><strong>{completion}% complete</strong></div>
    <div className="analytics-grid"><div className="chart-card"><h3>Task completion</h3><div className="bar-track" role="img" aria-label={`${completed} completed and ${active} active tasks`}><span className="bar-completed" style={{ width: `${tasks.length ? completed / tasks.length * 100 : 0}%` }} /><span className="bar-active" style={{ width: `${tasks.length ? active / tasks.length * 100 : 0}%` }} /></div><div className="chart-legend"><span><i className="legend-completed" />Completed {completed}</span><span><i className="legend-active" />Active {active}</span><span><i className="legend-overdue" />Overdue {overdue}</span></div></div>
      <div className="chart-card"><h3>Priority breakdown</h3>{priorities.map(({ priority, count }) => <div className="priority-row" key={priority}><span>{priority}</span><div className="priority-track"><i className={`priority-bar ${priority}`} style={{ width: `${count / max * 100}%` }} /></div><strong>{count}</strong></div>)}</div></div>
  </section>;
}

export default function App() {
  const [session, setSession] = useState(readSavedAuth);
  const [tasks, setTasks] = useState([]); const [dashboard, setDashboard] = useState(null); const [historyEvents, setHistoryEvents] = useState([]);
  const [filters, setFilters] = useState({ status: '', priority: '', search: '' });
  const [showForm, setShowForm] = useState(false); const [editing, setEditing] = useState(null); const [error, setError] = useState(''); const [view, setView] = useState('tasks');
  const userEmail = String(session?.user?.email || '').trim().toLowerCase();
  const [notifications, setNotifications] = useState(() => userEmail ? readLocalNotifications(userEmail) : []);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const isAuthenticated = Boolean(session?.user);
  const displayName = String(session?.user?.name || session?.user?.email || 'Student');

  useEffect(() => {
    setNotifications(userEmail ? readLocalNotifications(userEmail) : []);
    setNotificationOpen(false);
  }, [userEmail]);

  async function load() {
    if (!isAuthenticated) return;
    setError('');
    let loadError = '';
    try {
      const response = await request('/notifications');
      const saved = (response.notifications || []).map((item) => ({ ...item, id: item.eventKey }));
      setNotifications(saved);
      writeLocalJson(notificationKey(userEmail), saved);
    } catch (err) { loadError = err.message; }
    try {
      const response = await request('/tasks');
      const rows = Array.isArray(response.tasks) ? response.tasks : [];
      setTasks(rows.map((task) => ({ ...task, notifyMe: task.notifyMe === true })));
    }
    catch (err) { loadError = err.message; }
    try { setDashboard(await request('/dashboard')); }
    catch (err) { loadError ||= err.message; }
    if (view === 'history') {
      try { const response = await request('/tasks/history'); setHistoryEvents(response.events || []); }
      catch (err) { loadError ||= err.message; }
    }
    if (loadError) setError(loadError);
  }
  useEffect(() => { load(); }, [isAuthenticated, view, userEmail]);

  function login(data) {
    const auth = { user: data.user };
    sessionStorage.setItem('studyflow-auth', JSON.stringify(auth));
    setSession(auth);
  }
  function logout() { request('/auth/logout', { method: 'POST' }).catch(() => {}); sessionStorage.removeItem('studyflow-auth'); setSession(null); setTasks([]); setDashboard(null); setHistoryEvents([]); setNotifications([]); }
  function addNotification(notification) {
    const current = readLocalNotifications(userEmail);
    if (current.some((item) => item.id === notification.id)) return;
    const next = [{ ...notification, createdAt: new Date().toISOString(), read: false }, ...current].slice(0, 80);
    if (userEmail) writeLocalJson(notificationKey(userEmail), next);
    setNotifications(next);
    request('/notifications', { method: 'POST', body: {
      eventKey: notification.id,
      taskId: notification.taskId,
      title: notification.title,
      message: notification.message,
      priority: notification.priority
    } }).then(({ notification: saved }) => {
      const persisted = { ...saved, id: saved.eventKey };
      setNotifications((items) => {
        const updated = [persisted, ...items.filter((item) => item.id !== persisted.id)].slice(0, 80);
        if (userEmail) writeLocalJson(notificationKey(userEmail), updated);
        return updated;
      });
    }).catch(() => {});
  }
  function addTaskCreatedNotification(task) {
    const deadline = dueTimestamp(task);
    addNotification({
      id: `created:${task.id}`,
      taskId: task.id,
      title: 'Task added',
      message: `${task.title} was added${deadline ? ` · ${remainingLabel(deadline)}` : ''}.`,
      priority: task.priority
    });
  }
  function markNotificationsRead() {
    const next = notifications.map((item) => ({ ...item, read: true }));
    setNotifications(next);
    if (userEmail) writeLocalJson(notificationKey(userEmail), next);
    request('/notifications/read', { method: 'PATCH' }).catch(() => {});
  }
  function clearNotifications() {
    setNotifications([]);
    if (userEmail) { try { localStorage.removeItem(notificationKey(userEmail)); } catch {} }
    request('/notifications', { method: 'DELETE' }).catch(() => {});
  }

  useEffect(() => {
    if (!userEmail) return undefined;
    const scanReminders = () => {
      const now = Date.now();
      const known = new Set(readLocalNotifications(userEmail).map((item) => item.id));
      for (const task of tasks) {
        if (!task.notifyMe || task.status === 'completed') continue;
        const deadline = dueTimestamp(task);
        if (!deadline) continue;
        if (now >= deadline) {
          const id = `overdue:${task.id}:${deadline}`;
          if (!known.has(id)) {
            known.add(id);
            addNotification({
              id,
              taskId: task.id,
              title: `${task.priority[0].toUpperCase()}${task.priority.slice(1)} priority · overdue`,
              message: `${task.title} is ${remainingLabel(deadline, now)}.`,
              priority: task.priority
            });
          }
          continue;
        }
        for (const offset of reminderOffsets(task.priority)) {
          const thresholdAt = deadline - offset.ms;
          const createdAt = task.createdAt ? new Date(task.createdAt).getTime() : Number.NaN;
          if (now < thresholdAt || now >= deadline || (Number.isFinite(createdAt) && createdAt > thresholdAt)) continue;
          const id = `reminder:${task.id}:${deadline}:${task.priority}:${offset.label}`;
          if (known.has(id)) continue;
          known.add(id);
          addNotification({
            id,
            taskId: task.id,
            title: `${task.priority[0].toUpperCase()}${task.priority.slice(1)} priority reminder`,
            message: `${task.title} is ${remainingLabel(deadline, now)}${task.dueTime ? ` (deadline ${formatTime(task.dueTime)})` : ''}.`,
            priority: task.priority
          });
        }
        if (now >= deadline - 5 * 60_000 && now < deadline) {
          const minute = Math.floor(now / 60_000);
          const id = `last-five:${task.id}:${deadline}:${minute}`;
          if (!known.has(id)) {
            known.add(id);
            addNotification({
              id,
              taskId: task.id,
              title: `${task.priority[0].toUpperCase()}${task.priority.slice(1)} priority · ${now < deadline ? 'due soon' : 'overdue'}`,
              message: `${task.title} is ${remainingLabel(deadline, now)}${task.dueTime ? ` (deadline ${formatTime(task.dueTime)})` : ''}.`,
              priority: task.priority
            });
          }
        }
      }
    };
    scanReminders();
    const timer = window.setInterval(scanReminders, 60_000);
    return () => window.clearInterval(timer);
  }, [tasks, userEmail]);
  async function saveTask(form) {
    try {
      const data = await request(editing ? `/tasks/${editing.id}` : '/tasks', { method: editing ? 'PUT' : 'POST', body: form });
      if (data?.task) {
        const decorated = { ...data.task, notifyMe: data.task.notifyMe === true };
        if (!editing) setTasks((current) => [decorated, ...current]);
        if (!editing && decorated.notifyMe) addTaskCreatedNotification(decorated);
      }
      setShowForm(false); setEditing(null); await load();
    } catch (err) { setError(err.message); }
  }
  async function changeStatus(task, status) {
    try { const result = await request(`/tasks/${task.id}/status`, { method: 'PATCH', body: { status } });
      setTasks((current) => [...current.filter((item) => item.id !== task.id), result.task, ...(result.nextTask ? [result.nextTask] : [])]);
      await load();
    } catch (err) { setError(err.message); }
  }
  async function deleteTask(task) {
    if (!window.confirm(`Delete “${task.title}”?`)) return;
    try { await request(`/tasks/${task.id}`, { method: 'DELETE' }); setTasks((current) => current.filter((item) => item.id !== task.id)); await load(); }
    catch (err) { setError(err.message); }
  }

  function toggleNotifications() {
    if (!notificationOpen) markNotificationsRead();
    setNotificationOpen(!notificationOpen);
  }

  const completedTasks = tasks.filter((task) => task.status === 'completed');
  const visibleTasks = useMemo(() => tasks.filter((task) => {
    if (view === 'completed' ? task.status !== 'completed' : view === 'tasks' && task.status === 'completed') return false;
    if (view === 'tasks' && (filters.status === 'overdue' ? !task.overdue : filters.status && task.status !== filters.status)) return false;
    if (filters.priority && task.priority !== filters.priority) return false;
    if (filters.search && !`${task.title} ${task.description} ${task.subject}`.toLowerCase().includes(filters.search.toLowerCase())) return false;
    return true;
  }), [tasks, filters, view]);
  const stats = dashboard?.stats || { total: tasks.length, pending: 0, completed: 0, overdue: 0, completionRate: 0 };
  const active = tasks.filter((task) => task.status !== 'completed');
  const overdueTasks = active.filter((task) => task.overdue);
  const pendingTasks = active.filter((task) => !task.overdue);
  const streak = completionStreak(tasks);

  if (!session) return <Auth onLogin={login} />;
  return <main className="app-shell">
    <header><div><p className="eyebrow">STUDYFLOW</p><h1>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, {displayName.split(' ')[0]}.</h1><p className="muted">Plan your work, see what’s due, and track your progress.</p></div><div className="header-actions"><div className="streak-counter"><span>On-time streak</span><strong>{streak}</strong><small>tasks completed before deadline</small></div><NotificationCenter notifications={notifications} open={notificationOpen} onToggle={toggleNotifications} onMarkRead={markNotificationsRead} onClear={clearNotifications} /><button className="secondary" onClick={logout}>Sign out</button><button className="primary" onClick={() => { setView('tasks'); setEditing(null); setShowForm(true); }}>+ Add task</button></div></header>
    {error && <p className="error banner">{error}</p>}
    <nav className="view-tabs" aria-label="Task views"><button className={view === 'tasks' ? 'active' : ''} onClick={() => setView('tasks')}>Tasks</button><button className={view === 'completed' ? 'active' : ''} onClick={() => setView('completed')}>Completed</button><button className={view === 'calendar' ? 'active' : ''} onClick={() => setView('calendar')}>Calendar</button><button className={view === 'history' ? 'active' : ''} onClick={() => setView('history')}>History</button></nav>
    {view === 'tasks' && <>
      <section className="stats"><Stat label="All tasks" value={stats.total} /><Stat label="Pending" value={stats.pending} tone="blue" /><Stat label="Completed" value={stats.completed} tone="green" /><Stat label="Overdue" value={stats.overdue} tone="red" /></section>
      <Analytics tasks={tasks} />
      {showForm && <section className="form-panel"><TaskForm key={editing?.id ?? 'new'} initialTask={editing} onSave={saveTask} onCancel={() => { setShowForm(false); setEditing(null); }} /></section>}
      <section className="content-grid"><div className="tasks-panel"><div className="section-heading"><div><h2>Your tasks</h2><p className="muted">{visibleTasks.length} task{visibleTasks.length === 1 ? '' : 's'} shown</p></div></div>
        <div className="filters"><input placeholder="Search tasks" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} /><select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">Any status</option><option value="pending">Pending</option><option value="overdue">Overdue</option></select><select value={filters.priority} onChange={(event) => setFilters({ ...filters, priority: event.target.value })}><option value="">Any priority</option><option value="high">High priority</option><option value="medium">Medium priority</option><option value="low">Low priority</option></select></div>
        <div className="task-list">{visibleTasks.length ? visibleTasks.map((task) => <TaskCard key={task.id} task={task} onStatusChange={changeStatus} onEdit={(item) => { setEditing(item); setShowForm(true); }} onDelete={deleteTask} />) : <div className="empty"><h3>No tasks found</h3><p>Try changing the filters or add your first academic task.</p></div>}</div>
      </div><aside><section className="upcoming"><h2>Coming up</h2>{dashboard?.upcoming?.length ? dashboard.upcoming.slice(0, 3).map((task) => <div className="upcoming-item" key={task.id}><strong>{task.title}</strong><span>{task.subject} · {formatDate(task.dueDate)}{task.dueTime ? ` at ${formatTime(task.dueTime)}` : ''}</span></div>) : <p className="muted">Nothing with an upcoming deadline yet.</p>}</section><section className="tip"><p className="eyebrow">STUDY TIP</p><p>Break bigger assignments into small, actionable tasks. Your progress becomes much easier to see.</p></section></aside></section>
    </>}
    {view === 'completed' && <section className="tasks-panel completed-panel"><div className="section-heading"><div><h2>Completed tasks</h2><p className="muted">{visibleTasks.length} completed task{visibleTasks.length === 1 ? '' : 's'}</p></div></div><div className="filters"><input placeholder="Search completed tasks" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} /><select value={filters.priority} onChange={(event) => setFilters({ ...filters, priority: event.target.value })}><option value="">Any priority</option><option value="high">High priority</option><option value="medium">Medium priority</option><option value="low">Low priority</option></select></div><div className="task-list">{visibleTasks.length ? visibleTasks.map((task) => <TaskCard key={task.id} task={task} onStatusChange={changeStatus} onEdit={(item) => { setEditing(item); setView('tasks'); setShowForm(true); }} onDelete={deleteTask} />) : <div className="empty"><h3>No completed tasks</h3><p>Mark a task complete and it will appear here.</p></div>}</div></section>}
    {view === 'calendar' && <CalendarView tasks={tasks} />}
    {view === 'history' && <section className="history-layout">
      <div className="history-statuses">
        {[['Overdue', overdueTasks, 'red'], ['Pending', pendingTasks, 'blue'], ['Completed', completedTasks, 'green']].map(([label, group, tone]) => <section className="history-group" key={label}><h2>{label}<span className={`count ${tone}`}>{group.length}</span></h2>{group.length ? group.map((task) => <TaskCard key={task.id} task={task} onStatusChange={changeStatus} onEdit={(item) => { setEditing(item); setShowForm(true); setView('tasks'); }} onDelete={deleteTask} />) : <p className="muted">No {label.toLowerCase()} tasks.</p>}</section>)}
      </div>
      <section className="history-events"><h2>Recent activity</h2>{historyEvents.length ? historyEvents.map((event) => <article className="history-event" key={event.id}><span className="event-dot" /><div><strong>{event.taskTitle}</strong><p>{event.action.replaceAll('_', ' ')}{event.previousStatus || event.newStatus ? ` · ${event.previousStatus || 'new'} → ${event.newStatus || 'removed'}` : ''}</p><time>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.occurredAt))}</time></div></article>) : <p className="muted">Task changes will appear here.</p>}</section>
    </section>}
  </main>;
}
