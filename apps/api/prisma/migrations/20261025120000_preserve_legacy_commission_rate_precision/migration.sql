-- Preserve the exact validated legacy commission snapshot string instead of
-- truncating it to four decimal places.

ALTER TABLE "OrderItem"
ALTER COLUMN "commissionRate" TYPE TEXT USING "commissionRate"::TEXT;
