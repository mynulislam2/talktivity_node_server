--
-- PostgreSQL database dump
--

\restrict 3OVdF9IGQ3rBLE07vcboO64QcllchzhmIf2J1uBDTYLaAen5ZcrRVQQq41ZmVxO

-- Dumped from database version 17.6 (Debian 17.6-2.pgdg12+1)
-- Dumped by pg_dump version 17.7 (Ubuntu 17.7-3.pgdg24.04+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: talktivity
--

-- *not* creating schema, since initdb creates it


ALTER SCHEMA public OWNER TO talktivity;

--
-- Name: calculate_user_xp(integer, integer, integer, integer, integer); Type: FUNCTION; Schema: public; Owner: talktivity
--

CREATE FUNCTION public.calculate_user_xp(speaking_seconds integer, full_sessions integer, quizzes integer, exams integer, streak integer) RETURNS integer
    LANGUAGE plpgsql
    AS $$
            BEGIN
                RETURN (FLOOR(speaking_seconds / 60) * 2) + 
                       (full_sessions * 10) + 
                       (quizzes * 15) + 
                       (exams * 50) + 
                       (streak * 5);
            END;
            $$;


ALTER FUNCTION public.calculate_user_xp(speaking_seconds integer, full_sessions integer, quizzes integer, exams integer, streak integer) OWNER TO talktivity;

--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: talktivity
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_updated_at_column() OWNER TO talktivity;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: call_sessions; Type: TABLE; Schema: public; Owner: talktivity
--

CREATE TABLE public.call_sessions (
    id integer NOT NULL,
    user_id integer NOT NULL,
    call_started_at timestamp without time zone DEFAULT now(),
    call_ended_at timestamp without time zone,
    call_duration_seconds integer DEFAULT 0,
    call_completed boolean DEFAULT false NOT NULL,
    session_type character varying(50) DEFAULT 'practice'::character varying,
    topic_id integer,
    topic_name character varying(255),
    room_name character varying(255),
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT chk_call_sessions_session_type CHECK (((session_type)::text = ANY ((ARRAY['practice'::character varying, 'roleplay'::character varying, 'call'::character varying])::text[])))
);


ALTER TABLE public.call_sessions OWNER TO talktivity;

--
-- Name: TABLE call_sessions; Type: COMMENT; Schema: public; Owner: talktivity
--

COMMENT ON TABLE public.call_sessions IS 'Tracks individual call sessions with duration and completion status';


--
-- Name: call_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: talktivity
--

CREATE SEQUENCE public.call_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.call_sessions_id_seq OWNER TO talktivity;

--
-- Name: call_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: talktivity
--

ALTER SEQUENCE public.call_sessions_id_seq OWNED BY public.call_sessions.id;


--
-- Name: conversations; Type: TABLE; Schema: public; Owner: talktivity
--

CREATE TABLE public.conversations (
    id integer NOT NULL,
    room_name character varying(255) NOT NULL,
    participant_identity character varying(255),
    "timestamp" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    transcript text,
    user_id integer NOT NULL,
    session_duration integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.conversations OWNER TO talktivity;

--
-- Name: conversations_id_seq; Type: SEQUENCE; Schema: public; Owner: talktivity
--

CREATE SEQUENCE public.conversations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.conversations_id_seq OWNER TO talktivity;

--
-- Name: conversations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: talktivity
--

ALTER SEQUENCE public.conversations_id_seq OWNED BY public.conversations.id;


--
-- Name: daily_progress; Type: TABLE; Schema: public; Owner: talktivity
--

CREATE TABLE public.daily_progress (
    id integer NOT NULL,
    user_id integer NOT NULL,
    course_id integer NOT NULL,
    week_number integer NOT NULL,
    day_number integer NOT NULL,
    progress_date date NOT NULL,
    speaking_completed boolean DEFAULT false NOT NULL,
    speaking_started_at timestamp without time zone,
    speaking_ended_at timestamp without time zone,
    speaking_duration_seconds integer DEFAULT 0,
    speaking_quiz_completed boolean DEFAULT false NOT NULL,
    speaking_quiz_score integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    listening_completed boolean DEFAULT false NOT NULL,
    listening_quiz_completed boolean DEFAULT false NOT NULL,
    listening_quiz_score integer,
    roleplay_completed boolean DEFAULT false NOT NULL,
    roleplay_duration_seconds integer DEFAULT 0,
    total_time_seconds integer DEFAULT 0,
    roleplay_started_at timestamp without time zone,
    roleplay_ended_at timestamp without time zone
);


ALTER TABLE public.daily_progress OWNER TO talktivity;

--
-- Name: daily_progress_backup_20260124; Type: TABLE; Schema: public; Owner: talktivity
--

CREATE TABLE public.daily_progress_backup_20260124 (
    id integer,
    user_id integer,
    course_id integer,
    progress_date date,
    call_started_at timestamp without time zone,
    call_ended_at timestamp without time zone,
    call_completed boolean,
    call_duration_seconds integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.daily_progress_backup_20260124 OWNER TO talktivity;

--
-- Name: daily_progress_backup_20260127; Type: TABLE; Schema: public; Owner: talktivity
--

CREATE TABLE public.daily_progress_backup_20260127 (
    id integer,
    user_id integer,
    course_id integer,
    progress_date date,
    call_started_at timestamp without time zone,
    call_ended_at timestamp without time zone,
    call_completed boolean,
    call_duration_seconds integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.daily_progress_backup_20260127 OWNER TO talktivity;

--
-- Name: daily_progress_id_seq; Type: SEQUENCE; Schema: public; Owner: talktivity
--

CREATE SEQUENCE public.daily_progress_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.daily_progress_id_seq OWNER TO talktivity;

--
-- Name: daily_progress_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: talktivity
--

ALTER SEQUENCE public.daily_progress_id_seq OWNED BY public.daily_progress.id;


--
-- Name: daily_reports; Type: TABLE; Schema: public; Owner: talktivity
--

CREATE TABLE public.daily_reports (
    id integer NOT NULL,
    user_id integer NOT NULL,
    report_date date NOT NULL,
    report_data jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.daily_reports OWNER TO talktivity;

--
-- Name: daily_reports_id_seq; Type: SEQUENCE; Schema: public; Owner: talktivity
--

CREATE SEQUENCE public.daily_reports_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.daily_reports_id_seq OWNER TO talktivity;

--
-- Name: daily_reports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: talktivity
--

ALTER SEQUENCE public.daily_reports_id_seq OWNED BY public.daily_reports.id;


--
-- Name: dm_messages; Type: TABLE; Schema: public; Owner: talktivity
--

CREATE TABLE public.dm_messages (
    id integer NOT NULL,
    dm_id integer,
    sender_id integer NOT NULL,
    content text NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    read boolean DEFAULT false NOT NULL,
    pinned boolean DEFAULT false NOT NULL
);


ALTER TABLE public.dm_messages OWNER TO talktivity;

--
-- Name: dm_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: talktivity
--

CREATE SEQUENCE public.dm_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.dm_messages_id_seq OWNER TO talktivity;

--
-- Name: dm_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: talktivity
--

ALTER SEQUENCE public.dm_messages_id_seq OWNED BY public.dm_messages.id;


--
-- Name: dms; Type: TABLE; Schema: public; Owner: talktivity
--

CREATE TABLE public.dms (
    id integer NOT NULL,
    user1_id integer NOT NULL,
    user2_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.dms OWNER TO talktivity;

--
-- Name: dms_id_seq; Type: SEQUENCE; Schema: public; Owner: talktivity
--

CREATE SEQUENCE public.dms_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.dms_id_seq OWNER TO talktivity;

--
-- Name: dms_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: talktivity
--

ALTER SEQUENCE public.dms_id_seq OWNED BY public.dms.id;


--
-- Name: group_members; Type: TABLE; Schema: public; Owner: talktivity
--

CREATE TABLE public.group_members (
    id integer NOT NULL,
    group_id integer,
    user_id integer NOT NULL,
    joined_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.group_members OWNER TO talktivity;

--
-- Name: group_members_id_seq; Type: SEQUENCE; Schema: public; Owner: talktivity
--

CREATE SEQUENCE public.group_members_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.group_members_id_seq OWNER TO talktivity;

--
-- Name: group_members_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: talktivity
--

ALTER SEQUENCE public.group_members_id_seq OWNED BY public.group_members.id;


--
-- Name: group_messages; Type: TABLE; Schema: public; Owner: talktivity
--

CREATE TABLE public.group_messages (
    id integer NOT NULL,
    group_id integer,
    user_id integer NOT NULL,
    content text NOT NULL,
    pinned boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.group_messages OWNER TO talktivity;

--
-- Name: group_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: talktivity
--

CREATE SEQUENCE public.group_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.group_messages_id_seq OWNER TO talktivity;

--
-- Name: group_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: talktivity
--

ALTER SEQUENCE public.group_messages_id_seq OWNED BY public.group_messages.id;


--
-- Name: groups; Type: TABLE; Schema: public; Owner: talktivity
--

CREATE TABLE public.groups (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    category character varying(50),
    is_public boolean DEFAULT true NOT NULL,
    cover_image character varying(255),
    is_featured boolean DEFAULT false NOT NULL,
    is_trending boolean DEFAULT false NOT NULL,
    is_common boolean DEFAULT false NOT NULL,
    created_by integer,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.groups OWNER TO talktivity;

--
-- Name: groups_id_seq; Type: SEQUENCE; Schema: public; Owner: talktivity
--

CREATE SEQUENCE public.groups_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.groups_id_seq OWNER TO talktivity;

--
-- Name: groups_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: talktivity
--

ALTER SEQUENCE public.groups_id_seq OWNED BY public.groups.id;


--
-- Name: last_read_at; Type: TABLE; Schema: public; Owner: talktivity
--

CREATE TABLE public.last_read_at (
    id integer NOT NULL,
    user_id integer NOT NULL,
    group_id integer,
    dm_id integer,
    last_read_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.last_read_at OWNER TO talktivity;

--
-- Name: last_read_at_id_seq; Type: SEQUENCE; Schema: public; Owner: talktivity
--

CREATE SEQUENCE public.last_read_at_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.last_read_at_id_seq OWNER TO talktivity;

--
-- Name: last_read_at_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: talktivity
--

ALTER SEQUENCE public.last_read_at_id_seq OWNED BY public.last_read_at.id;


--
-- Name: lifetime_call_usage; Type: TABLE; Schema: public; Owner: talktivity
--

CREATE TABLE public.lifetime_call_usage (
    id integer NOT NULL,
    user_id integer NOT NULL,
    started_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    duration_seconds integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.lifetime_call_usage OWNER TO talktivity;

--
-- Name: lifetime_call_usage_id_seq; Type: SEQUENCE; Schema: public; Owner: talktivity
--

CREATE SEQUENCE public.lifetime_call_usage_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.lifetime_call_usage_id_seq OWNER TO talktivity;

--
-- Name: lifetime_call_usage_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: talktivity
--

ALTER SEQUENCE public.lifetime_call_usage_id_seq OWNED BY public.lifetime_call_usage.id;


--
-- Name: muted_groups; Type: TABLE; Schema: public; Owner: talktivity
--

CREATE TABLE public.muted_groups (
    id integer NOT NULL,
    user_id integer NOT NULL,
    group_id integer,
    muted_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.muted_groups OWNER TO talktivity;

--
-- Name: muted_groups_id_seq; Type: SEQUENCE; Schema: public; Owner: talktivity
--

CREATE SEQUENCE public.muted_groups_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.muted_groups_id_seq OWNER TO talktivity;

--
-- Name: muted_groups_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: talktivity
--

ALTER SEQUENCE public.muted_groups_id_seq OWNED BY public.muted_groups.id;


--
-- Name: onboarding_data; Type: TABLE; Schema: public; Owner: talktivity
--

CREATE TABLE public.onboarding_data (
    id integer NOT NULL,
    skill_to_improve character varying(100),
    language_statement character varying(10),
    industry character varying(100),
    speaking_feelings character varying(50),
    speaking_frequency character varying(50),
    main_goal character varying(100),
    gender character varying(20),
    current_learning_methods jsonb DEFAULT '[]'::jsonb,
    current_level character varying(50),
    native_language character varying(100),
    known_words_1 jsonb DEFAULT '[]'::jsonb,
    known_words_2 jsonb DEFAULT '[]'::jsonb,
    interests jsonb DEFAULT '[]'::jsonb,
    english_style character varying(50),
    tutor_style jsonb DEFAULT '[]'::jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    user_id integer NOT NULL
);


ALTER TABLE public.onboarding_data OWNER TO talktivity;

--
-- Name: onboarding_data_id_seq; Type: SEQUENCE; Schema: public; Owner: talktivity
--

CREATE SEQUENCE public.onboarding_data_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.onboarding_data_id_seq OWNER TO talktivity;

--
-- Name: onboarding_data_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: talktivity
--

ALTER SEQUENCE public.onboarding_data_id_seq OWNED BY public.onboarding_data.id;


--
-- Name: payment_audit_log; Type: TABLE; Schema: public; Owner: talktivity
--

CREATE TABLE public.payment_audit_log (
    id integer NOT NULL,
    event_type character varying(50) NOT NULL,
    user_id integer,
    transaction_id character varying(255),
    data jsonb,
    ip_address inet,
    user_agent text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.payment_audit_log OWNER TO talktivity;

--
-- Name: payment_audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: talktivity
--

CREATE SEQUENCE public.payment_audit_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.payment_audit_log_id_seq OWNER TO talktivity;

--
-- Name: payment_audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: talktivity
--

ALTER SEQUENCE public.payment_audit_log_id_seq OWNED BY public.payment_audit_log.id;


--
-- Name: payment_transactions; Type: TABLE; Schema: public; Owner: talktivity
--

CREATE TABLE public.payment_transactions (
    id integer NOT NULL,
    user_id integer NOT NULL,
    subscription_id integer,
    transaction_id character varying(255) NOT NULL,
    order_id character varying(255) NOT NULL,
    amount numeric(10,2) NOT NULL,
    currency character varying(3) DEFAULT 'BDT'::character varying,
    status character varying(20) NOT NULL,
    payment_method character varying(50),
    gateway_response jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_payment_transactions_status CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'completed'::character varying, 'failed'::character varying, 'refunded'::character varying, 'cancelled'::character varying])::text[])))
);


ALTER TABLE public.payment_transactions OWNER TO talktivity;

--
-- Name: payment_transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: talktivity
--

CREATE SEQUENCE public.payment_transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.payment_transactions_id_seq OWNER TO talktivity;

--
-- Name: payment_transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: talktivity
--

ALTER SEQUENCE public.payment_transactions_id_seq OWNED BY public.payment_transactions.id;


--
-- Name: refactoring_verification_report; Type: TABLE; Schema: public; Owner: talktivity
--

CREATE TABLE public.refactoring_verification_report (
    id integer NOT NULL,
    report_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    report_text text
);


ALTER TABLE public.refactoring_verification_report OWNER TO talktivity;

--
-- Name: refactoring_verification_report_id_seq; Type: SEQUENCE; Schema: public; Owner: talktivity
--

CREATE SEQUENCE public.refactoring_verification_report_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.refactoring_verification_report_id_seq OWNER TO talktivity;

--
-- Name: refactoring_verification_report_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: talktivity
--

ALTER SEQUENCE public.refactoring_verification_report_id_seq OWNED BY public.refactoring_verification_report.id;


--
-- Name: speaking_sessions; Type: TABLE; Schema: public; Owner: talktivity
--

CREATE TABLE public.speaking_sessions (
    id integer NOT NULL,
    user_id integer NOT NULL,
    course_id integer NOT NULL,
    date date NOT NULL,
    start_time timestamp without time zone NOT NULL,
    end_time timestamp without time zone,
    duration_seconds integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.speaking_sessions OWNER TO talktivity;

--
-- Name: speaking_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: talktivity
--

CREATE SEQUENCE public.speaking_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.speaking_sessions_id_seq OWNER TO talktivity;

--
-- Name: speaking_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: talktivity
--

ALTER SEQUENCE public.speaking_sessions_id_seq OWNED BY public.speaking_sessions.id;


--
-- Name: subscription_plans; Type: TABLE; Schema: public; Owner: talktivity
--

CREATE TABLE public.subscription_plans (
    id integer NOT NULL,
    name character varying(50) NOT NULL,
    price numeric(10,2) NOT NULL,
    duration_days integer NOT NULL,
    talk_time_minutes integer NOT NULL,
    max_scenarios integer NOT NULL,
    features jsonb DEFAULT '[]'::jsonb,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    plan_type character varying(20) DEFAULT 'Basic'::character varying NOT NULL
);


ALTER TABLE public.subscription_plans OWNER TO talktivity;

--
-- Name: subscription_plans_id_seq; Type: SEQUENCE; Schema: public; Owner: talktivity
--

CREATE SEQUENCE public.subscription_plans_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.subscription_plans_id_seq OWNER TO talktivity;

--
-- Name: subscription_plans_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: talktivity
--

ALTER SEQUENCE public.subscription_plans_id_seq OWNED BY public.subscription_plans.id;


--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: talktivity
--

CREATE TABLE public.subscriptions (
    id integer NOT NULL,
    user_id integer NOT NULL,
    plan_id integer NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    start_date timestamp without time zone,
    end_date timestamp without time zone,
    payment_id character varying(255),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    is_free_trial boolean DEFAULT false NOT NULL,
    free_trial_started_at timestamp without time zone,
    free_trial_used boolean DEFAULT false NOT NULL,
    CONSTRAINT chk_subscriptions_status CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'active'::character varying, 'expired'::character varying, 'cancelled'::character varying])::text[])))
);


ALTER TABLE public.subscriptions OWNER TO talktivity;

--
-- Name: subscriptions_id_seq; Type: SEQUENCE; Schema: public; Owner: talktivity
--

CREATE SEQUENCE public.subscriptions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.subscriptions_id_seq OWNER TO talktivity;

--
-- Name: subscriptions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: talktivity
--

ALTER SEQUENCE public.subscriptions_id_seq OWNED BY public.subscriptions.id;


--
-- Name: topic_categories; Type: TABLE; Schema: public; Owner: talktivity
--

CREATE TABLE public.topic_categories (
    id integer NOT NULL,
    category_name character varying(255) NOT NULL,
    topics jsonb DEFAULT '[]'::jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.topic_categories OWNER TO talktivity;

--
-- Name: topic_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: talktivity
--

CREATE SEQUENCE public.topic_categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.topic_categories_id_seq OWNER TO talktivity;

--
-- Name: topic_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: talktivity
--

ALTER SEQUENCE public.topic_categories_id_seq OWNED BY public.topic_categories.id;


--
-- Name: user_courses; Type: TABLE; Schema: public; Owner: talktivity
--

CREATE TABLE public.user_courses (
    id integer NOT NULL,
    user_id integer NOT NULL,
    course_start_date date NOT NULL,
    course_end_date date NOT NULL,
    current_week integer DEFAULT 1,
    current_day integer DEFAULT 1,
    is_active boolean DEFAULT true,
    personalized_topics jsonb DEFAULT '[]'::jsonb,
    batch_number integer DEFAULT 1,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    batch_status jsonb
);


ALTER TABLE public.user_courses OWNER TO talktivity;

--
-- Name: user_courses_id_seq; Type: SEQUENCE; Schema: public; Owner: talktivity
--

CREATE SEQUENCE public.user_courses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.user_courses_id_seq OWNER TO talktivity;

--
-- Name: user_courses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: talktivity
--

ALTER SEQUENCE public.user_courses_id_seq OWNED BY public.user_courses.id;


--
-- Name: user_lifecycle; Type: TABLE; Schema: public; Owner: talktivity
--

CREATE TABLE public.user_lifecycle (
    user_id integer NOT NULL,
    onboarding_completed boolean DEFAULT false NOT NULL,
    call_completed boolean DEFAULT false NOT NULL,
    report_completed boolean DEFAULT false NOT NULL,
    upgrade_completed boolean DEFAULT false NOT NULL,
    last_progress_check_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    onboarding_test_call_used boolean DEFAULT false
);


ALTER TABLE public.user_lifecycle OWNER TO talktivity;

--
-- Name: user_lifecycle_backup_20260124; Type: TABLE; Schema: public; Owner: talktivity
--

CREATE TABLE public.user_lifecycle_backup_20260124 (
    user_id integer,
    onboarding_completed boolean,
    onboarding_steps jsonb,
    call_completed boolean,
    report_completed boolean,
    upgrade_completed boolean,
    last_progress_check_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.user_lifecycle_backup_20260124 OWNER TO talktivity;

--
-- Name: user_lifecycle_backup_20260127; Type: TABLE; Schema: public; Owner: talktivity
--

CREATE TABLE public.user_lifecycle_backup_20260127 (
    user_id integer,
    onboarding_completed boolean,
    call_completed boolean,
    report_completed boolean,
    upgrade_completed boolean,
    last_progress_check_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    onboarding_test_call_used boolean
);


ALTER TABLE public.user_lifecycle_backup_20260127 OWNER TO talktivity;

--
-- Name: user_oauth_providers; Type: TABLE; Schema: public; Owner: talktivity
--

CREATE TABLE public.user_oauth_providers (
    id integer NOT NULL,
    user_id integer NOT NULL,
    provider character varying(50) NOT NULL,
    provider_user_id character varying(255) NOT NULL,
    access_token text,
    refresh_token text,
    expires_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.user_oauth_providers OWNER TO talktivity;

--
-- Name: user_oauth_providers_id_seq; Type: SEQUENCE; Schema: public; Owner: talktivity
--

CREATE SEQUENCE public.user_oauth_providers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.user_oauth_providers_id_seq OWNER TO talktivity;

--
-- Name: user_oauth_providers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: talktivity
--

ALTER SEQUENCE public.user_oauth_providers_id_seq OWNED BY public.user_oauth_providers.id;


--
-- Name: user_sessions; Type: TABLE; Schema: public; Owner: talktivity
--

CREATE TABLE public.user_sessions (
    id integer NOT NULL,
    user_id integer NOT NULL,
    session_token character varying(255) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.user_sessions OWNER TO talktivity;

--
-- Name: user_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: talktivity
--

CREATE SEQUENCE public.user_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.user_sessions_id_seq OWNER TO talktivity;

--
-- Name: user_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: talktivity
--

ALTER SEQUENCE public.user_sessions_id_seq OWNED BY public.user_sessions.id;


--
-- Name: user_word_progress; Type: TABLE; Schema: public; Owner: talktivity
--

CREATE TABLE public.user_word_progress (
    id integer NOT NULL,
    user_id integer NOT NULL,
    word_id integer NOT NULL,
    is_learned boolean DEFAULT false,
    learned_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.user_word_progress OWNER TO talktivity;

--
-- Name: user_word_progress_id_seq; Type: SEQUENCE; Schema: public; Owner: talktivity
--

CREATE SEQUENCE public.user_word_progress_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.user_word_progress_id_seq OWNER TO talktivity;

--
-- Name: user_word_progress_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: talktivity
--

ALTER SEQUENCE public.user_word_progress_id_seq OWNED BY public.user_word_progress.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: talktivity
--

CREATE TABLE public.users (
    id integer NOT NULL,
    email character varying(255) NOT NULL,
    password character varying(255),
    full_name character varying(255),
    google_id character varying(255),
    profile_picture text,
    auth_provider character varying(50) DEFAULT 'local'::character varying NOT NULL,
    is_email_verified boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    is_admin boolean DEFAULT false NOT NULL,
    reset_token character varying(255),
    reset_token_expiry timestamp without time zone,
    report_completed boolean DEFAULT false,
    call_completed boolean DEFAULT false,
    onboarding_completed boolean DEFAULT false,
    CONSTRAINT chk_users_auth_provider CHECK (((auth_provider)::text = ANY ((ARRAY['local'::character varying, 'google'::character varying, 'facebook'::character varying])::text[])))
);


ALTER TABLE public.users OWNER TO talktivity;

--
-- Name: users_backup_20260124; Type: TABLE; Schema: public; Owner: talktivity
--

CREATE TABLE public.users_backup_20260124 (
    id integer,
    email character varying(255),
    call_completed boolean,
    onboarding_completed boolean,
    report_completed boolean,
    onboarding_test_call_used boolean,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.users_backup_20260124 OWNER TO talktivity;

--
-- Name: users_backup_20260127; Type: TABLE; Schema: public; Owner: talktivity
--

CREATE TABLE public.users_backup_20260127 (
    id integer,
    email character varying(255),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    call_completed boolean,
    onboarding_completed boolean,
    report_completed boolean,
    onboarding_test_call_used boolean
);


ALTER TABLE public.users_backup_20260127 OWNER TO talktivity;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: talktivity
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO talktivity;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: talktivity
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: vocabulary_completions; Type: TABLE; Schema: public; Owner: talktivity
--

CREATE TABLE public.vocabulary_completions (
    id integer NOT NULL,
    user_id integer NOT NULL,
    week_number integer NOT NULL,
    day_number integer NOT NULL,
    completed_date date DEFAULT CURRENT_DATE NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    course_id integer
);


ALTER TABLE public.vocabulary_completions OWNER TO talktivity;

--
-- Name: vocabulary_completions_id_seq; Type: SEQUENCE; Schema: public; Owner: talktivity
--

CREATE SEQUENCE public.vocabulary_completions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.vocabulary_completions_id_seq OWNER TO talktivity;

--
-- Name: vocabulary_completions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: talktivity
--

ALTER SEQUENCE public.vocabulary_completions_id_seq OWNED BY public.vocabulary_completions.id;


--
-- Name: vocabulary_hierarchy; Type: TABLE; Schema: public; Owner: talktivity
--

CREATE TABLE public.vocabulary_hierarchy (
    id integer NOT NULL,
    week_number integer NOT NULL,
    day_number integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.vocabulary_hierarchy OWNER TO talktivity;

--
-- Name: vocabulary_hierarchy_id_seq; Type: SEQUENCE; Schema: public; Owner: talktivity
--

CREATE SEQUENCE public.vocabulary_hierarchy_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.vocabulary_hierarchy_id_seq OWNER TO talktivity;

--
-- Name: vocabulary_hierarchy_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: talktivity
--

ALTER SEQUENCE public.vocabulary_hierarchy_id_seq OWNED BY public.vocabulary_hierarchy.id;


--
-- Name: vocabulary_words; Type: TABLE; Schema: public; Owner: talktivity
--

CREATE TABLE public.vocabulary_words (
    id integer NOT NULL,
    day_id integer NOT NULL,
    week_number integer NOT NULL,
    day_number integer NOT NULL,
    word character varying(255) NOT NULL,
    meaning_bn text NOT NULL,
    example_en text NOT NULL,
    example_bn text NOT NULL,
    word_order integer DEFAULT 1,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.vocabulary_words OWNER TO talktivity;

--
-- Name: vocabulary_words_id_seq; Type: SEQUENCE; Schema: public; Owner: talktivity
--

CREATE SEQUENCE public.vocabulary_words_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.vocabulary_words_id_seq OWNER TO talktivity;

--
-- Name: vocabulary_words_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: talktivity
--

ALTER SEQUENCE public.vocabulary_words_id_seq OWNED BY public.vocabulary_words.id;


--
-- Name: weekly_exams; Type: TABLE; Schema: public; Owner: talktivity
--

CREATE TABLE public.weekly_exams (
    id integer NOT NULL,
    user_id integer NOT NULL,
    course_id integer NOT NULL,
    week_number integer NOT NULL,
    exam_date date NOT NULL,
    exam_completed boolean DEFAULT false,
    exam_score integer,
    exam_duration_seconds integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.weekly_exams OWNER TO talktivity;

--
-- Name: weekly_exams_id_seq; Type: SEQUENCE; Schema: public; Owner: talktivity
--

CREATE SEQUENCE public.weekly_exams_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.weekly_exams_id_seq OWNER TO talktivity;

--
-- Name: weekly_exams_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: talktivity
--

ALTER SEQUENCE public.weekly_exams_id_seq OWNED BY public.weekly_exams.id;


--
-- Name: call_sessions id; Type: DEFAULT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.call_sessions ALTER COLUMN id SET DEFAULT nextval('public.call_sessions_id_seq'::regclass);


--
-- Name: conversations id; Type: DEFAULT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.conversations ALTER COLUMN id SET DEFAULT nextval('public.conversations_id_seq'::regclass);


--
-- Name: daily_progress id; Type: DEFAULT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.daily_progress ALTER COLUMN id SET DEFAULT nextval('public.daily_progress_id_seq'::regclass);


--
-- Name: daily_reports id; Type: DEFAULT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.daily_reports ALTER COLUMN id SET DEFAULT nextval('public.daily_reports_id_seq'::regclass);


--
-- Name: dm_messages id; Type: DEFAULT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.dm_messages ALTER COLUMN id SET DEFAULT nextval('public.dm_messages_id_seq'::regclass);


--
-- Name: dms id; Type: DEFAULT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.dms ALTER COLUMN id SET DEFAULT nextval('public.dms_id_seq'::regclass);


--
-- Name: group_members id; Type: DEFAULT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.group_members ALTER COLUMN id SET DEFAULT nextval('public.group_members_id_seq'::regclass);


--
-- Name: group_messages id; Type: DEFAULT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.group_messages ALTER COLUMN id SET DEFAULT nextval('public.group_messages_id_seq'::regclass);


--
-- Name: groups id; Type: DEFAULT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.groups ALTER COLUMN id SET DEFAULT nextval('public.groups_id_seq'::regclass);


--
-- Name: last_read_at id; Type: DEFAULT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.last_read_at ALTER COLUMN id SET DEFAULT nextval('public.last_read_at_id_seq'::regclass);


--
-- Name: lifetime_call_usage id; Type: DEFAULT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.lifetime_call_usage ALTER COLUMN id SET DEFAULT nextval('public.lifetime_call_usage_id_seq'::regclass);


--
-- Name: muted_groups id; Type: DEFAULT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.muted_groups ALTER COLUMN id SET DEFAULT nextval('public.muted_groups_id_seq'::regclass);


--
-- Name: onboarding_data id; Type: DEFAULT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.onboarding_data ALTER COLUMN id SET DEFAULT nextval('public.onboarding_data_id_seq'::regclass);


--
-- Name: payment_audit_log id; Type: DEFAULT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.payment_audit_log ALTER COLUMN id SET DEFAULT nextval('public.payment_audit_log_id_seq'::regclass);


--
-- Name: payment_transactions id; Type: DEFAULT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.payment_transactions ALTER COLUMN id SET DEFAULT nextval('public.payment_transactions_id_seq'::regclass);


--
-- Name: refactoring_verification_report id; Type: DEFAULT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.refactoring_verification_report ALTER COLUMN id SET DEFAULT nextval('public.refactoring_verification_report_id_seq'::regclass);


--
-- Name: speaking_sessions id; Type: DEFAULT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.speaking_sessions ALTER COLUMN id SET DEFAULT nextval('public.speaking_sessions_id_seq'::regclass);


--
-- Name: subscription_plans id; Type: DEFAULT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.subscription_plans ALTER COLUMN id SET DEFAULT nextval('public.subscription_plans_id_seq'::regclass);


--
-- Name: subscriptions id; Type: DEFAULT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.subscriptions ALTER COLUMN id SET DEFAULT nextval('public.subscriptions_id_seq'::regclass);


--
-- Name: topic_categories id; Type: DEFAULT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.topic_categories ALTER COLUMN id SET DEFAULT nextval('public.topic_categories_id_seq'::regclass);


--
-- Name: user_courses id; Type: DEFAULT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.user_courses ALTER COLUMN id SET DEFAULT nextval('public.user_courses_id_seq'::regclass);


--
-- Name: user_oauth_providers id; Type: DEFAULT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.user_oauth_providers ALTER COLUMN id SET DEFAULT nextval('public.user_oauth_providers_id_seq'::regclass);


--
-- Name: user_sessions id; Type: DEFAULT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.user_sessions ALTER COLUMN id SET DEFAULT nextval('public.user_sessions_id_seq'::regclass);


--
-- Name: user_word_progress id; Type: DEFAULT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.user_word_progress ALTER COLUMN id SET DEFAULT nextval('public.user_word_progress_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: vocabulary_completions id; Type: DEFAULT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.vocabulary_completions ALTER COLUMN id SET DEFAULT nextval('public.vocabulary_completions_id_seq'::regclass);


--
-- Name: vocabulary_hierarchy id; Type: DEFAULT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.vocabulary_hierarchy ALTER COLUMN id SET DEFAULT nextval('public.vocabulary_hierarchy_id_seq'::regclass);


--
-- Name: vocabulary_words id; Type: DEFAULT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.vocabulary_words ALTER COLUMN id SET DEFAULT nextval('public.vocabulary_words_id_seq'::regclass);


--
-- Name: weekly_exams id; Type: DEFAULT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.weekly_exams ALTER COLUMN id SET DEFAULT nextval('public.weekly_exams_id_seq'::regclass);


--
-- Name: call_sessions call_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.call_sessions
    ADD CONSTRAINT call_sessions_pkey PRIMARY KEY (id);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: daily_progress daily_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.daily_progress
    ADD CONSTRAINT daily_progress_pkey PRIMARY KEY (id);


--
-- Name: daily_progress daily_progress_user_id_date_key; Type: CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.daily_progress
    ADD CONSTRAINT daily_progress_user_id_date_key UNIQUE (user_id, progress_date);


--
-- Name: daily_reports daily_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.daily_reports
    ADD CONSTRAINT daily_reports_pkey PRIMARY KEY (id);


--
-- Name: daily_reports daily_reports_user_id_report_date_key; Type: CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.daily_reports
    ADD CONSTRAINT daily_reports_user_id_report_date_key UNIQUE (user_id, report_date);


--
-- Name: dm_messages dm_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.dm_messages
    ADD CONSTRAINT dm_messages_pkey PRIMARY KEY (id);


--
-- Name: dms dms_pkey; Type: CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.dms
    ADD CONSTRAINT dms_pkey PRIMARY KEY (id);


--
-- Name: dms dms_user1_id_user2_id_key; Type: CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.dms
    ADD CONSTRAINT dms_user1_id_user2_id_key UNIQUE (user1_id, user2_id);


--
-- Name: group_members group_members_group_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_group_id_user_id_key UNIQUE (group_id, user_id);


--
-- Name: group_members group_members_pkey; Type: CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_pkey PRIMARY KEY (id);


--
-- Name: group_messages group_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.group_messages
    ADD CONSTRAINT group_messages_pkey PRIMARY KEY (id);


--
-- Name: groups groups_pkey; Type: CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_pkey PRIMARY KEY (id);


--
-- Name: last_read_at last_read_at_pkey; Type: CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.last_read_at
    ADD CONSTRAINT last_read_at_pkey PRIMARY KEY (id);


--
-- Name: last_read_at last_read_at_user_id_group_id_dm_id_key; Type: CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.last_read_at
    ADD CONSTRAINT last_read_at_user_id_group_id_dm_id_key UNIQUE (user_id, group_id, dm_id);


--
-- Name: lifetime_call_usage lifetime_call_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.lifetime_call_usage
    ADD CONSTRAINT lifetime_call_usage_pkey PRIMARY KEY (id);


--
-- Name: muted_groups muted_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.muted_groups
    ADD CONSTRAINT muted_groups_pkey PRIMARY KEY (id);


--
-- Name: muted_groups muted_groups_user_id_group_id_key; Type: CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.muted_groups
    ADD CONSTRAINT muted_groups_user_id_group_id_key UNIQUE (user_id, group_id);


--
-- Name: onboarding_data onboarding_data_pkey; Type: CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.onboarding_data
    ADD CONSTRAINT onboarding_data_pkey PRIMARY KEY (id);


--
-- Name: payment_audit_log payment_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.payment_audit_log
    ADD CONSTRAINT payment_audit_log_pkey PRIMARY KEY (id);


--
-- Name: payment_transactions payment_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_pkey PRIMARY KEY (id);


--
-- Name: payment_transactions payment_transactions_transaction_id_key; Type: CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_transaction_id_key UNIQUE (transaction_id);


--
-- Name: refactoring_verification_report refactoring_verification_report_pkey; Type: CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.refactoring_verification_report
    ADD CONSTRAINT refactoring_verification_report_pkey PRIMARY KEY (id);


--
-- Name: speaking_sessions speaking_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.speaking_sessions
    ADD CONSTRAINT speaking_sessions_pkey PRIMARY KEY (id);


--
-- Name: subscription_plans subscription_plans_name_key; Type: CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.subscription_plans
    ADD CONSTRAINT subscription_plans_name_key UNIQUE (name);


--
-- Name: subscription_plans subscription_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.subscription_plans
    ADD CONSTRAINT subscription_plans_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_payment_id_key; Type: CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_payment_id_key UNIQUE (payment_id);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: topic_categories topic_categories_category_name_key; Type: CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.topic_categories
    ADD CONSTRAINT topic_categories_category_name_key UNIQUE (category_name);


--
-- Name: topic_categories topic_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.topic_categories
    ADD CONSTRAINT topic_categories_pkey PRIMARY KEY (id);


--
-- Name: groups unique_group_name; Type: CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT unique_group_name UNIQUE (name);


--
-- Name: daily_progress uq_daily_progress_user_course_date; Type: CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.daily_progress
    ADD CONSTRAINT uq_daily_progress_user_course_date UNIQUE (user_id, course_id, progress_date);


--
-- Name: onboarding_data uq_onboarding_data_user_id; Type: CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.onboarding_data
    ADD CONSTRAINT uq_onboarding_data_user_id UNIQUE (user_id);


--
-- Name: user_word_progress uq_user_word_progress_user_word; Type: CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.user_word_progress
    ADD CONSTRAINT uq_user_word_progress_user_word UNIQUE (user_id, word_id);


--
-- Name: vocabulary_completions uq_vocabulary_completions_user_course_week_day_date; Type: CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.vocabulary_completions
    ADD CONSTRAINT uq_vocabulary_completions_user_course_week_day_date UNIQUE (user_id, course_id, week_number, day_number, completed_date);


--
-- Name: vocabulary_completions uq_vocabulary_completions_user_week_day; Type: CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.vocabulary_completions
    ADD CONSTRAINT uq_vocabulary_completions_user_week_day UNIQUE (user_id, week_number, day_number);


--
-- Name: user_courses user_courses_pkey; Type: CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.user_courses
    ADD CONSTRAINT user_courses_pkey PRIMARY KEY (id);


--
-- Name: user_lifecycle user_lifecycle_pkey; Type: CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.user_lifecycle
    ADD CONSTRAINT user_lifecycle_pkey PRIMARY KEY (user_id);


--
-- Name: user_oauth_providers user_oauth_providers_pkey; Type: CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.user_oauth_providers
    ADD CONSTRAINT user_oauth_providers_pkey PRIMARY KEY (id);


--
-- Name: user_oauth_providers user_oauth_providers_provider_provider_user_id_key; Type: CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.user_oauth_providers
    ADD CONSTRAINT user_oauth_providers_provider_provider_user_id_key UNIQUE (provider, provider_user_id);


--
-- Name: user_sessions user_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (id);


--
-- Name: user_sessions user_sessions_session_token_key; Type: CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_session_token_key UNIQUE (session_token);


--
-- Name: user_word_progress user_word_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.user_word_progress
    ADD CONSTRAINT user_word_progress_pkey PRIMARY KEY (id);


--
-- Name: user_word_progress user_word_progress_user_id_word_id_key; Type: CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.user_word_progress
    ADD CONSTRAINT user_word_progress_user_id_word_id_key UNIQUE (user_id, word_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_google_id_key; Type: CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_google_id_key UNIQUE (google_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: vocabulary_completions vocabulary_completions_pkey; Type: CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.vocabulary_completions
    ADD CONSTRAINT vocabulary_completions_pkey PRIMARY KEY (id);


--
-- Name: vocabulary_completions vocabulary_completions_user_id_week_number_day_number_compl_key; Type: CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.vocabulary_completions
    ADD CONSTRAINT vocabulary_completions_user_id_week_number_day_number_compl_key UNIQUE (user_id, week_number, day_number, completed_date);


--
-- Name: vocabulary_hierarchy vocabulary_hierarchy_pkey; Type: CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.vocabulary_hierarchy
    ADD CONSTRAINT vocabulary_hierarchy_pkey PRIMARY KEY (id);


--
-- Name: vocabulary_hierarchy vocabulary_hierarchy_week_number_day_number_key; Type: CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.vocabulary_hierarchy
    ADD CONSTRAINT vocabulary_hierarchy_week_number_day_number_key UNIQUE (week_number, day_number);


--
-- Name: vocabulary_words vocabulary_words_pkey; Type: CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.vocabulary_words
    ADD CONSTRAINT vocabulary_words_pkey PRIMARY KEY (id);


--
-- Name: vocabulary_words vocabulary_words_week_number_day_number_word_key; Type: CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.vocabulary_words
    ADD CONSTRAINT vocabulary_words_week_number_day_number_word_key UNIQUE (week_number, day_number, word);


--
-- Name: weekly_exams weekly_exams_pkey; Type: CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.weekly_exams
    ADD CONSTRAINT weekly_exams_pkey PRIMARY KEY (id);


--
-- Name: weekly_exams weekly_exams_user_id_week_number_key; Type: CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.weekly_exams
    ADD CONSTRAINT weekly_exams_user_id_week_number_key UNIQUE (user_id, week_number);


--
-- Name: idx_call_sessions_call_started_at; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_call_sessions_call_started_at ON public.call_sessions USING btree (call_started_at);


--
-- Name: idx_call_sessions_session_type; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_call_sessions_session_type ON public.call_sessions USING btree (session_type);


--
-- Name: idx_call_sessions_user_completed; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_call_sessions_user_completed ON public.call_sessions USING btree (user_id, call_completed);


--
-- Name: idx_call_sessions_user_date; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_call_sessions_user_date ON public.call_sessions USING btree (user_id, call_started_at);


--
-- Name: idx_call_sessions_user_id; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_call_sessions_user_id ON public.call_sessions USING btree (user_id);


--
-- Name: idx_call_sessions_user_started; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_call_sessions_user_started ON public.call_sessions USING btree (user_id, call_started_at);


--
-- Name: idx_conversations_room; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_conversations_room ON public.conversations USING btree (room_name);


--
-- Name: idx_conversations_room_name; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_conversations_room_name ON public.conversations USING btree (room_name);


--
-- Name: idx_conversations_session_duration; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_conversations_session_duration ON public.conversations USING btree (session_duration) WHERE (session_duration IS NOT NULL);


--
-- Name: idx_conversations_timestamp; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_conversations_timestamp ON public.conversations USING btree ("timestamp");


--
-- Name: idx_conversations_user_id; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_conversations_user_id ON public.conversations USING btree (user_id);


--
-- Name: idx_conversations_user_timestamp; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_conversations_user_timestamp ON public.conversations USING btree (user_id, "timestamp");


--
-- Name: idx_daily_progress_course; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_daily_progress_course ON public.daily_progress USING btree (course_id);


--
-- Name: idx_daily_progress_course_id; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_daily_progress_course_id ON public.daily_progress USING btree (course_id);


--
-- Name: idx_daily_progress_progress_date; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_daily_progress_progress_date ON public.daily_progress USING btree (progress_date);


--
-- Name: idx_daily_progress_user_course_date; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_daily_progress_user_course_date ON public.daily_progress USING btree (user_id, course_id, progress_date);


--
-- Name: idx_daily_progress_user_date; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_daily_progress_user_date ON public.daily_progress USING btree (user_id, progress_date);


--
-- Name: idx_daily_progress_user_id; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_daily_progress_user_id ON public.daily_progress USING btree (user_id);


--
-- Name: idx_daily_progress_week_day; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_daily_progress_week_day ON public.daily_progress USING btree (week_number, day_number);


--
-- Name: idx_daily_reports_date; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_daily_reports_date ON public.daily_reports USING btree (report_date);


--
-- Name: idx_daily_reports_report_date; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_daily_reports_report_date ON public.daily_reports USING btree (report_date);


--
-- Name: idx_daily_reports_user_date; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_daily_reports_user_date ON public.daily_reports USING btree (user_id, report_date);


--
-- Name: idx_daily_reports_user_id; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_daily_reports_user_id ON public.daily_reports USING btree (user_id);


--
-- Name: idx_dm_messages_created_at; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_dm_messages_created_at ON public.dm_messages USING btree (created_at);


--
-- Name: idx_dm_messages_dm_id; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_dm_messages_dm_id ON public.dm_messages USING btree (dm_id);


--
-- Name: idx_dm_messages_sender_id; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_dm_messages_sender_id ON public.dm_messages USING btree (sender_id);


--
-- Name: idx_dms_user1_id; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_dms_user1_id ON public.dms USING btree (user1_id);


--
-- Name: idx_dms_user2_id; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_dms_user2_id ON public.dms USING btree (user2_id);


--
-- Name: idx_group_members_group_id; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_group_members_group_id ON public.group_members USING btree (group_id);


--
-- Name: idx_group_members_group_user; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_group_members_group_user ON public.group_members USING btree (group_id, user_id);


--
-- Name: idx_group_members_user_id; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_group_members_user_id ON public.group_members USING btree (user_id);


--
-- Name: idx_group_messages_created_at; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_group_messages_created_at ON public.group_messages USING btree (created_at);


--
-- Name: idx_group_messages_group_id; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_group_messages_group_id ON public.group_messages USING btree (group_id);


--
-- Name: idx_group_messages_user_id; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_group_messages_user_id ON public.group_messages USING btree (user_id);


--
-- Name: idx_groups_category; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_groups_category ON public.groups USING btree (category);


--
-- Name: idx_groups_common; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_groups_common ON public.groups USING btree (is_common);


--
-- Name: idx_groups_created_by; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_groups_created_by ON public.groups USING btree (created_by);


--
-- Name: idx_groups_featured; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_groups_featured ON public.groups USING btree (is_featured);


--
-- Name: idx_groups_is_featured; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_groups_is_featured ON public.groups USING btree (is_featured);


--
-- Name: idx_groups_is_public; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_groups_is_public ON public.groups USING btree (is_public);


--
-- Name: idx_groups_name; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_groups_name ON public.groups USING btree (name);


--
-- Name: idx_groups_public; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_groups_public ON public.groups USING btree (is_public);


--
-- Name: idx_groups_trending; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_groups_trending ON public.groups USING btree (is_trending);


--
-- Name: idx_last_read_dm_id; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_last_read_dm_id ON public.last_read_at USING btree (dm_id);


--
-- Name: idx_last_read_group_id; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_last_read_group_id ON public.last_read_at USING btree (group_id);


--
-- Name: idx_last_read_user_id; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_last_read_user_id ON public.last_read_at USING btree (user_id);


--
-- Name: idx_lifetime_call_usage_user; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_lifetime_call_usage_user ON public.lifetime_call_usage USING btree (user_id);


--
-- Name: idx_muted_groups_group_id; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_muted_groups_group_id ON public.muted_groups USING btree (group_id);


--
-- Name: idx_muted_groups_user_id; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_muted_groups_user_id ON public.muted_groups USING btree (user_id);


--
-- Name: idx_oauth_provider; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_oauth_provider ON public.user_oauth_providers USING btree (provider);


--
-- Name: idx_oauth_provider_user_id; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_oauth_provider_user_id ON public.user_oauth_providers USING btree (provider_user_id);


--
-- Name: idx_oauth_user_id; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_oauth_user_id ON public.user_oauth_providers USING btree (user_id);


--
-- Name: idx_onboarding_data_user_id; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_onboarding_data_user_id ON public.onboarding_data USING btree (user_id);


--
-- Name: idx_onboarding_user_id; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_onboarding_user_id ON public.onboarding_data USING btree (user_id);


--
-- Name: idx_payment_audit_log_created_at; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_payment_audit_log_created_at ON public.payment_audit_log USING btree (created_at);


--
-- Name: idx_payment_audit_log_event_type; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_payment_audit_log_event_type ON public.payment_audit_log USING btree (event_type);


--
-- Name: idx_payment_audit_log_user_id; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_payment_audit_log_user_id ON public.payment_audit_log USING btree (user_id);


--
-- Name: idx_payment_transactions_created_at; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_payment_transactions_created_at ON public.payment_transactions USING btree (created_at);


--
-- Name: idx_payment_transactions_order_id; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_payment_transactions_order_id ON public.payment_transactions USING btree (order_id);


--
-- Name: idx_payment_transactions_status; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_payment_transactions_status ON public.payment_transactions USING btree (status);


--
-- Name: idx_payment_transactions_subscription_id; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_payment_transactions_subscription_id ON public.payment_transactions USING btree (subscription_id);


--
-- Name: idx_payment_transactions_transaction_id; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_payment_transactions_transaction_id ON public.payment_transactions USING btree (transaction_id);


--
-- Name: idx_payment_transactions_user_id; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_payment_transactions_user_id ON public.payment_transactions USING btree (user_id);


--
-- Name: idx_sessions_expires; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_sessions_expires ON public.user_sessions USING btree (expires_at);


--
-- Name: idx_sessions_token; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_sessions_token ON public.user_sessions USING btree (session_token);


--
-- Name: idx_sessions_user_id; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_sessions_user_id ON public.user_sessions USING btree (user_id);


--
-- Name: idx_speaking_sessions_course_id; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_speaking_sessions_course_id ON public.speaking_sessions USING btree (course_id);


--
-- Name: idx_speaking_sessions_date; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_speaking_sessions_date ON public.speaking_sessions USING btree (date);


--
-- Name: idx_speaking_sessions_user_date; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_speaking_sessions_user_date ON public.speaking_sessions USING btree (user_id, date);


--
-- Name: idx_speaking_sessions_user_id; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_speaking_sessions_user_id ON public.speaking_sessions USING btree (user_id);


--
-- Name: idx_subscription_plans_active; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_subscription_plans_active ON public.subscription_plans USING btree (is_active);


--
-- Name: idx_subscription_plans_is_active; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_subscription_plans_is_active ON public.subscription_plans USING btree (is_active);


--
-- Name: idx_subscription_plans_name; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_subscription_plans_name ON public.subscription_plans USING btree (name);


--
-- Name: idx_subscription_plans_plan_type; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_subscription_plans_plan_type ON public.subscription_plans USING btree (plan_type);


--
-- Name: idx_subscriptions_end_date; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_subscriptions_end_date ON public.subscriptions USING btree (end_date);


--
-- Name: idx_subscriptions_free_trial; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_subscriptions_free_trial ON public.subscriptions USING btree (is_free_trial, free_trial_started_at);


--
-- Name: idx_subscriptions_payment_id; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_subscriptions_payment_id ON public.subscriptions USING btree (payment_id);


--
-- Name: idx_subscriptions_plan_id; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_subscriptions_plan_id ON public.subscriptions USING btree (plan_id);


--
-- Name: idx_subscriptions_start_date; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_subscriptions_start_date ON public.subscriptions USING btree (start_date);


--
-- Name: idx_subscriptions_status; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_subscriptions_status ON public.subscriptions USING btree (status);


--
-- Name: idx_subscriptions_user_active; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_subscriptions_user_active ON public.subscriptions USING btree (user_id, status) WHERE ((status)::text = 'active'::text);


--
-- Name: idx_subscriptions_user_id; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_subscriptions_user_id ON public.subscriptions USING btree (user_id);


--
-- Name: idx_subscriptions_user_status; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_subscriptions_user_status ON public.subscriptions USING btree (user_id, status);


--
-- Name: idx_topic_categories_name; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_topic_categories_name ON public.topic_categories USING btree (category_name);


--
-- Name: idx_user_courses_active; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_user_courses_active ON public.user_courses USING btree (is_active);


--
-- Name: idx_user_courses_end_date; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_user_courses_end_date ON public.user_courses USING btree (course_end_date);


--
-- Name: idx_user_courses_is_active; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_user_courses_is_active ON public.user_courses USING btree (is_active);


--
-- Name: idx_user_courses_start_date; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_user_courses_start_date ON public.user_courses USING btree (course_start_date);


--
-- Name: idx_user_courses_user_active; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_user_courses_user_active ON public.user_courses USING btree (user_id, is_active) WHERE (is_active = true);


--
-- Name: idx_user_courses_user_id; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_user_courses_user_id ON public.user_courses USING btree (user_id);


--
-- Name: idx_user_lifecycle_updated_at; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_user_lifecycle_updated_at ON public.user_lifecycle USING btree (updated_at);


--
-- Name: idx_user_lifecycle_user_id; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_user_lifecycle_user_id ON public.user_lifecycle USING btree (user_id);


--
-- Name: idx_user_oauth_providers_user_id; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_user_oauth_providers_user_id ON public.user_oauth_providers USING btree (user_id);


--
-- Name: idx_user_sessions_expires; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_user_sessions_expires ON public.user_sessions USING btree (expires_at);


--
-- Name: idx_user_sessions_token; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_user_sessions_token ON public.user_sessions USING btree (session_token);


--
-- Name: idx_user_sessions_user_id; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_user_sessions_user_id ON public.user_sessions USING btree (user_id);


--
-- Name: idx_user_word_progress_learned; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_user_word_progress_learned ON public.user_word_progress USING btree (user_id, is_learned);


--
-- Name: idx_user_word_progress_user; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_user_word_progress_user ON public.user_word_progress USING btree (user_id);


--
-- Name: idx_user_word_progress_user_id; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_user_word_progress_user_id ON public.user_word_progress USING btree (user_id);


--
-- Name: idx_user_word_progress_word; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_user_word_progress_word ON public.user_word_progress USING btree (word_id);


--
-- Name: idx_user_word_progress_word_id; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_user_word_progress_word_id ON public.user_word_progress USING btree (word_id);


--
-- Name: idx_users_auth_provider; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_users_auth_provider ON public.users USING btree (auth_provider);


--
-- Name: idx_users_call_completed; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_users_call_completed ON public.users USING btree (call_completed);


--
-- Name: idx_users_created_at; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_users_created_at ON public.users USING btree (created_at);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: idx_users_google_id; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_users_google_id ON public.users USING btree (google_id);


--
-- Name: idx_users_is_admin; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_users_is_admin ON public.users USING btree (is_admin);


--
-- Name: idx_users_onboarding_completed; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_users_onboarding_completed ON public.users USING btree (onboarding_completed);


--
-- Name: idx_users_report_completed; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_users_report_completed ON public.users USING btree (report_completed);


--
-- Name: idx_users_reset_token; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_users_reset_token ON public.users USING btree (reset_token);


--
-- Name: idx_vocabulary_completions_course_id; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_vocabulary_completions_course_id ON public.vocabulary_completions USING btree (course_id);


--
-- Name: idx_vocabulary_completions_date; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_vocabulary_completions_date ON public.vocabulary_completions USING btree (completed_date);


--
-- Name: idx_vocabulary_completions_user_id; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_vocabulary_completions_user_id ON public.vocabulary_completions USING btree (user_id);


--
-- Name: idx_vocabulary_completions_user_week; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_vocabulary_completions_user_week ON public.vocabulary_completions USING btree (user_id, week_number);


--
-- Name: idx_vocabulary_completions_week_day; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_vocabulary_completions_week_day ON public.vocabulary_completions USING btree (week_number, day_number);


--
-- Name: idx_vocabulary_hierarchy_week_day; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_vocabulary_hierarchy_week_day ON public.vocabulary_hierarchy USING btree (week_number, day_number);


--
-- Name: idx_vocabulary_words_day_id; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_vocabulary_words_day_id ON public.vocabulary_words USING btree (day_id);


--
-- Name: idx_vocabulary_words_order; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_vocabulary_words_order ON public.vocabulary_words USING btree (word_order);


--
-- Name: idx_vocabulary_words_week_day; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_vocabulary_words_week_day ON public.vocabulary_words USING btree (week_number, day_number);


--
-- Name: idx_vocabulary_words_word; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_vocabulary_words_word ON public.vocabulary_words USING btree (word);


--
-- Name: idx_weekly_exams_course; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_weekly_exams_course ON public.weekly_exams USING btree (course_id);


--
-- Name: idx_weekly_exams_user_week; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE INDEX idx_weekly_exams_user_week ON public.weekly_exams USING btree (user_id, week_number);


--
-- Name: unique_group_name_lower; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE UNIQUE INDEX unique_group_name_lower ON public.groups USING btree (lower((name)::text));


--
-- Name: uq_dms_user_pair; Type: INDEX; Schema: public; Owner: talktivity
--

CREATE UNIQUE INDEX uq_dms_user_pair ON public.dms USING btree (LEAST(user1_id, user2_id), GREATEST(user1_id, user2_id));


--
-- Name: call_sessions trg_call_sessions_updated_at; Type: TRIGGER; Schema: public; Owner: talktivity
--

CREATE TRIGGER trg_call_sessions_updated_at BEFORE UPDATE ON public.call_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: conversations trg_conversations_updated_at; Type: TRIGGER; Schema: public; Owner: talktivity
--

CREATE TRIGGER trg_conversations_updated_at BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: daily_progress_backup_20260124 trg_daily_progress_backup_20260124_updated_at; Type: TRIGGER; Schema: public; Owner: talktivity
--

CREATE TRIGGER trg_daily_progress_backup_20260124_updated_at BEFORE UPDATE ON public.daily_progress_backup_20260124 FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: daily_progress_backup_20260127 trg_daily_progress_backup_20260127_updated_at; Type: TRIGGER; Schema: public; Owner: talktivity
--

CREATE TRIGGER trg_daily_progress_backup_20260127_updated_at BEFORE UPDATE ON public.daily_progress_backup_20260127 FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: daily_progress trg_daily_progress_updated_at; Type: TRIGGER; Schema: public; Owner: talktivity
--

CREATE TRIGGER trg_daily_progress_updated_at BEFORE UPDATE ON public.daily_progress FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: daily_reports trg_daily_reports_updated_at; Type: TRIGGER; Schema: public; Owner: talktivity
--

CREATE TRIGGER trg_daily_reports_updated_at BEFORE UPDATE ON public.daily_reports FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: onboarding_data trg_onboarding_data_updated_at; Type: TRIGGER; Schema: public; Owner: talktivity
--

CREATE TRIGGER trg_onboarding_data_updated_at BEFORE UPDATE ON public.onboarding_data FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: payment_transactions trg_payment_transactions_updated_at; Type: TRIGGER; Schema: public; Owner: talktivity
--

CREATE TRIGGER trg_payment_transactions_updated_at BEFORE UPDATE ON public.payment_transactions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: speaking_sessions trg_speaking_sessions_updated_at; Type: TRIGGER; Schema: public; Owner: talktivity
--

CREATE TRIGGER trg_speaking_sessions_updated_at BEFORE UPDATE ON public.speaking_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: subscription_plans trg_subscription_plans_updated_at; Type: TRIGGER; Schema: public; Owner: talktivity
--

CREATE TRIGGER trg_subscription_plans_updated_at BEFORE UPDATE ON public.subscription_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: subscriptions trg_subscriptions_updated_at; Type: TRIGGER; Schema: public; Owner: talktivity
--

CREATE TRIGGER trg_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: topic_categories trg_topic_categories_updated_at; Type: TRIGGER; Schema: public; Owner: talktivity
--

CREATE TRIGGER trg_topic_categories_updated_at BEFORE UPDATE ON public.topic_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: user_courses trg_user_courses_updated_at; Type: TRIGGER; Schema: public; Owner: talktivity
--

CREATE TRIGGER trg_user_courses_updated_at BEFORE UPDATE ON public.user_courses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: user_lifecycle_backup_20260124 trg_user_lifecycle_backup_20260124_updated_at; Type: TRIGGER; Schema: public; Owner: talktivity
--

CREATE TRIGGER trg_user_lifecycle_backup_20260124_updated_at BEFORE UPDATE ON public.user_lifecycle_backup_20260124 FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: user_lifecycle_backup_20260127 trg_user_lifecycle_backup_20260127_updated_at; Type: TRIGGER; Schema: public; Owner: talktivity
--

CREATE TRIGGER trg_user_lifecycle_backup_20260127_updated_at BEFORE UPDATE ON public.user_lifecycle_backup_20260127 FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: user_lifecycle trg_user_lifecycle_updated_at; Type: TRIGGER; Schema: public; Owner: talktivity
--

CREATE TRIGGER trg_user_lifecycle_updated_at BEFORE UPDATE ON public.user_lifecycle FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: user_oauth_providers trg_user_oauth_providers_updated_at; Type: TRIGGER; Schema: public; Owner: talktivity
--

CREATE TRIGGER trg_user_oauth_providers_updated_at BEFORE UPDATE ON public.user_oauth_providers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: user_word_progress trg_user_word_progress_updated_at; Type: TRIGGER; Schema: public; Owner: talktivity
--

CREATE TRIGGER trg_user_word_progress_updated_at BEFORE UPDATE ON public.user_word_progress FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: users_backup_20260124 trg_users_backup_20260124_updated_at; Type: TRIGGER; Schema: public; Owner: talktivity
--

CREATE TRIGGER trg_users_backup_20260124_updated_at BEFORE UPDATE ON public.users_backup_20260124 FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: users_backup_20260127 trg_users_backup_20260127_updated_at; Type: TRIGGER; Schema: public; Owner: talktivity
--

CREATE TRIGGER trg_users_backup_20260127_updated_at BEFORE UPDATE ON public.users_backup_20260127 FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: users trg_users_updated_at; Type: TRIGGER; Schema: public; Owner: talktivity
--

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: vocabulary_completions trg_vocabulary_completions_updated_at; Type: TRIGGER; Schema: public; Owner: talktivity
--

CREATE TRIGGER trg_vocabulary_completions_updated_at BEFORE UPDATE ON public.vocabulary_completions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: vocabulary_hierarchy trg_vocabulary_hierarchy_updated_at; Type: TRIGGER; Schema: public; Owner: talktivity
--

CREATE TRIGGER trg_vocabulary_hierarchy_updated_at BEFORE UPDATE ON public.vocabulary_hierarchy FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: vocabulary_words trg_vocabulary_words_updated_at; Type: TRIGGER; Schema: public; Owner: talktivity
--

CREATE TRIGGER trg_vocabulary_words_updated_at BEFORE UPDATE ON public.vocabulary_words FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: call_sessions call_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.call_sessions
    ADD CONSTRAINT call_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: daily_progress daily_progress_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.daily_progress
    ADD CONSTRAINT daily_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: daily_reports daily_reports_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.daily_reports
    ADD CONSTRAINT daily_reports_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: dms dms_user1_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.dms
    ADD CONSTRAINT dms_user1_id_fkey FOREIGN KEY (user1_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: dms dms_user2_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.dms
    ADD CONSTRAINT dms_user2_id_fkey FOREIGN KEY (user2_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: call_sessions fk_call_sessions_user_id; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.call_sessions
    ADD CONSTRAINT fk_call_sessions_user_id FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: conversations fk_conversations_user_id; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT fk_conversations_user_id FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: daily_progress fk_daily_progress_course_id; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.daily_progress
    ADD CONSTRAINT fk_daily_progress_course_id FOREIGN KEY (course_id) REFERENCES public.user_courses(id) ON DELETE CASCADE;


--
-- Name: daily_progress fk_daily_progress_course_user_course; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.daily_progress
    ADD CONSTRAINT fk_daily_progress_course_user_course FOREIGN KEY (course_id) REFERENCES public.user_courses(id) ON DELETE CASCADE;


--
-- Name: daily_progress fk_daily_progress_user_id; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.daily_progress
    ADD CONSTRAINT fk_daily_progress_user_id FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: daily_reports fk_daily_reports_user_id; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.daily_reports
    ADD CONSTRAINT fk_daily_reports_user_id FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: dm_messages fk_dm_messages_dm_id; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.dm_messages
    ADD CONSTRAINT fk_dm_messages_dm_id FOREIGN KEY (dm_id) REFERENCES public.dms(id) ON DELETE CASCADE;


--
-- Name: dm_messages fk_dm_messages_sender_id; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.dm_messages
    ADD CONSTRAINT fk_dm_messages_sender_id FOREIGN KEY (sender_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: dms fk_dms_user1_id; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.dms
    ADD CONSTRAINT fk_dms_user1_id FOREIGN KEY (user1_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: dms fk_dms_user2_id; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.dms
    ADD CONSTRAINT fk_dms_user2_id FOREIGN KEY (user2_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: group_members fk_group_members_group_id; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT fk_group_members_group_id FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: group_members fk_group_members_user_id; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT fk_group_members_user_id FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: group_messages fk_group_messages_group_id; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.group_messages
    ADD CONSTRAINT fk_group_messages_group_id FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: group_messages fk_group_messages_user_id; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.group_messages
    ADD CONSTRAINT fk_group_messages_user_id FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: groups fk_groups_created_by; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT fk_groups_created_by FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: muted_groups fk_muted_groups_group_id; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.muted_groups
    ADD CONSTRAINT fk_muted_groups_group_id FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: muted_groups fk_muted_groups_user_id; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.muted_groups
    ADD CONSTRAINT fk_muted_groups_user_id FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: onboarding_data fk_onboarding_data_user_id; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.onboarding_data
    ADD CONSTRAINT fk_onboarding_data_user_id FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: payment_transactions fk_payment_transactions_subscription_id; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT fk_payment_transactions_subscription_id FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(id) ON DELETE CASCADE;


--
-- Name: payment_transactions fk_payment_transactions_user_id; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT fk_payment_transactions_user_id FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: speaking_sessions fk_speaking_sessions_course_id; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.speaking_sessions
    ADD CONSTRAINT fk_speaking_sessions_course_id FOREIGN KEY (course_id) REFERENCES public.user_courses(id) ON DELETE CASCADE;


--
-- Name: speaking_sessions fk_speaking_sessions_user_id; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.speaking_sessions
    ADD CONSTRAINT fk_speaking_sessions_user_id FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: subscriptions fk_subscriptions_plan_id; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT fk_subscriptions_plan_id FOREIGN KEY (plan_id) REFERENCES public.subscription_plans(id) ON DELETE CASCADE;


--
-- Name: subscriptions fk_subscriptions_user_id; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT fk_subscriptions_user_id FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_courses fk_user_courses_user_id; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.user_courses
    ADD CONSTRAINT fk_user_courses_user_id FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_lifecycle fk_user_lifecycle_user_id; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.user_lifecycle
    ADD CONSTRAINT fk_user_lifecycle_user_id FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_oauth_providers fk_user_oauth_providers_user_id; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.user_oauth_providers
    ADD CONSTRAINT fk_user_oauth_providers_user_id FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_sessions fk_user_sessions_user_id; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT fk_user_sessions_user_id FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_word_progress fk_user_word_progress_user_id; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.user_word_progress
    ADD CONSTRAINT fk_user_word_progress_user_id FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_word_progress fk_user_word_progress_word_id; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.user_word_progress
    ADD CONSTRAINT fk_user_word_progress_word_id FOREIGN KEY (word_id) REFERENCES public.vocabulary_words(id) ON DELETE CASCADE;


--
-- Name: vocabulary_completions fk_vocabulary_completions_user_id; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.vocabulary_completions
    ADD CONSTRAINT fk_vocabulary_completions_user_id FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: vocabulary_words fk_vocabulary_words_day_id; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.vocabulary_words
    ADD CONSTRAINT fk_vocabulary_words_day_id FOREIGN KEY (day_id) REFERENCES public.vocabulary_hierarchy(id) ON DELETE CASCADE;


--
-- Name: group_members group_members_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: group_messages group_messages_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.group_messages
    ADD CONSTRAINT group_messages_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: groups groups_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: last_read_at last_read_at_dm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.last_read_at
    ADD CONSTRAINT last_read_at_dm_id_fkey FOREIGN KEY (dm_id) REFERENCES public.dms(id) ON DELETE CASCADE;


--
-- Name: last_read_at last_read_at_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.last_read_at
    ADD CONSTRAINT last_read_at_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: last_read_at last_read_at_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.last_read_at
    ADD CONSTRAINT last_read_at_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: lifetime_call_usage lifetime_call_usage_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.lifetime_call_usage
    ADD CONSTRAINT lifetime_call_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: muted_groups muted_groups_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.muted_groups
    ADD CONSTRAINT muted_groups_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: onboarding_data onboarding_data_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.onboarding_data
    ADD CONSTRAINT onboarding_data_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: payment_audit_log payment_audit_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.payment_audit_log
    ADD CONSTRAINT payment_audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: payment_transactions payment_transactions_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(id) ON DELETE SET NULL;


--
-- Name: payment_transactions payment_transactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: speaking_sessions speaking_sessions_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.speaking_sessions
    ADD CONSTRAINT speaking_sessions_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.user_courses(id) ON DELETE CASCADE;


--
-- Name: speaking_sessions speaking_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.speaking_sessions
    ADD CONSTRAINT speaking_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: subscriptions subscriptions_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.subscription_plans(id);


--
-- Name: subscriptions subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_courses user_courses_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.user_courses
    ADD CONSTRAINT user_courses_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_lifecycle user_lifecycle_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.user_lifecycle
    ADD CONSTRAINT user_lifecycle_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_oauth_providers user_oauth_providers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.user_oauth_providers
    ADD CONSTRAINT user_oauth_providers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_sessions user_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_word_progress user_word_progress_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.user_word_progress
    ADD CONSTRAINT user_word_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_word_progress user_word_progress_word_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.user_word_progress
    ADD CONSTRAINT user_word_progress_word_id_fkey FOREIGN KEY (word_id) REFERENCES public.vocabulary_words(id) ON DELETE CASCADE;


--
-- Name: vocabulary_completions vocabulary_completions_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.vocabulary_completions
    ADD CONSTRAINT vocabulary_completions_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.user_courses(id) ON DELETE CASCADE;


--
-- Name: vocabulary_completions vocabulary_completions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.vocabulary_completions
    ADD CONSTRAINT vocabulary_completions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: weekly_exams weekly_exams_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.weekly_exams
    ADD CONSTRAINT weekly_exams_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.user_courses(id) ON DELETE CASCADE;


--
-- Name: weekly_exams weekly_exams_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talktivity
--

ALTER TABLE ONLY public.weekly_exams
    ADD CONSTRAINT weekly_exams_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: -; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT ALL ON SEQUENCES TO talktivity;


--
-- Name: DEFAULT PRIVILEGES FOR TYPES; Type: DEFAULT ACL; Schema: -; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT ALL ON TYPES TO talktivity;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: -; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT ALL ON FUNCTIONS TO talktivity;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: -; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT ALL ON TABLES TO talktivity;


--
-- PostgreSQL database dump complete
--

\unrestrict 3OVdF9IGQ3rBLE07vcboO64QcllchzhmIf2J1uBDTYLaAen5ZcrRVQQq41ZmVxO

