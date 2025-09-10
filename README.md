# API Endpoint MCP Server
### Tools existed inside this MCP Server (As 10 September 2025):
1. SQL tools for different databases (Postgres, MySQL, SQL, Oracle)
2. 


## API Endpoints
After you deploying the MCP Server on the website, you will be getting a particular link. With that link, you be able to access some information through the endpoints that is specified.

### 1. SQL Tools for different databases (Postgres, MySQL, SQL, Oracle):
| Method | Endpoint       | Description                                |
|--------|----------------|--------------------------------------------|
| GET    | /dbs           | Lists all configured databases.            |
| GET    | /health        | Health check endpoint (server status).     |
| POST   | /sql/query     | Executes an SQL query against a database.  |

If your Base URL such as ```http://localhost:8787```, then you can use the endpoints as ```http://localhost:8787/health```. You can test the endpoints using **Postman** as well.

To specify what should be sent to the ```/sql/query```, you have to return in JSON form as such:
```json
{
  "db": "mysql",                            // Database Type
  "sql": "SELECT * FROM orders LIMIT 10;"   // SQL queries based on db type
}
```



### 2. (Not specified yet but just example for documentation)