-- PostgreSQL Table Schema Dump
-- Generated: 2026-01-23T00:18:11.549Z
-- Database: talktivity_postgres_sql_33av


-- ============================================
-- Table: conversations
-- Records: 855
-- ============================================
-- Columns:
--   id                        integer              NOT NULL DEFAULT nextval('conversations_id_seq'::regclass)
--   room_name                 character varying    NOT NULL
--   participant_identity      character varying    nullable
--   timestamp                 timestamp without time zone nullable DEFAULT CURRENT_TIMESTAMP
--   transcript                text                 nullable
--   user_id                   integer              NOT NULL
--   session_duration          integer              nullable


-- ============================================
-- Table: daily_progress
-- Records: 138
-- ============================================
-- Columns:
--   id                        integer              NOT NULL DEFAULT nextval('daily_progress_id_seq'::regclass)
--   user_id                   integer              NOT NULL
--   course_id                 integer              NOT NULL
--   week_number               integer              NOT NULL
--   day_number                integer              NOT NULL
--   date                      date                 NOT NULL
--   speaking_completed        boolean              nullable DEFAULT false
--   speaking_start_time       timestamp without time zone nullable
--   speaking_end_time         timestamp without time zone nullable
--   speaking_duration_seconds integer              nullable DEFAULT 0
--   quiz_completed            boolean              nullable DEFAULT false
--   quiz_score                integer              nullable
--   quiz_attempts             integer              nullable DEFAULT 0
--   created_at                timestamp without time zone nullable DEFAULT CURRENT_TIMESTAMP
--   updated_at                timestamp without time zone nullable DEFAULT CURRENT_TIMESTAMP
--   listening_completed       boolean              nullable DEFAULT false
--   listening_start_time      timestamp without time zone nullable
--   listening_end_time        timestamp without time zone nullable
--   listening_duration_seconds integer              nullable DEFAULT 0
--   listening_quiz_completed  boolean              nullable DEFAULT false
--   listening_quiz_score      integer              nullable
--   listening_quiz_attempts   integer              nullable DEFAULT 0
--   roleplay_completed        boolean              nullable DEFAULT false
--   practice_duration_seconds integer              nullable DEFAULT 0
--   roleplay_duration_seconds integer              nullable DEFAULT 0
--   total_time_seconds        integer              nullable DEFAULT 0
--   exam_completed            boolean              nullable DEFAULT false
--   exam_score                integer              nullable
--   exam_duration_seconds     integer              nullable
--   roleplay_remaining_seconds integer              nullable DEFAULT 0
--   practice_remaining_seconds integer              nullable DEFAULT 0


-- ============================================
-- Table: daily_reports
-- Records: 49
-- ============================================
-- Columns:
--   id                        integer              NOT NULL DEFAULT nextval('daily_reports_id_seq'::regclass)
--   user_id                   integer              NOT NULL
--   report_date               date                 NOT NULL
--   report_data               jsonb                NOT NULL
--   created_at                timestamp without time zone nullable DEFAULT CURRENT_TIMESTAMP
--   updated_at                timestamp without time zone nullable DEFAULT CURRENT_TIMESTAMP


-- ============================================
-- Table: dm_messages
-- Records: 10
-- ============================================
-- Columns:
--   id                        integer              NOT NULL DEFAULT nextval('dm_messages_id_seq'::regclass)
--   dm_id                     integer              nullable
--   sender_id                 integer              NOT NULL
--   content                   text                 NOT NULL
--   created_at                timestamp without time zone nullable DEFAULT now()
--   read                      boolean              nullable DEFAULT false
--   pinned                    boolean              nullable DEFAULT false


-- ============================================
-- Table: dms
-- Records: 0
-- ============================================
-- Columns:
--   id                        integer              NOT NULL DEFAULT nextval('dms_id_seq'::regclass)
--   user1_id                  integer              NOT NULL
--   user2_id                  integer              NOT NULL
--   created_at                timestamp without time zone nullable DEFAULT CURRENT_TIMESTAMP


-- ============================================
-- Table: group_members
-- Records: 646
-- ============================================
-- Columns:
--   id                        integer              NOT NULL DEFAULT nextval('group_members_id_seq'::regclass)
--   group_id                  integer              nullable
--   user_id                   integer              NOT NULL
--   joined_at                 timestamp without time zone nullable DEFAULT now()


-- ============================================
-- Table: group_messages
-- Records: 5
-- ============================================
-- Columns:
--   id                        integer              NOT NULL DEFAULT nextval('group_messages_id_seq'::regclass)
--   group_id                  integer              nullable
--   user_id                   integer              NOT NULL
--   content                   text                 NOT NULL
--   pinned                    boolean              nullable DEFAULT false
--   created_at                timestamp without time zone nullable DEFAULT now()


-- ============================================
-- Table: groups
-- Records: 4
-- ============================================
-- Columns:
--   id                        integer              NOT NULL DEFAULT nextval('groups_id_seq'::regclass)
--   name                      character varying    NOT NULL
--   description               text                 nullable
--   category                  character varying    nullable
--   is_public                 boolean              nullable DEFAULT true
--   cover_image               character varying    nullable
--   is_featured               boolean              nullable DEFAULT false
--   is_trending               boolean              nullable DEFAULT false
--   is_common                 boolean              nullable DEFAULT false
--   created_by                integer              nullable
--   created_at                timestamp without time zone nullable DEFAULT now()


-- ============================================
-- Table: muted_groups
-- Records: 2
-- ============================================
-- Columns:
--   id                        integer              NOT NULL DEFAULT nextval('muted_groups_id_seq'::regclass)
--   user_id                   integer              NOT NULL
--   group_id                  integer              nullable
--   muted_at                  timestamp without time zone nullable DEFAULT now()


-- ============================================
-- Table: onboarding_data
-- Records: 582
-- ============================================
-- Columns:
--   id                        integer              NOT NULL DEFAULT nextval('onboarding_data_id_seq'::regclass)
--   skill_to_improve          character varying    nullable
--   language_statement        character varying    nullable
--   english_usage             jsonb                nullable DEFAULT '[]'::jsonb
--   industry                  character varying    nullable
--   speaking_feelings         character varying    nullable
--   speaking_frequency        character varying    nullable
--   improvement_areas         jsonb                nullable DEFAULT '[]'::jsonb
--   main_goal                 character varying    nullable
--   speaking_obstacles        jsonb                nullable DEFAULT '[]'::jsonb
--   gender                    character varying    nullable
--   current_learning_methods  jsonb                nullable DEFAULT '[]'::jsonb
--   learning_challenges       jsonb                nullable DEFAULT '[]'::jsonb
--   hardest_part              character varying    nullable
--   current_level             character varying    nullable
--   native_language           character varying    nullable
--   known_words_1             jsonb                nullable DEFAULT '[]'::jsonb
--   known_words_2             jsonb                nullable DEFAULT '[]'::jsonb
--   work_scenarios            jsonb                nullable DEFAULT '[]'::jsonb
--   upcoming_occasions        jsonb                nullable DEFAULT '[]'::jsonb
--   interests                 jsonb                nullable DEFAULT '[]'::jsonb
--   english_style             character varying    nullable
--   tutor_style               jsonb                nullable DEFAULT '[]'::jsonb
--   created_at                timestamp without time zone nullable DEFAULT CURRENT_TIMESTAMP
--   updated_at                timestamp without time zone nullable DEFAULT CURRENT_TIMESTAMP
--   user_id                   integer              NOT NULL
--   last_speaking_date        date                 nullable


-- ============================================
-- Table: payment_audit_log
-- Records: 182
-- ============================================
-- Columns:
--   id                        integer              NOT NULL DEFAULT nextval('payment_audit_log_id_seq'::regclass)
--   event_type                character varying    NOT NULL
--   user_id                   integer              nullable
--   transaction_id            character varying    nullable
--   data                      jsonb                nullable
--   ip_address                inet                 nullable
--   user_agent                text                 nullable
--   created_at                timestamp without time zone nullable DEFAULT CURRENT_TIMESTAMP


-- ============================================
-- Table: payment_transactions
-- Records: 31
-- ============================================
-- Columns:
--   id                        integer              NOT NULL DEFAULT nextval('payment_transactions_id_seq'::regclass)
--   user_id                   integer              NOT NULL
--   subscription_id           integer              nullable
--   transaction_id            character varying    NOT NULL
--   order_id                  character varying    NOT NULL
--   amount                    numeric              NOT NULL
--   currency                  character varying    nullable DEFAULT 'BDT'::character varying
--   status                    character varying    NOT NULL
--   payment_method            character varying    nullable
--   gateway_response          jsonb                nullable
--   created_at                timestamp without time zone nullable DEFAULT CURRENT_TIMESTAMP
--   updated_at                timestamp without time zone nullable DEFAULT CURRENT_TIMESTAMP


-- ============================================
-- Table: speaking_sessions
-- Records: 834
-- ============================================
-- Columns:
--   id                        integer              NOT NULL DEFAULT nextval('speaking_sessions_id_seq'::regclass)
--   user_id                   integer              NOT NULL
--   course_id                 integer              NOT NULL
--   date                      date                 NOT NULL
--   start_time                timestamp without time zone NOT NULL
--   end_time                  timestamp without time zone nullable
--   duration_seconds          integer              nullable DEFAULT 0
--   created_at                timestamp without time zone nullable DEFAULT CURRENT_TIMESTAMP
--   updated_at                timestamp without time zone nullable DEFAULT CURRENT_TIMESTAMP


-- ============================================
-- Table: subscription_plans
-- Records: 5
-- ============================================
-- Columns:
--   id                        integer              NOT NULL DEFAULT nextval('subscription_plans_id_seq'::regclass)
--   name                      character varying    NOT NULL
--   price                     numeric              NOT NULL
--   duration_days             integer              NOT NULL
--   talk_time_minutes         integer              NOT NULL
--   max_scenarios             integer              NOT NULL
--   features                  jsonb                nullable DEFAULT '[]'::jsonb
--   is_active                 boolean              nullable DEFAULT true
--   created_at                timestamp without time zone nullable DEFAULT CURRENT_TIMESTAMP
--   updated_at                timestamp without time zone nullable DEFAULT CURRENT_TIMESTAMP
--   plan_type                 character varying    NOT NULL DEFAULT 'Basic'::character varying


-- ============================================
-- Table: subscriptions
-- Records: 55
-- ============================================
-- Columns:
--   id                        integer              NOT NULL DEFAULT nextval('subscriptions_id_seq'::regclass)
--   user_id                   integer              NOT NULL
--   plan_id                   integer              NOT NULL
--   status                    character varying    NOT NULL DEFAULT 'pending'::character varying
--   start_date                timestamp without time zone nullable
--   end_date                  timestamp without time zone nullable
--   payment_id                character varying    nullable
--   created_at                timestamp without time zone nullable DEFAULT CURRENT_TIMESTAMP
--   updated_at                timestamp without time zone nullable DEFAULT CURRENT_TIMESTAMP
--   is_free_trial             boolean              nullable DEFAULT false
--   free_trial_started_at     timestamp without time zone nullable
--   free_trial_used           boolean              nullable DEFAULT false


-- ============================================
-- Table: topic_categories
-- Records: 4
-- ============================================
-- Columns:
--   id                        integer              NOT NULL DEFAULT nextval('topic_categories_id_seq'::regclass)
--   category_name             character varying    NOT NULL
--   topics                    jsonb                nullable DEFAULT '[]'::jsonb
--   created_at                timestamp without time zone nullable DEFAULT CURRENT_TIMESTAMP
--   updated_at                timestamp without time zone nullable DEFAULT CURRENT_TIMESTAMP


-- ============================================
-- Table: user_courses
-- Records: 243
-- ============================================
-- Columns:
--   id                        integer              NOT NULL DEFAULT nextval('user_courses_id_seq'::regclass)
--   user_id                   integer              NOT NULL
--   course_start_date         date                 NOT NULL
--   course_end_date           date                 NOT NULL
--   current_week              integer              nullable DEFAULT 1
--   current_day               integer              nullable DEFAULT 1
--   is_active                 boolean              nullable DEFAULT true
--   personalized_topics       jsonb                nullable DEFAULT '[]'::jsonb
--   batch_number              integer              nullable DEFAULT 1
--   created_at                timestamp without time zone nullable DEFAULT CURRENT_TIMESTAMP
--   updated_at                timestamp without time zone nullable DEFAULT CURRENT_TIMESTAMP
--   batch_status              jsonb                nullable


-- ============================================
-- Table: user_lifecycle
-- Records: 633
-- ============================================
-- Columns:
--   user_id                   integer              NOT NULL
--   onboarding_completed      boolean              nullable DEFAULT false
--   onboarding_steps          jsonb                nullable DEFAULT '[]'::jsonb
--   onboarding_test_call_used boolean              nullable DEFAULT false
--   call_completed            boolean              nullable DEFAULT false
--   report_completed          boolean              nullable DEFAULT false
--   upgrade_completed         boolean              nullable DEFAULT false
--   lifetime_call_seconds     integer              nullable DEFAULT 0
--   lifetime_call_cap_seconds integer              nullable DEFAULT 300
--   last_progress_check_at    timestamp without time zone nullable
--   created_at                timestamp without time zone nullable DEFAULT CURRENT_TIMESTAMP
--   updated_at                timestamp without time zone nullable DEFAULT CURRENT_TIMESTAMP


-- ============================================
-- Table: user_oauth_providers
-- Records: 0
-- ============================================
-- Columns:
--   id                        integer              NOT NULL DEFAULT nextval('user_oauth_providers_id_seq'::regclass)
--   user_id                   integer              NOT NULL
--   provider                  character varying    NOT NULL
--   provider_user_id          character varying    NOT NULL
--   access_token              text                 nullable
--   refresh_token             text                 nullable
--   expires_at                timestamp without time zone nullable
--   created_at                timestamp without time zone nullable DEFAULT CURRENT_TIMESTAMP
--   updated_at                timestamp without time zone nullable DEFAULT CURRENT_TIMESTAMP


-- ============================================
-- Table: user_sessions
-- Records: 0
-- ============================================
-- Columns:
--   id                        integer              NOT NULL DEFAULT nextval('user_sessions_id_seq'::regclass)
--   user_id                   integer              NOT NULL
--   session_token             character varying    NOT NULL
--   expires_at                timestamp without time zone NOT NULL
--   created_at                timestamp without time zone nullable DEFAULT CURRENT_TIMESTAMP


-- ============================================
-- Table: user_word_progress
-- Records: 0
-- ============================================
-- Columns:
--   id                        integer              NOT NULL DEFAULT nextval('user_word_progress_id_seq'::regclass)
--   user_id                   integer              NOT NULL
--   word_id                   integer              NOT NULL
--   is_learned                boolean              nullable DEFAULT false
--   learned_at                timestamp without time zone nullable
--   created_at                timestamp without time zone nullable DEFAULT CURRENT_TIMESTAMP
--   updated_at                timestamp without time zone nullable DEFAULT CURRENT_TIMESTAMP


-- ============================================
-- Table: users
-- Records: 633
-- ============================================
-- Columns:
--   id                        integer              NOT NULL DEFAULT nextval('users_id_seq'::regclass)
--   email                     character varying    NOT NULL
--   password                  character varying    nullable
--   full_name                 character varying    nullable
--   google_id                 character varying    nullable
--   profile_picture           text                 nullable
--   auth_provider             character varying    nullable DEFAULT 'local'::character varying
--   is_email_verified         boolean              nullable DEFAULT false
--   created_at                timestamp without time zone nullable DEFAULT CURRENT_TIMESTAMP
--   updated_at                timestamp without time zone nullable DEFAULT CURRENT_TIMESTAMP
--   is_admin                  boolean              nullable DEFAULT false
--   reset_token               character varying    nullable
--   reset_token_expiry        timestamp without time zone nullable
--   onboarding_test_call_used boolean              nullable DEFAULT false
--   report_completed          boolean              nullable DEFAULT false
--   call_completed            boolean              nullable DEFAULT false
--   onboarding_completed      boolean              nullable DEFAULT false


-- ============================================
-- Table: vocabulary_completions
-- Records: 27
-- ============================================
-- Columns:
--   id                        integer              NOT NULL DEFAULT nextval('vocabulary_completions_id_seq'::regclass)
--   user_id                   integer              NOT NULL
--   week_number               integer              NOT NULL
--   day_number                integer              NOT NULL
--   completed_date            date                 NOT NULL DEFAULT CURRENT_DATE
--   created_at                timestamp without time zone nullable DEFAULT CURRENT_TIMESTAMP
--   updated_at                timestamp without time zone nullable DEFAULT CURRENT_TIMESTAMP


-- ============================================
-- Table: vocabulary_hierarchy
-- Records: 100
-- ============================================
-- Columns:
--   id                        integer              NOT NULL DEFAULT nextval('vocabulary_hierarchy_id_seq'::regclass)
--   week_number               integer              NOT NULL
--   day_number                integer              NOT NULL
--   created_at                timestamp without time zone nullable DEFAULT CURRENT_TIMESTAMP
--   updated_at                timestamp without time zone nullable DEFAULT CURRENT_TIMESTAMP


-- ============================================
-- Table: vocabulary_words
-- Records: 299
-- ============================================
-- Columns:
--   id                        integer              NOT NULL DEFAULT nextval('vocabulary_words_id_seq'::regclass)
--   day_id                    integer              NOT NULL
--   week_number               integer              NOT NULL
--   day_number                integer              NOT NULL
--   word                      character varying    NOT NULL
--   meaning_bn                text                 NOT NULL
--   example_en                text                 NOT NULL
--   example_bn                text                 NOT NULL
--   word_order                integer              nullable DEFAULT 1
--   created_at                timestamp without time zone nullable DEFAULT CURRENT_TIMESTAMP
--   updated_at                timestamp without time zone nullable DEFAULT CURRENT_TIMESTAMP

