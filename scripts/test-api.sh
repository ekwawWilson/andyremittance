#!/bin/bash

# Remittance API Test Script
# This script tests the API endpoints

BASE_URL="${BASE_URL:-http://localhost:3000}"

echo "🧪 Testing Remittance API Endpoints"
echo "Base URL: $BASE_URL"
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Test login
echo "1️⃣  Testing Login..."
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@remittance.com","password":"admin123"}')

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -n "$TOKEN" ]; then
  echo -e "${GREEN}✅ Login successful${NC}"
  echo "   Token: ${TOKEN:0:30}..."
else
  echo -e "${RED}❌ Login failed${NC}"
  echo "   Response: $LOGIN_RESPONSE"
  exit 1
fi
echo ""

# Test get profile
echo "2️⃣  Testing Get Profile..."
PROFILE_RESPONSE=$(curl -s -X GET "$BASE_URL/api/auth/me" \
  -H "Authorization: Bearer $TOKEN")

if echo $PROFILE_RESPONSE | grep -q '"success":true'; then
  echo -e "${GREEN}✅ Get profile successful${NC}"
else
  echo -e "${RED}❌ Get profile failed${NC}"
  echo "   Response: $PROFILE_RESPONSE"
fi
echo ""

# Test get exchange rates
echo "3️⃣  Testing Get Today's Exchange Rate..."
RATE_RESPONSE=$(curl -s -X GET "$BASE_URL/api/exchange-rates/today" \
  -H "Authorization: Bearer $TOKEN")

if echo $RATE_RESPONSE | grep -q '"success":true'; then
  echo -e "${GREEN}✅ Get exchange rate successful${NC}"
  RATE=$(echo $RATE_RESPONSE | grep -o '"cadToGhs":"[^"]*"' | cut -d'"' -f4)
  echo "   Rate: 1 CAD = $RATE GHS"
else
  echo -e "${RED}❌ Get exchange rate failed${NC}"
fi
echo ""

# Test get receiving points
echo "4️⃣  Testing Get Receiving Points..."
POINTS_RESPONSE=$(curl -s -X GET "$BASE_URL/api/receiving-points" \
  -H "Authorization: Bearer $TOKEN")

if echo $POINTS_RESPONSE | grep -q '"success":true'; then
  echo -e "${GREEN}✅ Get receiving points successful${NC}"
else
  echo -e "${RED}❌ Get receiving points failed${NC}"
fi
echo ""

# Test get senders
echo "5️⃣  Testing Get Senders..."
SENDERS_RESPONSE=$(curl -s -X GET "$BASE_URL/api/senders" \
  -H "Authorization: Bearer $TOKEN")

if echo $SENDERS_RESPONSE | grep -q '"success":true'; then
  echo -e "${GREEN}✅ Get senders successful${NC}"
else
  echo -e "${RED}❌ Get senders failed${NC}"
fi
echo ""

# Test get transactions
echo "6️⃣  Testing Get Transactions..."
TRANSACTIONS_RESPONSE=$(curl -s -X GET "$BASE_URL/api/transactions" \
  -H "Authorization: Bearer $TOKEN")

if echo $TRANSACTIONS_RESPONSE | grep -q '"success":true'; then
  echo -e "${GREEN}✅ Get transactions successful${NC}"
else
  echo -e "${RED}❌ Get transactions failed${NC}"
fi
echo ""

# Test get ledger accounts
echo "7️⃣  Testing Get Ledger Accounts..."
LEDGER_RESPONSE=$(curl -s -X GET "$BASE_URL/api/ledger/accounts" \
  -H "Authorization: Bearer $TOKEN")

if echo $LEDGER_RESPONSE | grep -q '"success":true'; then
  echo -e "${GREEN}✅ Get ledger accounts successful${NC}"
else
  echo -e "${RED}❌ Get ledger accounts failed${NC}"
fi
echo ""

# Test dashboard
echo "8️⃣  Testing Dashboard Stats..."
DASHBOARD_RESPONSE=$(curl -s -X GET "$BASE_URL/api/reports/dashboard" \
  -H "Authorization: Bearer $TOKEN")

if echo $DASHBOARD_RESPONSE | grep -q '"success":true'; then
  echo -e "${GREEN}✅ Get dashboard stats successful${NC}"
else
  echo -e "${RED}❌ Get dashboard stats failed${NC}"
fi
echo ""

echo "🏁 API Tests Complete!"
