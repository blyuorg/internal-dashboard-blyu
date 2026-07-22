-- Global editable task table: adds a 'cancelled' status (soft-delete —
-- keeps the never-hard-delete rule intact for tasks the same way it already
-- applies to projects/payouts) and two new capability flags the CEO can
-- grant independently: can_view_tasks (read-only) and can_edit_tasks
-- (reassign/status/estimate/deadline/cancel).
alter type task_status add value 'cancelled';
