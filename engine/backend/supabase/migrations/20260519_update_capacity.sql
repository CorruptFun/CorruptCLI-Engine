-- Update default capacity for classes table
ALTER TABLE public.classes ALTER COLUMN capacity SET DEFAULT 6;

-- Update existing classes to 6
UPDATE public.classes SET capacity = 6;
