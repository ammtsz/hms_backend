#!/bin/bash

# Railway Database Reset Script
# This script resets the Railway PostgreSQL database and reinitializes it
# Usage: ./reset-railway-database.sh

set -e  # Exit on error

echo "🔄 Railway Database Reset Script"
echo "================================="
echo ""

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI is not installed"
    echo "Install it with: npm install -g @railway/cli"
    echo "Then run: railway login"
    exit 1
fi

# Check if psql is installed
if ! command -v psql &> /dev/null; then
    echo "❌ PostgreSQL client (psql) is not installed"
    echo "Install it with: brew install postgresql"
    exit 1
fi

# Check if railway-init.sql exists
if [ ! -f "railway-init.sql" ]; then
    echo "❌ railway-init.sql not found in current directory"
    echo "Please run this script from the backend project root"
    exit 1
fi

echo "✅ Prerequisites checked"
echo ""

# Get Railway database URL
echo "📡 Getting Railway database connection..."

# Try to load from .env.local first
if [ -f ".env.local" ]; then
    echo "   Loading from .env.local..."
    export $(grep -v '^#' .env.local | xargs)
    DATABASE_URL=$DATABASE_PUBLIC_URL
fi

# If not found in .env.local, try Railway CLI
if [ -z "$DATABASE_URL" ]; then
    echo "   Trying Railway CLI..."
    DATABASE_URL=$(railway variables --service Postgres 2>/dev/null | grep DATABASE_PUBLIC_URL | awk -F= '{print $2}' | tr -d ' ')
fi

# If still not found, error out
if [ -z "$DATABASE_URL" ]; then
    echo "❌ Could not get DATABASE_PUBLIC_URL"
    echo ""
    echo "Options:"
    echo "1. Create a .env.local file with DATABASE_PUBLIC_URL=your_url"
    echo "2. Link to Railway project with: railway link"
    exit 1
fi

echo "✅ Connected to Railway database"
echo ""

# Confirm with user
echo "⚠️  WARNING: This will DELETE ALL DATA in your Railway database!"
echo ""
echo "Database: $(echo $DATABASE_URL | sed 's/postgresql:\/\/postgres:.*@/postgresql:\/\/postgres:***@/')"
echo ""
read -p "Are you sure you want to continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "❌ Reset cancelled"
    exit 0
fi

echo ""
echo "🗑️  Dropping existing schema..."
psql "$DATABASE_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" 2>&1 | grep -v "NOTICE" || true

echo "✅ Schema dropped and recreated"
echo ""

echo "🚀 Initializing database with railway-init.sql..."
psql "$DATABASE_URL" -f railway-init.sql 2>&1 | grep -E "(CREATE|INSERT|ERROR)" || true

echo ""
echo "✅ Database initialized"
echo ""

# Verify tables created
echo "🔍 Verifying tables created..."
TABLE_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';")

echo "✅ Found $TABLE_COUNT tables"
echo ""

# List all tables
echo "📋 Tables in database:"
psql "$DATABASE_URL" -c "\dt" | grep "hms_" || echo "No tables found!"

echo ""
echo "🎉 Railway database reset complete!"
echo ""
echo "Next steps:"
echo "1. Your backend should reconnect automatically"
echo "2. Test your frontend connection"
echo "3. Create the first admin (no default credentials are seeded):"
echo "   node scripts/create-admin.js --email admin@example.com --name \"Administrator\""
echo "   For local dev only: node scripts/create-admin.js --email dev@local --name \"Dev\" --dev"
echo ""
