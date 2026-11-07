#!/usr/bin/env bash
# Creates the Links table, with every column Tomstash uses, in an existing Airtable base.
# Needs AIRTABLE_BASE_ID and AIRTABLE_TOKEN (a token with the schema.bases:write scope).
# Edit the table name in airtable-table.json first if you don't want "Links".

set -euo pipefail

: "${AIRTABLE_BASE_ID:?Set AIRTABLE_BASE_ID (starts with app)}"
: "${AIRTABLE_TOKEN:?Set AIRTABLE_TOKEN (needs the schema.bases:write scope)}"

here="$(cd "$(dirname "$0")" && pwd)"

curl -sS -X POST "https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables" \
  -H "Authorization: Bearer ${AIRTABLE_TOKEN}" \
  -H "Content-Type: application/json" \
  --data @"${here}/airtable-table.json"
echo
