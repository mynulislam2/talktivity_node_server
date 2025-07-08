-- 001_create_group_chat_schema.sql
-- Create groups table
CREATE TABLE IF NOT EXISTS groups (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    category VARCHAR(50),
    cover_image VARCHAR(255),
    is_featured BOOLEAN DEFAULT FALSE,
    is_trending BOOLEAN DEFAULT FALSE,
    is_common BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create group_members table
CREATE TABLE IF NOT EXISTS group_members (
    id SERIAL PRIMARY KEY,
    group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL,
    joined_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (group_id, user_id)
);

-- Create group_messages table
CREATE TABLE IF NOT EXISTS group_messages (
    id SERIAL PRIMARY KEY,
    group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    pinned BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create dms table
CREATE TABLE IF NOT EXISTS dms (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create dm_participants table
CREATE TABLE IF NOT EXISTS dm_participants (
    id SERIAL PRIMARY KEY,
    dm_id INTEGER REFERENCES dms(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL,
    UNIQUE (dm_id, user_id)
);

-- Create dm_messages table
CREATE TABLE IF NOT EXISTS dm_messages (
    id SERIAL PRIMARY KEY,
    dm_id INTEGER REFERENCES dms(id) ON DELETE CASCADE,
    sender_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    read BOOLEAN DEFAULT FALSE
);

-- Create last_read_at table
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

-- Create muted_groups table
CREATE TABLE IF NOT EXISTS muted_groups (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
    muted_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (user_id, group_id)
);

-- Insert predefined groups
INSERT INTO groups (name, description, category, cover_image, is_featured, is_trending, is_common)
VALUES
    ('Common Group', 'A group for all users', 'General', NULL, TRUE, TRUE, TRUE),
    ('IELTS Practice', 'Discuss IELTS tips and practice', 'IELTS', NULL, TRUE, FALSE, FALSE),
    ('Grammar Help', 'Ask grammar questions and get help', 'Grammar', NULL, FALSE, TRUE, FALSE),
    ('Vocabulary Boost', 'Share and learn new words', 'Vocabulary', NULL, FALSE, FALSE, FALSE)
ON CONFLICT DO NOTHING; 