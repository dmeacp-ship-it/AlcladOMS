import csv
import json
import os
import re
import urllib.request

def main():
    env_path = os.path.join(os.path.dirname(__file__), '..', '.env.local')
    if os.path.exists(env_path):
        with open(env_path, 'r', encoding='utf-8') as f:
            for l in f:
                if '=' in l:
                    k, v = l.strip().split('=', 1)
                    os.environ[k] = v

    url = os.environ.get('SUPABASE_URL')
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

    csv_path = os.path.join(os.path.dirname(__file__), '..', 'scratch_vendors.csv')
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        next(reader)
        rows = list(reader)

    vendors = []
    for r in rows:
        raw_id, raw_company, contact, email, phone, cat, active, created, terms, status, op_bal, cl_bal = r
        raw_company = raw_company.strip()

        m = re.search(r'VDR-(\d+)\s*$', raw_company)
        if m:
            code = f'VDR-{int(m.group(1)):03d}'
            name = raw_company[:m.start()].strip()
        else:
            code = 'VDR-119'
            name = raw_company

        name = re.sub(r'\)(\S)', r') \1', name)
        name = re.sub(r'(\S)\(', r'\1 (', name)
        name = re.sub(r'\s+', ' ', name).strip()

        if 'مؤسسة وسيط الاساس للنقليا' in name and name.endswith(' ت'):
            name = 'مؤسسة وسيط الأساس للنقليات (Al-Wasit Al-Asas Transportation Company)'

        address = contact.strip() if contact and contact != '—' else None

        vendors.append({
            'code': code,
            'name': name,
            'address': address
        })

    vendors.sort(key=lambda x: x['code'])

    # Write SQL seed file
    sql_path = os.path.join(os.path.dirname(__file__), '..', 'supabase', 'seed_vendors.sql')
    sql_lines = [
        "-- Seed real vendors from factory CSV",
        "-- Run in Supabase SQL Editor\n",
        "-- 1. Delete any old placeholder vendors",
        "delete from vendors where code like 'VEN-%';\n",
        "-- 2. Insert 119 verified vendors",
        "insert into vendors (code, name, address)",
        "values"
    ]

    val_lines = []
    for v in vendors:
        c_esc = "'" + v['code'].replace("'", "''") + "'"
        n_esc = "'" + v['name'].replace("'", "''") + "'"
        a_esc = ("'" + v['address'].replace("'", "''") + "'") if v['address'] else "null"
        val_lines.append(f"  ({c_esc}, {n_esc}, {a_esc})")

    sql_lines.append(",\n".join(val_lines))
    sql_lines.append("on conflict (code) do update set name = excluded.name, address = excluded.address;")

    with open(sql_path, 'w', encoding='utf-8') as f:
        f.write("\n".join(sql_lines) + "\n")
    print(f"Generated {sql_path} with {len(vendors)} vendors.")

    # Insert into Supabase REST API
    headers = {
        'apikey': key,
        'Authorization': f'Bearer {key}',
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
    }

    req = urllib.request.Request(
        f'{url}/rest/v1/vendors',
        headers=headers,
        data=json.dumps(vendors).encode('utf-8'),
        method='POST'
    )

    try:
        with urllib.request.urlopen(req) as resp:
            print(f"Supabase REST API Insert Status: {resp.status}")
    except urllib.error.HTTPError as e:
        print(f"Error inserting via REST API: {e.code} - {e.read().decode()}")

if __name__ == '__main__':
    main()
