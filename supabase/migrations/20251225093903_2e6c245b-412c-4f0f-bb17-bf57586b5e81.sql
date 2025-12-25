-- Add require_quiz column to study_tasks table
ALTER TABLE public.study_tasks 
ADD COLUMN require_quiz boolean DEFAULT false;