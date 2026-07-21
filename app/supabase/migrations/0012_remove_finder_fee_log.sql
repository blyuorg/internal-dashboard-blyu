-- The finder's-fee pool (10% of remaining profit, section: Pool Split)
-- still exists in the payout formula unchanged, but automatic attribution
-- ("first person to log a lead wins") is removed — the CFO now picks the
-- recipient manually per payout run/export. Nothing writes to this table
-- anymore, so it's dropped rather than left as dead schema.
drop table if exists finder_fee_log;
