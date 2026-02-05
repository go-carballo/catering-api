#!/usr/bin/env bash

# Pre-Deployment Verification Script
# Run this before deploying to production

set -e

echo "🔍 Catering API - Pre-Deployment Verification"
echo "=============================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_passed() {
  echo -e "${GREEN}✅ $1${NC}"
}

check_failed() {
  echo -e "${RED}❌ $1${NC}"
  exit 1
}

warning() {
  echo -e "${YELLOW}⚠️  $1${NC}"
}

echo "1️⃣  Running tests..."
if pnpm test --run > /dev/null 2>&1; then
  check_passed "All tests passing"
else
  check_failed "Tests failed - fix before deploying"
fi

echo ""
echo "2️⃣  Building project..."
if pnpm run build > /dev/null 2>&1; then
  check_passed "Build successful"
else
  check_failed "Build failed - fix before deploying"
fi

echo ""
echo "3️⃣  Checking for console.log in production code..."
if rg 'console\.(log|warn|error)' src --exclude '\.spec\.ts' > /dev/null 2>&1; then
  check_failed "Found console.log in production code - remove before deploying"
else
  check_passed "No console.log found in production code"
fi

echo ""
echo "4️⃣  Checking for TODO/FIXME in production code..."
if rg 'TODO|FIXME' src --exclude '\.spec\.ts' > /dev/null 2>&1; then
  warning "Found TODO/FIXME comments in code - ensure they're not critical"
else
  check_passed "No TODO/FIXME found"
fi

echo ""
echo "5️⃣  Checking environment variables..."
if [ -z "$JWT_SECRET" ]; then
  warning "JWT_SECRET not set in environment"
else
  check_passed "JWT_SECRET is set"
fi

if [ -z "$DATABASE_URL" ]; then
  warning "DATABASE_URL not set in environment"
else
  check_passed "DATABASE_URL is set"
fi

if [ -z "$NODE_ENV" ]; then
  warning "NODE_ENV not set (defaults to development)"
else
  check_passed "NODE_ENV is set to: $NODE_ENV"
fi

echo ""
echo "6️⃣  Checking git status..."
if [ -z "$(git status --porcelain)" ]; then
  check_passed "Working directory is clean"
else
  warning "Working directory has uncommitted changes"
  git status --short
fi

echo ""
echo "=============================================="
echo -e "${GREEN}✅ All checks passed!${NC}"
echo ""
echo "📋 Pre-deployment checklist:"
echo "  [ ] Verified on staging environment"
echo "  [ ] Database backups configured"
echo "  [ ] Monitoring and alerting set up"
echo "  [ ] Team notified of deployment"
echo "  [ ] Rollback plan documented"
echo ""
echo "🚀 Ready to deploy!"
