import os

file_path = r"d:\code\exit-radar-pro\apps\web-gui\src\components\RadarDashboard.tsx"

# 1. Read the file (should be UTF-8 now, but let's be safe)
try:
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
except UnicodeDecodeError:
    with open(file_path, 'r', encoding='latin-1') as f:
        content = f.read()

# 2. Fix the duplication
duplicate = "maxHeight: '90vh', overflowY: 'auto', maxHeight: '90vh', overflowY: 'auto'"
single = "maxHeight: '90vh', overflowY: 'auto'"
content = content.replace(duplicate, single)

# 3. Write back as clean UTF-8
with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("✅ RadarDashboard.tsx 중복 스타일 제거 및 UTF-8 정화 완료.")
