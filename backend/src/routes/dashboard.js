import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { taskSelect } from '../utils/taskValidation.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const [metrics, upcoming] = await Promise.all([
      pool.query(`
        SELECT COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
          COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
          COUNT(*) FILTER (WHERE status <> 'completed' AND due_date IS NOT NULL
            AND (due_date + COALESCE(due_time, TIME '23:59:59')) < (NOW() AT TIME ZONE time_zone))::int AS overdue
        FROM tasks WHERE user_id = $1`, [req.user.id]),
      pool.query(`SELECT ${taskSelect()} FROM tasks
        WHERE user_id = $1 AND status <> 'completed' AND due_date IS NOT NULL
          AND (due_date + COALESCE(due_time, TIME '23:59:59')) >= (NOW() AT TIME ZONE time_zone)
        ORDER BY due_date ASC, due_time ASC NULLS LAST LIMIT 3`, [req.user.id])
    ]);
    const stats = metrics.rows[0];
    const total = Number(stats.total);
    res.json({
      stats: { ...stats, completionRate: total ? Math.round((Number(stats.completed) / total) * 100) : 0 },
      upcoming: upcoming.rows
    });
  } catch (error) { next(error); }
});

export default router;
