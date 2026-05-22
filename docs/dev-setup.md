# Developer Setup

## Required Local Tools

- JDK 21
- Gradle
- Node.js LTS
- Docker or OrbStack
- kubectl
- helm
- glab
- pre-commit

## Backend

```bash
cd playsay-platform/backend
gradle :api-gateway:test
gradle :api-gateway:bootRun
```

Health endpoints:

- `GET http://localhost:8080/hello`
- `GET http://localhost:8080/actuator/health`

## Frontend

```bash
cd playsay-platform/frontend
npm install
npm --workspace web-app run dev
```

The SPA is available at `http://localhost:5173`.

## Docker Smoke Test

From `playsay-platform`:

```bash
docker buildx build --platform linux/arm64 -f backend/api-gateway/Dockerfile -t playsay-api-gateway:local backend
docker run --rm -p 8080:8080 playsay-api-gateway:local
```

