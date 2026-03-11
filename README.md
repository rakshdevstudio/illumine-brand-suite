# Illumine Brand Suite

Luxury school uniform ordering platform for Illume — featuring a parent-facing store and an internal admin dashboard.

---

## Tech Stack

- **React 18** + **TypeScript**
- **Vite** (build tooling)
- **Tailwind CSS** + **shadcn/ui** (component library)
- **Supabase** (database, auth, edge functions)
- **TanStack Query** (data fetching)
- **React Router v6**
- **Zustand** (client state)

---

## Getting Started

### Prerequisites

- Node.js 18+
- A Supabase project

### Setup

```sh
# 1. Clone the repository
git clone <YOUR_GIT_URL>
cd illumine-brand-suite

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env
# Fill in your Supabase URL and anon key in .env

# 4. Start the development server
npm run dev
```

The app will be available at `http://localhost:8080`.

---

## Environment Variables

| Variable                  | Description                       |
|---------------------------|-----------------------------------|
| `VITE_SUPABASE_URL`       | Your Supabase project URL         |
| `VITE_SUPABASE_ANON_KEY`  | Your Supabase public anon key     |

---

## Project Structure

```
src/
  components/       # Shared + feature components
    admin/          # Admin layout and components
    store/          # Store layout and components
    ui/             # shadcn/ui primitives
  hooks/            # Custom React hooks
  integrations/
    supabase/       # Supabase client + generated types
  lib/              # Utilities
  pages/
    admin/          # Admin dashboard pages
    store/          # Customer store pages
supabase/
  functions/        # Supabase Edge Functions
  migrations/       # Database migrations
```

---

## Available Scripts

| Script              | Description                          |
|---------------------|--------------------------------------|
| `npm run dev`       | Start development server             |
| `npm run build`     | Production build                     |
| `npm run preview`   | Preview production build locally     |
| `npm run lint`      | Run ESLint                           |
| `npm run test`      | Run tests                            |
