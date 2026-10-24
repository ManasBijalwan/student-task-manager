import request from 'supertest';
import app from '../src/app.js';
import { pool } from '../src/db.js';
import { validateTask } from '../src/utils/taskValidation.js';
import { nextOccurrenceDate } from '../src/services/recurringTasks.js';

afterAll(async () => {
  await pool.end();
});

describe('API demo checks', () => {
  test('health endpoint responds successfully', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  test('task routes require authentication', async () => {
    const response = await request(app).get('/api/tasks');

    expect(response.status).toBe(401);
    expect(response.body.message).toMatch(/authentication is required/i);
  });

  test('notification routes require authentication', async () => {
    const response = await request(app).get('/api/notifications');

    expect(response.status).toBe(401);
    expect(response.body.message).toMatch(/authentication is required/i);
  });
});

describe('task validation demo checks', () => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

  test('accepts a valid task and applies defaults', () => {
    const result = validateTask({ title: 'Read chapter', subject: 'Cloud Computing' });

    expect(result.error).toBeUndefined();
    expect(result.task).toMatchObject({
      title: 'Read chapter',
      subject: 'Cloud Computing',
      priority: 'medium',
      status: 'pending',
      recurrence: 'none'
    });
  });

  test('rejects unsupported priority values', () => {
    const result = validateTask({ title: 'Read chapter', subject: 'Cloud Computing', priority: 'urgent' });

    expect(result.error).toMatch(/priority must be low, medium, or high/i);
  });

  test('rejects a due time without a due date', () => {
    const result = validateTask({ title: 'Read chapter', subject: 'Cloud Computing', dueTime: '09:30' });

    expect(result.error).toMatch(/due date is required/i);
  });

  test('accepts a due date in the expected YYYY-MM-DD format', () => {
    const result = validateTask({ title: 'Read chapter', subject: 'Cloud Computing', dueDate: today });

    expect(result.error).toBeUndefined();
    expect(result.task.dueDate).toBe(today);
  });

  test('keeps the notification preference on the task payload', () => {
    const result = validateTask({ title: 'Read chapter', subject: 'Cloud Computing', notifyMe: true });

    expect(result.error).toBeUndefined();
    expect(result.task.notifyMe).toBe(true);
  });

  test('trims text fields and normalizes priority and status', () => {
    const result = validateTask({ title: '  Read chapter  ', subject: '  Cloud  ', priority: 'HIGH', status: 'PENDING' });

    expect(result.error).toBeUndefined();
    expect(result.task).toMatchObject({ title: 'Read chapter', subject: 'Cloud', priority: 'high', status: 'pending' });
  });

  test('rejects missing required title and subject', () => {
    expect(validateTask({ title: '   ', subject: 'Cloud' }).error).toMatch(/title/i);
    expect(validateTask({ title: 'Read', subject: '' }).error).toMatch(/subject/i);
  });

  test('rejects invalid time zones and malformed dates', () => {
    expect(validateTask({ title: 'Read', subject: 'Cloud', timeZone: 'Mars/Olympus' }).error).toMatch(/time zone/i);
    expect(validateTask({ title: 'Read', subject: 'Cloud', dueDate: '12/31/2026' }).error).toMatch(/YYYY-MM-DD/i);
  });

  test('requires dates for recurring tasks and validates recurrence end date', () => {
    expect(validateTask({ title: 'Read', subject: 'Cloud', recurrence: 'weekly' }).error).toMatch(/due date is required/i);
    expect(validateTask({ title: 'Read', subject: 'Cloud', dueDate: today, recurrence: 'weekly', recurrenceEndDate: '2020-01-01' }).error).toMatch(/on or after/i);
  });

  test('rejects unsupported task status and recurrence values', () => {
    expect(validateTask({ title: 'Read', subject: 'Cloud', status: 'ongoing' }).error).toMatch(/status must be pending or completed/i);
    expect(validateTask({ title: 'Read', subject: 'Cloud', recurrence: 'hourly' }).error).toMatch(/recurrence must be/i);
  });
});

describe('recurring date calculations', () => {
  test('advances daily and weekly occurrences', () => {
    expect(nextOccurrenceDate('2026-10-20', 'daily')).toBe('2026-10-21');
    expect(nextOccurrenceDate('2026-10-20', 'weekly')).toBe('2026-10-27');
  });

  test('keeps monthly recurrence on the anchor day where possible and clamps short months', () => {
    expect(nextOccurrenceDate('2026-01-31', 'monthly', '2026-01-31')).toBe('2026-02-28');
    expect(nextOccurrenceDate('2026-02-28', 'monthly', '2026-01-31')).toBe('2026-03-31');
  });

  test('handles leap-day yearly recurrence and rejects unknown frequency', () => {
    expect(nextOccurrenceDate('2024-02-29', 'yearly', '2024-02-29')).toBe('2025-02-28');
    expect(nextOccurrenceDate('2026-10-20', 'hourly')).toBeNull();
  });
});
