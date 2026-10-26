export async function writeTaskCreatedNotifications(db, userId, tasks) {
  const notifiable = tasks.filter((task) => task.notifyMe === true);
  if (!notifiable.length) return;

  await db.query(
    `INSERT INTO task_notifications (user_id, task_id, event_key, title, message, priority)
     SELECT $1, task.id, 'created:' || task.id::text, 'Task added',
       task.title || CASE WHEN task.due_date IS NULL THEN ' was added.'
         ELSE ' is scheduled for ' || task.due_date::text || '.' END, task.priority
     FROM UNNEST($2::bigint[]) AS created(task_id)
     JOIN tasks AS task ON task.id = created.task_id AND task.user_id = $1
     ON CONFLICT (user_id, event_key) DO NOTHING`,
    [userId, notifiable.map((task) => task.id)]
  );
}
