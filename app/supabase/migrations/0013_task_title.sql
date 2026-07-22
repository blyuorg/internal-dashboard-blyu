-- Tasks never had their own name — only a project reference and a loose
-- free-text role_tag. Every task-picker in the UI (timer, delivery
-- pipeline, my tasks) fell back to showing the *project* name, so multiple
-- tasks on the same project were indistinguishable. Adds a real title.
alter table tasks add column title text;

-- Backfill existing rows so the NOT NULL constraint below doesn't fail —
-- best-effort from role_tag, otherwise a generic placeholder.
update tasks set title = coalesce(nullif(role_tag, ''), 'Untitled task') where title is null;

alter table tasks alter column title set not null;
alter table tasks add constraint tasks_title_not_blank check (length(trim(title)) > 0);
