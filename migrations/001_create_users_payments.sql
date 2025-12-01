-- Migration: create users and payments tables for Betrix bot
-- Run this with your preferred migration tool or psql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  user_id BIGINT PRIMARY KEY,
  uuid UUID NOT NULL DEFAULT gen_random_uuid(),
  full_name TEXT,
  msisdn TEXT,
  age INT,
  country TEXT,
  preferred_teams TEXT[],
  status TEXT NOT NULL DEFAULT 'trial', -- trial | active | banned
  tier TEXT NOT NULL DEFAULT 'free', -- free | paid
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT REFERENCES users(user_id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'KES',
  method TEXT NOT NULL DEFAULT 'mpesa',
  tx_ref TEXT, -- client reference
  tx_id TEXT,  -- provider transaction id
  status TEXT NOT NULL DEFAULT 'pending', -- pending | success | failed
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
