import os

target = "MCowBQYDK2VwAyEACGcJhmwm49O8M7bVPf2HpBehD8Gm3O0RYS17vnDtiho="
for base in [r"C:\Project", r"C:\project"]:
    if not os.path.exists(base): continue
    for root, dirs, files in os.walk(base):
        if "node_modules" in root or ".git" in root or ".venv" in root: continue
        for file in files:
            p = os.path.join(root, file)
            try:
                with open(p, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read()
                    if target in content:
                        print("FOUND TARGET IN:", p)
                    if "nova-key-2026-01" in content and "PRIVATE KEY" in content:
                        print("FOUND PRIVATE KEY IN:", p)
            except Exception:
                pass
