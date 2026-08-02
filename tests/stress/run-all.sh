#!/usr/bin/env bash
# ============================================================================
# NightCheck — Stress Test Runner
#
# Runs all stress tests in sequence and produces a combined report.
#
# Usage:
#   export SUPABASE_URL=https://your-project.supabase.co
#   export SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
#   bash tests/stress/run-all.sh
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║       NightCheck — Full Stress Test Suite                    ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check required env vars
if [ -z "${SUPABASE_URL:-${VITE_SUPABASE_URL:-}}" ]; then
  echo -e "${RED}❌ SUPABASE_URL or VITE_SUPABASE_URL is required${NC}"
  exit 1
fi

if [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo -e "${RED}❌ SUPABASE_SERVICE_ROLE_KEY is required${NC}"
  exit 1
fi

# Export for sub-processes
export SUPABASE_URL="${SUPABASE_URL:-${VITE_SUPABASE_URL:-}}"
export SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY}"

PASSED=0
FAILED=0
TOTAL=3

echo -e "\n${YELLOW}━━━ Test 1/3: Concurrent Check-in Stress Test ━━━${NC}\n"
if npx tsx "$SCRIPT_DIR/concurrent-checkin.ts"; then
  echo -e "\n${GREEN}✅ Concurrent check-in test PASSED${NC}"
  ((PASSED++))
else
  echo -e "\n${RED}❌ Concurrent check-in test FAILED${NC}"
  ((FAILED++))
fi

echo -e "\n${YELLOW}━━━ Test 2/3: Data Integrity Verification ━━━${NC}\n"
if npx tsx "$SCRIPT_DIR/data-integrity.ts"; then
  echo -e "\n${GREEN}✅ Data integrity test PASSED${NC}"
  ((PASSED++))
else
  echo -e "\n${RED}❌ Data integrity test FAILED${NC}"
  ((FAILED++))
fi

echo -e "\n${YELLOW}━━━ Test 3/3: Backup Verification ━━━${NC}\n"
if npx tsx "$SCRIPT_DIR/backup-verification.ts"; then
  echo -e "\n${GREEN}✅ Backup verification test PASSED${NC}"
  ((PASSED++))
else
  echo -e "\n${RED}❌ Backup verification test FAILED${NC}"
  ((FAILED++))
fi

# Summary
echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗"
echo "║                  COMBINED TEST RESULTS                       ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo -e "║  Passed:  ${PASSED}/${TOTAL}                                              ║"
echo -e "║  Failed:  ${FAILED}/${TOTAL}                                              ║"
echo -e "╚══════════════════════════════════════════════════════════════╝${NC}"

if [ "$FAILED" -gt 0 ]; then
  echo -e "\n${RED}❌ ${FAILED} test(s) failed${NC}"
  exit 1
else
  echo -e "\n${GREEN}✅ All tests passed!${NC}"
  exit 0
fi
