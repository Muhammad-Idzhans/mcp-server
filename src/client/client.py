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






















# import os
# import json
# from dotenv import load_dotenv

# from azure.identity import DefaultAzureCredential
# from azure.ai.agents import AgentsClient
# from azure.ai.agents.models import McpTool, ToolSet, ListSortOrder

# # --------------------------------------
# # Load env
# # --------------------------------------
# load_dotenv()
# project_endpoint = os.getenv("PROJECT_ENDPOINT")
# model_deployment = os.getenv("MODEL_DEPLOYMENT_NAME")

# # Allow swapping MCP server via env; defaults to public Echo server for testing
# mcp_server_url = os.getenv("MCP_SERVER_URL", "https://sql-mcp-server01.onrender.com/mcp")
# mcp_server_label = os.getenv("MCP_SERVER_LABEL", "sqlmcpserver")

# # --------------------------------------
# # Azure client
# # --------------------------------------
# agents_client = AgentsClient(
#     endpoint=project_endpoint,
#     credential=DefaultAzureCredential(
#         exclude_environment_credential=True,
#         exclude_managed_identity_credential=True
#     )
# )

# # --------------------------------------
# # MCP tool config
# # --------------------------------------
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
# print(f"- Approval mode: never")
# print("-" * 60)

# # --------------------------------------
# # Choose instructions based on MCP label
# # If you're testing your SQL MCP, keep your original rules.
# # Otherwise (e.g., Echo MCP), use generic tool instructions.
# # --------------------------------------
# def build_instructions(label: str) -> str:
#     if label.strip().lower() == "sqlmcpserver":
#         return (
#             "You are connected to an MCP server labeled 'sqlmcpserver'.\n\n"
#             "RULES:\n"
#             "- If the user asks about databases, you MUST call the correct MCP tool.\n"
#             "- Do NOT answer from your own knowledge.\n"
#             "- Use:\n"
#             "  * 'db.aliases' → list aliases\n"
#             "  * 'db.names' → list names\n"
#             "  * '<alias>.sql.query' → execute SQL\n"
#             "- Always return ONLY the tool output, nothing else."
#         )
#     else:
#         # Generic instructions for public/test MCPs (e.g., 'echomcp')
#         return (
#             f"You are connected to an MCP server labeled '{label}'.\n\n"
#             "RULES:\n"
#             "- Use the MCP tools exposed by the server to fulfill the user's request.\n"
#             "- Do NOT answer from your own knowledge.\n"
#             "- When the user specifies a tool and arguments (e.g., \"echo: {\"message\":\"Hi\"}\"), "
#             "you MUST call that tool and return ONLY the tool output.\n"
#             "- Always return ONLY the tool output, nothing else."
#         )

# # --------------------------------------
# # Run
# # --------------------------------------
# os.system('cls' if os.name == 'nt' else 'clear')
# with agents_client:
#     # Create agent connected to MCP server
#     agent = agents_client.create_agent(
#         model=model_deployment,
#         name="sql-mcp-agent",
#         instructions=build_instructions(mcp_server_label),
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
#         # run = agents_client.runs.create_and_process(
#         #     thread_id=thread.id,
#         #     agent_id=agent.id,
#         #     toolset=toolset
#         # )
#         run = agents_client.runs.create_and_process(
#             thread_id=thread.id,
#             agent_id=agent.id,
#             toolset=toolset,
#             additional_instructions="Call db.aliases",
#             tool_calls=[{
#                 "name": "db.aliases",
#                 "arguments": {}  # <-- ensure this is a dict, not a string
#             }]
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

























# import os
# import json
# from dotenv import load_dotenv

# from azure.identity import DefaultAzureCredential
# from azure.ai.agents import AgentsClient
# from azure.ai.agents.models import McpTool, ToolSet, ListSortOrder, MCPToolResource, ToolResources

# # --------------------------------------
# # Load env
# # --------------------------------------
# load_dotenv()
# project_endpoint = os.getenv("PROJECT_ENDPOINT")
# model_deployment = os.getenv("MODEL_DEPLOYMENT_NAME")

# # Allow swapping MCP server via env; defaults provided
# # mcp_server_url = os.getenv("MCP_SERVER_URL", "https://sql-mcp-server01.onrender.com/mcp")
# mcp_server_url = os.getenv("MCP_SERVER_URL", "https://mcp-server-isd-2.azurewebsites.net/mcp")

# mcp_server_label = os.getenv("MCP_SERVER_LABEL", "sqlmcpserver")

# # Optional: enable SDK HTTP logging for troubleshooting
# # You can also: set AZURE_LOG_LEVEL=info (or debug) in your shell
# os.environ.setdefault("AZURE_LOG_LEVEL", "info")

# # --------------------------------------
# # Azure client
# # --------------------------------------
# agents_client = AgentsClient(
#     endpoint=project_endpoint,
#     credential=DefaultAzureCredential(
#         exclude_environment_credential=True,
#         exclude_managed_identity_credential=True
#     )
# )

# # --------------------------------------
# # MCP tool config
# # --------------------------------------
# mcp_tool = McpTool(
#     server_label=mcp_server_label,
#     server_url=mcp_server_url,
#     allowed_tools=[
#         "db.aliases", "db.types", "db.names", "db.listByType"
#         # add namespaced tools after aliases work:
#         # "customer_db.sql.schema", "customer_db.sql.peek", "customer_db.sql.query",
#         # "merchant_db.sql.schema", "merchant_db.sql.peek", "merchant_db.sql.query",
#     ],
# )
# # 🔑 Auto-run MCP tools when selected by the model
# mcp_tool.set_approval_mode("never")
# mcp_tool.update_headers("Accept", "application/json, text/event-stream")
# mcp_tool.update_headers("x-role", "admin")


# toolset = ToolSet()
# toolset.add(mcp_tool)

# # 🔍 Debug: show MCP tool info
# print("Registered MCP tool:")
# print(f"- Label: {mcp_tool.server_label}")
# print(f"- URL: {mcp_tool.server_url}")
# print(f"- Approval mode: never")
# print("-" * 60)

# # --------------------------------------
# # Instructions
# # --------------------------------------
# def build_instructions(label: str) -> str:
#     if label.strip().lower() == "sqlmcpserver":
#         return (
#             "You are connected to an MCP server labeled 'sqlmcpserver'.\n\n"
#             "RULES:\n"
#             "- If the user asks about databases, you MUST call the correct MCP tool.\n"
#             "- Do NOT answer from your own knowledge.\n"
#             "- Use:\n"
#             "  * 'db.aliases' → list aliases\n"
#             "  * 'db.names' → list names\n"
#             "  * '<alias>.sql.query' → execute SQL\n"
#             "- Always return ONLY the tool output, nothing else."
#         )
#     else:
#         return (
#             f"You are connected to an MCP server labeled '{label}'.\n\n"
#             "RULES:\n"
#             "- Use the MCP tools exposed by the server to fulfill the user's request.\n"
#             "- Do NOT answer from your own knowledge.\n"
#             "- When the user specifies a tool and arguments (e.g., \"echo: {\"message\":\"Hi\"}\"), "
#             "you MUST call that tool and return ONLY the tool output.\n"
#             "- Always return ONLY the tool output, nothing else."
#         )

# # Optional: inject extra instructions only when user clearly asks for aliases
# def maybe_tool_instruction(prompt: str) -> str | None:
#     p = prompt.lower()
#     # crude but works for your testing
#     if "alias" in p and ("db" in p or "database" in p):
#         return "Call the MCP tool `db.aliases` and return only its output."
#     if "database names" in p or "db names" in p:
#         return "Call the MCP tool `db.names` and return only its output."
#     return None

# # --------------------------------------
# # Run
# # --------------------------------------
# os.system('cls' if os.name == 'nt' else 'clear')
# with agents_client:
#     # Create agent connected to MCP server
#     agent = agents_client.create_agent(
#         model=model_deployment,
#         name="sql-mcp-agent",
#         instructions=build_instructions(mcp_server_label),
#         toolset=[mcp_tool.definitions[0]],
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

#         # Decide if we want to bias this turn to a specific MCP tool
#         extra = maybe_tool_instruction(prompt)

#         try: 
#             mcp_resource = MCPToolResource(server_label=mcp_server_label)
#             tool_resources = ToolResources(mcp=[mcp_resource])
#             # Run agent with MCP (NO tool_calls kwarg!)
#             run = agents_client.runs.create_and_process(
#                 thread_id=thread.id,
#                 agent_id=agent.id,
#                 # toolset=toolset,
#                 tool_resources=tool_resources,
#                 additional_instructions=extra
#             )
#             print(f"Run status: {run.status}")

#             if run.status == "failed" or run.status.name == "FAILED":
#                 print("❌ Run failed. Checking details...")
#                 print(run.last_error)  # sometimes included in the object
        
#         except Exception as e:
#             print("🔥 Exception during run:")
#             print(e)

#         # 🔍 Inspect tool calls & steps
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







































# import os
# import json
# import time
# from dotenv import load_dotenv

# from azure.identity import DefaultAzureCredential
# from azure.ai.agents import AgentsClient
# from azure.ai.agents.models import (
#     McpTool,
#     ListSortOrder,
#     MCPToolResource,
#     ToolResources,
# )

# # --------------------------------------
# # Load env
# # --------------------------------------
# load_dotenv()
# project_endpoint = os.getenv("PROJECT_ENDPOINT")
# model_deployment = os.getenv("MODEL_DEPLOYMENT_NAME")

# mcp_server_url = os.getenv("MCP_SERVER_URL", "https://mcp-server-isd-2.azurewebsites.net/mcp")
# mcp_server_label = os.getenv("MCP_SERVER_LABEL", "sqlmcpserver")

# # Turn on verbose SDK logs while we debug
# os.environ.setdefault("AZURE_LOG_LEVEL", "debug")

# # --------------------------------------
# # Azure client
# # --------------------------------------
# agents_client = AgentsClient(
#     endpoint=project_endpoint,
#     credential=DefaultAzureCredential(
#         exclude_environment_credential=True,
#         exclude_managed_identity_credential=True,
#     ),
# )

# # --------------------------------------
# # MCP tool config (definition-level)
# # --------------------------------------
# mcp_tool = McpTool(
#     server_label=mcp_server_label,
#     server_url=mcp_server_url,
#     allowed_tools=[
#         "db.aliases", "db.types", "db.names", "db.listByType",
#         # (namespaced tools commented out)
#     ],
# )
# mcp_tool.set_approval_mode("never")
# mcp_tool.update_headers("Accept", "application/json, text/event-stream")
# mcp_tool.update_headers("x-role", "admin")

# print("Registered MCP tool:")
# print(f"- Label: {mcp_tool.server_label}")
# print(f"- URL:   {mcp_tool.server_url}")
# print("-" * 60)

# # --------------------------------------
# # Instructions
# # --------------------------------------
# def build_instructions(label: str) -> str:
#     return (
#         f"You are connected to an MCP server labeled '{label}'.\n\n"
#         "RULES:\n"
#         "- Use the MCP tools exposed by the server to fulfill the user's request.\n"
#         "- Do NOT answer from your own knowledge.\n"
#         "- Always return ONLY the tool output, nothing else."
#     )

# def maybe_tool_instruction(prompt: str) -> str | None:
#     p = prompt.lower()
#     if "alias" in p and ("db" in p or "database" in p):
#         return "Call the MCP tool `db.aliases` and return only its output."
#     if "database names" in p or "db names" in p:
#         return "Call the MCP tool `db.names` and return only its output."
#     return None

# # --------------------------------------
# # Run helpers
# # --------------------------------------
# TERMINAL_STATES = {"completed", "failed", "expired", "cancelled"}

# def poll_run_until_terminal(thread_id: str, run_id: str, interval_sec: float = 1.0):
#     """
#     Polls run status until it reaches a terminal state.
#     """
#     while True:
#         run = agents_client.runs.get(thread_id=thread_id, run_id=run_id)
#         if isinstance(run.status, str):
#             status = run.status.lower()
#         else:
#             status = str(run.status).lower()
#         if status in TERMINAL_STATES:
#             return run
#         time.sleep(interval_sec)

# # --------------------------------------
# # Main
# # --------------------------------------
# def main() -> None:
#     os.system('cls' if os.name == 'nt' else 'clear')

#     with agents_client:
#         # ✅ Create the agent with tool DEFINITIONS (not toolset)
#         agent = agents_client.create_agent(
#             model=model_deployment,
#             name="sql-mcp-agent",
#             instructions=build_instructions(mcp_server_label),
#             tools=[mcp_tool.definitions[0]],  # <-- supported pattern
#         )
#         print(f"Agent created: {agent.id}")

#         # Create a thread for the conversation
#         thread = agents_client.threads.create()
#         print(f"Thread created: {thread.id}")

#         # ✅ Build run-level MCP tool resources (headers go here in Python)
#         # See MCPToolResource docs: headers provided at construction or via dict ops
#         # https://learn.microsoft.com/en-us/python/api/azure-ai-agents/azure.ai.agents.models.mcptoolresource
#         mcp_resource = MCPToolResource(
#             server_label=mcp_server_label,
#             headers={"Accept": "application/json, text/event-stream", "x-role": "admin"},
#         )
#         tool_resources = ToolResources(mcp=[mcp_resource])

#         while True:
#             prompt = input("\nAsk something (or 'quit'): ").strip()
#             if prompt.lower() in ("quit", "q", "exit"):
#                 break

#             # Add the user message to the thread
#             agents_client.messages.create(thread_id=thread.id, role="user", content=prompt)

#             # Optional per-run nudge to pick a specific tool
#             extra = maybe_tool_instruction(prompt)

#             try:
#                 # ❗ Call the low-level 'runs.create' (NOT create_and_process) to avoid
#                 # the 'multiple values for tool_resources' bug in the wrapper.
#                 # RunsOperations.create signature supports tool_resources directly:
#                 # https://learn.microsoft.com/en-us/python/api/azure-ai-agents/azure.ai.agents.operations.runsoperations
#                 run = agents_client.runs.create(
#                     thread_id=thread.id,
#                     agent_id=agent.id,
#                     tool_resources=tool_resources,
#                     additional_instructions=extra,
#                 )
#                 # Poll to completion
#                 run = poll_run_until_terminal(thread.id, run.id)
#                 print(f"Run status: {run.status}")

#                 if (isinstance(run.status, str) and run.status.lower() == "failed") or getattr(run, "status", None) == "FAILED":
#                     print("❌ Run failed. Details (if any):")
#                     print(getattr(run, "last_error", None))

#             except Exception as e:
#                 print("🔥 Exception during run:")
#                 print(e)
#                 continue

#             # Inspect steps and tool calls
#             try:
#                 run_steps = agents_client.run_steps.list(thread_id=thread.id, run_id=run.id)
#                 for step in run_steps:
#                     print(f"\nStep {step.id} status: {step.status}")
#                     if step.step_details:
#                         print("Step details:")
#                         print(json.dumps(step.step_details.__dict__, indent=2, default=str))
#             except Exception as e:
#                 print("⚠️ Could not list run steps:", e)

#             # Dump conversation
#             try:
#                 messages = agents_client.messages.list(thread_id=thread.id, order=ListSortOrder.ASCENDING)
#                 print("\nConversation:")
#                 print("-" * 50)
#                 for msg in messages:
#                     if msg.text_messages:
#                         for tm in msg.text_messages:
#                             print(f"{msg.role.upper()}: {tm.text.value}")
#                     print("-" * 50)
#             except Exception as e:
#                 print("⚠️ Could not list messages:", e)

#         # Optional cleanup
#         try:
#             agents_client.delete_agent(agent.id)
#         except Exception:
#             pass


# if __name__ == "__main__":
#     main()

























# # client.py
# import os
# import json
# import time
# import requests
# from typing import Any, Dict, Optional, Set, Callable

# from dotenv import load_dotenv
# from azure.identity import DefaultAzureCredential
# from azure.ai.agents import AgentsClient
# from azure.ai.agents.models import (
#     FunctionTool,
#     SubmitToolOutputsAction,
#     ToolOutput,
#     RequiredFunctionToolCall,
#     ListSortOrder,
# )

# # ========== Load env ==========
# load_dotenv()
# PROJECT_ENDPOINT = os.environ["PROJECT_ENDPOINT"]
# MODEL_DEPLOYMENT_NAME = os.environ["MODEL_DEPLOYMENT_NAME"]
# MCP_SERVER_URL = os.environ.get("MCP_SERVER_URL", "https://mcp-server-isd-2.azurewebsites.net/mcp")
# MCP_ROLE = os.environ.get("MCP_ROLE", "admin")
# MCP_USER_ID = os.environ.get("MCP_USER_ID", "test_user")

# # Verbose logs (optional)
# os.environ.setdefault("AZURE_LOG_LEVEL", "warning")


# # ========== Minimal MCP HTTP client (mirrors toolList.py) ==========
# class McpHttpClient:
#     def __init__(self, url: str, role: str = "admin", user_id: Optional[str] = None):
#         self.url = url.rstrip("/")
#         self.sid: Optional[str] = None
#         self.headers: Dict[str, str] = {
#             "Content-Type": "application/json",
#             "Accept": "application/json, text/event-stream",
#             "x-role": role,
#         }
#         if user_id:
#             self.headers["x-user-id"] = user_id

#     def _post(self, payload: Dict[str, Any]) -> requests.Response:
#         return requests.post(self.url, headers=self.headers, data=json.dumps(payload), timeout=60)

#     @staticmethod
#     def _parse_response(text: str) -> Dict[str, Any]:
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
#                 "protocolVersion": "2025-03-26",
#                 "clientInfo": {"name": "agents-bridge-client", "version": "1.0.0"},
#                 "capabilities": {"roots": {"listChanged": True}, "sampling": {}, "tools": {}}
#             }
#         }
#         r = self._post(payload)
#         r.raise_for_status()
#         sid = r.headers.get("mcp-session-id")
#         if not sid:
#             raise RuntimeError("MCP server did not return mcp-session-id in headers.")
#         self.sid = sid

#     def ready(self):
#         assert self.sid, "Call initialize() first"
#         self.headers["mcp-session-id"] = self.sid
#         payload = {"jsonrpc": "2.0", "method": "notifications/initialized"}
#         r = self._post(payload)
#         # ignore body

#     def tools_call(self, name: str, arguments: Optional[Dict[str, Any]] = None) -> str:
#         """
#         Call an MCP tool and return a string payload suitable for Agent ToolOutput.
#         We coerce MCP results (which may be content=[{type:'json'|'text', ...}]) into a string.
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
#         obj = self._parse_response(r.text)

#         # Normalize MCP result into single string
#         result = obj.get("result") or {}
#         content = result.get("content") or []
#         if not content:
#             # empty content: return empty list JSON
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
#         # Fallback: stringify whole object
#         return json.dumps(obj, ensure_ascii=False)


# # Shared MCP client (session is reused across function calls in one run)
# _mcp = McpHttpClient(MCP_SERVER_URL, role=MCP_ROLE, user_id=MCP_USER_ID)
# _mcp_initialized = False


# def _ensure_mcp_session():
#     global _mcp_initialized
#     if not _mcp_initialized:
#         _mcp.initialize()
#         _mcp.ready()
#         _mcp_initialized = True


# # ========== Function tools (Agent decides; we execute via MCP) ==========

# def db_aliases() -> str:
#     """
#     Return list of available database aliases as a JSON string.
#     :return: JSON string array of aliases.
#     """
#     _ensure_mcp_session()
#     return _mcp.tools_call("db.aliases", {})

# def db_types() -> str:
#     """
#     Return list of available database types/dialects as a JSON string.
#     :return: JSON string array of types (e.g., ["mysql","pg","mssql","oracle","sqlite"])
#     """
#     _ensure_mcp_session()
#     return _mcp.tools_call("db.types", {})

# def db_names() -> str:
#     """
#     Return list of database names (not aliases) as a JSON string.
#     :return: JSON string array of db names.
#     """
#     _ensure_mcp_session()
#     return _mcp.tools_call("db.names", {})

# def db_list_by_type(type: str, unique: bool = True, includeAliases: bool = False) -> str:
#     """
#     List databases for a given dialect.
#     :param type: One of mysql | pg | mssql | oracle | sqlite
#     :param unique: If true, unique names; else one row per alias.
#     :param includeAliases: If true, include alias along with name.
#     :return: JSON string array (names or objects with alias+name).
#     """
#     _ensure_mcp_session()
#     args = {"type": type, "unique": unique, "includeAliases": includeAliases}
#     return _mcp.tools_call("db.listByType", args)

# # ---- customer_db.* tools ----

# def customer_db_sql_schema() -> str:
#     """
#     Return a compact Markdown outline of tables and columns for 'customer_db'.
#     :return: Markdown string.
#     """
#     _ensure_mcp_session()
#     return _mcp.tools_call("customer_db.sql.schema", {})

# def customer_db_sql_peek(maxRowsPerTable: int = 50, as_: str = "markdown") -> str:
#     """
#     Peek into 'customer_db' content.
#     :param maxRowsPerTable: 1..10000
#     :param as_: "markdown" | "json"
#     :return: Markdown string or JSON string (always returned as text to the Agent).
#     """
#     _ensure_mcp_session()
#     args = {"maxRowsPerTable": maxRowsPerTable, "as": as_}
#     return _mcp.tools_call("customer_db.sql.peek", args)

# def customer_db_sql_query(sql: str, params: Optional[dict] = None,
#                           readOnly: bool = True, rowLimit: int = 1000, as_: str = "json") -> str:
#     """
#     Execute a parameterized SQL query against 'customer_db'.
#     :param sql: SELECT query string.
#     :param params: Named parameters dict.
#     :param readOnly: Only SELECT when true.
#     :param rowLimit: Max rows returned.
#     :param as_: "json" | "markdown"
#     :return: JSON string or Markdown string.
#     """
#     _ensure_mcp_session()
#     args = {
#         "sql": sql,
#         "params": params or {},
#         "readOnly": readOnly,
#         "rowLimit": rowLimit,
#         "as": as_,
#     }
#     return _mcp.tools_call("customer_db.sql.query", args)

# # ---- merchant_db.* tools ----

# def merchant_db_sql_schema() -> str:
#     """
#     Return a compact Markdown outline of tables and columns for 'merchant_db'.
#     :return: Markdown string.
#     """
#     _ensure_mcp_session()
#     return _mcp.tools_call("merchant_db.sql.schema", {})

# def merchant_db_sql_peek(maxRowsPerTable: int = 50, as_: str = "markdown") -> str:
#     """
#     Peek into 'merchant_db' content.
#     :param maxRowsPerTable: 1..10000
#     :param as_: "markdown" | "json"
#     :return: Markdown string or JSON string (returned as text to the Agent).
#     """
#     _ensure_mcp_session()
#     args = {"maxRowsPerTable": maxRowsPerTable, "as": as_}
#     return _mcp.tools_call("merchant_db.sql.peek", args)

# def merchant_db_sql_query(sql: str, params: Optional[dict] = None,
#                           readOnly: bool = True, rowLimit: int = 1000, as_: str = "json") -> str:
#     """
#     Execute a parameterized SQL query against 'merchant_db'.
#     :param sql: SELECT query string.
#     :param params: Named parameters dict.
#     :param readOnly: Only SELECT when true.
#     :param rowLimit: Max rows returned.
#     :param as_: "json" | "markdown"
#     :return: JSON string or Markdown string.
#     """
#     _ensure_mcp_session()
#     args = {
#         "sql": sql,
#         "params": params or {},
#         "readOnly": readOnly,
#         "rowLimit": rowLimit,
#         "as": as_,
#     }
#     return _mcp.tools_call("merchant_db.sql.query", args)


# # ========== Build the FunctionTool set ==========
# # NOTE: names here become the “tool names” the model will call.
# USER_FUNCTIONS: Set[Callable[..., Any]] = {
#     db_aliases,
#     db_types,
#     db_names,
#     db_list_by_type,
#     customer_db_sql_schema,
#     customer_db_sql_peek,
#     customer_db_sql_query,
#     merchant_db_sql_schema,
#     merchant_db_sql_peek,
#     merchant_db_sql_query,
# }
# FUNCTIONS = FunctionTool(functions=USER_FUNCTIONS)  # The agent uses these tools


# # ========== Agent runner ==========
# TERMINAL = {"completed", "failed", "expired", "cancelled"}

# def poll_until_terminal(client: AgentsClient, thread_id: str, run_id: str, interval: float = 1.0):
#     while True:
#         run = client.runs.get(thread_id=thread_id, run_id=run_id)
#         status = str(getattr(run, "status", "")).lower()
#         if status in TERMINAL:
#             return run
#         # Handle tool outputs if required
#         if status == "requires_action" and isinstance(getattr(run, "required_action", None), SubmitToolOutputsAction):
#             tool_calls = run.required_action.submit_tool_outputs.tool_calls
#             outputs = []
#             for tc in tool_calls:
#                 if isinstance(tc, RequiredFunctionToolCall):
#                     # Execute function locally via FunctionTool helper
#                     try:
#                         output_str = FUNCTIONS.execute(tc)
#                     except Exception as ex:
#                         output_str = f"ERROR executing function '{tc.name}': {ex}"
#                     outputs.append(ToolOutput(tool_call_id=tc.id, output=output_str))
#             if outputs:
#                 client.runs.submit_tool_outputs(thread_id=thread_id, run_id=run_id, tool_outputs=outputs)
#         time.sleep(interval)


# def main():
#     # Azure Agents client (data-plane)
#     agents_client = AgentsClient(
#         endpoint=PROJECT_ENDPOINT,
#         credential=DefaultAzureCredential(
#             exclude_environment_credential=True,
#             exclude_managed_identity_credential=True,
#         ),
#     )

#     # Create the agent with our function tool definitions
#     with agents_client:
#         agent = agents_client.create_agent(
#             model=MODEL_DEPLOYMENT_NAME,
#             name="sql-mcp-bridge-agent",
#             instructions=(
#                 "You can use the provided tools to answer questions.\n"
#                 "- Prefer db_* tools to discover aliases/types/names, then use the appropriate "
#                 "customer_db_sql_* or merchant_db_sql_* tools to inspect or query.\n"
#                 "- Return concise, helpful answers. If a tool returns JSON text, summarize when appropriate."
#             ),
#             tools=FUNCTIONS.definitions,  # <-- critical
#         )
#         print(f"Agent created: {agent.id}")

#         thread = agents_client.threads.create()
#         print(f"Thread created: {thread.id}")

#         while True:
#             prompt = input("\nAsk something (or 'quit'): ").strip()
#             if prompt.lower() in ("quit", "q", "exit"):
#                 break

#             agents_client.messages.create(thread_id=thread.id, role="user", content=prompt)
#             run = agents_client.runs.create(thread_id=thread.id, agent_id=agent.id)

#             run = poll_until_terminal(agents_client, thread.id, run.id)
#             print(f"Run status: {run.status}")

#             # Show conversation
#             try:
#                 msgs = agents_client.messages.list(thread_id=thread.id, order=ListSortOrder.ASCENDING)
#                 print("\nConversation:")
#                 print("-" * 60)
#                 for m in msgs:
#                     if m.text_messages:
#                         for tm in m.text_messages:
#                             print(f"{m.role.upper()}: {tm.text.value}")
#                 print("-" * 60)
#             except Exception as e:
#                 print("⚠️ Could not list messages:", e)

#         # Optional cleanup
#         try:
#             agents_client.delete_agent(agent.id)
#         except Exception:
#             pass


# if __name__ == "__main__":
#     main()
































# import os
# import json
# import time
# import requests
# from typing import Any, Dict, Optional, Set, Callable

# from dotenv import load_dotenv
# from azure.identity import DefaultAzureCredential
# from azure.ai.agents import AgentsClient
# from azure.ai.agents.models import (
#     FunctionTool,
#     SubmitToolOutputsAction,
#     ToolOutput,
#     RequiredFunctionToolCall,
#     ListSortOrder,
# )

# # ========== Load env ==========
# load_dotenv()
# PROJECT_ENDPOINT = os.environ["PROJECT_ENDPOINT"]
# MODEL_DEPLOYMENT_NAME = os.environ["MODEL_DEPLOYMENT_NAME"]
# MCP_SERVER_URL = os.environ["MCP_SERVER_URL"]
# MCP_ROLE = os.environ.get("MCP_ROLE", "admin")
# MCP_USER_ID = os.environ.get("MCP_USER_ID", "test_user")

# # Verbose logs (optional while debugging)
# os.environ.setdefault("AZURE_LOG_LEVEL", "warning")


# # ========== Minimal MCP HTTP client (same flow as your toolList.py) ==========
# class McpHttpClient:
#     def __init__(self, url: str, role: str = "admin", user_id: Optional[str] = None):
#         self.url = url.rstrip("/")
#         self.sid: Optional[str] = None
#         self.headers: Dict[str, str] = {
#             "Content-Type": "application/json",
#             "Accept": "application/json, text/event-stream",
#             "x-role": role,
#         }
#         if user_id:
#             self.headers["x-user-id"] = user_id

#     def _post(self, payload: Dict[str, Any]) -> requests.Response:
#         return requests.post(self.url, headers=self.headers, data=json.dumps(payload), timeout=60)

#     @staticmethod
#     def _parse_response(text: str) -> Dict[str, Any]:
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
#                 "protocolVersion": "2025-03-26",
#                 "clientInfo": {"name": "agents-bridge-client", "version": "1.0.0"},
#                 "capabilities": {"roots": {"listChanged": True}, "sampling": {}, "tools": {}}
#             }
#         }
#         r = self._post(payload)
#         r.raise_for_status()
#         sid = r.headers.get("mcp-session-id")
#         if not sid:
#             raise RuntimeError("MCP server did not return mcp-session-id in headers.")
#         self.sid = sid

#     def ready(self):
#         assert self.sid, "Call initialize() first"
#         self.headers["mcp-session-id"] = self.sid
#         payload = {"jsonrpc": "2.0", "method": "notifications/initialized"}
#         r = self._post(payload)
#         # Intentionally ignore body

#     def tools_call(self, name: str, arguments: Optional[Dict[str, Any]] = None) -> str:
#         """
#         Call an MCP tool and return a text payload suitable for Agent ToolOutput.
#         We coerce MCP results (content=[{type:'json'|'text'}]) into a string.
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
#         obj = self._parse_response(r.text)

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


# # Shared MCP client (session reused across function calls)
# _mcp = McpHttpClient(MCP_SERVER_URL, role=MCP_ROLE, user_id=MCP_USER_ID)
# _mcp_initialized = False

# def _ensure_mcp_session():
#     global _mcp_initialized
#     if not _mcp_initialized:
#         _mcp.initialize()
#         _mcp.ready()
#         _mcp_initialized = True


# # ========== Function tools (Agent decides; we execute via MCP) ==========

# def db_aliases() -> str:
#     """
#     Return list of available database aliases as a JSON string.
#     :return: JSON string array of aliases.
#     """
#     _ensure_mcp_session()
#     return _mcp.tools_call("db.aliases", {})

# def db_types() -> str:
#     """
#     Return list of available database types/dialects as a JSON string.
#     :return: JSON string array of types (e.g., ["mysql","pg","mssql","oracle","sqlite"])
#     """
#     _ensure_mcp_session()
#     return _mcp.tools_call("db.types", {})

# def db_names() -> str:
#     """
#     Return list of database names (not aliases) as a JSON string.
#     :return: JSON string array of db names.
#     """
#     _ensure_mcp_session()
#     return _mcp.tools_call("db.names", {})

# def db_list_by_type(type: str, unique: bool = True, includeAliases: bool = False) -> str:
#     """
#     List databases for a given dialect.
#     :param type: One of mysql | pg | mssql | oracle | sqlite
#     :param unique: If true, unique names; else one row per alias.
#     :param includeAliases: If true, include alias along with name.
#     :return: JSON string array (names or objects with alias+name).
#     """
#     _ensure_mcp_session()
#     args = {"type": type, "unique": unique, "includeAliases": includeAliases}
#     return _mcp.tools_call("db.listByType", args)

# # ---- customer_db.* tools ----

# def customer_db_sql_schema() -> str:
#     """
#     Return a compact Markdown outline of tables and columns for 'customer_db'.
#     :return: Markdown string.
#     """
#     _ensure_mcp_session()
#     return _mcp.tools_call("customer_db.sql.schema", {})

# def customer_db_sql_peek(maxRowsPerTable: int = 50, as_: str = "markdown") -> str:
#     """
#     Peek into 'customer_db' content.
#     :param maxRowsPerTable: 1..10000
#     :param as_: "markdown" | "json"
#     :return: Markdown string or JSON string (returned as text to the Agent).
#     """
#     _ensure_mcp_session()
#     args = {"maxRowsPerTable": maxRowsPerTable, "as": as_}
#     return _mcp.tools_call("customer_db.sql.peek", args)

# def customer_db_sql_query(sql: str, params: Optional[dict] = None,
#                           readOnly: bool = True, rowLimit: int = 1000, as_: str = "json") -> str:
#     """
#     Execute a parameterized SQL query against 'customer_db'.
#     :param sql: SELECT query string.
#     :param params: Named parameters dict.
#     :param readOnly: Only SELECT when true.
#     :param rowLimit: Max rows returned.
#     :param as_: "json" | "markdown"
#     :return: JSON string or Markdown string.
#     """
#     _ensure_mcp_session()
#     args = {
#         "sql": sql,
#         "params": params or {},
#         "readOnly": readOnly,
#         "rowLimit": rowLimit,
#         "as": as_,
#     }
#     return _mcp.tools_call("customer_db.sql.query", args)

# # ---- merchant_db.* tools ----

# def merchant_db_sql_schema() -> str:
#     """
#     Return a compact Markdown outline of tables and columns for 'merchant_db'.
#     :return: Markdown string.
#     """
#     _ensure_mcp_session()
#     return _mcp.tools_call("merchant_db.sql.schema", {})

# def merchant_db_sql_peek(maxRowsPerTable: int = 50, as_: str = "markdown") -> str:
#     """
#     Peek into 'merchant_db' content.
#     :param maxRowsPerTable: 1..10000
#     :param as_: "markdown" | "json"
#     :return: Markdown string or JSON string.
#     """
#     _ensure_mcp_session()
#     args = {"maxRowsPerTable": maxRowsPerTable, "as": as_}
#     return _mcp.tools_call("merchant_db.sql.peek", args)

# def merchant_db_sql_query(sql: str, params: Optional[dict] = None,
#                           readOnly: bool = True, rowLimit: int = 1000, as_: str = "json") -> str:
#     """
#     Execute a parameterized SQL query against 'merchant_db'.
#     :param sql: SELECT query string.
#     :param params: Named parameters dict.
#     :param readOnly: Only SELECT when true.
#     :param rowLimit: Max rows returned.
#     :param as_: "json" | "markdown"
#     :return: JSON string or Markdown string.
#     """
#     _ensure_mcp_session()
#     args = {
#         "sql": sql,
#         "params": params or {},
#         "readOnly": readOnly,
#         "rowLimit": rowLimit,
#         "as": as_,
#     }
#     return _mcp.tools_call("merchant_db.sql.query", args)


# # ========== Build the FunctionTool set ==========
# USER_FUNCTIONS: Set[Callable[..., Any]] = {
#     db_aliases,
#     db_types,
#     db_names,
#     db_list_by_type,
#     customer_db_sql_schema,
#     customer_db_sql_peek,
#     customer_db_sql_query,
#     merchant_db_sql_schema,
#     merchant_db_sql_peek,
#     merchant_db_sql_query,
# }
# FUNCTIONS = FunctionTool(functions=USER_FUNCTIONS)  # The agent can call these tools


# # ========== Helpers ==========
# TERMINAL = {"completed", "failed", "expired", "cancelled"}

# def normalize_status(run) -> str:
#     """
#     Normalize run.status to a lower-case string safely across SDK enum/string variants.
#     """
#     s = getattr(run, "status", None)
#     if s is None:
#         return ""
#     # Enum style: try .value or .name; else str(s)
#     for attr in ("value", "name"):
#         if hasattr(s, attr):
#             try:
#                 return str(getattr(s, attr)).lower()
#             except Exception:
#                 pass
#     return str(s).lower()  # e.g. "RunStatus.InProgress" -> "runstatus.inprogress"

# def poll_until_terminal(client: AgentsClient, thread_id: str, run_id: str, interval: float = 1.0):
#     last_status = None
#     while True:
#         run = client.runs.get(thread_id=thread_id, run_id=run_id)
#         status = normalize_status(run)

#         # Print status transitions for visibility
#         if status != last_status:
#             print(f"[debug] run status -> {status}")
#             last_status = status

#         if status in TERMINAL:
#             return run

#         # Handle RequiresAction regardless of enum/string variant
#         if "requires_action" in status and isinstance(getattr(run, "required_action", None), SubmitToolOutputsAction):
#             tool_calls = run.required_action.submit_tool_outputs.tool_calls
#             if not tool_calls:
#                 # No tool calls provided—avoid spinning
#                 time.sleep(interval)
#                 continue

#             outputs = []
#             for tc in tool_calls:
#                 # Print tool name + args so we know what the model requested
#                 try:
#                     print(f"[debug] tool_call: name={tc.name} args={getattr(tc, 'arguments', {})}")
#                 except Exception:
#                     pass

#                 if isinstance(tc, RequiredFunctionToolCall):
#                     try:
#                         # Execute the function locally (bridges to MCP HTTP)
#                         output_str = FUNCTIONS.execute(tc)
#                         outputs.append(ToolOutput(tool_call_id=tc.id, output=output_str))
#                     except Exception as ex:
#                         err_msg = f"ERROR executing function '{getattr(tc,'name','?')}': {ex}"
#                         print(f"[debug] {err_msg}")
#                         outputs.append(ToolOutput(tool_call_id=tc.id, output=err_msg))
#                 else:
#                     # Unknown tool type; return an informative message
#                     outputs.append(ToolOutput(tool_call_id=tc.id, output=f"Unsupported tool call type: {type(tc)}"))

#             if outputs:
#                 client.runs.submit_tool_outputs(thread_id=thread_id, run_id=run_id, tool_outputs=outputs)

#         time.sleep(interval)


# def main():
#     agents_client = AgentsClient(
#         endpoint=PROJECT_ENDPOINT,
#         credential=DefaultAzureCredential(
#             exclude_environment_credential=True,
#             exclude_managed_identity_credential=True,
#         ),
#     )

#     with agents_client:
#         agent = agents_client.create_agent(
#             model=MODEL_DEPLOYMENT_NAME,
#             name="sql-mcp-bridge-agent",
#             instructions=(
#                 "You can use the provided tools to answer questions.\n"
#                 "- Prefer db_* tools to discover aliases/types/names, then use the appropriate "
#                 "customer_db_sql_* or merchant_db_sql_* tools to inspect or query.\n"
#                 "- If a tool returns JSON text, summarize when appropriate."
#             ),
#             tools=FUNCTIONS.definitions,
#         )
#         print(f"Agent created: {agent.id}")

#         thread = agents_client.threads.create()
#         print(f"Thread created: {thread.id}")

#         while True:
#             prompt = input("\nAsk something (or 'quit'): ").strip()
#             if prompt.lower() in ("quit", "q", "exit"):
#                 break

#             agents_client.messages.create(thread_id=thread.id, role="user", content=prompt)
#             run = agents_client.runs.create(thread_id=thread.id, agent_id=agent.id)

#             run = poll_until_terminal(agents_client, thread.id, run.id)
#             print(f"Run status: {normalize_status(run)}")

#             # Show conversation
#             try:
#                 msgs = agents_client.messages.list(thread_id=thread.id, order=ListSortOrder.ASCENDING)
#                 print("\nConversation:")
#                 print("-" * 60)
#                 for m in msgs:
#                     if m.text_messages:
#                         for tm in m.text_messages:
#                             print(f"{m.role.upper()}: {tm.text.value}")
#                 print("-" * 60)
#             except Exception as e:
#                 print("⚠️ Could not list messages:", e)

#         # Optional cleanup
#         try:
#             agents_client.delete_agent(agent.id)
#         except Exception:
#             pass


# if __name__ == "__main__":
#     main()















































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
PROJECT_ENDPOINT      = os.environ["PROJECT_ENDPOINT"]
MODEL_DEPLOYMENT_NAME = os.environ["MODEL_DEPLOYMENT_NAME"]
MCP_SERVER_URL        = os.environ["MCP_SERVER_URL"].rstrip("/")

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
    table      = os.environ.get("AUTH_TABLE", "users")
    col_user   = os.environ.get("AUTH_USER_COL", "username")
    col_pass   = os.environ.get("AUTH_PASS_COL", "password")
    col_role   = os.environ.get("AUTH_ROLE_COL", "role")
    col_userid = os.environ.get("AUTH_ID_COL", "user_id")

    # Determine DB type from env (mysql | pg)
    dialect = (os.environ.get("DB_PROVIDER") or os.environ.get("DB_DIALECT") or "").lower()
    if not dialect:
        # fallback: auto if MYSQL_HOST present -> mysql, elif PG_HOST -> pg
        dialect = "mysql" if os.environ.get("MYSQL_HOST") else ("pg" if os.environ.get("PG_HOST") else "")

    if dialect not in ("mysql", "pg"):
        print("[login] No DB_PROVIDER set (mysql|pg). Using default role='admin', user_id='test_user'.")
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
    """
    Return list of available database aliases as a JSON string.
    :return: JSON string array of aliases.
    """
    _ensure_mcp_session()
    return _mcp.tools_call("db.aliases", {})

def db_types() -> str:
    """
    Return list of available database dialects as a JSON string.
    :return: JSON string array (e.g., ["mysql","pg","mssql","oracle","sqlite"])
    """
    _ensure_mcp_session()
    return _mcp.tools_call("db.types", {})

def db_names() -> str:
    """
    Return list of database names (not aliases) as a JSON string.
    :return: JSON string array of names.
    """
    _ensure_mcp_session()
    return _mcp.tools_call("db.names", {})

def db_list_by_type(type: str, unique: bool = True, includeAliases: bool = False) -> str:
    """
    List databases for a given dialect.
    :param type: One of mysql | pg | mssql | oracle | sqlite
    :param unique: If true, unique names; else one row per alias.
    :param includeAliases: If true, include alias along with name.
    :return: JSON string array (names or objects with alias+name).
    """
    _ensure_mcp_session()
    args = {"type": type, "unique": unique, "includeAliases": includeAliases}
    return _mcp.tools_call("db.listByType", args)

def sql_schema(alias: str) -> str:
    """
    Return a compact Markdown outline of tables and columns for the given alias.
    :param alias: Database alias (e.g., "customer_db", "merchant_db")
    :return: Markdown string.
    """
    _ensure_mcp_session()
    return _mcp.tools_call(f"{alias}.sql.schema", {})

def sql_peek(alias: str, maxRowsPerTable: int = 50, as_: str = "markdown") -> str:
    """
    Peek into content for the given alias.
    :param alias: Database alias
    :param maxRowsPerTable: 1..10000
    :param as_: "markdown" | "json"
    :return: Markdown or JSON text (stringified).
    """
    _ensure_mcp_session()
    args = {"maxRowsPerTable": maxRowsPerTable, "as": as_}
    return _mcp.tools_call(f"{alias}.sql.peek", args)

def sql_query(alias: str, sql: str, params: Optional[dict] = None,
              readOnly: bool = True, rowLimit: int = 1000, as_: str = "json") -> str:
    """
    Execute a parameterized SQL query against the given alias.
    :param alias: Database alias
    :param sql: SELECT query string
    :param params: Named parameters dict
    :param readOnly: Only SELECT when true
    :param rowLimit: Max rows returned
    :param as_: "json" | "markdown"
    :return: JSON or Markdown text (stringified)
    """
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
    _ensure_mcp_session()                # session created using this identity

    # 2) Azure Agents client
    agents_client = AgentsClient(
        endpoint=PROJECT_ENDPOINT,
        credential=DefaultAzureCredential(
            exclude_environment_credential=True,
            exclude_managed_identity_credential=True,
        ),
    )

    # 3) Create agent with generalized function tools
    with agents_client:
        # agent = agents_client.create_agent(
        #     model=MODEL_DEPLOYMENT_NAME,
        #     name="sql-mcp-bridge-agent",
        #     instructions=(
        #         "You can use the provided tools to answer questions.\n"
        #         "- Use db_aliases/db_types/db_names/db_list_by_type to discover databases.\n"
        #         "- When inspecting or querying a specific database, call sql_schema/peek/query and "
        #         "pass the alias argument (e.g., alias='customer_db').\n"
        #         "- If a tool returns JSON text, summarize as needed."
        #     ),
        #     tools=FUNCTIONS.definitions,
        # )

        context_instructions = f"""
        You are assisting a signed-in user.

        - role: {role}
        - user_id: {user_id}

        Rules:
        - When the user says "my", treat it as user_id={user_id}.
        - Do NOT ask the user which user they are; you already know.
        - If role is "customer", default to alias "customer_db" unless the user explicitly selects another allowed alias.
        - If role is "merchant", default to alias "merchant_db".
        - Only call discovery tools (db_aliases, db_types, db_names, db_list_by_type) if role is "admin".
        - Prefer SELECT statements with named parameters. Keep results small.
        """

        agent = agents_client.create_agent(
            model=MODEL_DEPLOYMENT_NAME,
            name="sql-mcp-agent",
            instructions=context_instructions.strip(),
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
                count = 0
                msgs = agents_client.messages.list(thread_id=thread.id, order=ListSortOrder.ASCENDING)

                print("\nConversation:")
                print("=" * 80)
                for m in msgs:
                    if m.text_messages:
                        for tm in m.text_messages:
                            if count == 0:
                                print(f"\n{m.role.upper()}: {tm.text.value}")
                                count = 1
                            elif count == 1:
                                print(f"{m.role.upper()}: {tm.text.value}\n")
                                count = 0

                print("=" * 80)
            except Exception as e:
                print("⚠️ Could not list messages:", e)

        # Optional cleanup
        try:
            agents_client.delete_agent(agent.id)
        except Exception:
            pass


if __name__ == "__main__":
    main()