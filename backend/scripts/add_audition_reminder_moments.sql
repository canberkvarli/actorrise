-- Which of the three reminder emails an audition gets (prep, eve, after).
-- Null means all three, so existing rows keep today's behaviour.
ALTER TABLE auditions ADD COLUMN IF NOT EXISTS reminder_moments JSONB;
