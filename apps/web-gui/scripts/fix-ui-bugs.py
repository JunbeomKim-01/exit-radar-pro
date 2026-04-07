import os

file_path = r"d:\code\exit-radar-pro\apps\web-gui\src\components\RadarDashboard.tsx"

# Try different encodings until success
encodings = ['utf-8', 'cp949', 'euc-kr', 'latin-1']
content = None

for enc in encodings:
    try:
        with open(file_path, 'r', encoding=enc) as f:
            content = f.read()
        print(f"✅ Loaded using {enc}")
        break
    except UnicodeDecodeError:
        continue

if content is None:
    print("❌ Failed to read file with known encodings")
    exit(1)

# 1. Fix Scrolling (Mobile Overlay)
old_style = "boxShadow: '0 -8px 32px rgba(0,0,0,0.5)'"
new_style = "boxShadow: '0 -8px 32px rgba(0,0,0,0.5)', maxHeight: '90vh', overflowY: 'auto'"
content = content.replace(old_style, new_style)

# 2. Fix Yield Curve Case-Sensitivity
content = content.replace("const n = selectedMobileIndicator.name;", "const n = selectedMobileIndicator.name.toUpperCase();")
content = content.replace("n.includes('Yield Curve')", "n.includes('YIELD CURVE')")
content = content.replace("n.includes('거래량')", "n.includes('거래량') || n.includes('VOL')")

# Write back with the same encoding it was read with (preserve original)
with open(file_path, 'w', encoding=enc) as f:
    f.write(content)

print(f"✅ RadarDashboard.tsx 정밀 수술 완료. (Used {enc})")
