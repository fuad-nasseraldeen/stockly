# Setup Instructions (Detailed)

## Prerequisites

- Node 20.x recommended
- npm 9+
- Supabase project
- (optional) AWS credentials for PDF import via Textract

## Backend setup

```bash
cd backend
npm install
```

Create `backend/.env`:

```env
PORT=3001
FRONTEND_URL=http://localhost:5173
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role>
AWS_REGION=<region>
AWS_ACCESS_KEY_ID=<key>
AWS_SECRET_ACCESS_KEY=<secret>
```

## Frontend setup

```bash
cd frontend
npm install
```

Create `frontend/.env`:

```env
VITE_API_URL=http://localhost:3001
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon_key>
```

## Database setup

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

הרץ מיגרציות בסדר מספרי. ודא במיוחד את:

- `0025` import mappings source type
- `0026` price_entries metadata columns
- `0027` enum package_type value `roll`
- `0028` refreshed current price view metadata

## Run app

```bash
cd backend && npm run dev
cd frontend && npm run dev
```

## Validate setup

- `GET http://localhost:3001/health` מחזיר status ok
- Login + open `ImportExport`
- Excel multi-sheet preview עובד
- Validate/apply זמין

## Test commands

```bash
cd backend && npm run test
cd frontend && npm run test
```
