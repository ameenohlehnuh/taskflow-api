# SpotOn Backend (PostgreSQL + NestJS)

Backend service for SpotOn built with NestJS, PostgreSQL (PostGIS), and Redis, fully containerized using Docker Compose.

---

## 🚀 Getting Started

### 1. Clone the repository
```bash
git clone git@gitlab.com:azfarmamu/backend_spoton.git
cd backend_spoton
```

### 2. Environment Configuration
Create the .env file from .env.example inside the spot-on_service directory:
```bash
cp spot-on_service/.env.example spot-on_service/.env
```

### 3.Build and Run Containers
Start all services in detached mode:
```bash
docker compose up -d --build
```

### 4.Stop Containers
To stop and remove containers, networks, and volumes:
```bash
docker compose down -v
```


## 🌱 Database Seeding
To run database seeds via a one-off Docker container:
```bash 
docker compose run --rm backend1 npm run seed
```

## 🔍 Database Inspection
You can inspect and manage the PostgreSQL database using either method below:
### Method 1: Command Line (CLI)
Exec into the primary PostgreSQL container using psql:
```bash
docker exec -it postgres-primary psql -U postgres -d spoton
```
Inside the psql shell, check the tables:
```bash
\dt public.*
```
### Method 2: pgAdmin Web Interface
1. Open your browser and navigate to http://localhost:8080
2. Log in with the default pgAdmin credentials: 
    - Email: admin@spoton.com 
    - Password: admin123
3. Click Add New Server and configure the connection details:
    - Name: postgres-primary (or any display name)
    - Connection Tab:
        - Host name / address: postgres-primary (Do not use localhost)
        - Port: 5432
        - Maintenance database: spoton
        - Username: postgres
        - Password: postgres