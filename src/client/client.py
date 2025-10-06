# import os
# import requests
# from dotenv import load_dotenv

# # Load environment variables from .env
# load_dotenv()
# project_endpoint = os.getenv("PROJECT_ENDPOINT")  # e.g. https://<project>.region.inference.ai.azure.com
# api_key = os.getenv("AZURE_AI_KEY")
# model_deployment = os.getenv("MODEL_DEPLOYMENT_NAME")

# # Setup headers for API Key auth
# headers = {
#     "Content-Type": "application/json",
#     "api-key": api_key,
# }

# # Base API version
# api_version = "2024-12-01-preview"

# # ---- Step 1: Create Agent ----
# agent_payload = {
#     "model": model_deployment,
#     "name": "sql-mcp-agent",
#     "instructions": """
#     You have access to an MCP server called SQL MCP Server - this tool allows you to 
#     access the databases that is connect in this MCP Server via the tools provided.
#     You should be able to read and display the data to the user.
#     """
# }

# resp = requests.post(
#     f"{project_endpoint}/agents?api-version={api_version}",
#     headers=headers,
#     json=agent_payload,
# )
# # resp.raise_for_status()
# agent = resp.json()
# print(f"Created agent, ID: {agent['id']}")

# # ---- Step 2: Create Thread ----
# resp = requests.post(
#     f"{project_endpoint}/threads?api-version={api_version}",
#     headers=headers,
#     json={}
# )
# resp.raise_for_status()
# thread = resp.json()
# print(f"Created thread, ID: {thread['id']}")

# # ---- Step 3: Send user message ----
# prompt = input("\nHow can I help?: ")
# message_payload = {
#     "role": "user",
#     "content": prompt
# }

# resp = requests.post(
#     f"{project_endpoint}/threads/{thread['id']}/messages?api-version={api_version}",
#     headers=headers,
#     json=message_payload,
# )
# resp.raise_for_status()
# message = resp.json()
# print(f"Created message, ID: {message['id']}")

# # ---- Step 4: Run agent ----
# run_payload = {
#     "agentId": agent["id"]
#     # If you want to pass toolset/MCP config later, add here
# }

# resp = requests.post(
#     f"{project_endpoint}/threads/{thread['id']}/runs?api-version={api_version}",
#     headers=headers,
#     json=run_payload,
# )
# resp.raise_for_status()
# run = resp.json()
# print(f"Created run, ID: {run['id']} with status: {run['status']}")

# # ---- Step 5: Poll run status until complete ----
# import time

# while run["status"] in ("queued", "in_progress"):
#     time.sleep(2)
#     resp = requests.get(
#         f"{project_endpoint}/threads/{thread['id']}/runs/{run['id']}?api-version={api_version}",
#         headers=headers,
#     )
#     resp.raise_for_status()
#     run = resp.json()
#     print(f"Run status: {run['status']}")

# if run["status"] == "failed":
#     print(f"Run failed: {run.get('last_error')}")
# else:
#     print("Run completed successfully.")

# # ---- Step 6: Fetch messages ----
# resp = requests.get(
#     f"{project_endpoint}/threads/{thread['id']}/messages?api-version={api_version}",
#     headers=headers,
# )
# resp.raise_for_status()
# messages = resp.json().get("value", [])

# print("\nConversation:")
# print("-" * 50)
# for msg in messages:
#     role = msg["role"].upper()
#     if "content" in msg and isinstance(msg["content"], str):
#         print(f"{role}: {msg['content']}")
#         print("-" * 50)
#     elif "content" in msg and isinstance(msg["content"], list):
#         # Some responses may be structured in parts
#         for part in msg["content"]:
#             if "text" in part:
#                 print(f"{role}: {part['text']}")
#                 print("-" * 50)

# # ---- Step 7: Delete agent ----
# resp = requests.delete(
#     f"{project_endpoint}/agents/{agent['id']}?api-version={api_version}",
#     headers=headers,
# )
# if resp.status_code == 204:
#     print("Deleted agent")
# else:
#     print("Failed to delete agent:", resp.text)

















# import os
# from dotenv import load_dotenv

# # Add references
# # Add references
# from azure.identity import DefaultAzureCredential
# from azure.ai.agents import AgentsClient
# from azure.ai.agents.models import McpTool, ToolSet, ListSortOrder

# # Load environment variables from .env file
# load_dotenv()
# project_endpoint = os.getenv("PROJECT_ENDPOINT")
# model_deployment = os.getenv("MODEL_DEPLOYMENT_NAME")

# # Connect to the agents client
# agents_client = AgentsClient(
#     endpoint=project_endpoint,
#     credential=DefaultAzureCredential(
#         exclude_environment_credential=True,
#         exclude_managed_identity_credential=True
#     )
# )

# # MCP server configuration
# mcp_server_url = "https://sql-mcp-server01.onrender.com/mcp"
# mcp_server_label = "mslearn"

# # Initialize agent MCP tool
# mcp_tool = McpTool(
#     server_label=mcp_server_label,
#     server_url=mcp_server_url,
# )

# mcp_tool.set_approval_mode("never")

# toolset = ToolSet()
# toolset.add(mcp_tool)

# # Create agent with MCP tool and process agent run
# with agents_client:

#     # Create a new agent
#     agent = agents_client.create_agent(
#         model=model_deployment,
#         name="my-mcp-agent",
#         instructions="""
#     You are connected to an MCP server labeled 'mslearn' at a public HTTP endpoint.
#     When the user asks to list databases, call the MCP tools:
#     - db.aliases  (returns a JSON string of alias names)
#     - db.names    (returns a JSON string of database names)

#     After receiving tool output, return the tool's text content to the user verbatim (no paraphrase).
#     If a tool returns JSON, output the JSON as-is.
#     """,
#     )


#     # Log info
#     print(f"Created agent, ID: {agent.id}")
#     print(f"MCP Server: {mcp_tool.server_label} at {mcp_tool.server_url}")

#     # Create thread for communication
#     thread = agents_client.threads.create()
#     print(f"Created thread, ID: {thread.id}")

#     # Create a message on the thread
#     prompt = input("\nHow can I help?: ")
#     message = agents_client.messages.create(
#         thread_id=thread.id,
#         role="user",
#         content=prompt,
#     )
#     # print(f"Created message, ID: {message.id}")

#     # Create and process agent run in thread with MCP tools
#     run = agents_client.runs.create_and_process(thread_id=thread.id, agent_id=agent.id, toolset=toolset)
#     print(f"Created run, ID: {run.id}")
    
#     # Check run status
#     print(f"Run completed with status: {run.status}")
#     if run.status == "failed":
#         print(f"Run failed: {run.last_error}")

#     # Display run steps and tool calls
#     run_steps = agents_client.run_steps.list(thread_id=thread.id, run_id=run.id)
#     for step in run_steps:
#         print(f"Step {step['id']} status: {step['status']}")

#         # Check if there are tool calls in the step details
#         step_details = step.get("step_details", {})
#         tool_calls = step_details.get("tool_calls", [])

#         if tool_calls:
#             # Display the MCP tool call details
#             print("  MCP Tool calls:")
#             for call in tool_calls:
#                 print(f"    Tool Call ID: {call.get('id')}")
#                 print(f"    Type: {call.get('type')}")
#                 print(f"    Type: {call.get('name')}")

#         print()  # add an extra newline between steps

#     # Fetch and log all messages
#     messages = agents_client.messages.list(thread_id=thread.id, order=ListSortOrder.ASCENDING)
#     print("\nConversation:")
#     print("-" * 50)
#     for msg in messages:
#         if msg.text_messages:
#             last_text = msg.text_messages[-1]
#             print(f"{msg.role.upper()}: {last_text.text.value}")
#             print("-" * 50)

#     # Clean-up and delete the agent once the run is finished.
#     agents_client.delete_agent(agent.id)
#     print("Deleted agent")

































# import os
# import time
# import json
# from dotenv import load_dotenv

# from azure.identity import DefaultAzureCredential
# from azure.ai.agents import AgentsClient
# from azure.ai.agents.models import McpTool, ToolSet, ListSortOrder

# MAX_WAIT_SECONDS = 20
# POLL_INTERVAL = 1.0  # seconds


# def wait_for_run_completion(agents_client: AgentsClient, thread_id: str, run_id: str,
#                             max_wait_s: int = MAX_WAIT_SECONDS) -> dict:
#     """
#     Poll the run until it is not (queued|in_progress|requires_action) or until timeout.
#     Returns the final run object (dict-like).
#     """
#     deadline = time.monotonic() + max_wait_s
#     status = None
#     while time.monotonic() < deadline:
#         run = agents_client.runs.get(thread_id=thread_id, run_id=run_id)
#         status = getattr(run, "status", None) or run.get("status")
#         print(f"Run status: {status}")
#         if status not in ("queued", "in_progress", "requires_action"):
#             return run
#         time.sleep(POLL_INTERVAL)
#     # Timeout: return the last observed run
#     print("[warn] Run polling reached 20s timeout.")
#     return run


# def wait_for_assistant_message(agents_client: AgentsClient, thread_id: str,
#                                max_wait_s: int = MAX_WAIT_SECONDS) -> list:
#     """
#     Poll messages until at least one assistant message with text is present or timeout.
#     Returns the message list (ascending order).
#     """
#     deadline = time.monotonic() + max_wait_s
#     while time.monotonic() < deadline:
#         msgs = agents_client.messages.list(thread_id=thread_id, order=ListSortOrder.ASCENDING)
#         # Look for any assistant message
#         has_assistant = any(getattr(m, "role", "").lower() == "assistant" for m in msgs)
#         if has_assistant:
#             return msgs
#         time.sleep(POLL_INTERVAL)
#     print("[warn] Waiting for assistant message hit 20s timeout.")
#     return agents_client.messages.list(thread_id=thread_id, order=ListSortOrder.ASCENDING)


# def print_step_details(details: dict):
#     print("Step details:")
#     try:
#         print(json.dumps(details, indent=2))
#     except Exception:
#         print(details)


# # ----------------- your original setup (unchanged) -----------------
# load_dotenv()
# project_endpoint = os.getenv("PROJECT_ENDPOINT")
# model_deployment = os.getenv("MODEL_DEPLOYMENT_NAME")

# agents_client = AgentsClient(
#     endpoint=project_endpoint,
#     credential=DefaultAzureCredential(
#         exclude_environment_credential=True,
#         exclude_managed_identity_credential=True
#     )
# )

# mcp_server_url = "https://sql-mcp-server01.onrender.com/mcp"
# # mcp_server_url = "http://localhost:8787/mcp"
# mcp_server_label = "sqlmcpserver"

# mcp_tool = McpTool(
#     server_label=mcp_server_label,
#     server_url=mcp_server_url,
# )
# mcp_tool.set_approval_mode("never")

# toolset = ToolSet()
# toolset.add(mcp_tool)
# # -------------------------------------------------------------------

# os.system('cls')
# with agents_client:
#     # Create agent
#     agent = agents_client.create_agent(
#         model=model_deployment,
#         name="my-mcp-agent",
#         instructions="""
#         You are connected to an MCP server labeled 'mslearn' at a public HTTP endpoint.
#         When the user asks to list databases, call the MCP tools:
#         - db.aliases  (returns a JSON string of alias names)
#         - db.names    (returns a JSON string of database names)

#         After receiving tool output, return the tool's text content to the user verbatim (no paraphrase).
#         If a tool returns JSON, output the JSON as-is.
#         """,
#         toolset=toolset
#     )
#     print(f"Created agent, ID: {agent.id}")
#     print(f"MCP Server: {mcp_tool.server_label} at {mcp_tool.server_url}")

#     # Create thread
#     thread = agents_client.threads.create()
#     print(f"Created thread, ID: {thread.id}")

#     # Clear the console before run the conversation

#     while True:
#         # User message
#         prompt = input("\nHow can I help? (type 'quit' to exit): ").strip()
#         if prompt.lower() in ("quit", "q", "exit"):
#             break

#         _ = agents_client.messages.create(
#             thread_id=thread.id,
#             role="user",
#             content=prompt,
#         )

#         # --------- CHANGED: run + poll up to 20s instead of create_and_process ---------
#         run = agents_client.runs.create(thread_id=thread.id, agent_id=agent.id)
#         print(f"Created run, ID: {run.id}")

#         run = wait_for_run_completion(agents_client, thread_id=thread.id, run_id=run.id,
#                                     max_wait_s=MAX_WAIT_SECONDS)
#         print(f"Final run status: {run.status}")
#         if run.status == "failed":
#             print(f"Run failed: {getattr(run, 'last_error', None) or run.get('last_error')}")
#         # -------------------------------------------------------------------------------

#         # Show run steps (to inspect MCP tool activity)
#         run_steps = agents_client.run_steps.list(thread_id=thread.id, run_id=run.id)
#         for step in run_steps:
#             print(f"Step {step['id']} status: {step['status']}")
#             step_details = step.get("step_details", {}) or {}
#             print_step_details(step_details)
#             print()

#         # --------- NEW: wait (up to remaining 20s) for an assistant reply, then print ----

#         # messages = wait_for_assistant_message(agents_client, thread_id=thread.id,
#         #                                       max_wait_s=MAX_WAIT_SECONDS)

#         # print("\nConversation:")
#         # print("-" * 50)
#         # for msg in messages:
#         #     if getattr(msg, "text_messages", None):
#         #         last_text = msg.text_messages[-1]
#         #         print(f"{msg.role.upper()}: {last_text.text.value}")
#         #         print("-" * 50)

#         # --------------------------------------------------------------------------------
#         messages = agents_client.messages.list(thread_id=thread.id, order=ListSortOrder.ASCENDING)
#         print("\nConversation:")
#         print("-" * 50)
#         for msg in messages:
#             print(msg.role.upper() + ":")
#             # print any text_messages (there can be more than one)
#             if getattr(msg, "text_messages", None):
#                 for tm in msg.text_messages:
#                     print(tm.text.value)

#             print("-" * 50)

#         # --------------------------------------------------------------------------------

#     # Clean up
#     agents_client.delete_agent(agent.id)



















# import os
# import time
# import json
# from dotenv import load_dotenv

# from azure.identity import DefaultAzureCredential
# from azure.ai.agents import AgentsClient
# from azure.ai.agents.models import McpTool, ToolSet, ListSortOrder

# # Load env
# load_dotenv()
# project_endpoint = os.getenv("PROJECT_ENDPOINT")
# model_deployment = os.getenv("MODEL_DEPLOYMENT_NAME")

# # Azure client
# agents_client = AgentsClient(
#     endpoint=project_endpoint,
#     credential=DefaultAzureCredential(
#         exclude_environment_credential=True,
#         exclude_managed_identity_credential=True
#     )
# )

# # --- MCP tool config ---
# # --- MCP tool config ---
# mcp_server_url = "https://sql-mcp-server01.onrender.com/mcp"
# # mcp_server_url = "http://localhost:8787/mcp"
# mcp_server_label = "sqlmcpserver"

# mcp_tool = McpTool(
#     server_label=mcp_server_label,
#     server_url=mcp_server_url,
# )

# # 🔑 Force tools to always run when chosen
# mcp_tool.set_approval_mode("never")

# toolset = ToolSet()
# toolset.add(mcp_tool)

# # 🔍 Debug: show MCP tool info
# print("Registered MCP tool:")
# print(f"- Label: {mcp_tool.server_label}")
# print(f"- URL: {mcp_tool.server_url}")
# print(f"- Approval mode: {mcp_tool.set_approval_mode}")
# # ---------------------------------------------------------------

# os.system('cls')
# with agents_client:
#     # Create agent connected to MCP server
#     agent = agents_client.create_agent(
#         model=model_deployment,
#         name="sql-mcp-agent",
#         instructions = """
#         You are connected to an MCP server labeled 'sqlmcpserver'.

#         RULES:
#         - If the user asks about databases, you MUST call the correct MCP tool.
#         - Do NOT answer from your own knowledge.
#         - Use:
#           * 'db.aliases' → list aliases
#           * 'db.names' → list names
#           * '<alias>.sql.query' → execute SQL
#         - Always return ONLY the tool output, nothing else.
#         """,
#         toolset=toolset
#     )
#     print(f"Agent created: {agent.id}")

#     # Create thread
#     thread = agents_client.threads.create()
#     print(f"Thread created: {thread.id}")

#     while True:
#         prompt = input("\nAsk something (or 'quit'): ").strip()
#         if prompt.lower() in ("quit", "q", "exit"):
#             break

#         # Send message
#         _ = agents_client.messages.create(
#             thread_id=thread.id,
#             role="user",
#             content=prompt,
#         )

#         # Run agent with MCP
#         run = agents_client.runs.create_and_process(
#             thread_id=thread.id, 
#             agent_id=agent.id, 
#             toolset=toolset
#         )
#         print(f"Run status: {run.status}")

#         # 🔍 Inspect tool calls
#         run_steps = agents_client.run_steps.list(thread_id=thread.id, run_id=run.id)
#         for step in run_steps:
#             print(f"\nStep {step.id} status: {step.status}")
#             if step.step_details:
#                 print("Step details:")
#                 print(json.dumps(step.step_details.__dict__, indent=2, default=str))

#         # Print assistant response
#         messages = agents_client.messages.list(
#             thread_id=thread.id, 
#             order=ListSortOrder.ASCENDING
#         )
#         print("\nConversation:")
#         print("-" * 50)
#         for msg in messages:
#             if msg.text_messages:
#                 for tm in msg.text_messages:
#                     print(f"{msg.role.upper()}: {tm.text.value}")
#             print("-" * 50)

#     # Clean up
#     agents_client.delete_agent(agent.id)





































# client.py
# ------------------------------------------------------------
# Requirements (one-time):
#   pip install "azure-ai-projects" "azure-ai-agents>=1.2.0b3" azure-identity
#
# Env vars:
#   PROJECT_ENDPOINT       -> Your Azure AI Foundry project endpoint
#   MODEL_DEPLOYMENT_NAME  -> Your model deployment name
#
# Notes:
# - Uses MCP via ToolSet on runs.create_and_process(...) (NO tool_resources here).
# - Auto-approves MCP tool calls via RunHandler, and also sets approval_mode("never").
# - Adds role/user headers expected by your MCP server (x-role, x-user-id).
# - Works with your Streamable HTTP MCP server at /mcp.
# ------------------------------------------------------------

import os
import json
import sys
from dotenv import load_dotenv

from azure.identity import DefaultAzureCredential
from azure.ai.projects import AIProjectClient
from azure.ai.agents.models import (
    McpTool,
    ToolSet,
    ListSortOrder,
    RunHandler,
    ThreadRun,
    RequiredMcpToolCall,
    ToolApproval,
)

# ---------------------------
# Load environment
# ---------------------------
load_dotenv()
PROJECT_ENDPOINT = os.getenv("PROJECT_ENDPOINT")
MODEL_DEPLOYMENT = os.getenv("MODEL_DEPLOYMENT_NAME")

if not PROJECT_ENDPOINT or not MODEL_DEPLOYMENT:
    print(
        "[ERROR] Missing PROJECT_ENDPOINT or MODEL_DEPLOYMENT_NAME env vars.\n"
        "Set them and re-run. Example (PowerShell):\n"
        "  $env:PROJECT_ENDPOINT='https://<id>.services.ai.azure.com/api/projects/<project>'\n"
        "  $env:MODEL_DEPLOYMENT_NAME='gpt-4o-mini'\n",
        file=sys.stderr,
    )
    sys.exit(1)

# ---------------------------
# MCP tool/server settings
# ---------------------------
MCP_SERVER_URL = "https://sql-mcp-server01.onrender.com/mcp"
MCP_SERVER_LABEL = "sqlmcpserver"

# Build MCP tool definition
mcp_tool = McpTool(
    server_label=MCP_SERVER_LABEL,
    server_url=MCP_SERVER_URL,
    # Optional: restrict which server tools the agent can call
    allowed_tools=["db.aliases", "db.names", "db.types", "db.listByType", "customer_db.sql.query"],
)

# Approval mode & headers forwarded per run (via ToolSet → tool resources)
mcp_tool.set_approval_mode("never")  # avoid human-in-the-loop for safe read ops
mcp_tool.update_headers("x-role", "admin")         # your server uses this for discovery RBAC
mcp_tool.update_headers("x-user-id", "test_user")  # satisfies row-level filters if used
# (Optional) Streamable HTTP spec recommends POST Accept includes both JSON & SSE; SDK handles this,
# but adding is harmless:
mcp_tool.update_headers("Accept", "application/json, text/event-stream")

# Wrap in ToolSet (this is what create_and_process expects)
toolset = ToolSet()
toolset.add(mcp_tool)


# ---------------------------
# Auto-approve MCP tool calls
# (used by create_and_process)
# ---------------------------
class AutoApproveMcp(RunHandler):
    def submit_mcp_tool_approval(
        self, *, run: ThreadRun, tool_call: RequiredMcpToolCall, **kwargs
    ) -> ToolApproval:
        # Forward the headers we set on the McpTool (x-role, x-user-id, approval policy, etc.)
        return ToolApproval(
            tool_call_id=tool_call.id,
            approve=True,
            headers=mcp_tool.headers,
        )


def print_steps(agents_client, thread_id: str, run_id: str) -> None:
    steps = agents_client.run_steps.list(thread_id=thread_id, run_id=run_id)
    for step in steps:
        print(f"\n[Step] {step.id}  status={step.status}")
        # Show whatever the SDK exposes for debugging
        try:
            details = getattr(step, "step_details", None)
            if details is not None:
                print(json.dumps(details.__dict__, indent=2, default=str))
        except Exception:
            pass


def print_conversation(agents_client, thread_id: str) -> None:
    msgs = agents_client.messages.list(thread_id=thread_id, order=ListSortOrder.ASCENDING)
    print("\nConversation:")
    print("-" * 60)
    for msg in msgs:
        if msg.text_messages:
            for tm in msg.text_messages:
                print(f"{msg.role.upper()}: {tm.text.value}")
        print("-" * 60)


def main():
    # Create Azure client
    project_client = AIProjectClient(
        endpoint=PROJECT_ENDPOINT,
        credential=DefaultAzureCredential(
            exclude_environment_credential=True,        # keep same as your sample
            exclude_managed_identity_credential=True,   # adjust if you use MSI
        ),
    )

    with project_client:
        agents_client = project_client.agents

        # Create the Agent wired to our ToolSet (MCP server)
        agent = agents_client.create_agent(
            model=MODEL_DEPLOYMENT,
            name="sql-mcp-agent",
            instructions=(
                "You are connected to an MCP server labeled 'sqlmcpserver'.\n"
                "RULES:\n"
                "- If the user asks about databases, call the right MCP tool.\n"
                "- Do NOT answer from your own knowledge.\n"
                "- Use:\n"
                "  * 'db.aliases' → list aliases\n"
                "  * 'db.names' → list names\n"
                "  * '<alias>.sql.query' → execute SQL\n"
                "- Return ONLY the tool output."
            ),
            toolset=toolset,  # <— IMPORTANT: pass the ToolSet here
        )
        print(f"Agent created: {agent.id}")

        # Create a thread
        thread = agents_client.threads.create()
        print(f"Thread created: {thread.id}")

        print("\nType prompts (e.g., 'List me all database aliases.'). Type 'quit' to exit.")
        while True:
            prompt = input("\nAsk something (or 'quit'): ").strip()
            if prompt.lower() in ("quit", "q", "exit"):
                break

            # Add the user message
            _ = agents_client.messages.create(
                thread_id=thread.id,
                role="user",
                content=prompt,
            )

            # Create-and-process run with our ToolSet and auto-approval
            run = agents_client.runs.create_and_process(
                thread_id=thread.id,
                agent_id=agent.id,
                toolset=toolset,                 # <— IMPORTANT: NO tool_resources here
                run_handler=AutoApproveMcp(),    # auto-approve MCP tool calls
            )
            print(f"Run status: {run.status}")

            # Inspect steps and show the conversation
            print_steps(agents_client, thread.id, run.id)
            print_conversation(agents_client, thread.id)

        # Cleanup if you don't plan to reuse
        agents_client.delete_agent(agent.id)
        print("Agent deleted.")

if __name__ == "__main__":
    try:
        # Optional: clear console on Windows
        os.system('cls' if os.name == 'nt' else 'clear')
    except Exception:
        pass
    main()



