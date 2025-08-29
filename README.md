# MCP Server
### 1) Project Directory
Here are the current Project Directory as per updated on 29th August 2025.
```
mcp-server-starter/
├─ package.json
├─ tsconfig.json
├─ .gitignore
├─ .env                         # optional (future auth, db path, etc.)
└─ src/
   ├─ server/
   │  └─ stdio.ts              # minimal MCP server (stdio transport)
   ├─ tools/
   │  ├─ sql/
   │  │  ├─ index.ts           # "run_named_query" tool (registers with server)
   │  │  └─ templates.ts       # allow-listed SQL templates
   │  └─ index.ts              # (barrel) export all tools
   ├─ db/
   │  ├─ seed.ts               # create/seed SQLite
   │  └─ sqlite.ts             # tiny DB helper
   └─ client/
      └─ devClient.ts          # simple TS client to test the server
```

### 2) Initialization of The Project & dependencies Installation
```cmd
# Change the directory to the project
cd mcp-server-starter

# 1) Initialize Node project
npm init -y

# 2) Install runtime deps
npm i @modelcontextprotocol/sdk zod better-sqlite3 dotenv

# 3) Dev dependencies (TypeScript + runner)
npm i -D typescript tsx @types/node

# 4) Create a TS config
npx tsc --init

# 5) Folders
mkdir -p src/{server,tools/sql,db,client}
```