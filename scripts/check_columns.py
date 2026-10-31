import urllib.request
import json
import os

# Credentials come from tas-oms/.env.local (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY); never write them in a script.
def _env():
    path = os.path.join(os.path.dirname(__file__), '..', '.env.local')
    if os.path.exists(path):
        for line in open(path, encoding='utf-8'):
            if '=' in line and not line.lstrip().startswith('#'):
                k, v = line.strip().split('=', 1)
                os.environ.setdefault(k, v.strip().strip('"'))
    base, key = os.environ.get('SUPABASE_URL'), os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
    if not base or not key:
        raise SystemExit('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in tas-oms/.env.local first.')
    return base.rstrip('/'), key

BASE, KEY = _env()

headers = {
    'apikey': KEY,
    'Authorization': f'Bearer {KEY}'
}

url = BASE + '/rest/v1/materials?limit=1'
req = urllib.request.Request(url, headers=headers)
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read().decode())
    print('Material keys:', list(data[0].keys()) if data else 'Empty')
    if data:
        print('Sample material:', data[0])
