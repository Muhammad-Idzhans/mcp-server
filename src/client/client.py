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

































import os
import time
import json
from dotenv import load_dotenv

from azure.identity import DefaultAzureCredential
from azure.ai.agents import AgentsClient
from azure.ai.agents.models import McpTool, ToolSet, ListSortOrder

MAX_WAIT_SECONDS = 20
POLL_INTERVAL = 1.0  # seconds


def wait_for_run_completion(agents_client: AgentsClient, thread_id: str, run_id: str,
                            max_wait_s: int = MAX_WAIT_SECONDS) -> dict:
    """
    Poll the run until it is not (queued|in_progress|requires_action) or until timeout.
    Returns the final run object (dict-like).
    """
    deadline = time.monotonic() + max_wait_s
    status = None
    while time.monotonic() < deadline:
        run = agents_client.runs.get(thread_id=thread_id, run_id=run_id)
        status = getattr(run, "status", None) or run.get("status")
        print(f"Run status: {status}")
        if status not in ("queued", "in_progress", "requires_action"):
            return run
        time.sleep(POLL_INTERVAL)
    # Timeout: return the last observed run
    print("[warn] Run polling reached 20s timeout.")
    return run


def wait_for_assistant_message(agents_client: AgentsClient, thread_id: str,
                               max_wait_s: int = MAX_WAIT_SECONDS) -> list:
    """
    Poll messages until at least one assistant message with text is present or timeout.
    Returns the message list (ascending order).
    """
    deadline = time.monotonic() + max_wait_s
    while time.monotonic() < deadline:
        msgs = agents_client.messages.list(thread_id=thread_id, order=ListSortOrder.ASCENDING)
        # Look for any assistant message
        has_assistant = any(getattr(m, "role", "").lower() == "assistant" for m in msgs)
        if has_assistant:
            return msgs
        time.sleep(POLL_INTERVAL)
    print("[warn] Waiting for assistant message hit 20s timeout.")
    return agents_client.messages.list(thread_id=thread_id, order=ListSortOrder.ASCENDING)


def print_step_details(details: dict):
    print("Step details:")
    try:
        print(json.dumps(details, indent=2))
    except Exception:
        print(details)


# ----------------- your original setup (unchanged) -----------------
load_dotenv()
project_endpoint = os.getenv("PROJECT_ENDPOINT")
model_deployment = os.getenv("MODEL_DEPLOYMENT_NAME")

agents_client = AgentsClient(
    endpoint=project_endpoint,
    credential=DefaultAzureCredential(
        exclude_environment_credential=True,
        exclude_managed_identity_credential=True
    )
)

mcp_server_url = "https://sql-mcp-server01.onrender.com/mcp"
# mcp_server_url = "http://localhost:8787/mcp"
mcp_server_label = "sqlmcpserver"

mcp_tool = McpTool(
    server_label=mcp_server_label,
    server_url=mcp_server_url,
)
mcp_tool.set_approval_mode("never")

toolset = ToolSet()
toolset.add(mcp_tool)
# -------------------------------------------------------------------

os.system('cls')
with agents_client:
    # Create agent
    agent = agents_client.create_agent(
        model=model_deployment,
        name="my-mcp-agent",
        instructions="""
        You are connected to an MCP server labeled 'mslearn' at a public HTTP endpoint.
        When the user asks to list databases, call the MCP tools:
        - db.aliases  (returns a JSON string of alias names)
        - db.names    (returns a JSON string of database names)

        After receiving tool output, return the tool's text content to the user verbatim (no paraphrase).
        If a tool returns JSON, output the JSON as-is.
        """,
        toolset=toolset
    )
    print(f"Created agent, ID: {agent.id}")
    print(f"MCP Server: {mcp_tool.server_label} at {mcp_tool.server_url}")

    # Create thread
    thread = agents_client.threads.create()
    print(f"Created thread, ID: {thread.id}")

    # Clear the console before run the conversation

    while True:
        # User message
        prompt = input("\nHow can I help? (type 'quit' to exit): ").strip()
        if prompt.lower() in ("quit", "q", "exit"):
            break

        _ = agents_client.messages.create(
            thread_id=thread.id,
            role="user",
            content=prompt,
        )

        # --------- CHANGED: run + poll up to 20s instead of create_and_process ---------
        run = agents_client.runs.create(thread_id=thread.id, agent_id=agent.id)
        print(f"Created run, ID: {run.id}")

        run = wait_for_run_completion(agents_client, thread_id=thread.id, run_id=run.id,
                                    max_wait_s=MAX_WAIT_SECONDS)
        print(f"Final run status: {run.status}")
        if run.status == "failed":
            print(f"Run failed: {getattr(run, 'last_error', None) or run.get('last_error')}")
        # -------------------------------------------------------------------------------

        # Show run steps (to inspect MCP tool activity)
        run_steps = agents_client.run_steps.list(thread_id=thread.id, run_id=run.id)
        for step in run_steps:
            print(f"Step {step['id']} status: {step['status']}")
            step_details = step.get("step_details", {}) or {}
            print_step_details(step_details)
            print()

        # --------- NEW: wait (up to remaining 20s) for an assistant reply, then print ----

        # messages = wait_for_assistant_message(agents_client, thread_id=thread.id,
        #                                       max_wait_s=MAX_WAIT_SECONDS)

        # print("\nConversation:")
        # print("-" * 50)
        # for msg in messages:
        #     if getattr(msg, "text_messages", None):
        #         last_text = msg.text_messages[-1]
        #         print(f"{msg.role.upper()}: {last_text.text.value}")
        #         print("-" * 50)

        # --------------------------------------------------------------------------------
        messages = agents_client.messages.list(thread_id=thread.id, order=ListSortOrder.ASCENDING)
        print("\nConversation:")
        print("-" * 50)
        for msg in messages:
            print(msg.role.upper() + ":")
            # print any text_messages (there can be more than one)
            if getattr(msg, "text_messages", None):
                for tm in msg.text_messages:
                    print(tm.text.value)

            print("-" * 50)

        # --------------------------------------------------------------------------------

    # Clean up
    agents_client.delete_agent(agent.id)
