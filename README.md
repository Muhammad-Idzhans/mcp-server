# API Endpoint MCP Server
### Tools existed inside this MCP Server (As 10 September 2025):
1. SQL tools for different databases (Postgres, MySQL, SQL, Oracle)
2. 


## SQL tools for different databases (Postgres, MySQL, SQL, Oracle)
After you deploying the MCP Server on the website, you will get a particular link called _**Base URL**_. With that link, you be able to access some information through the endpoints that is specified. If your Base URL such as `http://localhost:8787`, then you can use the endpoints as `http://localhost:8787/health`. You can test the endpoints using **_Postman_** as well.

This MCP Server does not manage multiple databases of the same type. Instead, it provides connectivity to multiple database system (Postgres, MySQL, MSSQL, Oracle). Each system is configured independently via environment variables, and queries are executed againts the selected DB. 

**Note:** We can extend the current MCP Server to support not only multiple database types but also multiple instances of the same database type if needed.

Below are the endpoints under the SQL Tools:
| Method | Endpoint          | Description                                          |
|--------|----------------   |--------------------------------------------          |
| GET    | /dbs              | Lists all configured databases.                      |
| GET    | /health           | Health check endpoint (server status).               |
| GET    | /dbs              | List all databases name from all database type       |
| GET    | /dbs/aliases      | List all databases aliases from all database type    |
| GET    | /dbs/types        | List all available databases types                   |
| GET    | /dbs/list-by-type | Health check endpoint (server status).               |
| POST   | /sql/query     | Executes an SQL query against a database.  |



To specify what should be sent to the `/sql/query`, you have to send in JSON form with 2 information:
1. `"db"` : To specify what kind of database that we wanted it to be connected to.
    - `"pg"` : PostgreSQL
    - `"mysql"` : MySQL
    - `"mssql"` : Microsoft SQL
    - `"oracle"`: Oracle
2. `"sql"` : SQL Queries based on the database used.

Below is the exact format:
```json
{
  "db": "mysql",                            // Database Type
  "sql": "SELECT * FROM orders LIMIT 10;"   // SQL queries based on db type
}
```
### Database Used and Data
In this project, multiple relational database system were tested to ensure compatibility with the MCP Server. The database used are:
- PostgreSQL
- MySQL
- Microsoft SQL Server (MSSQL)
- Oracle Database

Each database contains two custom tables with a few sample rows of data.
- The tables are designed with different themes per database (e.g., hospital system, university system, employee system, etc.) so that outputs can be easily distinguished during testing.
- This prevents confusion when retrieving results and makes it clear which database the data originated from.

___
#### **1) POSTGRESQL DATABASE (Library System)**

**TABLE NAME:** `books`
| book\_id | title                          | author      | genre     | year\_published |
| -------- | -----------------------        | ----------- | --------- | --------------- |
| 1        | The Silent Forest              | John Rivers | Fiction   | 2015            |
| 2        | Data Science Simplified        | Alice Tan   | Education | 2020            |
| 2        | Demon Slayer: Kimetsu no Yaiba | Koyoharu Gotouge   | Fiction | 2016            |

**TABLE NAME:** `members`
| member\_id | name       | email                                                   | join\_date | active |
| ---------- | ---------- | ------------------------------------------------------- | ---------- | ------ |
| 101        | Sarah Lim  | [sarah@example.com](mailto:sarah@example.com)           | 2021-03-10 | true   |
| 102        | Ahmad Zaki | [ahmad.zaki@example.com](mailto:ahmad.zaki@example.com) | 2022-07-22 | false  |
| 103        | Megan Raaj | [megan.raaj@example.com](mailto:megan.raaj@example.com) | 2025-09-10 | false  |

Testing Using Postman to retrieve information:
```json
// Get all table
{
  "db": "pg",
  "sql": "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name"
}

// List all tables with columns + contents
{
  "db": "pg",
  "sql": "SELECT c.table_name, c.column_name, c.data_type FROM information_schema.columns c JOIN information_schema.tables t ON c.table_name = t.table_name WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE' ORDER BY c.table_name, c.ordinal_position;"
}

// List contents of a specific table with its columns - "SELECT * FROM <table-name> LIMIT 10;"
{
  "db": "pg",
  "sql": "SELECT * FROM books LIMIT 10;"
}
```

___

#### **2) MYSQL DATABASE (E-commerce Store)**

**TABLE NAME:** `products`
| product\_id | name          | category    | price   | stock |
| ----------- | ------------- | ----------- | ------- | ----- |
| 501         | Laptop X100   | Electronics | 3500.00 | 15    |
| 502         | Running Shoes | Sports      | 280.00  | 50    |
| 503         |  Office Table | Furniture   | 200.00  | 10    |

**TABLE NAME:** `orders`
| order\_id | product\_id | customer\_name | quantity | order\_date |
| --------- | ----------- | -------------- | -------- | ----------- |
| 9001      | 501         | Daniel Wong    | 1        | 2024-12-15  |
| 9002      | 502         | Mei Li         | 2        | 2025-01-20  |
| 9003      | 503         | Syahid Akbar   | 2        | 2025-09-10  |

Testing Using Postman to retrieve information:
```json
// Get all table
{
  "db": "mysql",
  "sql": "SELECT TABLE_NAME FROM information_schema.tables WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME"
}

// List all tables with columns + contents
{
  "db": "mysql",
  "sql": "SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME, ORDINAL_POSITION;"
}

// List contents of a specific table with its columns - "SELECT * FROM <table-name> LIMIT 10;"
{
  "db": "mysql",
  "sql": "SELECT * FROM orders LIMIT 10;"
}
```

___

#### **3) MSSQL DATABASE (Hospital Management)**
- There will be 3 database for mssql to simulate the ability to use 3 database in the same type at one time- These MSSQL Database is deployed in the Azure SQL Database and it has 3 database which is `mssql-mcp`, `coffee_database`and `pastry_database`.
- Each of these databases will be having 2 tables with 3 rows for each tables.

**DATABASE 1:** `mssql-mcp`
---
**TABLE NAME:** `patients`
| patient\_id | full\_name   | dob        | blood\_type | admitted   |
| ----------- | ------------ | ---------- | ----------- | ---------- |
| P001        | Kevin Smith  | 1990-05-21 | O+          | 2025-02-01 |
| P002        | Aisha Rahman | 1985-11-03 | A-          | 2025-02-07 |
| P003        | Ariff Hafizal| 2001-08-06 | AB          | 2025-09-01 |

**TABLE NAME:** `doctors`
| doctor\_id | name           | specialty  | phone        | available |
| ---------- | -------------  | ---------- | -----------  | --------- |
| D001       | Dr. Michael    | Cardiology | 012-3456789  | Yes       |
| D002       | Dr. Nur Farah  | Pediatrics | 019-8765432  | No        |
| D003       | Dr. Abd. Rahman| Surgeon    | 011-78150955 | Yes       |

**DATABASE 2:** `coffee_database`
---
**TABLE NAME:** `CoffeeBeans`
| bean\_id | bean\_name | origin   | roast\_level |
| -------- | ---------- | -------- | ------------ |
| 1        | Arabica    | Brazil   | Medium       |
| 2        | Robusta    | Vietnam  | Dark         |
| 3        | Liberica   | Malaysia | Light        |

**TABLE NAME:** `CoffeeDrinks`
| drink\_id | drink\_name   | bean\_id | milk\_type | price |
| --------- | ------------- | -------- | ---------- | ----- |
| 1         | Latte         | 1        | Whole      | 4.5   |
| 2         | Espresso      | 2        | None       | 3.0   |
| 3         | Kopi Liberica | 3        | Condensed  | 2.5   |

**DATABASE 3:** `pastry_database`
---
**TABLE NAME:** `Pastries`
| pastry\_id | pastry\_name | origin    | main\_flavor |
| ---------- | ------------ | --------- | ------------ |
| 1          | Croissant    | France    | Butter       |
| 2          | Egg Tart     | Hong Kong | Custard      |
| 3          | Kuih Lapis   | Malaysia  | Coconut      |

**TABLE NAME:** `PastryOrders`
| order\_id | pastry\_id | customer\_name | quantity | price |
| --------- | ---------- | -------------- | -------- | ----- |
| 1         | 1          | Aisha          | 2        | 7.0   |
| 2         | 2          | John           | 3        | 9.0   |
| 3         | 3          | Mei Ling       | 1        | 4.5   |

Testing Using Postman to retrieve information:
```json
// Get all table
{
  "db": "mssql",
  "sql": "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME"
}

// List all tables with columns + contents
{
  "db": "mssql",
  "sql": "SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS ORDER BY TABLE_NAME, ORDINAL_POSITION;"
}

// List contents of a specific table with its columns - "SELECT TOP 10 * FROM <table-name>;"
{
  "db": "mssql",
  "sql": "SELECT TOP 10 * FROM Doctors;"
}
```
___

#### **4) ORACLE DATABASE (University System)**

**TABLE NAME:** `COURSES`

| course\_id | course\_name              | department  | credits | semester |
| ---------- | ------------------------- | ----------- | ------- | -------- |
| CSE101     | Intro to Computer Science | Computing   | 4       | Fall     |
| BUS201     | Marketing Basics          | Business    | 3       | Spring   |
| ENG301     | Thermodynamics            | Engineering | 4       | Fall     |

**TABLE NAME:** `STUDENTS`
| student\_id | name      | major                   | gpa | enrollment\_year |
| ----------- | --------- | ----------------------- | --- | ---------------- |
| S1001       | Raj Kumar | Computer Science        | 3.8 | 2021             |
| S1002       | Emily Tan | Business Administration | 3.5 | 2020             |
| S1003       | Ahmad Ali | Mechanical Engineering  | 3.2 | 2019             |

Testing Using Postman to retrieve information:
```json
// Get all table
{
  "db": "oracle",
  "sql": "SELECT DISTINCT table_name FROM user_tab_columns WHERE table_name NOT LIKE 'ROLLING$%' AND table_name NOT LIKE 'SCHEDULER_%' -- AND UPPER(table_name) NOT IN (<your excludedOracleTables uppercased>) ORDER BY table_name"
}

// List all tables with columns + contents
{
  "db": "oracle",
  "sql": "SELECT table_name, column_name, data_type FROM user_tab_columns ORDER BY table_name, column_id"
}

// List contents of a specific table with its columns
{
  "db": "oracle",
  "sql": "SELECT * FROM COURSES"
}
```
___


### Database Environments
The MCP Server uses environment variables for database connections.
  - Not all environments are required. Only put the database that is required/existed.
  - If an environment for a database type is missing, the server will still run (It can be used for all database or just use for your desired database).
  - This project do supports SQLite but it will not be focused on since SQLite is usually for the local testing.
  - If more than one of the same database type appears, the put `,` in between for each of the variable. For example:
  ```.env
  MSSQL_USER=user1, user2
  MSSQL_PASSWORD=pass1, pass2
  MSSQL_DB=dbName1, dbName2
  ```



| Variable                | Usage / Description                                            | Example Value           |
| ----------------------- | -------------------------------------------------------------- | ----------------------- |
| `MYSQL_HOST`            | Hostname or IP address of the MySQL server                     | `127.0.0.1`             |
| `MYSQL_PORT`            | Port number for the MySQL server (default: `3306`)             | `3306`                  |
| `MYSQL_USER`            | Username to authenticate with the MySQL server                 | `root`                  |
| `MYSQL_PASSWORD`        | Password for the MySQL user                                    | `mypassword`            |
| `MYSQL_DB`              | Name of the MySQL database to connect to                       | `test_db`               |
| `PG_HOST`               | Hostname or IP address of the PostgreSQL server                | `127.0.0.1`             |
| `PG_PORT`               | Port number for the PostgreSQL server (default: `5432`)        | `5432`                  |
| `PG_USER`               | Username to authenticate with the PostgreSQL server            | `postgres`              |
| `PG_PASSWORD`           | Password for the PostgreSQL user                               | `secret123`             |
| `PG_DB`                 | Name of the PostgreSQL database to connect to                  | `sampledb`              |
| `MSSQL_HOST`            | Hostname or IP address of the Microsoft SQL Server             | `127.0.0.1`             |
| `MSSQL_PORT`            | Port number for the Microsoft SQL Server (default: `1433`)     | `1433`                  |
| `MSSQL_USER`            | Username to authenticate with the Microsoft SQL Server         | `sa`                    |
| `MSSQL_PASSWORD`        | Password for the Microsoft SQL Server user                     | `P@ssw0rd!`             |
| `MSSQL_DB`              | Name of the Microsoft SQL Server database to connect to        | `hospital_db`           |
| `ORACLE_CONNECT_STRING` | Oracle EZConnect string in the format `host:port/service_name` | `127.0.0.1:1521/XEPDB1` |
| `ORACLE_USER`           | Username to authenticate with the Oracle database              | `system`                |
| `ORACLE_PASSWORD`       | Password for the Oracle user                                   | `oracle123`             |


### MCP Tools Available
Copilot Studio (and any LLM-based orchestration) uses tool name + description + input schema to decide which tool to call. If descriptions are vague or repetitive, the model struggles to pick the right tool or understand when to use it. So far, these are the tools together with its description that we can refer. Any changes on the description can be done back in the `src/tools/sql/index.ts`.

Note: `<database-type-number>.sql.peek/schema/query` will be keep on adding depending on how many database for each type is added.
| Tool Name               | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **db.aliases**          | Return the list of available database aliases created/available on this server (e.g., mysql, mssql, mssql\_2, pg, oracle). Call this first to discover which DBs you can query.                                                                                                                                                                                                                                                                                                                                                                                          |
| **db.types**            | List available database dialects (types), e.g., MySQL, PostgreSQL, MSSQL, Oracle.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **db.names**            | List database names (not aliases) across all configured databases (unique, sorted).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **db.listByType**       | List database names for a given dialect (type). unique=true (default) returns unique names; set unique=false for one row per alias; includeAliases=true to add alias.                                                                                                                                                                                                                                                                                                                                                                                                    |
| **mysql.sql.peek**      | Return up to N rows from each base table in the chosen database. Dialect-aware and read-only. Use this to quickly inspect unknown schemas. If you provide 'db' (database name, not alias), this tool will resolve the right DB at runtime. Optionally provide 'type' (mysql pg mssql oracle sqlite) to disambiguate.                                                                                                                                                                                                                                                     |
| **mysql.sql.schema**    | Return a compact Markdown outline of tables and columns for the chosen database. If you provide 'db' (database name, not alias), this tool will resolve the right DB at runtime. Optionally provide 'type' to disambiguate.                                                                                                                                                                                                                                                                                                                                              |
| **mysql.sql.query**     | Execute a parameterized SQL query against the chosen database. If you provide 'db' (database name, not alias), the target DB is resolved at runtime. Optionally provide 'type' to disambiguate databases with the same name. **Usage Tips:** 1. Use a single SELECT statement. 2. Always use \:name placeholders (e.g., \:from, \:limit). 3. Avoid INSERT, UPDATE, DELETE unless explicitly allowed. 4. Use exact table/column names (call `sql.schema` first if unsure). 5. Add LIMIT/TOP/ROWNUM to keep results small. 6. Prefer ANSI SQL over vendor-specific syntax. |
| **pg.sql.peek**         | Return up to N rows from each base table in the chosen database. Dialect-aware and read-only. Use this to quickly inspect unknown schemas. If you provide 'db' (database name, not alias), this tool will resolve the right DB at runtime. Optionally provide 'type' (mysql pg mssql oracle sqlite) to disambiguate.                                                                                                                                                                                                                                                     |
| **pg.sql.schema**       | Return a compact Markdown outline of tables and columns for the chosen database. If you provide 'db' (database name, not alias), this tool will resolve the right DB at runtime. Optionally provide 'type' to disambiguate.                                                                                                                                                                                                                                                                                                                                              |
| **pg.sql.query**        | Execute a parameterized SQL query against the chosen database. If you provide 'db' (database name, not alias), the target DB is resolved at runtime. Optionally provide 'type' to disambiguate databases with the same name. **Usage Tips:** 1. Use a single SELECT statement. 2. Always use \:name placeholders (e.g., \:from, \:limit). 3. Avoid INSERT, UPDATE, DELETE unless explicitly allowed. 4. Use exact table/column names (call `sql.schema` first if unsure). 5. Add LIMIT/TOP/ROWNUM to keep results small. 6. Prefer ANSI SQL over vendor-specific syntax. |
| **mssql.sql.peek**      | Return up to N rows from each base table in the chosen database. Dialect-aware and read-only. Use this to quickly inspect unknown schemas. If you provide 'db' (database name, not alias), this tool will resolve the right DB at runtime. Optionally provide 'type' (mysql pg mssql oracle sqlite) to disambiguate.                                                                                                                                                                                                                                                     |
| **mssql.sql.schema**    | Return a compact Markdown outline of tables and columns for the chosen database. If you provide 'db' (database name, not alias), this tool will resolve the right DB at runtime. Optionally provide 'type' to disambiguate.                                                                                                                                                                                                                                                                                                                                              |
| **mssql.sql.query**     | Execute a parameterized SQL query against the chosen database. If you provide 'db' (database name, not alias), the target DB is resolved at runtime. Optionally provide 'type' to disambiguate databases with the same name. **Usage Tips:** 1. Use a single SELECT statement. 2. Always use \:name placeholders (e.g., \:from, \:limit). 3. Avoid INSERT, UPDATE, DELETE unless explicitly allowed. 4. Use exact table/column names (call `sql.schema` first if unsure). 5. Add LIMIT/TOP/ROWNUM to keep results small. 6. Prefer ANSI SQL over vendor-specific syntax. |
| **mssql\_2.sql.peek**   | Return up to N rows from each base table in the chosen database. Dialect-aware and read-only. Use this to quickly inspect unknown schemas. If you provide 'db' (database name, not alias), this tool will resolve the right DB at runtime. Optionally provide 'type' (mysql pg mssql oracle sqlite) to disambiguate.                                                                                                                                                                                                                                                     |
| **mssql\_2.sql.schema** | Return a compact Markdown outline of tables and columns for the chosen database. If you provide 'db' (database name, not alias), this tool will resolve the right DB at runtime. Optionally provide 'type' to disambiguate.                                                                                                                                                                                                                                                                                                                                              |
| **mssql\_2.sql.query**  | Execute a parameterized SQL query against the chosen database. If you provide 'db' (database name, not alias), the target DB is resolved at runtime. Optionally provide 'type' to disambiguate databases with the same name. **Usage Tips:** 1. Use a single SELECT statement. 2. Always use \:name placeholders (e.g., \:from, \:limit). 3. Avoid INSERT, UPDATE, DELETE unless explicitly allowed. 4. Use exact table/column names (call `sql.schema` first if unsure). 5. Add LIMIT/TOP/ROWNUM to keep results small. 6. Prefer ANSI SQL over vendor-specific syntax. |
| **mssql\_3.sql.peek**   | Return up to N rows from each base table in the chosen database. Dialect-aware and read-only. Use this to quickly inspect unknown schemas. If you provide 'db' (database name, not alias), this tool will resolve the right DB at runtime. Optionally provide 'type' (mysql pg mssql oracle sqlite) to disambiguate.                                                                                                                                                                                                                                                     |
| **mssql\_3.sql.schema** | Return a compact Markdown outline of tables and columns for the chosen database. If you provide 'db' (database name, not alias), this tool will resolve the right DB at runtime. Optionally provide 'type' to disambiguate.                                                                                                                                                                                                                                                                                                                                              |
| **mssql\_3.sql.query**  | Execute a parameterized SQL query against the chosen database. If you provide 'db' (database name, not alias), the target DB is resolved at runtime. Optionally provide 'type' to disambiguate databases with the same name. **Usage Tips:** 1. Use a single SELECT statement. 2. Always use \:name placeholders (e.g., \:from, \:limit). 3. Avoid INSERT, UPDATE, DELETE unless explicitly allowed. 4. Use exact table/column names (call `sql.schema` first if unsure). 5. Add LIMIT/TOP/ROWNUM to keep results small. 6. Prefer ANSI SQL over vendor-specific syntax. |
| **oracle.sql.peek**     | Return up to N rows from each base table in the chosen database. Dialect-aware and read-only. Use this to quickly inspect unknown schemas. If you provide 'db' (database name, not alias), this tool will resolve the right DB at runtime. Optionally provide 'type' (mysql pg mssql oracle sqlite) to disambiguate.                                                                                                                                                                                                                                                     |
| **oracle.sql.schema**   | Return a compact Markdown outline of tables and columns for the chosen database. If you provide 'db' (database name, not alias), this tool will resolve the right DB at runtime. Optionally provide 'type' to disambiguate.                                                                                                                                                                                                                                                                                                                                              |
| **oracle.sql.query**    | Execute a parameterized SQL query against the chosen database. If you provide 'db' (database name, not alias), the target DB is resolved at runtime. Optionally provide 'type' to disambiguate databases with the same name. **Usage Tips:** 1. Use a single SELECT statement. 2. Always use \:name placeholders (e.g., \:from, \:limit). 3. Avoid INSERT, UPDATE, DELETE unless explicitly allowed. 4. Use exact table/column names (call `sql.schema` first if unsure). 5. Add LIMIT/TOP/ROWNUM to keep results small. 6. Prefer ANSI SQL over vendor-specific syntax. |



### Deployment to Azure Web App
Delete the existing node_modules and installs dependencies exactly as listed in your `package-lock.json` _**(ci = clean install)**_:
```cmd
npm ci
```

Runs the build script in your package.json under "scripts":
```cmd
npm run build
```

Remove of the directory if exist:
```cmd
if exist srcpkg rmdir /s /q srcpkg
```

Make directory to be zipped:
```cmd
mkdir srcpkg
```

Copy project sources and assets Oryx needs. If you read any templates at runtime, include them too. **DO NOT** copy `node_modules` _**(Oryx will install on Linux)**_:
```cmd
xcopy src srcpkg\src\ /E /I /Y
copy package.json srcpkg\
copy package-lock.json srcpkg\ >NUL 2>&1
copy tsconfig.json srcpkg\ >NUL 2>&1
copy dbs.yaml srcpkg\ >NUL 2>&1
if exist src\tools\sql\templates xcopy src\tools\sql\templates srcpkg\src\tools\sql\templates\ /E /I /Y
```

Build a ZIP whose root is the content _**(not a nested folder)**_:
```cmd
if exist artifact-src.zip del /f /q artifact-src.zip
tar -a -c -f artifact-src.zip -C srcpkg .
```

Azure Login:
```cmd
az login
```

Set runtime to Node 20 LTS:
```cmd
az webapp config set -g <resource-group> -n <web-app-name> --linux-fx-version "NODE|20-lts"
```

Enable build automation _**(Oryx)**_:
```cmd
az webapp config appsettings set -g <resource-group> -n <web-app-name> --settings SCM_DO_BUILD_DURING_DEPLOYMENT=true NPM_CONFIG_PRODUCTION=false
```

Deploy to Azure:
```cmd
az webapp deploy -g <resource-group> -n <web-app-name> --src-path artifact-src.zip
```

Enable Logs and Monitor to view _**(In another cmd)**_:
```cmd
az webapp log config -g <resource-group> -n <web-app-name> --application-logging filesystem --docker-container-logging filesystem --level information

az webapp log tail -g <resource-group> -n <web-app-name>
```

Find the outbound IP - to put in the SQL Server if your server is inside Azure
```cmd
az webapp show -g <resource-group> -n <web-app-name> --query outboundIpAddresses -o tsv
```


### Using REST API Endpoints in Azure AI Foundry Agents
If you want to use API Endpoints instead of MCP endpoints in your Azure AI Foundry, you can register them as a Custom Tool using the OpenAPI 3.0 Specified Tool.

Here’s a sample .json schema you can use. Just change the url with the right Azure Web App URL:
```json
{
  "openapi": "3.0.1",
  "info": {
    "title": "MCP SQL Server API",
    "version": "1.0.0",
    "description": "REST API wrapper for MCP SQL server endpoints."
  },
  "servers": [
    {
      "url": "https://<web-app-link>"
    }
  ],
  "paths": {
    "/dbs": {
      "get": {
        "summary": "List all databases",
        "operationId": "listDatabases",
        "responses": {
          "200": {
            "description": "Successful response",
            "content": {
              "application/json": {
                "schema": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  }
                }
              }
            }
          }
        }
      }
    },
    "/dbs/aliases": {
      "get": {
        "summary": "List all database aliases",
        "operationId": "listDatabaseAliases",
        "responses": {
          "200": {
            "description": "Successful response",
            "content": {
              "application/json": {
                "schema": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  }
                }
              }
            }
          }
        }
      }
    },
    "/dbs/types": {
      "get": {
        "summary": "List all SQL database types/engines/dialect",
        "operationId": "listDatabaseTypes",
        "responses": {
          "200": {
            "description": "Successful response",
            "content": {
              "application/json": {
                "schema": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  }
                }
              }
            }
          }
        }
      }
    },
    "/dbs/list-by-type": {
      "get": {
        "summary": "List all SQL database names available by types/engines/dialect",
        "operationId": "listDatabaseByTypes",
        "responses": {
          "200": {
            "description": "Successful response",
            "content": {
              "application/json": {
                "schema": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  }
                }
              }
            }
          }
        }
      }
    },
    "/sql/query": {
      "post": {
        "summary": "Execute SQL query against a database",
        "operationId": "executeSqlQuery",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "db": {
                    "type": "string",
                    "description": "The database name to run the query on based on user input"
                  },
                  "type": {
                    "type": "string",
                    "enum": [
                      "mysql",
                      "mssql",
                      "oracle",
                      "pg"
                    ],
                    "description": "The type of database engine/dialect"
                  },
                  "sql": {
                    "type": "string",
                    "description": "The SQL query to execute based on the database type"
                  }
                },
                "required": [
                  "db",
                  "type",
                  "sql"
                ]
              },
              "example": {
                "db": "pastry_database",
                "type": "mssql",
                "sql": "SELECT TOP 10 * FROM PastryOrders;"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Query executed successfully",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "rows": {
                      "type": "array",
                      "items": {
                        "type": "object"
                      }
                    },
                    "message": {
                      "type": "string"
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
```
