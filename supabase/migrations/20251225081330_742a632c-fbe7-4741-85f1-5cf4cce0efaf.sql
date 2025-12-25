-- Add exam_date column to profiles table
ALTER TABLE public.profiles
ADD COLUMN exam_date date DEFAULT NULL;