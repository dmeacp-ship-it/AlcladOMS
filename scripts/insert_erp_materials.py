import urllib.request
import urllib.error
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
    'Authorization': f'Bearer {KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
}

keys = ['code', 'name', 'category', 'kind', 'mat_type', 'thickness', 'width', 'color_code', 'color_name', 'uom', 'cost_price']

raw_items = [
    {
        'code': '1000027815',
        'name': 'LDPE RECYCLED GRANULE',
        'category': 'GRANULE',
        'kind': 'CORE',
        'mat_type': 'PE',
        'uom': 'KG',
        'cost_price': 0
    },
    {
        'code': '1000027819',
        'name': 'CALCIUM COMPOUND FILLER',
        'category': 'GRANULE',
        'kind': 'OTHER',
        'mat_type': 'CaCO3',
        'uom': 'KG',
        'cost_price': 0
    },
    {
        'code': '1000027823',
        'name': 'CALCIUM POWDER (CaCO3)',
        'category': 'GRANULE',
        'kind': 'OTHER',
        'mat_type': 'CaCO3',
        'uom': 'KG',
        'cost_price': 0
    },
    {
        'code': '1000027821',
        'name': 'DESICCANT MASTER BATCH',
        'category': 'GRANULE',
        'kind': 'OTHER',
        'mat_type': 'DESICCANT',
        'uom': 'KG',
        'cost_price': 0
    },
    {
        'code': '1000027817',
        'name': 'FR3 GRANULES (FRB1)',
        'category': 'GRANULE',
        'kind': 'CORE',
        'mat_type': 'FRB1',
        'uom': 'KG',
        'cost_price': 0
    },
    {
        'code': '1000027825',
        'name': 'FR2 GRANULE (FRA2 GRANULE)',
        'category': 'GRANULE',
        'kind': 'CORE',
        'mat_type': 'FRA2',
        'uom': 'KG',
        'cost_price': 0
    },
    {
        'code': '1000027827',
        'name': 'FR2 CORE (FRA2 CORE)',
        'category': 'RM',
        'kind': 'CORE',
        'mat_type': 'FRA2',
        'uom': 'M2',
        'cost_price': 0
    },
    {
        'code': '2000032749',
        'name': 'SLV-0.40*1270-Silver',
        'category': 'RM',
        'kind': 'TOP_COIL',
        'mat_type': 'SDPE',
        'thickness': 0.40,
        'width': 1270.0,
        'color_code': 'SLV',
        'color_name': 'Silver',
        'uom': 'KG',
        'cost_price': 0
    }
]

normalized = []
for item in raw_items:
    norm = {k: item.get(k, None) for k in keys}
    normalized.append(norm)

url = BASE + '/rest/v1/materials'
req = urllib.request.Request(url, data=json.dumps(normalized).encode('utf-8'), headers=headers, method='POST')

try:
    with urllib.request.urlopen(req) as resp:
        res = json.loads(resp.read().decode('utf-8'))
        print(f"Successfully inserted {len(res)} materials!")
        for r in res:
            print(f"  Inserted ID {r['id']}: {r['code']} - {r['name']}")
except urllib.error.HTTPError as e:
    print(f"Error {e.code}: {e.read().decode('utf-8')}")
