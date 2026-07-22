-- "Submit for review" required a deliverable link with no alternative.
-- Some tasks genuinely have no link to share (an in-person deliverable, a
-- decision made verbally, etc.) — allow submitting with a note instead,
-- as long as at least one of the two is present.
alter table deliverables alter column link drop not null;
alter table deliverables add column note text;

alter table deliverables add constraint deliverables_link_or_note_required
  check (
    (link is not null and length(trim(link)) > 0)
    or (note is not null and length(trim(note)) > 0)
  );
