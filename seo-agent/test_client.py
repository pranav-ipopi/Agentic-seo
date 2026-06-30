import requests
import json

response = requests.post(
    "http://127.0.0.1:8000/chat",
    headers={"Authorization": "Bearer my_secure_api_key_123"},
    json={"messages":[{"role":"user","content":"Hello"}]},
    stream=True
)
for line in response.iter_lines():
    if line:
        print(line.decode('utf-8'))
