# Talktivity Server

## Project Structure
```
talktivity_node_server/
├── package.json               # Project dependencies & scripts
├── .gitignore                 # Git ignore rules
├── README.md                  # Project documentation
│
└── src/
    ├── config/                # Environment parsing, constants
    │   └── index.js
    │
    ├── core/                  # Shared/core infrastructure
    │   ├── http/
    │   │   ├── middlewares/
    │   │   │   ├── auth.js
    │   │   │   ├── cors.js
    │   │   │   ├── rateLimit.js
    │   │   │   └── requestLogger.js
    │   │   └── response.js
    │   │
    │   ├── error/
    │   │   ├── errors.js
    │   │   └── errorHandler.js
    │   │
    │   ├── logger/
    │   │   └── index.js       # Winston logger init
    │   │
    │   ├── db/
    │   │   └── client.js      # PostgreSQL client
    │   │
    │   └── socket/
    │       └── index.js       # Socket.IO setup
    │
    ├── app.js                 # Express app creation (middlewares, mount routers)
    ├── server.js              # Server bootstrap (listen, signals)
    │
    └── modules/               # Feature-based modules
        ├── auth/
        │   ├── router.js
        │   ├── controller.js
        │   ├── service.js
        │   ├── repo.js
        │   ├── schema.js
        │   └── index.js
        │
        ├── listening/
        │   ├── router.js
        │   ├── controller.js
        │   ├── service.js
        │   ├── repo.js
        │   ├── schema.js
        │   └── index.js
        │
        ├── topics/
        │   ├── router.js
        │   ├── controller.js
        │   ├── service.js
        │   ├── repo.js
        │   ├── schema.js
        │   └── index.js
        │
        ├── groups/
        │   ├── router.js
        │   ├── controller.js
        │   ├── service.js
        │   ├── repo.js
        │   ├── schema.js
        │   └── index.js
        │
        ├── leaderboard/
        │   ├── router.js
        │   ├── controller.js
        │   ├── service.js
        │   ├── repo.js
        │   ├── schema.js
        │   └── index.js
        │
        ├── transcripts/
        │   ├── router.js
        │   ├── controller.js
        │   ├── service.js
        │   ├── repo.js
        │   ├── schema.js
        │   └── index.js
        │
        ├── vocabulary/
        │   ├── router.js
        │   ├── controller.js
        │   ├── service.js
        │   ├── repo.js
        │   ├── schema.js
        │   └── index.js
        │
        ├── reports/
        │   ├── router.js
        │   ├── controller.js
        │   ├── service.js
        │   ├── repo.js
        │   ├── schema.js
        │   └── index.js
        │
        └── dm/
            ├── router.js
            ├── controller.js
            ├── service.js
            ├── repo.js
            ├── schema.js
            └── index.js
```

## Getting Started

### Prerequisites
- Node.js (version 14 or higher)
- PostgreSQL database
- npm or yarn

### Installation
1. Clone the repository
2. Navigate to the project directory
3. Install dependencies:
   ```bash
   npm install
   ```

### Environment Setup
Create a `.env` file in the root directory with the following variables:
```
JWT_SECRET=your_jwt_secret_key_here_at_least_32_characters
PG_HOST=localhost
PG_PORT=5432
PG_USER=your_database_user
PG_PASSWORD=your_database_password
PG_DATABASE=your_database_name
ALLOWED_ORIGINS=http://localhost:3000,https://yourdomain.com
```

### Running the Application
- Development mode: `npm run dev`
- Production mode: `npm start`

### API Endpoints
The server exposes several REST API endpoints for authentication, groups, and transcripts functionality.