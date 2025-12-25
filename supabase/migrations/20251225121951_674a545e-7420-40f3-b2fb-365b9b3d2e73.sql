-- Add difficulty column to subjects table
ALTER TABLE public.subjects 
ADD COLUMN difficulty text DEFAULT 'medium' CHECK (difficulty IN ('strong', 'medium', 'weak'));