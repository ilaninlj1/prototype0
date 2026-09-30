#!/usr/bin/env bash
# Checks Taste Twins' rules against the live project with two throwaway
# anonymous users, then deletes their data. Usage: bash scripts/verify-twins.sh
set -euo pipefail
set -a; source .env.local; set +a
U=$EXPO_PUBLIC_SUPABASE_URL; K=$EXPO_PUBLIC_SUPABASE_ANON_KEY
signup() { curl -s -X POST "$U/auth/v1/signup" -H "apikey: $K" -H "Content-Type: application/json" -d '{}'; }
tok() { python3 -c "import json,sys;print(json.load(sys.stdin)['access_token'])"; }
uid() { python3 -c "import json,sys;print(json.load(sys.stdin)['user']['id'])"; }
A=$(signup); TA=$(echo "$A" | tok); IA=$(echo "$A" | uid)
B=$(signup); TB=$(echo "$B" | tok); IB=$(echo "$B" | uid)
call() { curl -s -X "$1" "$U/rest/v1/$2" -H "apikey: $K" -H "Authorization: Bearer $3" -H "Content-Type: application/json" -H "Prefer: return=minimal" ${4:+-d "$4"}; }
rpc() { curl -s -X POST "$U/rest/v1/rpc/$1" -H "apikey: $K" -H "Authorization: Bearer $2" -H "Content-Type: application/json" -d "${3:-{\}}"; }
call POST twin_profiles "$TA" "{\"device_id\":\"$(uuidgen)\",\"name\":\"Test A\",\"handle\":\"test_a\",\"platform\":\"instagram\",\"adult\":true}"
call POST twin_profiles "$TB" "{\"device_id\":\"$(uuidgen)\",\"name\":\"Test B\",\"handle\":\"test_b\",\"platform\":\"snapchat\",\"adult\":true}"
for t in 1 2 3; do call POST twin_likes "$TA" "{\"track_id\":$t,\"artist_key\":\"artist $t\"}"; call POST twin_likes "$TB" "{\"track_id\":$t,\"artist_key\":\"artist $t\"}"; done
echo "1. A sees B as a twin:      $(rpc my_twins "$TA" | grep -c "Test B" || true) (expect 1)"
echo "2. A can't read B's row:    $(call GET "twin_profiles?select=handle" "$TA")  (expect only A's handle)"
echo "3. Handle before waves:     $(rpc twin_handle "$TA" "{\"twin\":\"$IB\"}")  (expect [])"
call POST twin_waves "$TA" "{\"to_user\":\"$IB\"}"
echo "4. Handle after one wave:   $(rpc twin_handle "$TA" "{\"twin\":\"$IB\"}")  (expect [])"
call POST twin_waves "$TB" "{\"to_user\":\"$IA\"}"
echo "5. Handle after both waved: $(rpc twin_handle "$TA" "{\"twin\":\"$IB\"}")  (expect test_b)"
echo "6. Can't mark self hidden=false/true: $(call PATCH "twin_profiles?user_id=eq.$IA" "$TA" '{"hidden":true}')  (expect a permission error)"
call POST twin_blocks "$TB" "{\"to_user\":\"$IA\"}"
echo "7. After B blocks A, A sees: $(rpc my_twins "$TA")  (expect [])"
echo "8. After block, handle:     $(rpc twin_handle "$TA" "{\"twin\":\"$IB\"}")  (expect [])"
call PATCH "twin_profiles?user_id=eq.$IA" "$TA" '{"adult":false}'
echo "9. Under-18 wave refused:   $(call POST twin_waves "$TA" "{\"to_user\":\"$IB\"}")  (expect an RLS error)"
rpc leave_twins "$TA" >/dev/null; rpc leave_twins "$TB" >/dev/null
echo "10. After leaving, A's row: $(call GET "twin_profiles?select=user_id" "$TA")  (expect [])"
