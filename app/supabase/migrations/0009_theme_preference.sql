-- Adds a third theme option (pink, just for fun) alongside light/dark.
-- dark_mode (boolean) stays for backward compatibility with anything still
-- reading it directly; theme (text) is the new source of truth going forward.
alter table user_preferences add column theme text not null default 'light';
alter table user_preferences add constraint user_preferences_theme_check
  check (theme in ('light', 'dark', 'pink'));

update user_preferences set theme = case when dark_mode then 'dark' else 'light' end;
