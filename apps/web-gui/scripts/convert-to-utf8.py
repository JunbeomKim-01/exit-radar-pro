import os

file_path = r"d:\code\exit-radar-pro\apps\web-gui\src\components\RadarDashboard.tsx"

# 1. Read with latin-1 (which captures everything without failing)
try:
    with open(file_path, 'r', encoding='latin-1') as f:
        content = f.read()
    print("✅ Successfully read with latin-1")
except Exception as e:
    print(f"❌ Failed to read: {e}")
    exit(1)

# 2. Write back as clean UTF-8
try:
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("✅ Successfully converted to UTF-8")
except Exception as e:
    print(f"❌ Failed to write: {e}")
    exit(1)
