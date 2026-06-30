-- Timezone-Agnostic Database Schema Migration
-- This script converts all TIMESTAMP columns to separate DATE and TIME columns
-- to eliminate timezone-related issues.

-- Step 1: Create new init.sql with timezone-agnostic schema
-- PostgreSQL schema for HMS (Helthcare Management System) - Timezone Agnostic Version
-- This schema manages patient records, appointments, treatments, and scheduling
-- All dates stored as DATE type, all times as TIME type - no timezone dependencies
-- Version: 3.0 (Timezone Agnostic)
-- Last Updated: 2025-09-18

-- Domain Types (unchanged)
CREATE TYPE PATIENT_PRIORITY AS ENUM (
    '1', -- Emergency: Requires immediate attention
    '2', -- Intermediate: Priority but not urgent
    '3', -- Normal: Standard priority level
    '4', -- Priority level 4
    '5'  -- Priority level 5
);

CREATE TYPE PATIENT_STATUS AS ENUM (
    'N',  -- New patient (N)
    'T',  -- In treatment (T)
    'D',  -- Discharged
    'C'   -- Consecutive no-shows (C)
);

CREATE TYPE APPOINTMENT_TYPE AS ENUM (
    'assessment',   -- Assessment consultation
    'physiotherapy',  -- Physiotherapy treatment
    'tens'         -- TENS therapy treatment
);

CREATE TYPE APPOINTMENT_STATUS AS ENUM (
    'scheduled',   -- Appointment is scheduled
    'checked_in',  -- Patient has arrived
    'in_progress', -- Treatment is ongoing
    'completed',   -- Treatment is finished
    'cancelled',   -- Appointment was cancelled
    'missed'       -- Patient missed the appointment
);

CREATE TYPE TREATMENT_TYPE AS ENUM (
    'physiotherapy',  -- Physiotherapy modality
    'tens'          -- TENS modality
);

CREATE TYPE TREATMENT_STATUS AS ENUM (
    'scheduled',   -- Treatment (`hms_treatment`) is scheduled
    'in_progress', -- Treatment is in progress
    'completed',   -- Treatment is completed
    'cancelled'    -- Treatment was cancelled
);

CREATE TYPE SESSION_STATUS AS ENUM (
    'scheduled',   -- Session is scheduled
    'completed',   -- Session was completed
    'missed',      -- Session was missed
    'cancelled'    -- Session was cancelled
);

CREATE TYPE USER_ROLE AS ENUM (
    'staff',      -- Regular staff member
    'admin',      -- System administrator
    'doctor',     -- Assessment doctor
    'therapist'   -- Treatment therapist
);

-- Core patient information (updated with timezone-agnostic timestamps)
CREATE TABLE hms_patient (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    priority PATIENT_PRIORITY DEFAULT '3',
    patient_status PATIENT_STATUS DEFAULT 'N',
    birth_date DATE,
    main_concern TEXT,
    start_date DATE NOT NULL,
    discharge_date DATE,
    missing_appointments_streak INTEGER DEFAULT 0,

-- Timezone-agnostic audit fields
created_date DATE DEFAULT CURRENT_DATE,
created_time TIME DEFAULT CURRENT_TIME,
updated_date DATE DEFAULT CURRENT_DATE,
updated_time TIME DEFAULT CURRENT_TIME,

-- Validation constraints
CONSTRAINT valid_phone CHECK (phone ~ '^\(\d{3}\) \d{3}-\d{4}$'),
    CONSTRAINT valid_birth_date CHECK (birth_date <= CURRENT_DATE)
);

-- Patient notes for storing detailed observations and treatment notes
CREATE TABLE hms_patient_note (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL,
    note_content TEXT NOT NULL,
    category VARCHAR(50) DEFAULT 'general',

-- Timezone-agnostic audit fields following the existing pattern
created_date DATE DEFAULT CURRENT_DATE,
created_time TIME DEFAULT CURRENT_TIME,
updated_date DATE DEFAULT CURRENT_DATE,
updated_time TIME DEFAULT CURRENT_TIME,

-- Foreign key constraint
CONSTRAINT fk_patient_note_patient 
        FOREIGN KEY (patient_id) 
        REFERENCES hms_patient(id) 
        ON DELETE CASCADE
);

-- Medical appointment records (updated with timezone-agnostic timestamps)
CREATE TABLE hms_appointment (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER REFERENCES hms_patient (id) ON DELETE CASCADE,
    type APPOINTMENT_TYPE NOT NULL,
    status APPOINTMENT_STATUS DEFAULT 'scheduled',

-- Scheduled date/time (already timezone-agnostic)
scheduled_date DATE NOT NULL, scheduled_time TIME NOT NULL,

-- Event timestamps converted to separate date/time fields
checked_in_time TIME,
started_time TIME,
completed_time TIME,
cancelled_date DATE,
cancelled_time TIME,

-- Other fields
absence_justified BOOLEAN DEFAULT NULL,
absence_notes TEXT,
notes TEXT,

-- Parent/child relationship for linking follow-ups and generated treatments
parent_appointment_id INTEGER REFERENCES hms_appointment (id) ON DELETE SET NULL,

-- Reschedule: links this (new) appointment to the original cancelled/missed one (migration 006)
rescheduled_from_appointment_id INTEGER NULL,

-- Timezone-agnostic audit fields
created_date DATE DEFAULT CURRENT_DATE,
created_time TIME DEFAULT CURRENT_TIME,
updated_date DATE DEFAULT CURRENT_DATE,
updated_time TIME DEFAULT CURRENT_TIME
);

-- Ensure each original appointment can be the source of only one reschedule (migration 006)
CREATE UNIQUE INDEX idx_appointment_rescheduled_from_unique ON hms_appointment (
    rescheduled_from_appointment_id
)
WHERE
    rescheduled_from_appointment_id IS NOT NULL;

COMMENT ON COLUMN hms_appointment.rescheduled_from_appointment_id IS 'ID of the cancelled/missed appointment this one was rescheduled from. At most one rescheduled appointment per original.';

-- Consultation records (assessment consultation per appointment)
CREATE TABLE hms_consultation (
    id SERIAL PRIMARY KEY,
    appointment_id INTEGER REFERENCES hms_appointment (id) ON DELETE CASCADE UNIQUE,
    main_concern TEXT,
    patient_status PATIENT_STATUS,
    home_exercises TEXT,
    pain_management TEXT,
    medications TEXT,
    physiotherapy BOOLEAN DEFAULT false,
    tens BOOLEAN DEFAULT false,
    return_weeks INTEGER CHECK (return_weeks >= 0 AND return_weeks <= 52),
    return_when_treatment_complete BOOLEAN DEFAULT false,
    notes TEXT,

-- Consultation times converted to separate date/time fields
start_time TIME, end_time TIME,

-- Timezone-agnostic audit fields
created_date DATE DEFAULT CURRENT_DATE,
    created_time TIME DEFAULT CURRENT_TIME,
    updated_date DATE DEFAULT CURRENT_DATE,
    updated_time TIME DEFAULT CURRENT_TIME
);

-- Treatments (physiotherapy / tens per consultation; table `hms_treatment`)


CREATE TABLE hms_treatment (
    id SERIAL PRIMARY KEY,
    consultation_id INTEGER NOT NULL REFERENCES hms_consultation (id) ON DELETE CASCADE,
    appointment_id INTEGER NOT NULL REFERENCES hms_appointment (id) ON DELETE CASCADE,
    patient_id INTEGER NOT NULL REFERENCES hms_patient (id) ON DELETE CASCADE,
    
    treatment_type TREATMENT_TYPE NOT NULL,
    body_locations TEXT,
    start_date DATE NOT NULL,
    planned_sessions INTEGER NOT NULL CHECK (planned_sessions > 0 AND planned_sessions <= 50),
    completed_sessions INTEGER DEFAULT 0 CHECK (completed_sessions >= 0),
    end_date DATE,
    status TREATMENT_STATUS DEFAULT 'scheduled',

-- Session duration in minutes (30, 45, or 60)
duration_minutes INTEGER NOT NULL CHECK (duration_minutes IN (30, 45, 60)),
notes TEXT,
cancellation_reason TEXT,

-- Timezone-agnostic audit fields
created_date DATE DEFAULT CURRENT_DATE,
created_time TIME DEFAULT CURRENT_TIME,
updated_date DATE DEFAULT CURRENT_DATE,
updated_time TIME DEFAULT CURRENT_TIME
);

-- Sessions (`hms_session`): scheduled occurrences for a treatment


CREATE TABLE hms_session (
    id SERIAL PRIMARY KEY,
    treatment_id INTEGER NOT NULL REFERENCES hms_treatment (id) ON DELETE CASCADE,
    appointment_id INTEGER REFERENCES hms_appointment (id) ON DELETE SET NULL,
    
    session_number INTEGER NOT NULL CHECK (session_number > 0),
    scheduled_date DATE NOT NULL,

-- Session timing converted to separate date/time fields
start_time TIME,
end_time TIME,
status SESSION_STATUS DEFAULT 'scheduled',
notes TEXT,
missed_reason TEXT,
performed_by VARCHAR(100),

-- Timezone-agnostic audit fields

created_date DATE DEFAULT CURRENT_DATE,
    created_time TIME DEFAULT CURRENT_TIME,
    updated_date DATE DEFAULT CURRENT_DATE,
    updated_time TIME DEFAULT CURRENT_TIME
);

-- One record per (treatment_id, session_number) per appointment (allows rescheduled appointments to have their own record; matches migrations 007/008)
CREATE UNIQUE INDEX IF NOT EXISTS idx_session_session_number_per_appointment ON hms_session (
    treatment_id,
    session_number,
    appointment_id
)
WHERE
    appointment_id IS NOT NULL;

-- Schedule settings table (updated with timezone-agnostic timestamps)
CREATE TABLE hms_schedule_setting (
    id SERIAL PRIMARY KEY,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    max_concurrent_assessment INTEGER DEFAULT 1,
    max_concurrent_physiotherapy_tens INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,

-- Timezone-agnostic audit fields


created_date DATE DEFAULT CURRENT_DATE,
    created_time TIME DEFAULT CURRENT_TIME,
    updated_date DATE DEFAULT CURRENT_DATE,
    updated_time TIME DEFAULT CURRENT_TIME,
    
    UNIQUE (day_of_week)
);

-- Table: hms_system_settings
-- Purpose: Key-value store for global system configuration (e.g. appointments threshold for status C)
CREATE TABLE hms_system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value VARCHAR(500) NOT NULL
);

COMMENT ON TABLE hms_system_settings IS 'Global system settings; key-value store for config such as missing_appointments_threshold';

-- Seed default appointments threshold (1-10, default 3)
INSERT INTO
    hms_system_settings (key, value)
VALUES (
        'missing_appointments_threshold',
        '3'
    )
ON CONFLICT (key) DO NOTHING;

-- Table: hms_day_finalization
-- Purpose: Track which dates have been finalized (end-of-day process completed)
-- Primary Key: finalization_date (one finalization per date)
CREATE TABLE hms_day_finalization (
    finalization_date DATE PRIMARY KEY,
    finalized_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finalized_by VARCHAR(100), -- Future: track who finalized (currently nullable)
    notes TEXT, -- Optional: reason or notes about finalization
    created_date DATE DEFAULT CURRENT_DATE,
    created_time TIME DEFAULT CURRENT_TIME
);

CREATE INDEX idx_day_finalization_date ON hms_day_finalization (finalization_date);

CREATE INDEX idx_day_finalization_at ON hms_day_finalization (finalized_at);

COMMENT ON TABLE hms_day_finalization IS 'Tracks finalized dates for end-of-day workflow';

COMMENT ON COLUMN hms_day_finalization.finalization_date IS 'Date that was finalized';

COMMENT ON COLUMN hms_day_finalization.finalized_at IS 'Timestamp when finalization occurred';

COMMENT ON COLUMN hms_day_finalization.finalized_by IS 'User who finalized (future use)';

COMMENT ON COLUMN hms_day_finalization.notes IS 'Optional notes about finalization';

-- ============================================================================
-- HOLIDAY MANAGEMENT SYSTEM
-- ============================================================================
-- Purpose: Manage holidays and blocked dates for appointment scheduling
-- Version: 1.0
-- Last Updated: 2026-01-27

-- Holiday management table for blocking dates in the calendar
CREATE TABLE hms_holiday (
    id SERIAL PRIMARY KEY,
    holiday_date DATE NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,

-- Future enhancement: block specific treatment types
-- NULL = all treatments blocked (default)
-- Array values: 'assessment', 'physiotherapy', 'tens'
blocked_treatment_types VARCHAR(20) [] DEFAULT NULL,

-- UUID to group multiple holidays into periods (NULL for individual holidays)
holiday_group_id UUID NULL,

-- Audit fields (timezone-agnostic following project pattern)
created_date DATE DEFAULT CURRENT_DATE,
created_time TIME DEFAULT CURRENT_TIME,
updated_date DATE DEFAULT CURRENT_DATE,
updated_time TIME DEFAULT CURRENT_TIME,

-- Constraints
CONSTRAINT valid_holiday_date CHECK (holiday_date >= CURRENT_DATE) );

-- Performance index for fast date lookups
CREATE INDEX idx_holiday_date ON hms_holiday (holiday_date);

-- Helper function to check if a date has scheduled appointments
-- Used for validation before creating holidays
CREATE OR REPLACE FUNCTION has_scheduled_appointments(check_date DATE)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM hms_appointment
        WHERE scheduled_date = check_date
        AND status != 'cancelled'
    );
END;
$$ LANGUAGE plpgsql;

-- Comments for holiday management
COMMENT ON TABLE hms_holiday IS 'Stores holidays and blocked dates for appointment scheduling';

COMMENT ON COLUMN hms_holiday.holiday_date IS 'Date of the holiday (must be unique)';

COMMENT ON COLUMN hms_holiday.name IS 'Holiday name (e.g., Natal, Ano Novo)';

COMMENT ON COLUMN hms_holiday.description IS 'Optional description or notes about the holiday';

-- =====================================================================================
-- Table: hms_holiday_template
-- Purpose: Stores reusable holiday templates that can be applied to any year
-- =====================================================================================
CREATE TABLE hms_holiday_template (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,

-- JSONB column to store array of holidays with month/day/name/description
-- Example: [{"month": 12, "day": 25, "name": "Natal", "description": "Feriado Nacional"}]
holidays JSONB NOT NULL,

-- Audit field
created_date DATE DEFAULT CURRENT_DATE );

-- Index for faster template queries
CREATE INDEX idx_holiday_template_name ON hms_holiday_template (name);

COMMENT ON TABLE hms_holiday_template IS 'Stores reusable holiday templates that can be applied to any year';

COMMENT ON COLUMN hms_holiday_template.holidays IS 'JSONB array of {month, day, name, description} objects';

COMMENT ON COLUMN hms_holiday.blocked_treatment_types IS 'Array of treatment types to block (NULL = all types blocked)';

COMMENT ON COLUMN hms_holiday.created_date IS 'Date when holiday was created (timezone-agnostic)';

COMMENT ON COLUMN hms_holiday.created_time IS 'Time when holiday was created (timezone-agnostic)';

COMMENT ON COLUMN hms_holiday.updated_date IS 'Date when holiday was last updated (timezone-agnostic)';

COMMENT ON COLUMN hms_holiday.updated_time IS 'Time when holiday was last updated (timezone-agnostic)';

COMMENT ON FUNCTION has_scheduled_appointments (DATE) IS 'Checks if a date has non-cancelled scheduled appointments';

-- ============================================================================
-- SYSTEM OPTIONS TABLE
-- ============================================================================
-- Purpose: Configurable options for system features (body locations,
-- priorities, note categories, etc.)
-- Version: 2.0
-- Last Updated: 2026-03-20

-- System option rows. For some domains, `label` can be null and callers should
-- fall back to using `value` as display text.
CREATE TABLE hms_system_options (
    id SERIAL PRIMARY KEY,
    type VARCHAR(20) NOT NULL CHECK (
        type IN (
            'body_location',
            'priority',
            'note_category'
        )
    ),
    value VARCHAR(50) NOT NULL,
    label VARCHAR(50),
    sort_order INTEGER,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT unique_type_value UNIQUE (type, value)
);

-- Create index for performance
CREATE INDEX idx_system_options_type_active 
ON hms_system_options(type, is_active);

COMMENT ON TABLE hms_system_options IS 'Stores configurable system options (body locations, priorities, note categories)';

COMMENT ON COLUMN hms_system_options.type IS 'Option domain: body_location | priority | note_category';

COMMENT ON COLUMN hms_system_options.value IS 'Stored code/value (e.g., "Head", "Blue", "1", "general")';

COMMENT ON COLUMN hms_system_options.label IS 'Human readable label for UI (nullable; fallback to value)';

COMMENT ON COLUMN hms_system_options.sort_order IS 'Optional ordering hint for UI/business logic';

COMMENT ON COLUMN hms_system_options.is_active IS 'Whether this option is currently active';

-- ============================================================================
-- AUTHENTICATION SYSTEM TABLES
-- ============================================================================
-- Purpose: User authentication with JWT tokens and refresh token management
-- Version: 1.0
-- Last Updated: 2026-01-22

-- Users table for system authentication
CREATE TABLE hms_user (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    display_name VARCHAR(50),
    role USER_ROLE DEFAULT 'staff' NOT NULL,
    is_active BOOLEAN DEFAULT true NOT NULL,
    must_change_password BOOLEAN DEFAULT false NOT NULL,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP,
    failed_password_change_attempts INTEGER DEFAULT 0 NOT NULL,
    password_change_locked_until TIMESTAMP,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Refresh tokens table for JWT session management
CREATE TABLE hms_refresh_token (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES hms_user (id) ON DELETE CASCADE,
    token VARCHAR(500) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_refresh_token_user FOREIGN KEY (user_id) REFERENCES hms_user (id) ON DELETE CASCADE
);

-- Performance indexes for authentication
CREATE INDEX idx_user_email ON hms_user (email);

CREATE INDEX idx_user_locked ON hms_user (locked_until);

CREATE INDEX idx_password_change_locked_until ON hms_user (password_change_locked_until);

CREATE INDEX idx_user_role ON hms_user (role);

CREATE INDEX idx_user_is_active ON hms_user (is_active);

CREATE INDEX idx_user_display_name ON hms_user (display_name);

CREATE INDEX idx_refresh_token_token ON hms_refresh_token (token);

CREATE INDEX idx_refresh_token_user_id ON hms_refresh_token (user_id);

CREATE INDEX idx_refresh_token_expires_at ON hms_refresh_token (expires_at);

-- Comments for authentication tables
COMMENT ON TABLE hms_user IS 'System users with authentication credentials';

COMMENT ON TABLE hms_refresh_token IS 'JWT refresh tokens for session management';

COMMENT ON COLUMN hms_user.email IS 'Unique email address for login';

COMMENT ON COLUMN hms_user.password_hash IS 'Bcrypt hashed password (never store plain text)';

COMMENT ON COLUMN hms_user.display_name IS 'Display name shown in UI (optional, defaults to name)';

COMMENT ON COLUMN hms_user.role IS 'User role: staff, admin, doctor, therapist';

COMMENT ON COLUMN hms_user.is_active IS 'Whether user account is active';

COMMENT ON COLUMN hms_user.must_change_password IS 'Whether user must change password on next login';

COMMENT ON COLUMN hms_user.last_login IS 'Timestamp of last successful login';

COMMENT ON COLUMN hms_user.created_at IS 'Timestamp when user was created';

COMMENT ON COLUMN hms_user.updated_at IS 'Timestamp when user was last updated';

COMMENT ON COLUMN hms_refresh_token.token IS 'JWT refresh token string';

COMMENT ON COLUMN hms_refresh_token.expires_at IS 'Token expiration timestamp';

COMMENT ON COLUMN hms_refresh_token.revoked_at IS 'Timestamp when token was revoked (null if active)';

COMMENT ON COLUMN hms_refresh_token.created_at IS 'Timestamp when token was created';

-- Bootstrap admin: create the first admin user via the CLI helper script after deployment.
--
--   node scripts/create-admin.js --email admin@example.com --name "Admin"
--
-- The script prompts for a password and inserts a bcrypt hash. No default credentials
-- are seeded here so that production deployments never carry a known password.
--
-- For local development only, you may run:
--   node scripts/create-admin.js --email dev@local --name "Dev Admin" --dev
-- which generates a random 24-char password and prints it once.

-- Function to update date/time fields for audit
CREATE OR REPLACE FUNCTION update_updated_date_time_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_date = CURRENT_DATE;
    NEW.updated_time = CURRENT_TIME;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updating audit timestamps
CREATE TRIGGER update_patients_modtime
    BEFORE UPDATE ON hms_patient
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_date_time_column();

CREATE TRIGGER update_appointments_modtime
    BEFORE UPDATE ON hms_appointment
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_date_time_column();

CREATE TRIGGER update_consultations_modtime
    BEFORE UPDATE ON hms_consultation
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_date_time_column();

CREATE TRIGGER update_scheduling_settings_modtime
    BEFORE UPDATE ON hms_schedule_setting
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_date_time_column();

CREATE TRIGGER update_treatments_modtime
    BEFORE UPDATE ON hms_treatment
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_date_time_column();

CREATE TRIGGER update_sessions_modtime
    BEFORE UPDATE ON hms_session
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_date_time_column();

CREATE TRIGGER update_patient_notes_modtime
    BEFORE UPDATE ON hms_patient_note
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_date_time_column();

CREATE TRIGGER update_holidays_modtime
    BEFORE UPDATE ON hms_holiday
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_date_time_column();

-- Function to update updated_at timestamp for user table
CREATE OR REPLACE FUNCTION update_user_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_modtime
    BEFORE UPDATE ON hms_user
    FOR EACH ROW
    EXECUTE FUNCTION update_user_updated_at_column();

-- Enhanced function for consultation validation
CREATE OR REPLACE FUNCTION check_one_consultation_per_appointment()
RETURNS TRIGGER AS $$
DECLARE
    appointment_exists BOOLEAN;
    appointment_status hms_appointment.status%TYPE;
    existing_record RECORD;
BEGIN
    -- Check if appointment exists
    SELECT EXISTS(
        SELECT 1 FROM hms_appointment WHERE id = NEW.appointment_id
    ) INTO appointment_exists;

    IF NOT appointment_exists THEN
        RAISE EXCEPTION 'Cannot create consultation: Appointment with ID % does not exist', NEW.appointment_id;
    END IF;

    -- Check appointment status
    SELECT status INTO appointment_status
    FROM hms_appointment
    WHERE id = NEW.appointment_id;

    IF appointment_status = 'cancelled' THEN
        RAISE EXCEPTION 'Cannot create consultation: Appointment (ID: %) is cancelled', NEW.appointment_id;
    END IF;

    -- Check for existing consultation
    SELECT * INTO existing_record
    FROM hms_consultation
    WHERE appointment_id = NEW.appointment_id;

    IF FOUND THEN
        RAISE EXCEPTION 'Cannot create consultation: Appointment (ID: %) already has a consultation (ID: %)',
            NEW.appointment_id, existing_record.id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to enforce one consultation per appointment
CREATE TRIGGER ensure_one_consultation_per_appointment
    BEFORE INSERT ON hms_consultation
    FOR EACH ROW
    EXECUTE FUNCTION check_one_consultation_per_appointment();

-- Performance indexes
CREATE INDEX idx_appointment_scheduled_date ON hms_appointment (scheduled_date);

CREATE INDEX idx_appointment_patient_id ON hms_appointment (patient_id);

CREATE INDEX idx_appointment_status ON hms_appointment (status);

CREATE INDEX idx_treatments_consultation ON hms_treatment (consultation_id);

CREATE INDEX idx_treatments_patient ON hms_treatment (patient_id);

CREATE INDEX idx_sessions_treatment ON hms_session (treatment_id);

CREATE INDEX idx_hms_patient_note_patient_id ON hms_patient_note (patient_id);

CREATE INDEX idx_hms_patient_note_category ON hms_patient_note (category);

CREATE INDEX idx_hms_patient_note_created_date ON hms_patient_note (created_date);

CREATE INDEX idx_consultation_patient_status ON hms_consultation (patient_status);

-- Patient notes table comments
COMMENT ON TABLE hms_patient_note IS 'Stores patient notes and observations for healthcare providers';

COMMENT ON COLUMN hms_patient_note.patient_id IS 'Reference to the patient this note belongs to';

COMMENT ON COLUMN hms_patient_note.note_content IS 'The actual note content';

COMMENT ON COLUMN hms_patient_note.category IS 'Note category (general, treatment, observation, etc.)';

COMMENT ON COLUMN hms_patient_note.created_date IS 'Date when the note was created (timezone-agnostic)';

COMMENT ON COLUMN hms_patient_note.created_time IS 'Time when the note was created (timezone-agnostic)';

COMMENT ON COLUMN hms_patient_note.updated_date IS 'Date when the note was last updated (timezone-agnostic)';

COMMENT ON COLUMN hms_patient_note.updated_time IS 'Time when the note was last updated (timezone-agnostic)';

-- Treatment timing and hierarchy comments
COMMENT ON COLUMN hms_appointment.checked_in_time IS 'Check-in time (date derived from appointment context)';

COMMENT ON COLUMN hms_appointment.started_time IS 'Treatment start time (date derived from appointment context)';

COMMENT ON COLUMN hms_appointment.completed_time IS 'Treatment completion time (date derived from appointment context)';

COMMENT ON COLUMN hms_consultation.main_concern IS 'Main concern from the patient during this specific consultation session';

COMMENT ON COLUMN hms_consultation.patient_status IS 'Patient lifecycle status at time of consultation: N=New, T=Treatment, D=Discharged, C=Consecutive no-shows';

COMMENT ON COLUMN hms_consultation.start_time IS 'Consultation start time (date derived from appointment_date context)';

COMMENT ON COLUMN hms_consultation.end_time IS 'Consultation end time (date derived from appointment_date context)';

COMMENT ON COLUMN hms_treatment.body_locations IS 'Standard body locations for this treatment';

COMMENT ON COLUMN hms_treatment.planned_sessions IS 'Number of sessions planned for this treatment (quantity)';

COMMENT ON COLUMN hms_session.start_time IS 'Session start time (date derived from scheduled_date context)';

COMMENT ON COLUMN hms_session.end_time IS 'Session end time (date derived from scheduled_date context)';

-- Helper function to find root appointment from parent_appointment_id hierarchy
CREATE OR REPLACE FUNCTION get_root_appointment_id(appointment_id INTEGER) 
RETURNS INTEGER AS $$
DECLARE
    current_id INTEGER := appointment_id;
    parent_id INTEGER;
BEGIN
    LOOP
        SELECT parent_appointment_id INTO parent_id 
        FROM hms_appointment 
        WHERE id = current_id;
        
        IF parent_id IS NULL THEN
            RETURN current_id;
        END IF;
        
        current_id := parent_id;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_root_appointment_id (INTEGER) IS 'Returns the root (main) appointment ID for any appointment in the hierarchy';

-- Consultation episodes view - using parent_appointment_id from hms_appointment
CREATE OR REPLACE VIEW consultation_episodes AS
SELECT
    t1.id as root_consultation_id,
    t1.appointment_id as main_appointment_id,
    t1.notes as episode_notes,
    a1.scheduled_date as episode_start_date,
    COUNT(t2.id) + 1 as total_consultations,
    ARRAY_AGG(
        t2.id
        ORDER BY a2.scheduled_date
    ) FILTER (
        WHERE
            t2.id IS NOT NULL
    ) as followup_consultation_ids,
    MAX(a2.scheduled_date) as last_consultation_date,
    CASE
        WHEN MAX(t2.return_weeks) > 0
        OR t1.return_weeks > 0 THEN 'active'
        ELSE 'completed'
    END as episode_status
FROM
    hms_consultation t1
    LEFT JOIN hms_appointment a1 ON t1.appointment_id = a1.id
    LEFT JOIN hms_appointment a2 ON a2.parent_appointment_id = a1.id
    LEFT JOIN hms_consultation t2 ON t2.appointment_id = a2.id
WHERE
    a1.parent_appointment_id IS NULL -- Only root appointments
GROUP BY
    t1.id,
    t1.appointment_id,
    t1.notes,
    a1.scheduled_date;

COMMENT ON VIEW consultation_episodes IS 'Episode-level view of consultations with hierarchy (parent_appointment_id)';

-- Default schedule settings for all days of the week
INSERT INTO
    hms_schedule_setting (
        day_of_week,
        start_time,
        end_time,
        max_concurrent_assessment,
        max_concurrent_physiotherapy_tens,
        is_active
    )
VALUES (
        0,
        '06:00:00',
        '23:00:00',
        50,
        50,
        true
    ), -- Sunday: 6 AM to 11 PM
    (
        1,
        '06:00:00',
        '23:00:00',
        50,
        50,
        true
    ), -- Monday: 6 AM to 11 PM
    (
        2,
        '06:00:00',
        '23:00:00',
        50,
        50,
        true
    ), -- Tuesday: 6 AM to 11 PM
    (
        3,
        '06:00:00',
        '23:00:00',
        50,
        50,
        true
    ), -- Wednesday: 6 AM to 11 PM
    (
        4,
        '06:00:00',
        '23:00:00',
        50,
        50,
        true
    ), -- Thursday: 6 AM to 11 PM
    (
        5,
        '06:00:00',
        '23:00:00',
        50,
        50,
        true
    ), -- Friday: 6 AM to 11 PM
    (
        6,
        '06:00:00',
        '23:00:00',
        50,
        50,
        true
    );
-- Saturday: 6 AM to 11 PM

-- =====================================================================================
-- Seed Data: Holiday Templates
-- Purpose: Pre-populate common holiday templates
-- =====================================================================================

-- Template 1: National Holidays
INSERT INTO
    hms_holiday_template (name, description, holidays)
VALUES (
        'National Holidays',
        NULL,
        '[
        {"month": 1, "day": 1, "name": "Confraternização Universal", "description": "Feriado Nacional"},
        {"month": 4, "day": 21, "name": "Tiradentes", "description": "Feriado Nacional"},
        {"month": 5, "day": 1, "name": "Dia do Trabalho", "description": "Feriado Nacional"},
        {"month": 9, "day": 7, "name": "Independência do Brasil", "description": "Feriado Nacional"},
        {"month": 10, "day": 12, "name": "Nossa Senhora Aparecida", "description": "Feriado Nacional"},
        {"month": 11, "day": 2, "name": "Finados", "description": "Feriado Nacional"},
        {"month": 11, "day": 15, "name": "Proclamação da República", "description": "Feriado Nacional"},
        {"month": 12, "day": 25, "name": "Natal", "description": "Feriado Nacional"}
    ]'::jsonb
    );

-- Template 2: Sao Paulo State Holidays
INSERT INTO
    hms_holiday_template (name, description, holidays)
VALUES (
        'Sao Paulo State Holidays',
        NULL,
        '[
        {"month": 7, "day": 9, "name": "Revolução Constitucionalista de 1932", "description": "Feriado Estadual de São Paulo"}
    ]'::jsonb
    );

-- Template 3: Santo Andre Municipal Holidays
INSERT INTO
    hms_holiday_template (name, description, holidays)
VALUES (
        'Feriados Municipais de Santo André',
        NULL,
        '[
        {"month": 4, "day": 8, "name": "Aniversário da cidade de Santo André", "description": "Feriado Municipal de Santo André"},
        {"month": 11, "day": 20, "name": "Dia da Consciência Negra", "description": "Feriado Municipal de Santo André"}
    ]'::jsonb
    );

-- =====================================================================================
-- Seed Data: System Options
-- Purpose: Pre-populate body locations and priority definitions
-- =====================================================================================

-- Seed body locations
INSERT INTO
    hms_system_options (type, value)
VALUES ('body_location', 'Head'),
    ('body_location', 'Neck'),
    (
        'body_location',
        'Left Shoulder'
    ),
    ('body_location', 'Back'),
    (
        'body_location',
        'Right Shoulder'
    ),
    ('body_location', 'Left Arm'),
    ('body_location', 'Right Arm'),
    ('body_location', 'Lumbar'),
    ('body_location', 'Right Knee'),
    ('body_location', 'Left Knee'),
    (
        'body_location',
        'Right Ankle'
    ),
    ('body_location', 'Left Ankle'),
    ('body_location', 'Right Foot'),
    ('body_location', 'Left Foot');

-- Seed priorities (initially 1-2 active, 3-5 inactive)
INSERT INTO
    hms_system_options (
        type,
        value,
        label,
        sort_order,
        is_active
    )
VALUES (
        'priority',
        '1',
        'Priority',
        1,
        true
    ),
    (
        'priority',
        '2',
        'Standard',
        2,
        true
    ),
    (
        'priority',
        '3',
        'Priority 3',
        3,
        false
    ),
    (
        'priority',
        '4',
        'Priority 4',
        4,
        false
    ),
    (
        'priority',
        '5',
        'Priority 5',
        5,
        false
    );

-- Seed note categories (used for patient notes)
INSERT INTO
    hms_system_options (
        type,
        value,
        label,
        sort_order,
        is_active
    )
VALUES (
        'note_category',
        'general',
        'General',
        1,
        true
    ),
    (
        'note_category',
        'status_change',
        'Status change',
        2,
        true
    ),
    (
        'note_category',
        'medication',
        'Medications',
        3,
        true
    ),
    (
        'note_category',
        'progress',
        'Progress',
        4,
        true
    ),
    (
        'note_category',
        'emergency',
        'Emergency',
        5,
        true
    );