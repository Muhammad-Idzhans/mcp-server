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
#### Database Used and Data
Databases that was used are Postgres, MySQL, SQL and Oracle. Below are the information that can be seen inside the database:

**1) POSTGRESQL DATABASE (Library System)**

**TABLE NAME:** ```books```
| book\_id | title                   | author      | genre     | year\_published |
| -------- | ----------------------- | ----------- | --------- | --------------- |
| 1        | The Silent Forest       | John Rivers | Fiction   | 2015            |
| 2        | Data Science Simplified | Alice Tan   | Education | 2020            |

**TABLE NAME:** ```members```
| member\_id | name       | email                                                   | join\_date | active |
| ---------- | ---------- | ------------------------------------------------------- | ---------- | ------ |
| 101        | Sarah Lim  | [sarah@example.com](mailto:sarah@example.com)           | 2021-03-10 | true   |
| 102        | Ahmad Zaki | [ahmad.zaki@example.com](mailto:ahmad.zaki@example.com) | 2022-07-22 | false  |



**2) MySQL Database (E-commerce Store)**

**TABLE NAME:** ```products```
| product\_id | name          | category    | price   | stock |
| ----------- | ------------- | ----------- | ------- | ----- |
| 501         | Laptop X100   | Electronics | 3500.00 | 15    |
| 502         | Running Shoes | Sports      | 280.00  | 50    |

**TABLE NAME:** ```orders```
| order\_id | product\_id | customer\_name | quantity | order\_date |
| --------- | ----------- | -------------- | -------- | ----------- |
| 9001      | 501         | Daniel Wong    | 1        | 2024-12-15  |
| 9002      | 502         | Mei Li         | 2        | 2025-01-20  |


**3) MSSQL Database (Hospital Management)**

**TABLE NAME:** ```patients```
| patient\_id | full\_name   | dob        | blood\_type | admitted   |
| ----------- | ------------ | ---------- | ----------- | ---------- |
| P001        | Kevin Smith  | 1990-05-21 | O+          | 2025-02-01 |
| P002        | Aisha Rahman | 1985-11-03 | A-          | 2025-02-07 |

**TABLE NAME:** ```doctors```
| patient\_id | full\_name   | dob        | blood\_type | admitted   |
| ----------- | ------------ | ---------- | ----------- | ---------- |
| P001        | Kevin Smith  | 1990-05-21 | O+          | 2025-02-01 |
| P002        | Aisha Rahman | 1985-11-03 | A-          | 2025-02-07 |

**4) Oracle Database (University System)**

**TABLE NAME:** ```COURSES```

| course\_id | course\_name              | department  | credits | semester |
| ---------- | ------------------------- | ----------- | ------- | -------- |
| CSE101     | Intro to Computer Science | Computing   | 4       | Fall     |
| BUS201     | Marketing Basics          | Business    | 3       | Spring   |
| ENG301     | Thermodynamics            | Engineering | 4       | Fall     |

**TABLE NAME:** ```STUDENTS```
| student\_id | name      | major                   | gpa | enrollment\_year |
| ----------- | --------- | ----------------------- | --- | ---------------- |
| S1001       | Raj Kumar | Computer Science        | 3.8 | 2021             |
| S1002       | Emily Tan | Business Administration | 3.5 | 2020             |
| S1003       | Ahmad Ali | Mechanical Engineering  | 3.2 | 2019             |



