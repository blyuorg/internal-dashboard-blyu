-- Manual hour entry ("Log hours" on Team/CTO dashboards) had zero
-- validation — someone could type any number and it would feed straight
-- into the CFO's payout calculations. This bounds every time_logs row
-- (manual or timer-generated) to a plausible single-entry range: more than
-- zero (a session that rounds to 0.00h recorded nothing real) and at most
-- 16 hours (longer than that in one sitting isn't credible for one entry).
alter table time_logs add constraint time_logs_hours_bounds
  check (hours > 0 and hours <= 16);
