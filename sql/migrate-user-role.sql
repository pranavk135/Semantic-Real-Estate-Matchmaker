-- Run this statement once on an existing database, then run the UPDATE below separately.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'USER';
