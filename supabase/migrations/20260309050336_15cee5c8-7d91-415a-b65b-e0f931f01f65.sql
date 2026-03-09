-- Add demo_access to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'demo_access';