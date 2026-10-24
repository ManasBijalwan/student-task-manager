import { describe, expect, test } from '@jest/globals';
import { completionStreak, dateKey, dueTimestamp, formatTime, reminderOffsets, remainingLabel } from '../src/taskUtils.js';

describe('frontend task date and time helpers', () => {
  test('normalizes date strings and local Date values', () => {
    expect(dateKey('2026-10-22T09:30:00.000Z')).toBe('2026-10-22');
    expect(dateKey(new Date(2026, 9, 22))).toBe('2026-10-22');
    expect(dateKey(null)).toBe('');
  });

  test('formats database time values and computes a due timestamp', () => {
    expect(formatTime('09:30:00')).toBe('09:30');
    expect(dueTimestamp({ dueDate: '2026-10-22', dueTime: '09:30:00' })).toBe(new Date('2026-10-22T09:30:00').getTime());
    expect(dueTimestamp({ dueDate: null })).toBeNull();
  });
});

describe('frontend reminder rules', () => {
  test.each([
    ['high', ['24 hours', '1 hour']],
    ['medium', ['12 hours', '1 hour']],
    ['low', ['1 hour']]
  ])('uses the expected threshold set for %s priority', (priority, expected) => {
    expect(reminderOffsets(priority).map((offset) => offset.label)).toEqual(expected);
  });

  test('shows remaining time and overdue time at minute precision under one hour', () => {
    const now = 1_000_000;
    expect(remainingLabel(now + 4 * 60_000, now)).toBe('due in 4 minutes');
    expect(remainingLabel(now + 62 * 60_000, now)).toBe('due in 1 hour 2 minutes');
    expect(remainingLabel(now - 60_000, now)).toBe('overdue by 1 minute');
    expect(remainingLabel(now, now)).toBe('due now');
  });
});

describe('on-time completion streak', () => {
  const completed = (id, completedOnTime, completedAt) => ({ id, status: 'completed', dueDate: '2026-10-22', completedAt, completedOnTime });

  test('counts consecutive most recent on-time completions', () => {
    expect(completionStreak([
      completed(1, true, '2026-10-20T10:00:00Z'),
      completed(2, true, '2026-10-21T10:00:00Z'),
      completed(3, false, '2026-10-22T10:00:00Z')
    ])).toBe(0);
    expect(completionStreak([
      completed(1, true, '2026-10-20T10:00:00Z'),
      completed(2, true, '2026-10-21T10:00:00Z')
    ])).toBe(2);
  });

  test('ignores tasks without completion dates and returns zero for no completions', () => {
    expect(completionStreak([{ status: 'pending', dueDate: '2026-10-22' }])).toBe(0);
    expect(completionStreak([{ status: 'completed', dueDate: '2026-10-22' }])).toBe(0);
  });
});
