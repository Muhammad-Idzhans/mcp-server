# import requests
# import json

# URL = "https://sql-mcp-server01.onrender.com/mcp"
# # URL = "http://localhost:8787/mcp"
# HEADERS = {
#     "Content-Type": "application/json", 
#     "Accept": "application/json, text/event-stream"
# }

# # 1. Initialize
# init_payload = {
#     "jsonrpc": "2.0",
#     "id": "1",
#     "method": "initialize",
#     "params": {
#         "protocolVersion": "2025-03-26",
#         "clientInfo": {"name": "python-client", "version": "1.0.0"},
#         "capabilities": {"roots": {"listChanged": True}, "sampling": {}, "tools": {}}
#     }
# }

# r = requests.post(URL, headers=HEADERS, data=json.dumps(init_payload))
# print("INIT:", r.status_code, r.text)

# if "mcp-session-id" not in r.headers:
#     raise RuntimeError("Server did not return mcp-session-id")
# session_id = r.headers["mcp-session-id"]

# # Update headers with session
# HEADERS["mcp-session-id"] = session_id

# # 2. notifications/initialized
# notif_payload = {
#     "jsonrpc": "2.0",
#     "method": "notifications/initialized"
# }
# r = requests.post(URL, headers=HEADERS, data=json.dumps(notif_payload))
# print("READY:", r.status_code, r.text)

# # 3. tools/list
# tools_payload = {
#     "jsonrpc": "2.0",
#     "id": "2",
#     "method": "tools/list",
#     "params": {}
# }
# r = requests.post(URL, headers=HEADERS, data=json.dumps(tools_payload))
# print("TOOLS:", r.status_code, r.text)


















import requests
import json
import sys
from typing import Any, Dict, Optional

# ---- Configuration ----
URL = "https://sql-mcp-server01.onrender.com/mcp"
# URL = "http://localhost:8787/mcp"

HEADERS: Dict[str, str] = {
    "Content-Type": "application/json",
    # Streamable HTTP requires POST to accept both JSON and SSE; keep both:
    # (server chooses response mode; we parse whichever we get)
    "Accept": "application/json, text/event-stream",
    # RBAC / row-filter context for your server
    "x-role": "admin",
    "x-user-id": "test_user",
}

# ---- Helpers to parse SSE or plain JSON ----
def parse_mcp_response(text: str) -> Dict[str, Any]:
    """
    Parse MCP server responses that may be:
      - SSE: 'event: message\\ndata: {...}\\n\\n'
      - Plain JSON: '{...}'
    Returns the parsed JSON object; raises on failure.
    """
    t = text.strip()
    if t.startswith("event:"):
        # Extract the last 'data: {...}' block
        lines = t.splitlines()
        data_lines = [ln for ln in lines if ln.startswith("data:")]
        if not data_lines:
            raise ValueError(f"No 'data:' block found in SSE: {t[:200]}...")
        payload = data_lines[-1][len("data: "):]
        return json.loads(payload)
    # Fallback: try JSON directly
    return json.loads(t)

def post_json(url: str, headers: Dict[str, str], payload: Dict[str, Any]) -> requests.Response:
    return requests.post(url, headers=headers, data=json.dumps(payload))

def print_section(title: str, obj: Any) -> None:
    print(f"\n=== {title} ===")
    if isinstance(obj, (dict, list)):
        print(json.dumps(obj, indent=2))
    else:
        print(obj)

# ---- MCP client primitives ----
def mcp_initialize() -> str:
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
    r = post_json(URL, HEADERS, init_payload)
    print(f"INIT: {r.status_code}")
    # The MCP server uses the response headers to return the session id
    sid = r.headers.get("mcp-session-id")
    if not sid:
        print(r.text)
        raise RuntimeError("Server did not return mcp-session-id")
    # Show body for debugging
    print(r.text)
    return sid

def mcp_ready(sid: str) -> None:
    HEADERS["mcp-session-id"] = sid
    notif_payload = {"jsonrpc": "2.0", "method": "notifications/initialized"}
    r = post_json(URL, HEADERS, notif_payload)
    print(f"READY: {r.status_code}")
    print(r.text or "")

def mcp_tools_list() -> Dict[str, Any]:
    payload = {"jsonrpc": "2.0", "id": "2", "method": "tools/list", "params": {}}
    r = post_json(URL, HEADERS, payload)
    print(f"TOOLS: {r.status_code}")
    print(r.text)
    return parse_mcp_response(r.text)

def mcp_tools_call(name: str, arguments: Optional[Dict[str, Any]] = None, req_id: str = "call-1") -> Dict[str, Any]:
    """
    Call a tool. If the tool expects no inputs, pass arguments={} (not None).
    Some clients send null for empty args, which can trip validation;
    using {} is safest for zero-arg tools.
    """
    args = arguments if arguments is not None else {}
    payload = {
        "jsonrpc": "2.0",
        "id": req_id,
        "method": "tools/call",
        "params": {
            "name": name,
            "arguments": args
        }
    }
    r = post_json(URL, HEADERS, payload)
    print(f"CALL [{name}]: {r.status_code}")
    print(r.text)
    return parse_mcp_response(r.text)

def main():
    try:
        # 1) initialize → get session id
        sid = mcp_initialize()
        # 2) notify ready
        mcp_ready(sid)
        # 3) list tools
        tools_list = mcp_tools_list()
        print_section("Available tools", tools_list)

        # --- Sanity calls on discovery tools ---
        aliases = mcp_tools_call("db.aliases", {})        # zero-arg tool: pass {}
        print_section("db.aliases result", aliases)

        types_res = mcp_tools_call("db.types", {})        # zero-arg tool
        print_section("db.types result", types_res)

        names_res = mcp_tools_call("db.names", {})        # zero-arg tool
        print_section("db.names result", names_res)

        # --- db.listByType: needs type ---
        # You can change "mysql" to one of the dialects your server shows (from db.types result).
        list_mysql = mcp_tools_call("db.listByType", {"type": "mysql", "unique": True, "includeAliases": False})
        print_section("db.listByType(mysql)", list_mysql)

        # --- Peek / Schema / Query on your customer_db alias ---
        peek_res = mcp_tools_call("customer_db.sql.peek", {"maxRowsPerTable": 5, "as": "markdown"})
        print_section("customer_db.sql.peek", peek_res)

        schema_res = mcp_tools_call("customer_db.sql.schema", {})
        print_section("customer_db.sql.schema", schema_res)

        # Sample read-only query (adjust table if needed)
        query_res = mcp_tools_call(
            "customer_db.sql.query",
            {
                "sql": "SELECT 1 AS one",
                "params": {},
                "readOnly": True,
                "rowLimit": 10,
                "as": "json"
            }
        )
        print_section("customer_db.sql.query", query_res)

        print("\nAll MCP calls completed.")
    except Exception as e:
        print(f"[ERROR] {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()