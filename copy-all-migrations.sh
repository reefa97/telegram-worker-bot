#!/bin/bash

# One-command migration helper
# This script outputs all migrations ready to copy-paste into Supabase SQL Editor

echo "═══════════════════════════════════════════════════════════════"
echo "🚀 TELEGRAM WORKER TRACKING SYSTEM - DATABASE MIGRATIONS"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "📋 Instructions:"
echo "1. Open Supabase SQL Editor:"
echo "   https://supabase.com/dashboard/project/mxjfqszjpnlmagsikqfk/sql"
echo "2. Copy EVERYTHING between the --- markers below"
echo "3. Paste into SQL Editor and click RUN"
echo "4. Done! All 4 migrations will be applied at once!"
echo""
echo "═══════════════════════════════════════════════════════════════"
echo "START COPYING FROM BELOW THIS LINE"
echo "-------------------------------------------------------------------"
echo ""

cd "/Users/fridman/Desktop/Bot Telegram Work"

# Output all migrations in one go
cat supabase/migrations/20240101000000_initial_schema.sql
echo ""
echo "-- ============================================"
echo "-- MIGRATION 2: Security Functions"
echo "-- ============================================"
echo ""
cat supabase/migrations/20240101000001_security_functions.sql
echo ""
echo "-- ============================================"
echo "-- MIGRATION 3: RLS Policies"
echo "-- ============================================"
echo ""
cat supabase/migrations/20240101000002_rls_policies.sql
echo ""
echo "-- ============================================"
echo "-- MIGRATION 4: Indexes"
echo "-- ============================================"
echo ""
cat supabase/migrations/20240101000003_indexes.sql

echo ""
echo "-------------------------------------------------------------------"
echo "STOP COPYING ABOVE THIS LINE"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "✅ After running in Supabase SQL Editor:"
echo "   1. Refresh http://localhost:5173"
echo "   2. Login: reefa@reefa.pl / 42fundyk"
echo "   3. You're now Super Admin!"
echo ""
