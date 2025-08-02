const { Pool } = require('pg');

const pool = new Pool({
  host: 'dpg-d1giokqli9vc73an51vg-a.singapore-postgres.render.com',
  port: 5432,
  user: 'talktivity',
  password: 'gYmROfudwrUt7HJwRiNgYchzlytxCx5q',
  database: 'talktivity_postgres_sql',
  ssl: { rejectUnauthorized: false }
});

const createGroupsSchemaSQL = `
CREATE TABLE IF NOT EXISTS groups (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    category VARCHAR(50),
    is_public BOOLEAN DEFAULT TRUE,
    cover_image VARCHAR(255),
    is_featured BOOLEAN DEFAULT FALSE,
    is_trending BOOLEAN DEFAULT FALSE,
    is_common BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS group_members (
    id SERIAL PRIMARY KEY,
    group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL,
    joined_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS group_messages (
    id SERIAL PRIMARY KEY,
    group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    pinned BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dms (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dm_participants (
    id SERIAL PRIMARY KEY,
    dm_id INTEGER REFERENCES dms(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL,
    UNIQUE (dm_id, user_id)
);

CREATE TABLE IF NOT EXISTS dm_messages (
    id SERIAL PRIMARY KEY,
    dm_id INTEGER REFERENCES dms(id) ON DELETE CASCADE,
    sender_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    read BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS last_read_at (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    group_id INTEGER,
    dm_id INTEGER,
    last_read_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT only_one_ref CHECK (
        (group_id IS NOT NULL AND dm_id IS NULL) OR
        (group_id IS NULL AND dm_id IS NOT NULL)
    ),
    UNIQUE (user_id, group_id, dm_id)
);

CREATE TABLE IF NOT EXISTS muted_groups (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
    muted_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (user_id, group_id)
);

-- Insert predefined groups (using proper conflict resolution)
INSERT INTO groups (name, description, category, cover_image, is_featured, is_trending, is_common)
VALUES
    ('Common Group', 'A group for all users', 'General', NULL, TRUE, TRUE, TRUE),
    ('IELTS Practice', 'Discuss IELTS tips and practice', 'IELTS', NULL, TRUE, FALSE, FALSE),
    ('Grammar Help', 'Ask grammar questions and get help', 'Grammar', NULL, FALSE, TRUE, FALSE),
    ('Vocabulary Boost', 'Share and learn new words', 'Vocabulary', NULL, FALSE, FALSE, FALSE)
ON CONFLICT (name) DO NOTHING;
`;

(async () => {
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    for (const statement of createGroupsSchemaSQL.split(';')) {
      const sql = statement.trim();
      if (sql) {
        await client.query(sql);
      }
    }
    await client.query('COMMIT');
    console.log('✅ Groups schema created or already exists.');
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    console.error('❌ Error creating groups schema:', err);
  } finally {
    if (client) client.release();
    await pool.end();
  }
})(); 