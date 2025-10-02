# toolList.py
import requests, json

MCP_URL = "https://sql-mcp-server01.onrender.com/mcp"
headers = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream"}

# 1. Initialize
init_payload = {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
        "capabilities": {}
    }
}
r = requests.post(MCP_URL, headers=headers, data=json.dumps(init_payload))
print("INIT:", r.status_code, r.text)

# 2. Now list tools
tools_payload = {
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list",
    "params": {}
}
r = requests.post(MCP_URL, headers=headers, data=json.dumps(tools_payload))
print("TOOLS:", r.status_code, r.text)
