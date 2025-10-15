# # mcp_agent_bridge.py
# """
# Azure AI Foundry Agent <-> MCP Server bridge (HTTP)
# - Opens MCP session (initialize -> mcp-session-id) and binds identity headers (x-role, x-user-id).
# - Exposes MCP tools as Azure Agent FunctionTools so the model can call db.* and <alias>.sql.*.
# - Provides a simple interactive loop (type 'q' to quit) and prints the conversation.

# Env vars (configure in Azure Web App settings or .env):
#   PROJECT_ENDPOINT         = https://<your-azure-ai-project-endpoint>
#   MODEL_DEPLOYMENT_NAME    = <your-model-deployment-name>
#   MCP_SERVER_URL_3         = https://<your-mcp-server>/mcp
#   USER_ROLE                = customer|merchant|admin|...   (used as X-Role)
#   USER_ID                  = <string user id>              (used as X-User-Id)
#   DEFAULT_ALIAS            = optional (e.g., customer_db)

# Optional (dev):
#   AZURE_LOG_LEVEL          = warning|info|debug (default: warning)

# Requirements:
#   pip install python-dotenv requests azure-identity azure-ai-agents
# """

# import os
# import sys
# import json
# import time
# import getpass
# import mysql.connector
# from typing import Any, Dict, Optional, Set, Callable

# import requests
# from dotenv import load_dotenv

# from azure.identity import DefaultAzureCredential, ManagedIdentityCredential
# from azure.ai.agents import AgentsClient
# from azure.ai.agents.models import (
#     FunctionTool,
#     RequiredFunctionToolCall,
#     ToolOutput,
#     SubmitToolOutputsAction,
#     ListSortOrder,
# )

# # ------------------------------------------------------------------------------
# # Load environment
# # ------------------------------------------------------------------------------
# load_dotenv()

# PROJECT_ENDPOINT = os.environ.get("PROJECT_ENDPOINT", "").strip()
# MODEL_DEPLOYMENT_NAME = os.environ.get("MODEL_DEPLOYMENT_NAME", "").strip()
# MCP_SERVER_URL_3 = (os.environ.get("MCP_SERVER_URL_3", "") or "").strip().rstrip("/")
# USER_ROLE = (os.environ.get("USER_ROLE", "") or "admin").strip()
# USER_ID = (os.environ.get("USER_ID", "") or "test_user").strip()
# DEFAULT_ALIAS = os.environ.get("DEFAULT_ALIAS", "").strip()

# if not PROJECT_ENDPOINT or not MODEL_DEPLOYMENT_NAME or not MCP_SERVER_URL_3:
#     print("❌ Missing env: PROJECT_ENDPOINT, MODEL_DEPLOYMENT_NAME, MCP_SERVER_URL_3")
#     sys.exit(1)

# os.environ.setdefault("AZURE_LOG_LEVEL", "warning")

# # ------------------------------------------------------------------------------
# # LOGIN TO MYSQL TO VERIFY USERNAME/PASSWORD AND GET ROLE, USER_ID
# # ------------------------------------------------------------------------------
# # Load MySQL credentials from environment variables
# MYSQL_HOST = os.getenv("MYSQL_HOST")
# MYSQL_PORT = int(os.getenv("MYSQL_PORT", 3306))
# MYSQL_USER = os.getenv("MYSQL_USER")
# MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD")
# MYSQL_DB = os.getenv("MYSQL_DB")

# if not all([MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DB]):
#     raise EnvironmentError("Missing MySQL connection environment variables.")

# # Connect to MySQL
# conn = mysql.connector.connect(
#     host=MYSQL_HOST,
#     port=MYSQL_PORT,
#     user=MYSQL_USER,
#     password=MYSQL_PASSWORD,
#     database=MYSQL_DB
# )
# cursor = conn.cursor(dictionary=True)

# # Login loop
# USER_ROLE = None
# USER_ID = None
# while True:
#     print("Please log in:")
#     username = input("Username: ").strip()
#     password = getpass.getpass("Password: ").strip()

#     cursor.execute(
#         "SELECT user_id, role FROM users WHERE username=%s AND password=%s",
#         (username, password)
#     )
#     user = cursor.fetchone()

#     if user:
#         USER_ID = str(user["user_id"])
#         USER_ROLE = user["role"]
#         print(f"✅ Login successful! Role: {USER_ROLE}, User ID: {USER_ID}")
#         break
#     else:
#         print("❌ Invalid credentials. Please try again.\n")

# cursor.close()
# conn.close()
# # ------------------------------------------------------------------------------

# # ------------------------------------------------------------------------------
# # Minimal MCP HTTP client (JSON-RPC over /mcp)
# # Matches your server's initialize/headers/flow.
# # - POST initialize -> mcp-session-id header
# # - subsequent requests include mcp-session-id, x-role, x-user-id
# # - payloads: tools/list, tools/call (name + arguments)
# # ------------------------------------------------------------------------------

# class McpHttpClient:
#     """
#     Speaks JSON-RPC with your MCP HTTP endpoint (/mcp).
#     Server flow:
#       1) POST {"method": "initialize", ...} -> response header 'mcp-session-id'
#       2) POST/GET include 'mcp-session-id' header; identity via x-role/x-user-id
#       3) tools/list, tools/call (name, arguments) return content=[{type: 'text'|'json'}]
#     Reference: src/server/http.ts and src/tools/sql/index.ts in your project.  # [1]
#     """
#     def __init__(self, url: str):
#         self.url = url.rstrip("/")
#         self.sid: Optional[str] = None
#         self.headers: Dict[str, str] = {
#             "Content-Type": "application/json",
#             # Server can stream via SSE or return plain JSON; accept both:
#             "Accept": "application/json, text/event-stream",
#         }

#     def set_identity(self, role: str, user_id: str):
#         # Your server uses x-role and x-user-id for RBAC and row policies.  # [1]
#         self.headers["x-role"] = role
#         self.headers["x-user-id"] = user_id

#     def _post(self, payload: Dict[str, Any]) -> requests.Response:
#         return requests.post(self.url, headers=self.headers, data=json.dumps(payload), timeout=60)

#     @staticmethod
#     def _parse_mcp_response(text: str) -> Dict[str, Any]:
#         """
#         Supports plain JSON OR SSE ('event: message\ndata: {...}\n\n').
#         """
#         t = text.strip()
#         if t.startswith("event:"):
#             lines = t.splitlines()
#             data_lines = [ln for ln in lines if ln.startswith("data:")]
#             if not data_lines:
#                 raise ValueError(f"No 'data:' block in SSE: {t[:200]}...")
#             payload = data_lines[-1][len("data: "):]
#             return json.loads(payload)
#         return json.loads(t)

#     def initialize(self):
#         payload = {
#             "jsonrpc": "2.0",
#             "id": "1",
#             "method": "initialize",
#             "params": {
#                 # Your server samples use '2025-03-26' as protocolVersion.  # [1]
#                 "protocolVersion": "2025-03-26",
#                 "clientInfo": {"name": "agents-bridge-client", "version": "1.0.0"},
#                 "capabilities": {"roots": {"listChanged": True}, "sampling": {}, "tools": {}}
#             }
#         }
#         r = self._post(payload)
#         r.raise_for_status()
#         sid = r.headers.get("mcp-session-id")
#         if not sid:
#             raise RuntimeError("MCP server did not return mcp-session-id header.")
#         self.sid = sid

#     def ready(self):
#         assert self.sid, "Call initialize() first"
#         self.headers["mcp-session-id"] = self.sid
#         payload = {"jsonrpc": "2.0", "method": "notifications/initialized"}
#         # server accepts a minimal body here
#         self._post(payload)

#     def tools_list(self) -> Any:
#         payload = {"jsonrpc": "2.0", "id": "list-1", "method": "tools/list", "params": {}}
#         r = self._post(payload)
#         r.raise_for_status()
#         return self._parse_mcp_response(r.text)

#     def tools_call(self, name: str, arguments: Optional[Dict[str, Any]] = None) -> str:
#         """
#         Execute a tool and return a single text result for easier display to the Agent.
#         Your server returns content=[{type:'text'|'json' ...}]; we stringify to text.  # [1]
#         """
#         assert self.sid, "Call initialize() first"
#         args = arguments if arguments is not None else {}
#         payload = {
#             "jsonrpc": "2.0",
#             "id": "call-1",
#             "method": "tools/call",
#             "params": {"name": name, "arguments": args}
#         }
#         r = self._post(payload)
#         r.raise_for_status()
#         obj = self._parse_mcp_response(r.text)
#         result = obj.get("result") or {}
#         content = result.get("content") or []
#         if not content:
#             return "[]"
#         item = content[0]
#         ctype = item.get("type")
#         if ctype == "text":
#             return item.get("text", "")
#         if ctype == "json":
#             try:
#                 return json.dumps(item.get("json"), ensure_ascii=False)
#             except Exception:
#                 return str(item.get("json"))
#         return json.dumps(obj, ensure_ascii=False)

#     def close_session(self):
#         if not self.sid:
#             return
#         try:
#             requests.delete(self.url, headers=self.headers, timeout=30)
#         except Exception:
#             pass
#         self.sid = None

# # ------------------------------------------------------------------------------
# # Function tools (Agent -> MCP bridge)
# # Map Agent function names to MCP tools.
# # ------------------------------------------------------------------------------

# def build_function_tools(mcp: McpHttpClient) -> FunctionTool:
#     def db_aliases() -> str:
#         return mcp.tools_call("db.aliases", {})
#     def db_types() -> str:
#         return mcp.tools_call("db.types", {})
#     def db_names() -> str:
#         return mcp.tools_call("db.names", {})
#     def db_list_by_type(type: str, unique: bool = True, includeAliases: bool = False) -> str:
#         args = {"type": type, "unique": unique, "includeAliases": includeAliases}
#         return mcp.tools_call("db.listByType", args)

#     def sql_schema(alias: str) -> str:
#         return mcp.tools_call(f"{alias}.sql.schema", {})
#     def sql_peek(alias: str, maxRowsPerTable: int = 50, as_: str = "markdown") -> str:
#         args = {"maxRowsPerTable": maxRowsPerTable, "as": as_}
#         return mcp.tools_call(f"{alias}.sql.peek", args)
#     def sql_query(alias: str, sql: str, params: Optional[dict] = None,
#                   readOnly: bool = True, rowLimit: int = 1000, as_: str = "json") -> str:
#         args = {"sql": sql, "params": params or {}, "readOnly": readOnly,
#                 "rowLimit": rowLimit, "as": as_}
#         return mcp.tools_call(f"{alias}.sql.query", args)

#     USER_FUNCTIONS: Set[Callable[..., Any]] = {
#         db_aliases, db_types, db_names, db_list_by_type, sql_schema, sql_peek, sql_query
#     }
#     return FunctionTool(functions=USER_FUNCTIONS)

# # ------------------------------------------------------------------------------
# # Azure Agents run helpers
# # ------------------------------------------------------------------------------

# TERMINAL_STATES = {"completed", "failed", "expired", "cancelled"}

# def _normalize_status(run) -> str:
#     s = getattr(run, "status", None)
#     if s is None:
#         return ""
#     for attr in ("value", "name"):
#         if hasattr(s, attr):
#             try:
#                 return str(getattr(s, attr)).lower()
#             except Exception:
#                 pass
#     return str(s).lower()

# def _poll_until_terminal(client: AgentsClient, thread_id: str, run_id: str, interval: float = 1.0):
#     last = None
#     while True:
#         run = client.runs.get(thread_id=thread_id, run_id=run_id)
#         status = _normalize_status(run)
#         if status != last:
#             print(f"[debug] run status -> {status}")
#             last = status
#         if status in TERMINAL_STATES:
#             return run
#         # Tool bridge
#         if "requires_action" in status and isinstance(getattr(run, "required_action", None), SubmitToolOutputsAction):
#             tool_calls = run.required_action.submit_tool_outputs.tool_calls
#             outputs = []
#             for tc in tool_calls:
#                 print(f"[debug] tool_call: name={getattr(tc,'name','?')} args={getattr(tc,'arguments',{})}")
#                 if isinstance(tc, RequiredFunctionToolCall):
#                     try:
#                         out = FUNCTIONS.execute(tc)  # call the local FunctionTool
#                     except Exception as ex:
#                         out = f"ERROR executing '{getattr(tc,'name','?')}': {ex}"
#                     outputs.append(ToolOutput(tool_call_id=tc.id, output=out))
#             if outputs:
#                 client.runs.submit_tool_outputs(thread_id=thread_id, run_id=run_id, tool_outputs=outputs)
#         time.sleep(interval)

# # ------------------------------------------------------------------------------
# # Main
# # ------------------------------------------------------------------------------

# def main():
#     # 1) Open MCP session using identity headers (x-role/x-user-id).   # [1]
#     mcp = McpHttpClient(url=MCP_SERVER_URL_3)
#     mcp.set_identity(role=USER_ROLE, user_id=USER_ID)
#     mcp.initialize()   # returns mcp-session-id in headers                 # [1]
#     mcp.ready()

#     global FUNCTIONS
#     FUNCTIONS = build_function_tools(mcp)

#     # 2) Azure Agents client (use Managed Identity in Web App if available)
#     #    DefaultAzureCredential automatically tries ManagedIdentityCredential.
#     #    If you prefer to force MI, uncomment the line below and pass 'credential=ManagedIdentityCredential()'.
#     # credential = ManagedIdentityCredential()
#     agents_client = AgentsClient(
#         endpoint=PROJECT_ENDPOINT,
#         credential=DefaultAzureCredential(
#             exclude_environment_credential=False,
#             exclude_managed_identity_credential=False,  # allow MI in Azure Web App
#         ),
#     )

#     # 3) Identity-aware instructions for the Agent (keeps it deterministic)
#     default_alias_hint = DEFAULT_ALIAS or ""
#     instructions = f"""
# You are assisting a signed-in user.
# - role: {USER_ROLE}
# - user_id: {USER_ID}

# Behavior:
# - Treat phrases like "my points", "my purchases", "my account" as referring to user_id={USER_ID}.
# - Use the provided tools to answer queries. Prefer <alias>.sql.query with named params.
# - Keep results small and include a limit (LIMIT/TOP/ROWNUM).
# - If you need exact column names, call <alias>.sql.schema once.

# Alias selection:
# - Default alias: {default_alias_hint or "(none)"} (use unless the user specifies another allowed alias).

# Safety & policy:
# - Your access is scoped by the MCP session headers (x-role/x-user-id) and server policies.
# - If a query is rejected, adjust to allowed tables or add required filters (e.g., WHERE user_id = :user_id).
# """.strip()

#     with agents_client:
#         agent = agents_client.create_agent(
#             model=MODEL_DEPLOYMENT_NAME,
#             name="mcp-sql-agent",
#             instructions=instructions,
#             tools=FUNCTIONS.definitions,
#         )
#         print(f"Agent created: {agent.id}")
#         thread = agents_client.threads.create()
#         print(f"Thread created: {thread.id}")

#         try:
#             while True:
#                 prompt = input("\nAsk something (or 'q' to quit): ").strip()
#                 if prompt.lower() in ("q", "quit", "exit"):
#                     break

#                 agents_client.messages.create(thread_id=thread.id, role="user", content=prompt)
#                 run = agents_client.runs.create(thread_id=thread.id, agent_id=agent.id)
#                 run = _poll_until_terminal(agents_client, thread.id, run.id)

#                 # Show conversation
#                 try:
#                     msgs = agents_client.messages.list(thread_id=thread.id, order=ListSortOrder.ASCENDING)
#                     print("\nConversation:")
#                     print("=" * 80)
#                     for m in msgs:
#                         if m.text_messages:
#                             for tm in m.text_messages:
#                                 print(f"{m.role.upper()}: {tm.text.value}\n")
#                     print("=" * 80)
#                 except Exception as e:
#                     print("⚠️ Could not list messages:", e)

#         finally:
#             # Cleanup: delete agent and close MCP session
#             try:
#                 agents_client.delete_agent(agent.id)
#                 print(f"Deleted agent: {agent.id}")
#             except Exception:
#                 pass
#             try:
#                 mcp.close_session()
#                 print("Closed MCP session.")
#             except Exception:
#                 pass


# if __name__ == "__main__":
#     main()




























import os
import sys
import json
import time
import getpass
from typing import Any, Dict, Optional, Set, Callable

import requests
from dotenv import load_dotenv
from azure.identity import DefaultAzureCredential
from azure.ai.agents import AgentsClient
from azure.ai.agents.models import (
    FunctionTool,
    RequiredFunctionToolCall,
    ToolOutput,
    SubmitToolOutputsAction,
    ListSortOrder,
)

# -------------------- Load environment --------------------
load_dotenv()
PROJECT_ENDPOINT = os.environ.get("PROJECT_ENDPOINT", "").strip()
MODEL_DEPLOYMENT_NAME = os.environ.get("MODEL_DEPLOYMENT_NAME", "").strip()
MCP_SERVER_URL_3 = (os.environ.get("MCP_SERVER_URL_3", "") or "").strip().rstrip("/")
DEFAULT_ALIAS = os.environ.get("DEFAULT_ALIAS", "").strip()

if not PROJECT_ENDPOINT or not MODEL_DEPLOYMENT_NAME or not MCP_SERVER_URL_3:
    print("❌ Missing env: PROJECT_ENDPOINT, MODEL_DEPLOYMENT_NAME, MCP_SERVER_URL_3")
    sys.exit(1)

os.environ.setdefault("AZURE_LOG_LEVEL", "warning")

# -------------------- New Login Function --------------------
def user_login() -> tuple[str, str]:
    """
    Prompt for username/password and return (role, user_id).
    Fallback to defaults if DB not configured or login fails.
    """
    username = input("Username: ").strip()
    password = getpass.getpass("Password: ").strip()

    MYSQL_HOST = os.getenv("MYSQL_HOST")
    MYSQL_PORT = int(os.getenv("MYSQL_PORT", 3306))
    MYSQL_USER = os.getenv("MYSQL_USER")
    MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD")
    MYSQL_DB = os.getenv("MYSQL_DB")

    if all([MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DB]):
        try:
            import mysql.connector
            conn = mysql.connector.connect(
                host=MYSQL_HOST,
                port=MYSQL_PORT,
                user=MYSQL_USER,
                password=MYSQL_PASSWORD,
                database=MYSQL_DB,
            )
            cursor = conn.cursor(dictionary=True)
            cursor.execute(
                "SELECT role, user_id FROM users WHERE username=%s AND password=%s LIMIT 1",
                (username, password),
            )
            row = cursor.fetchone()
            cursor.close()
            conn.close()
            if row:
                print(f"✅ Login successful! Role: {row['role']}, User ID: {row['user_id']}")
                return (row["role"], str(row["user_id"]))
            else:
                print("❌ Invalid credentials. Defaulting to customer/1.")
                return ("customer", "1")
        except Exception as ex:
            print(f"⚠️ DB error: {ex}. Defaulting to admin/test_user.")
            return ("admin", "test_user")
    else:
        print("⚠️ No DB configured. Defaulting to admin/test_user.")
        return ("admin", "test_user")

# -------------------- MCP HTTP Client --------------------
class McpHttpClient:
    def __init__(self, url: str):
        self.url = url.rstrip("/")
        self.sid: Optional[str] = None
        self.headers: Dict[str, str] = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        }

    def set_identity(self, role: str, user_id: str):
        self.headers["x-role"] = role
        self.headers["x-user-id"] = user_id

    def _post(self, payload: Dict[str, Any]) -> requests.Response:
        return requests.post(self.url, headers=self.headers, data=json.dumps(payload), timeout=60)

    @staticmethod
    def _parse_mcp_response(text: str) -> Dict[str, Any]:
        t = text.strip()
        if t.startswith("event:"):
            lines = t.splitlines()
            data_lines = [ln for ln in lines if ln.startswith("data:")]
            if not data_lines:
                raise ValueError(f"No 'data:' block in SSE: {t[:200]}...")
            payload = data_lines[-1][len("data: ") :]
            return json.loads(payload)
        return json.loads(t)

    def initialize(self):
        payload = {
            "jsonrpc": "2.0",
            "id": "1",
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-03-26",
                "clientInfo": {"name": "agents-bridge-client", "version": "1.0.0"},
                "capabilities": {"roots": {"listChanged": True}, "sampling": {}, "tools": {}},
            },
        }
        r = self._post(payload)
        r.raise_for_status()
        sid = r.headers.get("mcp-session-id")
        if not sid:
            raise RuntimeError("MCP server did not return mcp-session-id header.")
        self.sid = sid

    def ready(self):
        assert self.sid, "Call initialize() first"
        self.headers["mcp-session-id"] = self.sid
        payload = {"jsonrpc": "2.0", "method": "notifications/initialized"}
        self._post(payload)

    def tools_call(self, name: str, arguments: Optional[Dict[str, Any]] = None) -> str:
        assert self.sid, "Call initialize() first"
        args = arguments if arguments is not None else {}
        payload = {
            "jsonrpc": "2.0",
            "id": "call-1",
            "method": "tools/call",
            "params": {"name": name, "arguments": args},
        }
        r = self._post(payload)
        r.raise_for_status()
        obj = self._parse_mcp_response(r.text)
        result = obj.get("result") or {}
        content = result.get("content") or []
        if not content:
            return "[]"
        item = content[0]
        ctype = item.get("type")
        if ctype == "text":
            return item.get("text", "")
        if ctype == "json":
            try:
                return json.dumps(item.get("json"), ensure_ascii=False)
            except Exception:
                return str(item.get("json"))
        return json.dumps(obj, ensure_ascii=False)

    def close_session(self):
        if not self.sid:
            return
        try:
            requests.delete(self.url, headers=self.headers, timeout=30)
        except Exception:
            pass
        self.sid = None

# -------------------- Function Tools --------------------
def build_function_tools(mcp: McpHttpClient) -> FunctionTool:
    def db_aliases() -> str:
        return mcp.tools_call("db.aliases", {})
    def db_types() -> str:
        return mcp.tools_call("db.types", {})
    def db_names() -> str:
        return mcp.tools_call("db.names", {})
    def db_list_by_type(type: str, unique: bool = True, includeAliases: bool = False) -> str:
        args = {"type": type, "unique": unique, "includeAliases": includeAliases}
        return mcp.tools_call("db.listByType", args)
    def sql_schema(alias: str) -> str:
        return mcp.tools_call(f"{alias}.sql.schema", {})
    def sql_peek(alias: str, maxRowsPerTable: int = 50, as_: str = "markdown") -> str:
        args = {"maxRowsPerTable": maxRowsPerTable, "as": as_}
        return mcp.tools_call(f"{alias}.sql.peek", args)
    def sql_query(alias: str, sql: str, params: Optional[dict] = None, readOnly: bool = True, rowLimit: int = 1000, as_: str = "json") -> str:
        args = {"sql": sql, "params": params or {}, "readOnly": readOnly, "rowLimit": rowLimit, "as": as_}
        return mcp.tools_call(f"{alias}.sql.query", args)

    USER_FUNCTIONS: Set[Callable[..., Any]] = {db_aliases, db_types, db_names, db_list_by_type, sql_schema, sql_peek, sql_query}
    return FunctionTool(functions=USER_FUNCTIONS)

# -------------------- Main --------------------
TERMINAL_STATES = {"completed", "failed", "expired", "cancelled"}

def _normalize_status(run) -> str:
    s = getattr(run, "status", None)
    if s is None:
        return ""
    for attr in ("value", "name"):
        if hasattr(s, attr):
            try:
                return str(getattr(s, attr)).lower()
            except Exception:
                pass
    return str(s).lower()

def _poll_until_terminal(client: AgentsClient, thread_id: str, run_id: str, interval: float = 1.0):
    last = None
    while True:
        run = client.runs.get(thread_id=thread_id, run_id=run_id)
        status = _normalize_status(run)
        if status != last:
            print(f"[debug] run status -> {status}")
            last = status
        if status in TERMINAL_STATES:
            return run
        if "requires_action" in status and isinstance(getattr(run, "required_action", None), SubmitToolOutputsAction):
            tool_calls = run.required_action.submit_tool_outputs.tool_calls
            outputs = []
            for tc in tool_calls:
                print(f"[debug] tool_call: name={getattr(tc,'name','?')} args={getattr(tc,'arguments',{})}")
                if isinstance(tc, RequiredFunctionToolCall):
                    try:
                        out = FUNCTIONS.execute(tc)
                    except Exception as ex:
                        out = f"ERROR executing '{getattr(tc,'name','?')}': {ex}"
                    outputs.append(ToolOutput(tool_call_id=tc.id, output=out))
            if outputs:
                client.runs.submit_tool_outputs(thread_id=thread_id, run_id=run_id, tool_outputs=outputs)
        time.sleep(interval)

def main():
    role, user_id = user_login()
    mcp = McpHttpClient(url=MCP_SERVER_URL_3)
    mcp.set_identity(role=role, user_id=user_id)
    mcp.initialize()
    mcp.ready()

    global FUNCTIONS
    FUNCTIONS = build_function_tools(mcp)

    agents_client = AgentsClient(endpoint=PROJECT_ENDPOINT, credential=DefaultAzureCredential())

    default_alias_hint = DEFAULT_ALIAS or ""
    instructions = f"""
You are assisting a signed-in user.
- role: {role}
- user_id: {user_id}
Behavior:
- Treat phrases like "my points", "my purchases", "my account" as referring to user_id={user_id}.
- Use the provided tools to answer queries. Prefer <alias>.sql.query with named params.
- Keep results small and include a limit (LIMIT/TOP/ROWNUM).
- If you need exact column names, call <alias>.sql.schema once.
Alias selection:
- Default alias: {default_alias_hint or "(none)"} (use unless the user specifies another allowed alias).
Safety & policy:
- Your access is scoped by the MCP session headers (x-role/x-user-id) and server policies.
- If a query is rejected, adjust to allowed tables or add required filters (e.g., WHERE user_id = :user_id).
""".strip()

    with agents_client:
        agent = agents_client.create_agent(model=MODEL_DEPLOYMENT_NAME, name="mcp-sql-agent", instructions=instructions, tools=FUNCTIONS.definitions)
        print(f"Agent created: {agent.id}")
        thread = agents_client.threads.create()
        print(f"Thread created: {thread.id}")

        try:
            while True:
                prompt = input("\nAsk something (or 'q' to quit): ").strip()
                if prompt.lower() in ("q", "quit", "exit"):
                    break
                agents_client.messages.create(thread_id=thread.id, role="user", content=prompt)
                run = agents_client.runs.create(thread_id=thread.id, agent_id=agent.id)
                run = _poll_until_terminal(agents_client, thread.id, run.id)
                try:
                    msgs = agents_client.messages.list(thread_id=thread.id, order=ListSortOrder.ASCENDING)
                    print("\nConversation:\n" + "=" * 80)
                    for m in msgs:
                        if m.text_messages:
                            for tm in m.text_messages:
                                print(f"{m.role.upper()}: {tm.text.value}\n")
                    print("=" * 80)
                except Exception as e:
                    print("⚠️ Could not list messages:", e)
        finally:
            try:
                agents_client.delete_agent(agent.id)
                print(f"Deleted agent: {agent.id}")
            except Exception:
                pass
            try:
                mcp.close_session()
                print("Closed MCP session.")
            except Exception:
                pass

if __name__ == "__main__":
    main()
