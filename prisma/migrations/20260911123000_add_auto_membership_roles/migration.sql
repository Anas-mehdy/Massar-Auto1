-- Automotive workshop team roles.
-- This migration belongs to the independent Massar Auto database only.
ALTER TYPE "MembershipRole" ADD VALUE IF NOT EXISTS 'RECEPTIONIST';
ALTER TYPE "MembershipRole" ADD VALUE IF NOT EXISTS 'WAREHOUSE';
ALTER TYPE "MembershipRole" ADD VALUE IF NOT EXISTS 'FINANCE';
