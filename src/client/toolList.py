import requests
import json

URL = "https://sql-mcp-server01.onrender.com/mcp"
# URL = "http://localhost:8787/mcp"
HEADERS = {
    "Content-Type": "application/json", 
    "Accept": "application/json, text/event-stream"
}

# 1. Initialize
init_payload = {
    "jsonrpc": "2.0",
    "id": "1",
    "method": "initialize",
    "params": {
        "protocolVersion": "2025-03-26",
        "clientInfo": {"name": "python-client", "version": "1.0.0"},
        "capabilities": {"roots": {"listChanged": True}, "sampling": {}, "tools": {}}
    }
}

r = requests.post(URL, headers=HEADERS, data=json.dumps(init_payload))
print("INIT:", r.status_code, r.text)

if "mcp-session-id" not in r.headers:
    raise RuntimeError("Server did not return mcp-session-id")
session_id = r.headers["mcp-session-id"]

# Update headers with session
HEADERS["mcp-session-id"] = session_id

# 2. notifications/initialized
notif_payload = {
    "jsonrpc": "2.0",
    "method": "notifications/initialized"
}
r = requests.post(URL, headers=HEADERS, data=json.dumps(notif_payload))
print("READY:", r.status_code, r.text)

# 3. tools/list
tools_payload = {
    "jsonrpc": "2.0",
    "id": "2",
    "method": "tools/list",
    "params": {}
}
r = requests.post(URL, headers=HEADERS, data=json.dumps(tools_payload))
print("TOOLS:", r.status_code, r.text)
