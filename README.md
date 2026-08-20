# Honey School Platform

Product monorepo for the Honey School online English school platform.

Sprint 0 contents:

- `backend/api-gateway`: Kotlin/Spring Boot API gateway service
- `frontend/web-app`: single React SPA prepared for shadcn/ui-style components
- `contracts`: generated OpenAPI and WebSocket schemas will live here
- `docs/adr`: architecture decision records
- `Jenkinsfile`: CI pipeline for Jenkins, GHCR image publishing, and dev image tag updates

## Local Backend

```bash
cd backend/api-gateway
gradle bootRun
```

## Local Frontend

```bash
cd frontend/web-app
npm install
npm run dev
```
