-- The CEO's final sign-off queue (section 5.2) approves/kicks back deliverables
-- that already cleared the CTO review gate. The original review-gate policy
-- only granted deliverables UPDATE to the CTO; add CEO (and is_admin_ceo).
create policy "deliverables_ceo_signoff" on deliverables
  for update using (auth_is_ceo());
