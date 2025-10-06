-- Add delivery_note_no column to deliveries table
ALTER TABLE public.deliveries 
ADD COLUMN delivery_note_no TEXT;