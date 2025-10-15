# agent_mcp_cmd.py
"""
CMD-based demo: Azure AI Foundry Agent <-> MCP Server (HTTP)
- Prompts for username/password and verifies against your Cloud DB (MySQL/Postgres).
- On successful login, binds X-Role and X-User-Id to MCP HTTP session.
- Creates an Azure Agent with function tools that bridge to MCP tools.
- Lets the user chat; agent calls MCP tools to query your DBs (per RBAC/policies).
- Typing 'q' or 'quit' deletes the agent and closes the MCP session cleanly.

Requirements:
  pip install python-dotenv requests azure-identity azure-ai-agents
  # plus one of:
  pip install mysql-connector-python      # if using MySQL for login
  pip install psycopg2-binary             # if using Postgres for login
"""

import os
import sys
import json
import time
import getpass
from typing import Any, Dict, Optional, Tuple, Callable, Set

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

# ---------- Load env ----------
load_dotenv()

PROJECT_ENDPOINT = os.environ["PROJECT_ENDPOINT"]
MODEL_DEPLOYMENT_NAME = os.environ["MODEL_DEPLOYMENT_NAME"]
MCP_SERVER_URL_2 = os.environ["MCP_SERVER_URL_2"].rstrip("/")

if not PROJECT_ENDPOINT or not MODEL_DEPLOYMENT_NAME or not MCP_SERVER_URL_2:
    print("❌ Missing env: PROJECT_ENDPOINT, MODEL_DEPLOYMENT_NAME, MCP_SERVER_URL_2")
    sys.exit(1)

# Reduce noisy logs unless debugging
os.environ.setdefault("AZURE_LOG_LEVEL", "warning")

# ---------- DB Login (MySQL/Postgres) ----------
def db_login_loop() -> Tuple[str, str, str]:
    """
    Repeatedly prompt the user for username/password and verify against your DB.

    Returns:
        (role, user_id, username) for the authenticated user.
    """
    # Config for auth table/columns (override by env if needed)
    table = os.environ.get("AUTH_TABLE", "users")
    col_user = os.environ.get("AUTH_USER_COL", "username")
    col_pass = os.environ.get("AUTH_PASS_COL", "password")
    col_role = os.environ.get("AUTH_ROLE_COL", "role")
    col_userid = os.environ.get("AUTH_ID_COL", "user_id")

    # Dialect from env hints (prefer explicit)
    dialect = (os.environ.get("DB_PROVIDER") or os.environ.get("DB_DIALECT") or "").lower()
    if not dialect:
        # Derive from presence of connection envs
        dialect = "mysql" if os.environ.get("MYSQL_HOST") else ("pg" if os.environ.get("PG_HOST") else "")

    if dialect not in ("mysql", "pg"):
        print("❌ No DB_PROVIDER (mysql|pg) set and no MYSQL_HOST/PG_HOST present.")
        print("   Please configure your login DB connection envs.")
        sys.exit(1)

    print(f"[login] Using {dialect.upper()} for credential verification.")
    while True:
        username = input("Login username: ").strip()
        # Use getpass for password masking in CMD
        password = getpass.getpass("Login password: ").strip()

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
            else:  # Postgres
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
                print("⚠️ Invalid credentials. Please try again.\n")
                continue

            role, user_id = str(row[0]), str(row[1])
            print(f"[login] Authenticated. role={role} user_id={user_id}")
            return role, user_id, username

        except Exception as ex:
            print(f"❌ DB error: {ex}")
            print("   Please verify your DB env and try again.\n")
            time.sleep(0.8)

# ---------- Minimal MCP HTTP client ----------
class McpHttpClient:
    """
    Speaks JSON-RPC over your MCP HTTP endpoint (/mcp).
    - POST initialize → receives mcp-session-id in response headers.
    - Subsequent requests carry mcp-session-id + X-Role + X-User-Id.
    - Tools are invoked by 'tools/call' with {name, arguments}.

    Server-side behavior referenced from your http.ts and tools/sql code.  # MCP server returns mcp-session-id in headers; expects X-Role/X-User-Id. [1](https://enfrasysconsulting-my.sharepoint.com/personal/muhammad_idzhans_enfrasys_com/Documents/Microsoft%20Copilot%20Chat%20Files/All%20files%20code.txt)
    """
    def __init__(self, url: str):
        self.url = url.rstrip("/")
        self.sid: Optional[str] = None
        self.headers: Dict[str, str] = {
            "Content-Type": "application/json",
            # Streamable HTTP supports JSON or SSE responses; accept both:
            "Accept": "application/json, text/event-stream",
        }

    def set_identity(self, role: str, user_id: str):
        self.headers["x-role"] = role       # RBAC / alias allowlist from policies.yaml [1](https://enfrasysconsulting-my.sharepoint.com/personal/muhammad_idzhans_enfrasys_com/Documents/Microsoft%20Copilot%20Chat%20Files/All%20files%20code.txt)
        self.headers["x-user-id"] = user_id # row filters use :user_id injected via userContext [1](https://enfrasysconsulting-my.sharepoint.com/personal/muhammad_idzhans_enfrasys_com/Documents/Microsoft%20Copilot%20Chat%20Files/All%20files%20code.txt)

    def _post(self, payload: Dict[str, Any]) -> requests.Response:
        return requests.post(self.url, headers=self.headers, data=json.dumps(payload), timeout=60)

    @staticmethod
    def _parse_mcp_response(text: str) -> Dict[str, Any]:
        """
        Supports either plain JSON or SSE ('event: message\\ndata: {...}\\n\\n').
        """
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
            raise RuntimeError("MCP server did not return mcp-session-id header.")
        self.sid = sid

    def ready(self):
        assert self.sid, "Call initialize() first"
        self.headers["mcp-session-id"] = self.sid
        payload = {"jsonrpc": "2.0", "method": "notifications/initialized"}
        # server does not require body parsing here
        self._post(payload)

    def tools_call(self, name: str, arguments: Optional[Dict[str, Any]] = None) -> str:
        """
        Execute a tool and return a single text result for easier display.
        Your server returns content=[{type:'text'|'json'}]; we stringify to text.

        Tool names include discovery (db.aliases/types/names/listByType) and
        namespaced SQL tools: "<alias>.sql.schema|peek|query". [1](https://enfrasysconsulting-my.sharepoint.com/personal/muhammad_idzhans_enfrasys_com/Documents/Microsoft%20Copilot%20Chat%20Files/All%20files%20code.txt)
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
        """
        Cleanly delete the server-side MCP session.
        """
        if not self.sid:
            return
        try:
            requests.delete(self.url, headers=self.headers, timeout=30)
        except Exception:
            pass
        self.sid = None


# ---------- Function tools (Agent -> MCP bridge) ----------
def build_function_tools(mcp: McpHttpClient) -> FunctionTool:
    """
    Expose a small set of functions the Agent can call.
    These map to your MCP tools and keep the agent general-purpose.
    """

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

    def sql_query(alias: str, sql: str, params: Optional[dict] = None,
                  readOnly: bool = True, rowLimit: int = 1000, as_: str = "json") -> str:
        args = {"sql": sql, "params": params or {}, "readOnly": readOnly, "rowLimit": rowLimit, "as": as_}
        return mcp.tools_call(f"{alias}.sql.query", args)

    USER_FUNCTIONS: Set[Callable[..., Any]] = {
        db_aliases, db_types, db_names, db_list_by_type, sql_schema, sql_peek, sql_query
    }
    return FunctionTool(functions=USER_FUNCTIONS)


# ---------- Azure Agent run helpers ----------
TERMINAL_STATES = {"completed", "failed", "expired", "cancelled"}

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
        if status in TERMINAL_STATES:
            return run

        # Tool bridge
        if "requires_action" in status and isinstance(getattr(run, "required_action", None), SubmitToolOutputsAction):
            tool_calls = run.required_action.submit_tool_outputs.tool_calls
            outputs = []
            for tc in tool_calls:
                print(f"[debug] tool_call: name={getattr(tc,'name','?')} args={getattr(tc,'arguments',{})}")
                if isinstance(tc, RequiredFunctionToolCall):
                    try:
                        # Execute locally defined FunctionTool
                        out = FUNCTIONS.execute(tc)
                    except Exception as ex:
                        out = f"ERROR executing '{getattr(tc,'name','?')}': {ex}"
                    outputs.append(ToolOutput(tool_call_id=tc.id, output=out))
            if outputs:
                client.runs.submit_tool_outputs(thread_id=thread_id, run_id=run_id, tool_outputs=outputs)
        time.sleep(interval)


# ---------- Main ----------
def main():
    # 1) Login and bind identity to MCP
    role, user_id, username = db_login_loop()

    mcp = McpHttpClient(url=MCP_SERVER_URL_2)
    mcp.set_identity(role=role, user_id=user_id)  # identity headers required by your server [1](https://enfrasysconsulting-my.sharepoint.com/personal/muhammad_idzhans_enfrasys_com/Documents/Microsoft%20Copilot%20Chat%20Files/All%20files%20code.txt)
    mcp.initialize()  # POST initialize → mcp-session-id header returned by your server [1](https://enfrasysconsulting-my.sharepoint.com/personal/muhammad_idzhans_enfrasys_com/Documents/Microsoft%20Copilot%20Chat%20Files/All%20files%20code.txt)
    mcp.ready()

    global FUNCTIONS
    FUNCTIONS = build_function_tools(mcp)

    # 2) Azure Agents client
    agents_client = AgentsClient(
        endpoint=PROJECT_ENDPOINT,
        credential=DefaultAzureCredential(
            exclude_environment_credential=True,
            exclude_managed_identity_credential=True,
        ),
    )

    # 3) Create agent with instructions tailored to your RBAC + row filters
    #    Ensures "my" resolves to the logged-in user without follow-up questions.
    default_alias_hint = {
        "customer": "customer_db",
        "customer_admin": "customer_db",
        "merchant": "merchant_db",
        "merchant_admin": "merchant_db",
    }.get(role, None)

#     instructions = f"""
# You are assisting a signed-in user.
# - username: {username}
# - role: {role}
# - user_id: {user_id}

# Behavior:
# - Treat "my ..." as referring to user_id={user_id}.
# - Do NOT ask who the user is; you already know.
# - Use SQL tools via the provided functions (sql_schema / sql_peek / sql_query).
# - Prefer named parameters (e.g., :user_id) and small result sets.
# - If role is not 'admin', avoid discovery tools unless needed; rely on default alias.
# - Default alias: {default_alias_hint or "(none)"} (use this unless the user explicitly chooses another allowed alias).
# - Examples the user may ask:
#   "What is my current total amount of points?"
#   → Call sql_schema (once if needed), then sql_query on the default alias with a SELECT that aggregates from the relevant table(s),
#     using :user_id and LIMIT/TOP/ROWNUM as appropriate for the dialect.

# Important:
# - Your access is scoped by the server using X-Role and X-User-Id headers.
# - If a query is rejected, adjust to allowed tables or apply row filters (e.g., WHERE user_id = :user_id).
# """.strip()

    instructions = f"""
You are assisting a signed-in user.
- username: {username}
- role: {role}
- user_id: {user_id}

Identity & pronouns
- Treat any phrase like “my points”, “my purchases”, “my account” as referring to user_id={user_id}.
- Do NOT ask the user who they are; you already know from the session headers.

Alias selection
- Default to alias **customer_db** for any question about the user’s account, points, or purchase history.
- Use alias **merchant_db** ONLY when the user wants to browse or ask about items/products (catalog browsing).

Allowed tables (customer role)
- In **customer_db**: you may query ONLY these tables: `users`, `purchase_history`, `points_history`.
- In **merchant_db**: you may query ONLY the `items` table.
- If you attempt a table outside these lists, adjust your plan to an allowed table and try again.

Tool usage
- Prefer `<alias>.sql.query` for answers. Call `<alias>.sql.schema` once if you need to confirm the exact column names.
- Do NOT use `sql.peek` for customer questions.
- Discovery tools (db.aliases/types/names) are unnecessary; you already know which aliases to use for this role.

SQL rules
- Use **read-only SELECT** statements with **named parameters** (e.g., `:user_id`, `:limit`).
- Keep results small. Always include a limit (LIMIT / TOP / ROWNUM depending on dialect).
- For personal data in **customer_db**, ALWAYS include a `WHERE user_id = :user_id` filter.
- For **merchant_db.items**, no user filter is required unless specified (e.g., `WHERE is_active = 1`).

Examples
- “What is my current total amount of points?”
  → alias=customer_db; query points from `points_history` with `WHERE user_id = :user_id`.
    Example (generic): SELECT SUM(points) AS total_points FROM points_history WHERE user_id = :user_id;

- “Show my last 5 purchases.”
  → alias=customer_db; query `purchase_history` filtered by user and ordered by recency.
    Example: SELECT purchase_id, item_id, total_price, purchase_date
             FROM purchase_history
             WHERE user_id = :user_id
             ORDER BY purchase_date DESC
             LIMIT :limit; (set :limit = 5)

- “List available items.”
  → alias=merchant_db; query `items` and return a concise list with name/price/availability.
    Example: SELECT item_id, name, price, availability_status
             FROM items
             WHERE is_active = 1
             ORDER BY name ASC
             LIMIT :limit; (e.g., :limit = 10)

Error handling
- If a call fails with a policy/permission error, switch to the allowed alias/table and add required filters (e.g., `user_id = :user_id`), then retry.

Response style
- Return concise answers with the computed values (e.g., the total points number) and a short summary. Avoid exposing raw SQL unless the user asks for it.
""".strip()

    with agents_client:
        agent = agents_client.create_agent(
            model=MODEL_DEPLOYMENT_NAME,
            name="mcp-sql-agent",
            instructions=instructions,
            tools=FUNCTIONS.definitions,
        )
        print(f"Agent created: {agent.id}")

        thread = agents_client.threads.create()
        print(f"Thread created: {thread.id}")

        try:
            while True:
                prompt = input("\nAsk something (or 'quit'/'q'): ").strip()
                if prompt.lower() in ("quit", "q", "exit"):
                    break

                agents_client.messages.create(thread_id=thread.id, role="user", content=prompt)
                run = agents_client.runs.create(thread_id=thread.id, agent_id=agent.id)
                run = poll_until_terminal(agents_client, thread.id, run.id)

                # Show conversation as simple alternating blocks
                try:
                    msgs = agents_client.messages.list(thread_id=thread.id, order=ListSortOrder.ASCENDING)
                    print("\nConversation:")
                    print("=" * 80)
                    for m in msgs:
                        if m.text_messages:
                            for tm in m.text_messages:
                                print(f"{m.role.upper()}: {tm.text.value}\n")
                    print("=" * 80)
                except Exception as e:
                    print("⚠️ Could not list messages:", e)

        finally:
            # Cleanup: delete agent and close MCP session
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
