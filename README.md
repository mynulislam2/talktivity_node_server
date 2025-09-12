Project Structre:
```
Agentserver/
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
    │   │   └── index.js       # pino/winston init
    │   │
    │   └── db/
    │       └── client.js      # knex/pg/prisma client (choose one)
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