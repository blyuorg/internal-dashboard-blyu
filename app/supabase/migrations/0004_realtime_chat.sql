-- Live chat (section 5.1) needs Postgres change events streamed to clients.
alter publication supabase_realtime add table chat_messages;
