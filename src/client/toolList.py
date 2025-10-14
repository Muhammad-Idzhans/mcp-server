# client.py
import os
import json
import time
import requests
from typing import Any, Dict, Optional, Set, Callable, Tuple
from dotenv import load_dotenv
from azure.identity import DefaultAzureCredential
from azure.ai.agents import AgentsClient
from azure.ai.agents.models import (
    FunctionTool,
    SubmitToolOutputsAction,
    ToolOutput,
    RequiredFunctionToolCall,
    ListSortOrder,
)

# ========== Load env ==========
load_dotenv()
PROJECT_ENDPOINT = os.environ["PROJECT_ENDPOINT"]
MODEL_DEPLOYMENT_NAME = os.environ["MODEL_DEPLOYMENT_NAME"]
MCP_SERVER_URL = os.environ["MCP_SERVER_URL"].rstrip("/")
# Verbose logs (optional)
os.environ.setdefault("AZURE_LOG_LEVEL", "warning")

# ========== Railway DB login (role + user_id) ==========
def railway_login() -> Tuple[str, str]:
    """
    Returns (role, user_id) for the current user by querying your Railway DB.
    You can set credentials for MySQL or Postgres via env vars.
    Defaults:
    - table: users
    - columns: username, password, role, user_id
    Prompts at runtime for username/password.
    """
    # Prompt user
    username = input("Login username: ").strip()
    password = input("Login password: ").strip()

    # Config (override via env if your schema differs)
    table = os.environ.get("AUTH_TABLE", "users")
    col_user = os.environ.get("AUTH_USER_COL", "username")
    col_pass = os.environ.get("AUTH_PASS_COL", "password")
    col_role = os.environ.get("AUTH_ROLE_COL", "role")
    col_userid = os.environ.get("AUTH_ID_COL", "user_id")

    # Determine DB type from env (mysql \n pg)
    dialect = (os.environ.get("DB_PROVIDER") or os.environ.get("DB_DIALECT") or "").lower()
    if not dialect:
        # fallback: auto if MYSQL_HOST present -> mysql, elif PG_HOST -> pg
        dialect = "mysql" if os.environ.get("MYSQL_HOST") else ("pg" if os.environ.get("PG_HOST") else "")
    if dialect not in ("mysql", "pg"):
        print("[login] No DB_PROVIDER set (mysql\\pg). Using default role='admin', user_id='test_user'.")
        return ("admin", "test_user")
    try:
        if dialect == "mysql":
            import mysql.connector  # mysql-connector-python
            conn = mysql.connector.connect(
                host=os.environ["MYSQL_HOST"],
                port=int(os.environ.get("MYSQL_PORT", "3306")),
                user=os.environ["MYSQL_USER"],
                password=os.environ["MYSQL_PASSWORD"],
                database=os.environ["MYSQL_DB"],
            )
            # NOTE: In production use hashed passwords; this demo assumes plain text
            sql = f"""
            SELECT {col_role}, {col_userid}
            FROM {table}
            WHERE {col_user} = %s AND {col_pass} = %s
            LIMIT 1
            """
            with conn.cursor() as cur:
                cur.execute(sql, (username, password))
                row = cur.fetchone()
            conn.close()
        else:  # pg
            import psycopg2  # psycopg2-binary
            conn = psycopg2.connect(
                host=os.environ["PG_HOST"],
                port=int(os.environ.get("PG_PORT", "5432")),
                user=os.environ["PG_USER"],
                password=os.environ["PG_PASSWORD"],
                dbname=os.environ["PG_DB"],
            )
            sql = f"""
            SELECT {col_role}, {col_userid}
            FROM {table}
            WHERE {col_user} = %s AND {col_pass} = %s
            LIMIT 1
            """
            with conn.cursor() as cur:
                cur.execute(sql, (username, password))
                row = cur.fetchone()
            conn.close()
        if not row:
            print("[login] Invalid credentials. Defaulting to role='customer' user_id='1' for demo.")
            return ("customer", "1")
        role, user_id = str(row[0]), str(row[1])
        print(f"[login] Authenticated. role={role} user_id={user_id}")
        return (role, user_id)
    except Exception as ex:
        print(f"[login] DB error ({dialect}), defaulting to admin/test_user: {ex}")
        return ("admin", "test_user")

# ========== Minimal MCP HTTP client (same flow as your toolList.py) ==========
class McpHttpClient:
    def __init__(self, url: str):
        self.url = url.rstrip("/")
        self.sid: Optional[str] = None
        self.headers: Dict[str, str] = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            # x-role / x-user-id set after login
        }

    def update_identity(self, role: str, user_id: str):
        """Update identity headers; call before initialize()"""
        self.headers["x-role"] = role
        self.headers["x-user-id"] = user_id

    def _post(self, payload: Dict[str, Any]) -> requests.Response:
        return requests.post(self.url, headers=self.headers, data=json.dumps(payload), timeout=60)

    @staticmethod
    def _parse_response(text: str) -> Dict[str, Any]:
        t = text.strip()
        if t.startswith("event:"):
            lines = t.splitlines()
            data_lines = [ln for ln in lines if ln.startswith("data:")]
            if not data_lines:
                raise ValueError(f"No 'data:' block in SSE: {t[:200]}...")
            payload = data_lines[-1][len("data: "):]
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
                "capabilities": {"roots": {"listChanged": True}, "sampling": {}, "tools": {}}
            }
        }
        r = self._post(payload)
        r.raise_for_status()
        sid = r.headers.get("mcp-session-id")
        if not sid:
            raise RuntimeError("MCP server did not return mcp-session-id in headers.")
        self.sid = sid

    def ready(self):
        assert self.sid, "Call initialize() first"
        self.headers["mcp-session-id"] = self.sid
        payload = {"jsonrpc": "2.0", "method": "notifications/initialized"}
        self._post(payload)  # ignore body

    def tools_call(self, name: str, arguments: Optional[Dict[str, Any]] = None) -> str:
        """
        Call an MCP tool and return a text payload suitable for Agent ToolOutput.
        We coerce MCP results (content=[{type:'json'|'text'}]) into a single string.
        """
        assert self.sid, "Call initialize() first"
        args = arguments if arguments is not None else {}
        payload = {
            "jsonrpc": "2.0",
            "id": "call-1",
            "method": "tools/call",
            "params": {"name": name, "arguments": args}
        }
        r = self._post(payload)
        r.raise_for_status()
        obj = self._parse_response(r.text)
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

_mcp = McpHttpClient(MCP_SERVER_URL)
_mcp_initialized = False
def _ensure_mcp_session():
    global _mcp_initialized
    if not _mcp_initialized:
        _mcp.initialize()
        _mcp.ready()
        _mcp_initialized = True

# ========== Function tools (generalized) ==========
def db_aliases() -> str:
    """Return list of available database aliases as a JSON string."""
    _ensure_mcp_session()
    return _mcp.tools_call("db.aliases", {})

def db_types() -> str:
    """Return list of available database dialects as a JSON string."""
    _ensure_mcp_session()
    return _mcp.tools_call("db.types", {})

def db_names() -> str:
    """Return list of database names (not aliases) as a JSON string."""
    _ensure_mcp_session()
    return _mcp.tools_call("db.names", {})

def db_list_by_type(type: str, unique: bool = True, includeAliases: bool = False) -> str:
    """List databases for a given dialect."""
    _ensure_mcp_session()
    args = {"type": type, "unique": unique, "includeAliases": includeAliases}
    return _mcp.tools_call("db.listByType", args)

def sql_schema(alias: str) -> str:
    """Return a compact Markdown outline of tables and columns for the given alias."""
    _ensure_mcp_session()
    return _mcp.tools_call(f"{alias}.sql.schema", {})

def sql_peek(alias: str, maxRowsPerTable: int = 50, as_: str = "markdown") -> str:
    """Peek into content for the given alias."""
    _ensure_mcp_session()
    args = {"maxRowsPerTable": maxRowsPerTable, "as": as_}
    return _mcp.tools_call(f"{alias}.sql.peek", args)

def sql_query(alias: str, sql: str, params: Optional[dict] = None,
              readOnly: bool = True, rowLimit: int = 1000, as_: str = "json") -> str:
    """Execute a parameterized SQL query against the given alias."""
    _ensure_mcp_session()
    args = {"sql": sql, "params": params or {}, "readOnly": readOnly, "rowLimit": rowLimit, "as": as_}
    return _mcp.tools_call(f"{alias}.sql.query", args)

# ========== Build FunctionTool set ==========
USER_FUNCTIONS: Set[Callable[..., Any]] = {
    db_aliases,
    db_types,
    db_names,
    db_list_by_type,
    sql_schema,
    sql_peek,
    sql_query,
}
FUNCTIONS = FunctionTool(functions=USER_FUNCTIONS)  # Agent can call these tools

# ========== Run helpers ==========
TERMINAL = {"completed", "failed", "expired", "cancelled"}
def normalize_status(run) -> str:
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

def poll_until_terminal(client: AgentsClient, thread_id: str, run_id: str, interval: float = 1.0):
    last_status = None
    while True:
        run = client.runs.get(thread_id=thread_id, run_id=run_id)
        status = normalize_status(run)
        if status != last_status:
            print(f"[debug] run status -> {status}")
            last_status = status
        if status in TERMINAL:
            return run
        if "requires_action" in status and isinstance(getattr(run, "required_action", None), SubmitToolOutputsAction):
            tool_calls = run.required_action.submit_tool_outputs.tool_calls
            outputs = []
            for tc in tool_calls:
                print(f"[debug] tool_call: name={getattr(tc,'name','?')} args={getattr(tc,'arguments',{})}")
                if isinstance(tc, RequiredFunctionToolCall):
                    try:
                        out = FUNCTIONS.execute(tc)  # bridges to MCP HTTP
                    except Exception as ex:
                        out = f"ERROR executing function '{getattr(tc,'name','?')}': {ex}"
                    outputs.append(ToolOutput(tool_call_id=tc.id, output=out))
            if outputs:
                client.runs.submit_tool_outputs(thread_id=thread_id, run_id=run_id, tool_outputs=outputs)
        time.sleep(interval)

# ========== Main ==========
def main():
    # 1) Login (Railway DB) -> get role + user_id, bind to MCP headers
    role, user_id = railway_login()
    _mcp.update_identity(role, user_id)  # must be before initialize
    _ensure_mcp_session()  # session created using this identity

    # 2) Discover aliases and pick a default alias for this session (tiny addition)
    try:
        aliases = json.loads(db_aliases())
    except Exception:
        aliases = []
    # Prefer role-specific alias if present; else first available alias
    default_alias = None
    role_l = (role or "").lower()
    if role_l.startswith("customer") and "customer_db" in aliases:
        default_alias = "customer_db"
    elif role_l.startswith("merchant") and "merchant_db" in aliases:
        default_alias = "merchant_db"
    elif aliases:
        default_alias = aliases[0]

    # 3) Get a compact schema preview for the default alias and inject into instructions
    schema_preview = ""
    if default_alias:
        try:
            schema_preview = sql_schema(default_alias)
            # keep the preview short to avoid flooding context (adjust as needed)
            schema_preview = schema_preview[:4000]
        except Exception:
            schema_preview = ""

    # 4) Identity-aware instructions (small change from your original)
    agent_instructions = (
        "You can use the provided tools to answer questions.\n"
        f"- Signed-in identity: role={role}, user_id={user_id}.\n"
        f"- Default database alias to use when not specified: {default_alias}.\n"
        "- Do NOT ask for credentials; the user is already authenticated.\n"
        "- When the user says \"my ...\", interpret it with this identity (user_id above).\n"
        "- Use db_aliases/db_types/db_names/db_list_by_type to discover databases if needed.\n"
        "- When inspecting or querying a specific database, call sql_schema/peek/query and "
        "pass the alias argument (use the default alias unless the user specifies another).\n"
        "- If a tool returns JSON text, summarize as needed.\n"
        "\n"
        "### Schema overview (default alias)\n"
        f"{schema_preview}\n"
    )

    # 5) Azure Agents client
    agents_client = AgentsClient(
        endpoint=PROJECT_ENDPOINT,
        credential=DefaultAzureCredential(
            exclude_environment_credential=True,
            exclude_managed_identity_credential=True,
        ),
    )

    # 6) Create agent with generalized function tools + identity-aware instructions
    with agents_client:
        agent = agents_client.create_agent(
            model=MODEL_DEPLOYMENT_NAME,
            name="sql-mcp-bridge-agent",
            instructions=agent_instructions,
            tools=FUNCTIONS.definitions,
        )
        print(f"Agent created: {agent.id}")
        thread = agents_client.threads.create()
        print(f"Thread created: {thread.id}")

        while True:
            prompt = input("\nAsk something (or 'quit'): ").strip()
            if prompt.lower() in ("quit", "q", "exit"):
                break
            agents_client.messages.create(thread_id=thread.id, role="user", content=prompt)
            run = agents_client.runs.create(thread_id=thread.id, agent_id=agent.id)
            run = poll_until_terminal(agents_client, thread.id, run.id)
            print(f"Run status: {normalize_status(run)}")

            # Show conversation
            try:
                msgs = agents_client.messages.list(thread_id=thread.id, order=ListSortOrder.ASCENDING)
                print("\nConversation:")
                print("-" * 60)
                for m in msgs:
                    if m.text_messages:
                        for tm in m.text_messages:
                            print(f"{m.role.upper()}: {tm.text.value}")
                print("-" * 60)
            except Exception as e:
                print("⚠️ Could not list messages:", e)

        # Optional cleanup
        try:
            agents_client.delete_agent(agent.id)
        except Exception:
            pass

if __name__ == "__main__":
    main()