/*
# Create office_holidays table for Holiday Control System

1. New Tables
- `office_holidays`
  - `id` (uuid, primary key)
  - `holiday_date` (date, not null) — the date of the holiday in Asia/Kolkata calendar
  - `holiday_name` (text, not null) — human-readable name (e.g. "Janmashtami", "Office Closed")
  - `is_active` (boolean, default true) — soft delete / deactivation
  - `created_by` (uuid, references auth.users) — who created the holiday
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())

2. Constraints
- Unique index on (holiday_date, is_active) WHERE is_active = true — prevents duplicate active holidays for the same date
- Index on holiday_date for fast lookups

3. Security
- RLS enabled on office_holidays
- All authenticated users can SELECT (read) holidays — needed for frontend display
- Only users with role 'master' can INSERT, UPDATE, DELETE — enforced via profile role check
- The primary master (Viraj) is the intended manager

4. Important Notes
- Sundays are NOT stored in this table — they are detected automatically via Asia/Kolkata timezone
- Only manually-added holidays (festivals, special closures) are stored here
- The unique partial index ensures only one active holiday per date
- created_by tracks who added the holiday for audit purposes
*/

CREATE TABLE IF NOT EXISTS office_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date date NOT NULL,
  holiday_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE office_holidays ENABLE ROW LEVEL SECURITY;

-- Unique partial index: only one active holiday per date
CREATE UNIQUE INDEX IF NOT EXISTS office_holidays_unique_active_date
  ON office_holidays (holiday_date)
  WHERE is_active = true;

-- Fast lookup by date
CREATE INDEX IF NOT EXISTS office_holidays_date_idx
  ON office_holidays (holiday_date);

-- All authenticated users can read holidays (needed for frontend display and holiday awareness)
DROP POLICY IF EXISTS "select_office_holidays" ON office_holidays;
CREATE POLICY "select_office_holidays"
  ON office_holidays FOR SELECT
  TO authenticated
  USING (true);

-- Only masters can insert holidays
DROP POLICY IF EXISTS "insert_office_holidays_master" ON office_holidays;
CREATE POLICY "insert_office_holidays_master"
  ON office_holidays FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'master'
    )
  );

-- Only masters can update holidays
DROP POLICY IF EXISTS "update_office_holidays_master" ON office_holidays;
CREATE POLICY "update_office_holidays_master"
  ON office_holidays FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'master'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'master'
    )
  );

-- Only masters can delete holidays
DROP POLICY IF EXISTS "delete_office_holidays_master" ON office_holidays;
CREATE POLICY "delete_office_holidays_master"
  ON office_holidays FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'master'
    )
  );

-- Auto-update updated_at on modification
CREATE OR REPLACE FUNCTION update_office_holidays_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS office_holidays_updated_at ON office_holidays;
CREATE TRIGGER office_holidays_updated_at
  BEFORE UPDATE ON office_holidays
  FOR EACH ROW
  EXECUTE FUNCTION update_office_holidays_updated_at();
