import cors from 'cors';
import express from 'express';
import authRoutes from './routes/auth.js';
import taskRoutes from './routes/tasks.js';
import dashboardRoutes from './routes/dashboard.js';
import notificationRoutes from './routes/notifications.js';

export const app = express();

let clientOrigin = process.env.CLIENT_URL || 'http://localhost:5173';

export function configureClientOrigin(origin) {
  if (origin) clientOrigin = origin;
}

app.use(cors({
  origin: (origin, callback) => callback(null, !origin || origin === clientOrigin),
  credentials: true
}));
app.use(express.json({ limit: '100kb' }));
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/notifications', notificationRoutes);
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({
    message: process.env.NODE_ENV === 'production'
      ? 'Something went wrong. Please try again.'
      : `Request failed: ${err.message}`
  });
});

export default app;
