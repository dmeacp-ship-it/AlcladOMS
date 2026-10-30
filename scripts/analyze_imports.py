import openpyxl
import os

files = [
    r'C:\Users\Admin\.gemini\antigravity\brain\5b39f75a-48b3-4827-9e08-291b0f10a4cc\.user_uploaded\media_1793360230394_657a1c05.xlsx',
    r'C:\Users\Admin\.gemini\antigravity\brain\5b39f75a-48b3-4827-9e08-291b0f10a4cc\.user_uploaded\media_1793360230394_74346cdc.xlsx',
    r'C:\Users\Admin\.gemini\antigravity\brain\5b39f75a-48b3-4827-9e08-291b0f10a4cc\.user_uploaded\media_1793360230394_0ed2954d.xlsx'
]

for idx, f in enumerate(files):
    print(f"================ FILE {idx+1}: {os.path.basename(f)} ================")
    wb = openpyxl.load_workbook(f, data_only=True)
    ws = wb.active
    headers = [str(ws.cell(1, c).value or '') for c in range(1, ws.max_column + 1)]
    print("Headers:", headers)
    
    for r in range(2, ws.max_row + 1):
        row_vals = [ws.cell(r, c).value for c in range(1, ws.max_column + 1)]
        # Check if row has any values
        if any(row_vals):
            # Print non-null values
            non_empty = {headers[c]: row_vals[c] for c in range(len(headers)) if row_vals[c] is not None}
            # Only print if item name is present or row > 110
            if r <= 5 or r >= 110 or non_empty.get('(*)Item Name'):
                print(f"Row {r:3d}: {non_empty}")
