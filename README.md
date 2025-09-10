# API Endpoint MCP Server
### Tools existed inside this MCP Server (As 10 September 2025):
1. SQL tools for different databases (Postgres, MySQL, SQL, Oracle)
2. 


## SQL tools for different databases (Postgres, MySQL, SQL, Oracle)
After you deploying the MCP Server on the website, you will get a particular link called _**Base URL**_. With that link, you be able to access some information through the endpoints that is specified. If your Base URL such as `http://localhost:8787`, then you can use the endpoints as `http://localhost:8787/health`. You can test the endpoints using **_Postman_** as well.

Below are the endpoints under the SQL Tools:
| Method | Endpoint       | Description                                |
|--------|----------------|--------------------------------------------|
| GET    | /dbs           | Lists all configured databases.            |
| GET    | /health        | Health check endpoint (server status).     |
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

#### **2) MySQL Database (E-commerce Store)**

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

#### **3) MSSQL Database (Hospital Management)**

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

#### **4) Oracle Database (University System)**

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



