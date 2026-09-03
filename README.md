# SpotOn Backend (PostgreSQL + NestJS)

Backend service for SpotOn built with NestJS (Express style), PostgreSQL, and Redis, fully containerized with Docker Compose.

1. Clone the project

```bash
git@gitlab.com:azfarmamu/backend_spoton.git
```

2. create file .env make sure u at the root project 
```bash
cp spot-on_service/.env.example spot-on_service/.env
```

3. build 
```bash
docker compose up -d --build
```

4. delete compose 

```bash 
docker compose down -v 
```