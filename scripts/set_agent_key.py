#!/usr/bin/env python3
"""Set AGENT_API_KEY in .env from stdin."""
import sys, re

key = sys.stdin.read().strip()
if not key or len(key) < 10:
    print("Invalid key")
    sys.exit(1)

env_path = "/home/alaiisah/Desktop/Scholarshipright/backend/.env"
with open(env_path, 'r') as f:
    content = f.read()

if 'AGENT_API_KEY=' in content:
    content = re.sub(r'AGENT_API_KEY=\S*', f'AGENT_API_KEY={key}', content)
else:
    content += f'\nAGENT_API_KEY={key}\n'

with open(env_path, 'w') as f:
    f.write(content)

print(f"AGENT_API_KEY written (length: {len(key)})")
