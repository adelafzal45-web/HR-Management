--
-- PostgreSQL database dump
--

\restrict NnMS0Br64oADJaro4xGJqcv0RCwxyv8I9UIItEe6qaHivRrPYPh6G1cMbnDT67E

-- Dumped from database version 18.4
-- Dumped by pg_dump version 18.4

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
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: appraisal_forms_evaluation_type_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.appraisal_forms_evaluation_type_enum AS ENUM (
    'Daily',
    'Weekly',
    'Monthly'
);


ALTER TYPE public.appraisal_forms_evaluation_type_enum OWNER TO postgres;

--
-- Name: performance_reviews_evaluation_type_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.performance_reviews_evaluation_type_enum AS ENUM (
    'Daily',
    'Weekly',
    'Monthly'
);


ALTER TYPE public.performance_reviews_evaluation_type_enum OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: appraisal_form_assignments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.appraisal_form_assignments (
    assignment_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    form_id uuid NOT NULL,
    department_id uuid,
    designation_id uuid,
    user_id uuid,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT "CHK_afa_single_target" CHECK ((((((department_id IS NOT NULL))::integer + ((designation_id IS NOT NULL))::integer) + ((user_id IS NOT NULL))::integer) = 1))
);


ALTER TABLE public.appraisal_form_assignments OWNER TO postgres;

--
-- Name: appraisal_form_questions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.appraisal_form_questions (
    form_question_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    display_order integer DEFAULT 1 NOT NULL,
    weight_percentage numeric(5,2) NOT NULL,
    is_required boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    form_id uuid NOT NULL,
    question_id uuid NOT NULL,
    rating_scale integer DEFAULT 10 NOT NULL,
    min_label character varying(60),
    max_label character varying(60),
    snapshot_text text,
    snapshot_type character varying(30),
    snapshot_options jsonb,
    is_active boolean DEFAULT true NOT NULL,
    description character varying(500),
    snapshot_description character varying(500),
    version integer DEFAULT 1 NOT NULL,
    rating_min integer DEFAULT 1 NOT NULL,
    CONSTRAINT "CHK_afq_rating_min" CHECK ((rating_min = ANY (ARRAY[0, 1]))),
    CONSTRAINT "CHK_afq_rating_min_lt_scale" CHECK ((rating_min < rating_scale)),
    CONSTRAINT "CHK_afq_rating_scale" CHECK (((rating_scale >= 2) AND (rating_scale <= 100)))
);


ALTER TABLE public.appraisal_form_questions OWNER TO postgres;

--
-- Name: COLUMN appraisal_form_questions.version; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.appraisal_form_questions.version IS 'Which form version this question snapshot belongs to. Multiple rows per question can exist with different versions, so historical reviews can resolve their original questions.';


--
-- Name: appraisal_forms; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.appraisal_forms (
    form_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    form_name character varying(150) NOT NULL,
    description text,
    evaluation_type public.appraisal_forms_evaluation_type_enum NOT NULL,
    status character varying(20) DEFAULT 'Draft'::character varying NOT NULL,
    department_id uuid,
    designation_id uuid,
    created_by uuid,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    version integer DEFAULT 1 NOT NULL
);


ALTER TABLE public.appraisal_forms OWNER TO postgres;

--
-- Name: COLUMN appraisal_forms.version; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.appraisal_forms.version IS 'Current version of this form. Incremented when a published form is edited.';


--
-- Name: appraisal_notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.appraisal_notifications (
    notification_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    recipient_user_id uuid NOT NULL,
    type character varying(40) NOT NULL,
    title character varying(200) NOT NULL,
    message text NOT NULL,
    related_review_id uuid,
    dedupe_key character varying(120),
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT "CHK_an_type" CHECK (((type)::text = ANY ((ARRAY['SHIFT_REMINDER'::character varying, 'PENDING_DIGEST'::character varying, 'REVIEW_REOPENED'::character varying, 'REVIEW_APPROVED'::character varying])::text[])))
);


ALTER TABLE public.appraisal_notifications OWNER TO postgres;

--
-- Name: appraisal_question_options; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.appraisal_question_options (
    option_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    option_text text NOT NULL,
    score numeric(5,2) NOT NULL,
    display_order integer NOT NULL,
    question_id uuid NOT NULL,
    CONSTRAINT "CHK_aqo_score_non_negative" CHECK ((score >= (0)::numeric))
);


ALTER TABLE public.appraisal_question_options OWNER TO postgres;

--
-- Name: appraisal_questions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.appraisal_questions (
    question_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    question_text text NOT NULL,
    question_type character varying(30) DEFAULT 'rating'::character varying NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT "CHK_aq_question_type" CHECK (((question_type)::text = ANY ((ARRAY['rating'::character varying, 'yes_no'::character varying, 'multiple_choice'::character varying, 'dropdown'::character varying, 'text_feedback'::character varying])::text[])))
);


ALTER TABLE public.appraisal_questions OWNER TO postgres;

--
-- Name: attendance; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.attendance (
    attendance_id uuid DEFAULT gen_random_uuid() NOT NULL,
    attendance_date date NOT NULL,
    check_in time without time zone,
    check_out time without time zone,
    working_hours numeric(5,2),
    attendance_status character varying(20) NOT NULL,
    overtime_hours numeric(5,2),
    is_overtime boolean DEFAULT false NOT NULL,
    user_id uuid NOT NULL,
    shift_id uuid
);


ALTER TABLE public.attendance OWNER TO postgres;

--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.audit_logs (
    audit_log_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    actor_user_id uuid,
    actor_email character varying(255),
    action character varying(80) NOT NULL,
    entity_type character varying(80) NOT NULL,
    entity_id character varying(100),
    before_state jsonb,
    after_state jsonb,
    ip_address character varying(64),
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.audit_logs OWNER TO postgres;

--
-- Name: company_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.company_settings (
    id integer DEFAULT 1 NOT NULL,
    legal_company_name character varying(200) NOT NULL,
    registration_number character varying(100),
    industry character varying(100),
    timezone character varying(50) DEFAULT 'UTC'::character varying NOT NULL,
    currency character varying(10) DEFAULT 'USD'::character varying NOT NULL,
    working_days character varying(50) DEFAULT 'Mon-Fri'::character varying NOT NULL,
    company_name character varying(200) NOT NULL,
    logo_url character varying(500),
    logo_collapsed_url character varying(500),
    favicon_url character varying(500),
    email character varying(255),
    phone character varying(50),
    address text,
    website character varying(255),
    primary_color character varying(20) DEFAULT '#F1B344'::character varying,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    ceo_name character varying(150),
    ceo_signature_url character varying(500),
    cofounder_name character varying(150),
    cofounder_signature_url character varying(500),
    CONSTRAINT "CHK_company_settings_id_one" CHECK ((id = 1))
);


ALTER TABLE public.company_settings OWNER TO postgres;

--
-- Name: departments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.departments (
    department_id uuid DEFAULT gen_random_uuid() NOT NULL,
    department_name character varying(100) NOT NULL,
    description text
);


ALTER TABLE public.departments OWNER TO postgres;

--
-- Name: designations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.designations (
    designation_id uuid DEFAULT gen_random_uuid() NOT NULL,
    title character varying(100) NOT NULL,
    department_id uuid NOT NULL
);


ALTER TABLE public.designations OWNER TO postgres;

--
-- Name: email_queue; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.email_queue (
    email_queue_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    template_key character varying(60),
    to_email character varying(255) NOT NULL,
    to_name character varying(200),
    subject character varying(255) NOT NULL,
    body_html text NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 5 NOT NULL,
    next_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    last_error text,
    sent_at timestamp with time zone,
    related_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "CHK_email_queue_status" CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'sending'::character varying, 'sent'::character varying, 'failed'::character varying, 'cancelled'::character varying])::text[])))
);


ALTER TABLE public.email_queue OWNER TO postgres;

--
-- Name: email_template_versions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.email_template_versions (
    email_template_version_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    email_template_id uuid NOT NULL,
    version integer NOT NULL,
    subject character varying(255) NOT NULL,
    body_html text NOT NULL,
    changed_by_user_id uuid,
    changed_by_email character varying(255),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.email_template_versions OWNER TO postgres;

--
-- Name: email_templates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.email_templates (
    email_template_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    template_key character varying(60) NOT NULL,
    name character varying(150) NOT NULL,
    description text,
    subject character varying(255) NOT NULL,
    body_html text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    updated_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.email_templates OWNER TO postgres;

--
-- Name: employee_component_overrides; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.employee_component_overrides (
    override_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    component_id uuid NOT NULL,
    override_calculation_type character varying(20),
    override_amount numeric(14,4),
    override_formula text,
    effective_from date,
    effective_to date,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.employee_component_overrides OWNER TO postgres;

--
-- Name: employee_documents; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.employee_documents (
    document_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "employeeId" uuid NOT NULL,
    category character varying(50) NOT NULL,
    original_name character varying(255) NOT NULL,
    stored_name character varying(100) NOT NULL,
    mime_type character varying(100) NOT NULL,
    size_bytes integer NOT NULL,
    uploaded_by uuid,
    uploaded_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.employee_documents OWNER TO postgres;

--
-- Name: employee_loans; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.employee_loans (
    loan_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    name character varying(120) NOT NULL,
    principal numeric(14,2) DEFAULT 0 NOT NULL,
    outstanding numeric(14,2) DEFAULT 0 NOT NULL,
    installment_amount numeric(14,2) DEFAULT 0 NOT NULL,
    start_period_id uuid,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    remarks text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    requested_at timestamp with time zone,
    decided_by uuid,
    decided_at timestamp with time zone,
    decision_note text,
    CONSTRAINT chk_employee_loans_status CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'active'::character varying, 'closed'::character varying, 'paused'::character varying, 'rejected'::character varying])::text[])))
);


ALTER TABLE public.employee_loans OWNER TO postgres;

--
-- Name: holidays; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.holidays (
    holiday_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(150) NOT NULL,
    holiday_date date NOT NULL,
    description text,
    department_id uuid,
    is_recurring boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    event_type character varying(20) DEFAULT 'Holiday'::character varying NOT NULL,
    notify boolean DEFAULT false NOT NULL,
    notified_at timestamp without time zone,
    CONSTRAINT "CHK_holidays_event_type" CHECK (((event_type)::text = ANY ((ARRAY['Holiday'::character varying, 'Event'::character varying])::text[])))
);


ALTER TABLE public.holidays OWNER TO postgres;

--
-- Name: job_categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.job_categories (
    job_category_id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_category_name character varying(100) NOT NULL,
    description text
);


ALTER TABLE public.job_categories OWNER TO postgres;

--
-- Name: leave_entitlements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.leave_entitlements (
    leave_entitlement_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    leave_type_id uuid NOT NULL,
    year smallint NOT NULL,
    entitled_days numeric(6,2) DEFAULT 0 NOT NULL,
    carried_forward_days numeric(6,2) DEFAULT 0 NOT NULL,
    adjusted_days numeric(6,2) DEFAULT 0 NOT NULL,
    expired_days numeric(6,2) DEFAULT 0 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.leave_entitlements OWNER TO postgres;

--
-- Name: leave_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.leave_history (
    leave_history_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    leave_type_id uuid NOT NULL,
    year smallint NOT NULL,
    type character varying(20) NOT NULL,
    amount numeric(6,2) NOT NULL,
    balance_after numeric(6,2) NOT NULL,
    note text,
    reference_id uuid,
    reference_type character varying(40),
    performed_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.leave_history OWNER TO postgres;

--
-- Name: leave_requests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.leave_requests (
    leave_id uuid DEFAULT gen_random_uuid() NOT NULL,
    leave_type character varying(30) NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    reason text,
    status character varying(20) DEFAULT 'Pending'::character varying NOT NULL,
    applied_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    approved_date timestamp without time zone,
    user_id uuid NOT NULL,
    approved_by uuid,
    leave_type_id uuid,
    is_half_day boolean DEFAULT false NOT NULL,
    days_count numeric(6,2),
    duration_type character varying(20) DEFAULT 'Full Day'::character varying NOT NULL,
    attachment_path character varying(255),
    attachment_name character varying(255),
    approval_reason text,
    rejection_reason text,
    cancellation_reason text
);


ALTER TABLE public.leave_requests OWNER TO postgres;

--
-- Name: leave_types; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.leave_types (
    leave_type_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    is_paid boolean DEFAULT true NOT NULL,
    max_days_per_year integer DEFAULT 0 NOT NULL,
    carry_forward_allowed boolean DEFAULT false NOT NULL,
    max_carry_forward_days integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "CHK_leave_types_carry_forward_consistency" CHECK ((carry_forward_allowed OR (max_carry_forward_days = 0))),
    CONSTRAINT "CHK_leave_types_carry_forward_days" CHECK ((max_carry_forward_days >= 0)),
    CONSTRAINT "CHK_leave_types_max_days" CHECK ((max_days_per_year >= 0))
);


ALTER TABLE public.leave_types OWNER TO postgres;

--
-- Name: loan_installments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.loan_installments (
    installment_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    loan_id uuid NOT NULL,
    period_id uuid,
    sequence integer DEFAULT 0 NOT NULL,
    amount numeric(14,2) DEFAULT 0 NOT NULL,
    status character varying(20) DEFAULT 'scheduled'::character varying NOT NULL,
    balance_after numeric(14,2),
    deducted_on timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_loan_installments_status CHECK (((status)::text = ANY ((ARRAY['scheduled'::character varying, 'deducted'::character varying, 'skipped'::character varying])::text[])))
);


ALTER TABLE public.loan_installments OWNER TO postgres;

--
-- Name: meeting_participants; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.meeting_participants (
    meeting_participant_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    meeting_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.meeting_participants OWNER TO postgres;

--
-- Name: meetings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.meetings (
    meeting_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    title character varying(200) NOT NULL,
    scheduled_at timestamp with time zone NOT NULL,
    location character varying(255),
    agenda text,
    audience_type character varying(20) DEFAULT 'Specific'::character varying NOT NULL,
    audience_department_id uuid,
    notify_email boolean DEFAULT true NOT NULL,
    notify_in_app boolean DEFAULT true NOT NULL,
    status character varying(20) DEFAULT 'Scheduled'::character varying NOT NULL,
    cancellation_reason text,
    organizer_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.meetings OWNER TO postgres;

--
-- Name: migrations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.migrations (
    id integer NOT NULL,
    "timestamp" bigint NOT NULL,
    name character varying NOT NULL
);


ALTER TABLE public.migrations OWNER TO postgres;

--
-- Name: migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.migrations_id_seq OWNER TO postgres;

--
-- Name: migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.migrations_id_seq OWNED BY public.migrations.id;


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notifications (
    notification_id uuid DEFAULT gen_random_uuid() NOT NULL,
    title character varying(200) NOT NULL,
    message text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by uuid,
    category character varying(40) DEFAULT 'General'::character varying NOT NULL,
    recipient_id uuid,
    read_at timestamp without time zone,
    link character varying(255),
    reference_id uuid,
    reference_type character varying(40),
    batch_id uuid,
    audience_type character varying(20) DEFAULT 'All'::character varying NOT NULL,
    audience_department_id uuid,
    attachment_url character varying(500),
    attachment_name character varying(255),
    attachment_mime character varying(100),
    attachment_size integer
);


ALTER TABLE public.notifications OWNER TO postgres;

--
-- Name: password_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.password_history (
    password_history_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    password_hash character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.password_history OWNER TO postgres;

--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.password_reset_tokens (
    password_reset_token_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    token_hash character varying(64) NOT NULL,
    delivery_email character varying(255) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    invalidated_at timestamp with time zone,
    created_by_user_id uuid,
    created_ip character varying(64),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.password_reset_tokens OWNER TO postgres;

--
-- Name: payroll; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payroll (
    payroll_id uuid DEFAULT gen_random_uuid() NOT NULL,
    payroll_month date NOT NULL,
    basic_salary numeric(12,2) NOT NULL,
    allowance numeric(12,2) DEFAULT 0 NOT NULL,
    bonus numeric(12,2) DEFAULT 0 NOT NULL,
    deduction numeric(12,2) DEFAULT 0 NOT NULL,
    tax numeric(12,2) DEFAULT 0 NOT NULL,
    net_salary numeric(12,2) NOT NULL,
    payment_date date NOT NULL,
    user_id uuid NOT NULL
);


ALTER TABLE public.payroll OWNER TO postgres;

--
-- Name: payroll_periods; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payroll_periods (
    period_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(100) NOT NULL,
    frequency character varying(20) DEFAULT 'monthly'::character varying NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    pay_date date,
    working_days integer DEFAULT 0 NOT NULL,
    status character varying(20) DEFAULT 'draft'::character varying NOT NULL,
    prepared_by uuid,
    approved_by uuid,
    processed_at timestamp with time zone,
    approved_at timestamp with time zone,
    locked_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_payroll_periods_status CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'processing'::character varying, 'pending_approval'::character varying, 'approved'::character varying, 'locked'::character varying, 'paid'::character varying])::text[])))
);


ALTER TABLE public.payroll_periods OWNER TO postgres;

--
-- Name: payroll_rules; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payroll_rules (
    rule_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    rule_type character varying(20) NOT NULL,
    name character varying(100) NOT NULL,
    scope_type character varying(20) DEFAULT 'company'::character varying NOT NULL,
    scope_id uuid,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    effective_from date,
    effective_to date,
    version integer DEFAULT 1 NOT NULL,
    superseded_by uuid,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_payroll_rules_scope CHECK (((scope_type)::text = ANY ((ARRAY['company'::character varying, 'job_category'::character varying, 'department'::character varying, 'designation'::character varying, 'employee'::character varying])::text[]))),
    CONSTRAINT chk_payroll_rules_type CHECK (((rule_type)::text = ANY ((ARRAY['absent'::character varying, 'late'::character varying, 'repeated_late'::character varying, 'leave'::character varying, 'overtime'::character varying, 'bonus'::character varying, 'appraisal'::character varying])::text[])))
);


ALTER TABLE public.payroll_rules OWNER TO postgres;

--
-- Name: payroll_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payroll_settings (
    id integer DEFAULT 1 NOT NULL,
    frequency character varying(20) DEFAULT 'monthly'::character varying NOT NULL,
    period_type character varying(20) DEFAULT 'calendar'::character varying NOT NULL,
    currency character varying(10) DEFAULT 'PKR'::character varying NOT NULL,
    working_days_source character varying(20) DEFAULT 'attendance'::character varying NOT NULL,
    fixed_working_days integer DEFAULT 26 NOT NULL,
    working_hours_per_day numeric(5,2) DEFAULT 8 NOT NULL,
    approval_enabled boolean DEFAULT false NOT NULL,
    auto_generate_payslip boolean DEFAULT true NOT NULL,
    employee_self_service boolean DEFAULT true NOT NULL,
    payroll_locking_enabled boolean DEFAULT true NOT NULL,
    payslip_close_day integer DEFAULT 20 NOT NULL,
    overtime_enabled boolean DEFAULT false NOT NULL,
    rounding character varying(10) DEFAULT 'nearest'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_payroll_settings_singleton CHECK ((id = 1))
);


ALTER TABLE public.payroll_settings OWNER TO postgres;

--
-- Name: payslip_lines; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payslip_lines (
    line_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    payslip_id uuid NOT NULL,
    component_id uuid,
    label character varying(100) NOT NULL,
    type character varying(20) NOT NULL,
    amount numeric(12,2) DEFAULT 0 NOT NULL,
    calc_note text,
    display_order integer DEFAULT 0 NOT NULL,
    CONSTRAINT chk_payslip_lines_type CHECK (((type)::text = ANY ((ARRAY['earning'::character varying, 'deduction'::character varying])::text[])))
);


ALTER TABLE public.payslip_lines OWNER TO postgres;

--
-- Name: payslips; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payslips (
    payslip_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    period_id uuid NOT NULL,
    user_id uuid NOT NULL,
    structure_id uuid,
    basic_salary numeric(12,2) DEFAULT 0 NOT NULL,
    gross_salary numeric(12,2) DEFAULT 0 NOT NULL,
    total_earnings numeric(12,2) DEFAULT 0 NOT NULL,
    total_deductions numeric(12,2) DEFAULT 0 NOT NULL,
    net_salary numeric(12,2) DEFAULT 0 NOT NULL,
    working_days integer DEFAULT 0 NOT NULL,
    present_days numeric(6,2) DEFAULT 0 NOT NULL,
    absent_days numeric(6,2) DEFAULT 0 NOT NULL,
    paid_leave_days numeric(6,2) DEFAULT 0 NOT NULL,
    unpaid_leave_days numeric(6,2) DEFAULT 0 NOT NULL,
    late_count integer DEFAULT 0 NOT NULL,
    overtime_hours numeric(6,2) DEFAULT 0 NOT NULL,
    overtime_amount numeric(12,2) DEFAULT 0 NOT NULL,
    status character varying(20) DEFAULT 'generated'::character varying NOT NULL,
    calculation_json jsonb,
    payment_date date,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.payslips OWNER TO postgres;

--
-- Name: performance_review_answers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.performance_review_answers (
    answer_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    answer_comment text,
    answered_percentage numeric(5,2) DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    review_id uuid NOT NULL,
    selected_option_id uuid,
    is_absent_auto_zero boolean DEFAULT false NOT NULL,
    form_question_id uuid
);


ALTER TABLE public.performance_review_answers OWNER TO postgres;

--
-- Name: performance_reviews; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.performance_reviews (
    review_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    review_period character varying(50) NOT NULL,
    review_date date NOT NULL,
    total_score_percentage numeric(5,2) DEFAULT 0 NOT NULL,
    comments text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    reviewer_id uuid NOT NULL,
    reviewee_id uuid NOT NULL,
    evaluation_type public.performance_reviews_evaluation_type_enum,
    status character varying(20) DEFAULT 'Draft'::character varying NOT NULL,
    form_id uuid,
    attendance_id uuid,
    recommendation text,
    submitted_at timestamp without time zone,
    locked_at timestamp without time zone,
    approved_by_user_id uuid,
    approved_at timestamp without time zone,
    is_auto_generated boolean DEFAULT false NOT NULL,
    form_version integer,
    CONSTRAINT "CHK_pr_status" CHECK (((status)::text = ANY ((ARRAY['Draft'::character varying, 'Submitted'::character varying, 'Approved'::character varying, 'Rejected'::character varying])::text[])))
);


ALTER TABLE public.performance_reviews OWNER TO postgres;

--
-- Name: COLUMN performance_reviews.form_version; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.performance_reviews.form_version IS 'Which version of the form this review was submitted against. NULL for reviews created before versioning was added (treated as version 1).';


--
-- Name: permissions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.permissions (
    permission_id uuid DEFAULT gen_random_uuid() NOT NULL,
    permission_name character varying(100) NOT NULL,
    description text
);


ALTER TABLE public.permissions OWNER TO postgres;

--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.refresh_tokens (
    refresh_token_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    token_hash character varying(64) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.refresh_tokens OWNER TO postgres;

--
-- Name: reimbursements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.reimbursements (
    reimbursement_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    title character varying(160) NOT NULL,
    category character varying(60) DEFAULT 'Other'::character varying NOT NULL,
    amount numeric(14,2) DEFAULT 0 NOT NULL,
    expense_date date NOT NULL,
    description text,
    receipt_url character varying(500),
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    decided_by uuid,
    decided_at timestamp with time zone,
    decision_note text,
    paid_period_id uuid,
    paid_payslip_id uuid,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_reimbursements_amount CHECK ((amount > (0)::numeric)),
    CONSTRAINT chk_reimbursements_status CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'paid'::character varying])::text[])))
);


ALTER TABLE public.reimbursements OWNER TO postgres;

--
-- Name: review_approvals; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.review_approvals (
    approval_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    review_id uuid NOT NULL,
    action character varying(20) NOT NULL,
    actor_user_id uuid,
    comment text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT "CHK_ra_action" CHECK (((action)::text = ANY ((ARRAY['SUBMIT'::character varying, 'APPROVE'::character varying, 'REJECT'::character varying, 'REOPEN'::character varying])::text[])))
);


ALTER TABLE public.review_approvals OWNER TO postgres;

--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.role_permissions (
    role_permission_id uuid DEFAULT gen_random_uuid() NOT NULL,
    role_id uuid NOT NULL,
    permission_id uuid NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.role_permissions OWNER TO postgres;

--
-- Name: roles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.roles (
    role_id uuid DEFAULT gen_random_uuid() NOT NULL,
    role_name character varying(50) NOT NULL,
    description text
);


ALTER TABLE public.roles OWNER TO postgres;

--
-- Name: salary_components; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.salary_components (
    component_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(100) NOT NULL,
    code character varying(40) NOT NULL,
    type character varying(20) NOT NULL,
    calculation_type character varying(20) NOT NULL,
    amount numeric(14,4) DEFAULT 0 NOT NULL,
    formula text,
    is_recurring boolean DEFAULT true NOT NULL,
    is_taxable boolean DEFAULT false NOT NULL,
    include_in_gross boolean DEFAULT true NOT NULL,
    include_in_overtime boolean DEFAULT false NOT NULL,
    include_in_leave_deduction boolean DEFAULT false NOT NULL,
    include_in_bonus boolean DEFAULT false NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    effective_from date,
    effective_to date,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_salary_components_calc CHECK (((calculation_type)::text = ANY ((ARRAY['fixed'::character varying, 'percent_basic'::character varying, 'percent_gross'::character varying, 'per_day'::character varying, 'per_hour'::character varying, 'formula'::character varying])::text[]))),
    CONSTRAINT chk_salary_components_type CHECK (((type)::text = ANY ((ARRAY['earning'::character varying, 'deduction'::character varying])::text[])))
);


ALTER TABLE public.salary_components OWNER TO postgres;

--
-- Name: salary_structure_assignments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.salary_structure_assignments (
    assignment_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    structure_id uuid NOT NULL,
    scope_type character varying(20) NOT NULL,
    scope_id uuid,
    base_salary numeric(12,2),
    effective_from date,
    effective_to date,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_ssa_scope CHECK (((scope_type)::text = ANY ((ARRAY['company'::character varying, 'job_category'::character varying, 'department'::character varying, 'designation'::character varying, 'employee'::character varying])::text[])))
);


ALTER TABLE public.salary_structure_assignments OWNER TO postgres;

--
-- Name: salary_structure_components; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.salary_structure_components (
    structure_component_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    structure_id uuid NOT NULL,
    component_id uuid NOT NULL,
    override_calculation_type character varying(20),
    override_amount numeric(14,4),
    override_formula text,
    display_order integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.salary_structure_components OWNER TO postgres;

--
-- Name: salary_structures; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.salary_structures (
    structure_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.salary_structures OWNER TO postgres;

--
-- Name: shifts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.shifts (
    shift_id uuid DEFAULT gen_random_uuid() NOT NULL,
    shift_name character varying(100) NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    grace_period_minutes integer DEFAULT 0 NOT NULL,
    status character varying(20) DEFAULT 'Active'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    break_duration_minutes integer DEFAULT 0 NOT NULL,
    CONSTRAINT "CHK_shifts_break_duration" CHECK ((break_duration_minutes >= 0))
);


ALTER TABLE public.shifts OWNER TO postgres;

--
-- Name: smtp_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.smtp_settings (
    id integer DEFAULT 1 NOT NULL,
    host character varying(255),
    port integer DEFAULT 587 NOT NULL,
    username character varying(255),
    password_encrypted text,
    encryption character varying(10) DEFAULT 'tls'::character varying NOT NULL,
    from_name character varying(150),
    from_email character varying(255),
    reply_to character varying(255),
    enabled boolean DEFAULT false NOT NULL,
    last_test_at timestamp with time zone,
    last_test_ok boolean,
    last_test_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "CHK_smtp_settings_encryption" CHECK (((encryption)::text = ANY ((ARRAY['none'::character varying, 'tls'::character varying, 'ssl'::character varying])::text[]))),
    CONSTRAINT "CHK_smtp_settings_single_row" CHECK ((id = 1))
);


ALTER TABLE public.smtp_settings OWNER TO postgres;

--
-- Name: tax_configs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tax_configs (
    tax_config_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(100) NOT NULL,
    regime character varying(60),
    currency character varying(3) DEFAULT 'PKR'::character varying NOT NULL,
    annualize boolean DEFAULT true NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    effective_from date,
    effective_to date,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.tax_configs OWNER TO postgres;

--
-- Name: tax_slabs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tax_slabs (
    slab_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tax_config_id uuid NOT NULL,
    lower_bound numeric(14,2) DEFAULT 0 NOT NULL,
    upper_bound numeric(14,2),
    base_tax numeric(14,2) DEFAULT 0 NOT NULL,
    rate_percent numeric(5,2) DEFAULT 0 NOT NULL,
    display_order integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.tax_slabs OWNER TO postgres;

--
-- Name: team_lead_assignment_members; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.team_lead_assignment_members (
    assignment_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.team_lead_assignment_members OWNER TO postgres;

--
-- Name: team_lead_assignments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.team_lead_assignments (
    assignment_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    team_lead_id uuid NOT NULL,
    mode character varying(20) NOT NULL,
    department_id uuid,
    created_by uuid,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT "CHK_tla_department_required" CHECK ((((mode)::text <> 'DEPARTMENT'::text) OR (department_id IS NOT NULL))),
    CONSTRAINT "CHK_tla_mode" CHECK (((mode)::text = ANY ((ARRAY['DEPARTMENT'::character varying, 'MEMBERS'::character varying])::text[])))
);


ALTER TABLE public.team_lead_assignments OWNER TO postgres;

--
-- Name: user_leave_balances; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_leave_balances (
    user_leave_balance_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    leave_type_id uuid NOT NULL,
    allocated_days numeric(6,2) DEFAULT 0 NOT NULL,
    used_days numeric(6,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "CHK_user_leave_balances_allocated" CHECK ((allocated_days >= (0)::numeric)),
    CONSTRAINT "CHK_user_leave_balances_used" CHECK ((used_days >= (0)::numeric))
);


ALTER TABLE public.user_leave_balances OWNER TO postgres;

--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    user_id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_code character varying(20) NOT NULL,
    first_name character varying(100) NOT NULL,
    last_name character varying(100) NOT NULL,
    email character varying(255) NOT NULL,
    password character varying NOT NULL,
    phone character varying(20),
    profile_image text,
    date_of_birth date,
    gender character varying(10),
    address text,
    employee_type character varying(30) NOT NULL,
    designation_id uuid,
    joining_date date NOT NULL,
    salary numeric(12,2),
    status boolean DEFAULT true NOT NULL,
    working_hours numeric(5,2),
    overtime_hours numeric(5,2),
    is_overtime boolean DEFAULT false NOT NULL,
    attendance_status character varying(20) DEFAULT 'Absent'::character varying NOT NULL,
    role_id uuid,
    department_id uuid,
    shift_id uuid,
    job_category_id uuid,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    street_address text,
    city character varying(100),
    state_province character varying(100),
    postal_code character varying(20),
    country character varying(100),
    emergency_contact_name character varying(150),
    emergency_contact_relationship character varying(60),
    emergency_contact_phone character varying(20),
    bank_name character varying(150),
    bank_account_number character varying(40),
    bank_routing_code character varying(34),
    blood_group character varying(5),
    login_enabled boolean DEFAULT true NOT NULL,
    password_reset_allowed boolean DEFAULT true NOT NULL,
    web_login_allowed boolean DEFAULT true NOT NULL,
    mobile_login_allowed boolean DEFAULT true NOT NULL,
    api_access_allowed boolean DEFAULT false NOT NULL,
    multi_device_login_allowed boolean DEFAULT true NOT NULL,
    remote_attendance_allowed boolean DEFAULT false NOT NULL,
    biometric_attendance_allowed boolean DEFAULT false NOT NULL,
    team_lead_id uuid,
    profile_image_thumb character varying(500),
    CONSTRAINT "CHK_users_team_lead_not_self" CHECK (((team_lead_id IS NULL) OR (team_lead_id <> user_id)))
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: working_day_schedules; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.working_day_schedules (
    schedule_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    department_id uuid,
    designation_id uuid,
    day_of_week smallint NOT NULL,
    is_working boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "CHK_working_day_schedules_dow" CHECK (((day_of_week >= 1) AND (day_of_week <= 7))),
    CONSTRAINT "CHK_working_day_schedules_scope" CHECK (((designation_id IS NULL) OR (department_id IS NOT NULL)))
);


ALTER TABLE public.working_day_schedules OWNER TO postgres;

--
-- Name: migrations id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.migrations ALTER COLUMN id SET DEFAULT nextval('public.migrations_id_seq'::regclass);


--
-- Data for Name: appraisal_form_assignments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.appraisal_form_assignments (assignment_id, form_id, department_id, designation_id, user_id, created_at, updated_at) FROM stdin;
b1343c76-2591-4bdc-8ecc-ae95889947c7	c36bdab2-6592-442f-b4b4-a02b59b4da0b	f04f68cc-db96-4411-926a-ce34cfc41fa0	\N	\N	2026-08-11 20:46:11.231913	2026-08-11 20:46:11.231913
bbe9c2fa-5483-486c-bde9-52d21291a081	c36bdab2-6592-442f-b4b4-a02b59b4da0b	\N	ef95a6ad-7c2e-4861-ab66-afa005e4469e	\N	2026-08-11 20:46:11.231913	2026-08-11 20:46:11.231913
18288724-37e0-417c-b461-9076a64a63dd	c36bdab2-6592-442f-b4b4-a02b59b4da0b	\N	3916c3d8-2428-4c10-9647-4a486094a428	\N	2026-08-11 20:46:11.231913	2026-08-11 20:46:11.231913
\.


--
-- Data for Name: appraisal_form_questions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.appraisal_form_questions (form_question_id, display_order, weight_percentage, is_required, created_at, updated_at, form_id, question_id, rating_scale, min_label, max_label, snapshot_text, snapshot_type, snapshot_options, is_active, description, snapshot_description, version, rating_min) FROM stdin;
8f1c3bf3-80c7-4d59-ab14-9d948acdf48e	1	33.33	t	2026-08-11 20:45:41.636292	2026-08-11 20:46:11.567675	c36bdab2-6592-442f-b4b4-a02b59b4da0b	1649313f-0fc2-4565-bfff-57ba30cf17a0	10	\N	\N	q1	rating	[]	t	\N	\N	1	1
23508bc2-ee6d-4a9e-ab6d-fd89d15f3477	2	33.33	t	2026-08-11 20:45:41.636292	2026-08-11 20:46:11.567675	c36bdab2-6592-442f-b4b4-a02b59b4da0b	c5524985-98c7-4457-8001-4ca70a09d880	10	\N	\N	q2	rating	[]	t	\N	\N	1	1
2ea5818f-e76c-4a2b-94c2-f7b61d251be0	3	33.34	t	2026-08-11 20:45:41.636292	2026-08-11 20:46:11.567675	c36bdab2-6592-442f-b4b4-a02b59b4da0b	3a88894c-0e07-43ab-9852-9d4183102e3f	10	\N	\N	q3	rating	[]	t	\N	\N	1	1
7515b22b-86d2-43ad-8afb-322cf0989cee	1	33.33	t	2026-08-12 10:14:52.001329	2026-08-12 10:14:52.001329	c36bdab2-6592-442f-b4b4-a02b59b4da0b	1649313f-0fc2-4565-bfff-57ba30cf17a0	10	\N	\N	\N	\N	\N	t	\N	\N	2	1
739cf4ec-1a87-4bc4-a239-3ee658950d2d	2	33.33	t	2026-08-12 10:14:52.001329	2026-08-12 10:14:52.001329	c36bdab2-6592-442f-b4b4-a02b59b4da0b	c5524985-98c7-4457-8001-4ca70a09d880	10	\N	\N	\N	\N	\N	t	\N	\N	2	1
3de54399-fc11-4c95-b5cf-b729c84fc185	3	33.34	t	2026-08-12 10:14:52.001329	2026-08-12 10:14:52.001329	c36bdab2-6592-442f-b4b4-a02b59b4da0b	3a88894c-0e07-43ab-9852-9d4183102e3f	10	\N	\N	\N	\N	\N	t	\N	\N	2	1
\.


--
-- Data for Name: appraisal_forms; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.appraisal_forms (form_id, form_name, description, evaluation_type, status, department_id, designation_id, created_by, is_active, created_at, updated_at, version) FROM stdin;
c36bdab2-6592-442f-b4b4-a02b59b4da0b	DAILY EVALUATION (Copy)	evaluate an employee for this day	Daily	Archived	\N	\N	5269a7da-0db6-49b8-97eb-c2d482cb611a	f	2026-08-11 20:45:41.636292	2026-08-12 17:28:56.700533	2
\.


--
-- Data for Name: appraisal_notifications; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.appraisal_notifications (notification_id, recipient_user_id, type, title, message, related_review_id, dedupe_key, is_read, created_at) FROM stdin;
c6c3d28a-0b01-4f4b-a8ed-9520517fd05b	c64f66c9-639f-4913-8d6e-0304d51f1c20	SHIFT_REMINDER	2 appraisal form(s) pending	Your shift ends at 12:00:00. Still pending: Ashan Mustafa, Taha Tayyab.	\N	SHIFT_REMINDER:c64f66c9-639f-4913-8d6e-0304d51f1c20:2026-08-12:dc4fa1fb-1b82-49fa-97be-9de7f89f8406	f	2026-08-12 11:00:00.05614
\.


--
-- Data for Name: appraisal_question_options; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.appraisal_question_options (option_id, option_text, score, display_order, question_id) FROM stdin;
\.


--
-- Data for Name: appraisal_questions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.appraisal_questions (question_id, question_text, question_type, is_active, created_at, updated_at) FROM stdin;
143e4596-f227-41c4-b959-2ad8517cde66	hhj	rating	t	2026-08-12 10:59:15.926051	2026-08-12 10:59:15.926051
1649313f-0fc2-4565-bfff-57ba30cf17a0	q1	rating	t	2026-08-11 20:45:00.24824	2026-08-11 20:45:00.24824
c5524985-98c7-4457-8001-4ca70a09d880	q2	rating	t	2026-08-11 20:45:00.24824	2026-08-11 20:45:00.24824
3a88894c-0e07-43ab-9852-9d4183102e3f	q3	rating	t	2026-08-11 20:45:00.24824	2026-08-11 20:45:00.24824
6f804287-1461-40df-b00f-e1a00aec1922	kjk	rating	t	2026-08-12 10:14:42.264844	2026-08-12 10:14:42.264844
\.


--
-- Data for Name: attendance; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.attendance (attendance_id, attendance_date, check_in, check_out, working_hours, attendance_status, overtime_hours, is_overtime, user_id, shift_id) FROM stdin;
c4f08797-7698-493c-8b25-6b3a27b8f32d	2026-08-10	\N	\N	\N	Absent	\N	f	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	dc4fa1fb-1b82-49fa-97be-9de7f89f8406
bf33f151-2aa4-4950-b07a-053a45823b6b	2026-08-10	15:54:55	\N	\N	Present	\N	f	5269a7da-0db6-49b8-97eb-c2d482cb611a	\N
523726d3-7842-4ff9-9543-301343d1864b	2026-08-11	\N	\N	\N	Absent	\N	f	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	dc4fa1fb-1b82-49fa-97be-9de7f89f8406
11926927-51da-45e3-a3d4-7af8fdfc084f	2026-08-11	16:00:32	17:26:31	1.43	Present	0.00	f	5269a7da-0db6-49b8-97eb-c2d482cb611a	\N
68d267c0-b119-4c66-a3bc-24f40237f931	2026-08-11	14:13:09	\N	\N	Absent	\N	f	c64f66c9-639f-4913-8d6e-0304d51f1c20	dc4fa1fb-1b82-49fa-97be-9de7f89f8406
cd7a930d-ffa3-4e4a-9221-a972b9f14192	2026-08-11	20:40:55	\N	\N	Present	\N	f	43af610e-e846-4f7c-88bd-c51fc43f0d12	dc4fa1fb-1b82-49fa-97be-9de7f89f8406
5e79473d-9a06-4a4f-9a35-7bebde0f5ff3	2026-08-12	\N	\N	\N	Absent	\N	f	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	dc4fa1fb-1b82-49fa-97be-9de7f89f8406
1a5834af-7bab-4e31-b981-e011b61c91c1	2026-08-12	\N	\N	\N	Absent	\N	f	c64f66c9-639f-4913-8d6e-0304d51f1c20	dc4fa1fb-1b82-49fa-97be-9de7f89f8406
df73f206-6e9f-45ba-9694-a89fc84a90d4	2026-08-12	\N	\N	\N	Absent	\N	f	43af610e-e846-4f7c-88bd-c51fc43f0d12	dc4fa1fb-1b82-49fa-97be-9de7f89f8406
9a5808c9-5ca0-4dfd-b39f-8e06507236f0	2026-08-12	10:51:05	14:03:23	3.20	Present	0.00	f	5269a7da-0db6-49b8-97eb-c2d482cb611a	\N
\.


--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.audit_logs (audit_log_id, actor_user_id, actor_email, action, entity_type, entity_id, before_state, after_state, ip_address, user_agent, created_at) FROM stdin;
4cb8efac-f952-49d2-9138-f58806591135	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	email.settings.update	smtp_settings	1	{"enabled": true}	{"enabled": false}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-08 20:47:34.683806+05
ba76b3f8-8cb5-42af-af34-9c277741f088	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	email.settings.update	smtp_settings	1	{"enabled": false}	{"enabled": true}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-09 02:36:20.60081+05
7d22ed57-fcaf-4c6c-8125-14b178887454	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	email.settings.test	smtp_settings	1	\N	{"to": "haseebiqbalxyz@gmail.com", "error": "Invalid login: 535-5.7.8 Username and Password not accepted. For more information, go to\\n535 5.7.8  https://support.google.com/mail/?p=BadCredentials ffacd0b85a97d-4800215078asm17003088f8f.12 - gsmtp", "result": "failed"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-09 02:36:31.916792+05
f25a2508-eae7-4aea-a655-c762e86a9238	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	employee.create	User	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	\N	{"city": "Bahawalpur", "email": "mudasseriqbal755@gmail.com", "phone": "+92 3479008279", "gender": "Male", "salary": 10, "status": true, "address": null, "country": "Pakistan", "user_id": "8b4ba86e-6f24-4eed-83b0-d5f191eb7adf", "password": "[REDACTED]", "payrolls": null, "teamLead": null, "bank_name": null, "last_name": "Iqbal", "attendance": null, "created_at": "2026-08-10T09:10:29.247Z", "first_name": "Muddasir", "updated_at": "2026-08-10T09:10:29.247Z", "blood_group": "B-", "is_overtime": false, "postal_code": "63100", "teamMembers": null, "joining_date": "2026-08-10T00:00:00.000Z", "reviewsGiven": null, "team_lead_id": null, "date_of_birth": "2000-01-01T00:00:00.000Z", "employee_code": "TC-EMP-004", "employee_type": "Full-Time", "leaveBalances": null, "leaveRequests": null, "login_enabled": true, "notifications": null, "profile_image": null, "working_hours": null, "overtime_hours": null, "state_province": "Punjab", "street_address": "House No 5 Ramzan Street Yasrab Town Shell Pump Bahawalpur", "reviewsReceived": null, "attendance_status": "Absent", "bank_routing_code": null, "web_login_allowed": true, "api_access_allowed": false, "bank_account_number": null, "profile_image_thumb": null, "mobile_login_allowed": true, "approvedLeaveRequests": null, "createdAppraisalForms": null, "receivedNotifications": null, "emergency_contact_name": "Muddasir Iqbal", "password_reset_allowed": "[REDACTED]", "emergency_contact_phone": "03479008279", "remote_attendance_allowed": false, "multi_device_login_allowed": true, "biometric_attendance_allowed": false, "emergency_contact_relationship": "Self"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-10 14:10:29.247165+05
afcb7b91-e81d-4ff2-8628-8d63e624237f	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	email.queue.cancel	email_queue	2b0bdf40-ff51-4ba4-ab6f-25937c00c862	{"status": "pending"}	{"status": "cancelled"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-10 14:17:34.149111+05
6d5c3422-cd15-4fb3-b6f8-377f2334df9d	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	email.queue.retry	email_queue	2b0bdf40-ff51-4ba4-ab6f-25937c00c862	{"status": "cancelled", "attempts": 2}	{"status": "pending", "attempts": 0}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-10 14:17:34.653155+05
3aba55dc-2cae-4a44-857f-fcc827d8c5c6	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	email.queue.cancel	email_queue	2b0bdf40-ff51-4ba4-ab6f-25937c00c862	{"status": "pending"}	{"status": "cancelled"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-10 14:17:35.458998+05
c33cf731-805b-4e34-b97f-4bdd1be463a8	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	email.queue.cancel	email_queue	262b6b5e-9748-47b1-9757-b510b9e55feb	{"status": "pending"}	{"status": "cancelled"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-10 14:17:36.269126+05
c41ab11f-a9b8-4043-b84f-0cbc5b33ae9a	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	email.queue.cancel	email_queue	4111bdba-21a3-44c1-9b42-06f120278c10	{"status": "pending"}	{"status": "cancelled"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-10 14:17:37.117548+05
ad66e446-c0ab-48b5-8c98-b04c54370341	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	email.queue.cancel	email_queue	3800869c-ef06-43f4-876c-fa92fbd12336	{"status": "pending"}	{"status": "cancelled"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-10 14:17:38.135171+05
2da9d963-f990-44be-a4c2-1ec6be71b799	\N	system@mail-queue	email.failed	email_queue	da9a4ca2-4332-4089-85ff-f708a8326da3	\N	{"to": "mudasseriqbal755@gmail.com", "error": "Invalid login: 535-5.7.8 Username and Password not accepted. For more information, go to\\n535 5.7.8  https://support.google.com/mail/?p=BadCredentials ffacd0b85a97d-4800215078asm34129778f8f.12 - gsmtp", "attempts": 5, "template_key": "meeting_invitation"}	\N	\N	2026-08-10 18:56:12.199555+05
58033fdb-353c-461a-a9d5-5bd6546dbfe9	\N	system@mail-queue	email.failed	email_queue	5f419562-e7f9-41e6-935b-af66d3990230	\N	{"to": "engmuhammadhaseebiqbal@gmail.com", "error": "Invalid login: 535-5.7.8 Username and Password not accepted. For more information, go to\\n535 5.7.8  https://support.google.com/mail/?p=BadCredentials 5b1f17b1804b1-4995427a4dcsm478337825e9.11 - gsmtp", "attempts": 5, "template_key": "meeting_invitation"}	\N	\N	2026-08-10 18:56:14.289057+05
e88ee108-a25d-49a5-af26-b6c60b3c14ab	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	appraisal.question.create	appraisal_questions	e56cdf3c-6679-4a5b-9afe-e73e7d98e333	\N	{"option_count": 0, "question_text": "hhghgh", "question_type": "rating"}	\N	\N	2026-08-10 19:25:43.731042+05
f713715d-5517-46c3-86e5-b84f0e7eb023	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	appraisal.question.delete	appraisal_questions	e56cdf3c-6679-4a5b-9afe-e73e7d98e333	{"question_text": "hhghgh", "question_type": "rating"}	\N	\N	\N	2026-08-10 19:25:48.707042+05
ab1eba20-cc16-4a69-b4a3-de455df50fa3	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	email.queue.cancel	email_queue	da9a4ca2-4332-4089-85ff-f708a8326da3	{"status": "failed"}	{"status": "cancelled"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-10 19:26:33.995828+05
d8aafef8-f141-4b3b-b94f-a6aa7d21b8bb	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	email.queue.cancel	email_queue	5f419562-e7f9-41e6-935b-af66d3990230	{"status": "failed"}	{"status": "cancelled"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-10 19:26:34.946023+05
17318029-b36e-4bf4-88d6-d403fcfc42a0	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	appraisal.question.create	appraisal_questions	6f804287-1461-40df-b00f-e1a00aec1922	\N	{"option_count": 0, "question_text": "kjk", "question_type": "rating"}	\N	\N	2026-08-12 10:14:42.264844+05
1b7cbe98-a2d9-42af-abd7-568916fd785b	5269a7da-0db6-49b8-97eb-c2d482cb611a	\N	appraisal.form.version	appraisal_forms	c36bdab2-6592-442f-b4b4-a02b59b4da0b	{"status": "Published", "version": 1}	{"status": "Draft", "version": 2}	\N	\N	2026-08-12 10:14:52.037969+05
426697e2-aabc-4ae0-87e0-8962ae1b33d0	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	employee.create	User	c64f66c9-639f-4913-8d6e-0304d51f1c20	\N	{"city": "Manila Mertro", "email": "general@clickupmarket.com", "phone": "+92 3014485957", "gender": "Male", "salary": 599999.91, "status": true, "address": null, "country": "Pakistan", "user_id": "c64f66c9-639f-4913-8d6e-0304d51f1c20", "password": "[REDACTED]", "payrolls": null, "teamLead": null, "bank_name": null, "last_name": "Mustafa", "attendance": null, "created_at": "2026-08-11T03:49:33.346Z", "first_name": "Ashan", "updated_at": "2026-08-11T03:49:33.346Z", "blood_group": null, "is_overtime": false, "postal_code": "44000", "teamMembers": null, "joining_date": "2026-08-11T00:00:00.000Z", "reviewsGiven": null, "team_lead_id": null, "date_of_birth": "2000-01-01T00:00:00.000Z", "employee_code": "TC-EMP-005", "employee_type": "Full-Time", "leaveBalances": null, "leaveRequests": null, "login_enabled": true, "notifications": null, "profile_image": null, "working_hours": null, "overtime_hours": null, "state_province": "Punjab", "street_address": "Main Road Lahore", "reviewsReceived": null, "attendance_status": "Absent", "bank_routing_code": null, "web_login_allowed": true, "api_access_allowed": false, "bank_account_number": null, "profile_image_thumb": null, "mobile_login_allowed": true, "approvedLeaveRequests": null, "createdAppraisalForms": null, "receivedNotifications": null, "emergency_contact_name": null, "password_reset_allowed": "[REDACTED]", "emergency_contact_phone": null, "remote_attendance_allowed": false, "multi_device_login_allowed": true, "biometric_attendance_allowed": false, "emergency_contact_relationship": null}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-11 08:49:33.346518+05
637c7f86-f111-44ab-a5d6-2e9f08c2935f	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	employee.update	User	c64f66c9-639f-4913-8d6e-0304d51f1c20	{"joining_date": "2026-08-11", "date_of_birth": "2000-01-01"}	{"joining_date": "2026-08-11T00:00:00.000Z", "date_of_birth": "2000-01-01T00:00:00.000Z"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-11 08:51:17.296443+05
99f33569-3b8d-4496-bc20-aada6cf36569	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	employee.password.reset	User	c64f66c9-639f-4913-8d6e-0304d51f1c20	\N	{"password_reset": "[REDACTED]", "require_change_on_next_login": false}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-11 08:51:18.783139+05
809dada0-dae8-45a6-89b6-4efcc1b4cbd0	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	employee.leave-types.assign	User	c64f66c9-639f-4913-8d6e-0304d51f1c20	{"leave_types": []}	{"leave_types": []}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-11 08:51:18.844833+05
99b4c2bb-01f1-4f48-800e-c8b3e82c933d	\N	system@mail-queue	email.failed	email_queue	810c08f9-d70f-4c2d-a744-fff7bfa89ff2	\N	{"to": "general@clickupmarket.com", "error": "Stored SMTP password could not be decrypted. It may have been written with a different SMTP_ENCRYPTION_KEY — re-enter the password in SMTP settings.", "attempts": 5, "template_key": "account_created"}	\N	\N	2026-08-11 10:11:20.070729+05
e6185c4b-9351-4b37-ad72-9434a3706626	\N	system@mail-queue	email.failed	email_queue	7dfb30c8-903a-4996-a768-7eadef4c77f0	\N	{"to": "general@clickupmarket.com", "error": "Stored SMTP password could not be decrypted. It may have been written with a different SMTP_ENCRYPTION_KEY — re-enter the password in SMTP settings.", "attempts": 5, "template_key": "welcome_employee"}	\N	\N	2026-08-11 10:11:20.121766+05
090df455-b25f-47a1-9474-bf105797aa79	\N	system@mail-queue	email.failed	email_queue	a9c8e6fb-7339-4eb5-8a35-54e3f41e7690	\N	{"to": "general@clickupmarket.com", "error": "Stored SMTP password could not be decrypted. It may have been written with a different SMTP_ENCRYPTION_KEY — re-enter the password in SMTP settings.", "attempts": 5, "template_key": "admin_reset_notification"}	\N	\N	2026-08-11 10:13:00.026279+05
8cb35e9c-9a5f-4610-a4af-14aa49a2e9ca	\N	system@mail-queue	email.failed	email_queue	3dc3bf4a-9838-4431-af72-a0a6f7c5a609	\N	{"to": "general@clickupmarket.com", "error": "Stored SMTP password could not be decrypted. It may have been written with a different SMTP_ENCRYPTION_KEY — re-enter the password in SMTP settings.", "attempts": 5, "template_key": "profile_updated"}	\N	\N	2026-08-11 10:13:00.038803+05
8a0a1970-bd46-432b-8a81-ab438943d808	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	email.queue.cancel	email_queue	a9c8e6fb-7339-4eb5-8a35-54e3f41e7690	{"status": "failed"}	{"status": "cancelled"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-11 17:49:51.086595+05
add7dd3c-63c4-4ccd-aabe-21a29e95c48d	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	email.queue.cancel	email_queue	3dc3bf4a-9838-4431-af72-a0a6f7c5a609	{"status": "failed"}	{"status": "cancelled"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-11 17:49:52.829856+05
edf7b654-dd33-483c-8d42-02b3b1558ade	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	email.queue.cancel	email_queue	7dfb30c8-903a-4996-a768-7eadef4c77f0	{"status": "failed"}	{"status": "cancelled"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-11 17:49:54.619666+05
257ae27b-1707-49e6-8e99-95c0fb449569	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	email.queue.cancel	email_queue	810c08f9-d70f-4c2d-a744-fff7bfa89ff2	{"status": "failed"}	{"status": "cancelled"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-11 17:49:56.24031+05
798e067c-b288-4ae6-bb16-bf54daa6d489	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	employee.update	User	c64f66c9-639f-4913-8d6e-0304d51f1c20	{"updated_at": "2026-08-11T03:51:18.762Z", "joining_date": "2026-08-11", "date_of_birth": "2000-01-01"}	{"updated_at": "2026-08-11T14:20:29.222Z", "joining_date": "2026-08-11T00:00:00.000Z", "date_of_birth": "2000-01-01T00:00:00.000Z"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-11 19:20:29.22265+05
77393814-4868-440a-ba39-580ef24b75a0	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	employee.leave-types.assign	User	c64f66c9-639f-4913-8d6e-0304d51f1c20	{"leave_types": []}	{"leave_types": []}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-11 19:20:29.436755+05
4b68f086-0a43-4fa4-b782-1374b0ccd7fb	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	employee.password.reset_link.sent	User	5269a7da-0db6-49b8-97eb-c2d482cb611a	\N	{"queued": true, "expires_at": "2026-08-11T15:39:00.034Z", "delivery_email": "engmuhammadhaseebiqbal@gmail.com", "issued_by_admin": false}	127.0.0.1	\N	2026-08-11 19:39:00.208865+05
71cfc9e8-2b8b-46e0-9a42-7b2a21af5284	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	email.queue.cancel	email_queue	9086c17a-2f9d-4c95-9e65-67fd8d7b33d1	{"status": "pending"}	{"status": "cancelled"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-11 19:41:58.9803+05
2b89a46a-38f2-405f-9aa6-948b1db9b0ba	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	email.queue.cancel	email_queue	ce5f7a01-848f-4036-aee1-cb399b595181	{"status": "pending"}	{"status": "cancelled"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-11 19:42:00.040094+05
2d2b0f4f-9e4c-42ce-b028-1315b70a8a00	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	employee.create	User	43af610e-e846-4f7c-88bd-c51fc43f0d12	\N	{"city": "Lahore", "email": "taa@gmail.com", "phone": "+92 123456789", "gender": "Male", "salary": 50000, "status": true, "address": null, "country": "Pakistan", "user_id": "43af610e-e846-4f7c-88bd-c51fc43f0d12", "password": "[REDACTED]", "payrolls": null, "teamLead": null, "bank_name": "js", "last_name": "Tayyab", "attendance": null, "created_at": "2026-08-11T15:36:08.080Z", "first_name": "Taha", "updated_at": "2026-08-11T15:36:08.080Z", "blood_group": "AB+", "is_overtime": false, "postal_code": "44000", "teamMembers": null, "joining_date": "2026-08-11T00:00:00.000Z", "reviewsGiven": null, "team_lead_id": "c64f66c9-639f-4913-8d6e-0304d51f1c20", "date_of_birth": "2000-01-01T00:00:00.000Z", "employee_code": "TC-EMP-006", "employee_type": "Full-Time", "leaveBalances": null, "leaveRequests": null, "login_enabled": true, "notifications": null, "profile_image": null, "working_hours": null, "overtime_hours": null, "state_province": "Punjab", "street_address": "Main Road Lahore", "reviewsReceived": null, "attendance_status": "Absent", "bank_routing_code": null, "web_login_allowed": true, "api_access_allowed": false, "bank_account_number": "1234567890", "profile_image_thumb": null, "mobile_login_allowed": true, "approvedLeaveRequests": null, "createdAppraisalForms": null, "receivedNotifications": null, "emergency_contact_name": null, "password_reset_allowed": "[REDACTED]", "emergency_contact_phone": null, "remote_attendance_allowed": false, "multi_device_login_allowed": true, "biometric_attendance_allowed": false, "emergency_contact_relationship": null}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-11 20:36:08.080072+05
71333a44-de5a-4ab1-804d-9bf992ae30cd	43af610e-e846-4f7c-88bd-c51fc43f0d12	taa@gmail.com	leave-request.create	LeaveRequest	86085c15-dcea-460c-8bce-57376a7e3b85	\N	{"status": "Pending", "end_date": "2026-08-12", "days_count": null, "leave_type": "Annual Leave", "start_date": "2026-08-12"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-11 20:37:56.030755+05
897e15ca-3f9b-4e68-8410-5e3275f90843	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	leave-request.update	LeaveRequest	86085c15-dcea-460c-8bce-57376a7e3b85	{"status": "Pending", "end_date": "2026-08-12", "days_count": null, "start_date": "2026-08-12"}	{"status": "Rejected", "end_date": "2026-08-12", "days_count": null, "start_date": "2026-08-12"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-11 20:39:23.86986+05
e676c458-ab86-46e9-8499-afccfa74eca1	c64f66c9-639f-4913-8d6e-0304d51f1c20	general@clickupmarket.com	appraisal.review.submit	performance_reviews	e096814b-0d8a-4160-aa9c-31e534068f4d	\N	{"status": "Submitted", "answers": 3, "form_id": "c36bdab2-6592-442f-b4b4-a02b59b4da0b", "reviewee_id": "c64f66c9-639f-4913-8d6e-0304d51f1c20", "review_period": "2026-08-11"}	\N	\N	2026-08-11 20:48:43.77159+05
fcad1bdb-a9b5-432b-8849-3fec2cc2787f	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	leave-entitlement.change	LeaveEntitlement	a8069042-af10-487b-a687-18852d1bcc45	\N	{"days": 10, "mode": "set", "year": 2026, "delta": 10, "user_id": "43af610e-e846-4f7c-88bd-c51fc43f0d12", "leave_type_id": "d13488b5-e96b-4e1c-8407-66086af68c00", "new_allocated": 30}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-11 21:15:09.609626+05
063fce85-e1a9-4cb4-a5f2-79d2b2dafd3f	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	leave-entitlement.bulk-assign	LeaveEntitlement	\N	\N	{"days": 10, "mode": "set", "year": 2026, "leave_type_id": "d13488b5-e96b-4e1c-8407-66086af68c00", "affected_users": ["43af610e-e846-4f7c-88bd-c51fc43f0d12"]}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-11 21:15:09.609626+05
6e2c82a6-ec6d-4f40-92c6-80dde08bc862	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	leave-entitlement.change	LeaveEntitlement	a8069042-af10-487b-a687-18852d1bcc45	\N	{"days": 30, "mode": "set", "year": 2026, "delta": 20, "user_id": "43af610e-e846-4f7c-88bd-c51fc43f0d12", "leave_type_id": "d13488b5-e96b-4e1c-8407-66086af68c00", "new_allocated": 50}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-11 21:15:56.399627+05
18b65042-df17-4b8c-aa40-6acd1077fce9	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	leave-entitlement.bulk-assign	LeaveEntitlement	\N	\N	{"days": 30, "mode": "set", "year": 2026, "leave_type_id": "d13488b5-e96b-4e1c-8407-66086af68c00", "affected_users": ["43af610e-e846-4f7c-88bd-c51fc43f0d12"]}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-11 21:15:56.399627+05
c93ad9ce-c32e-4107-8195-a8250e400469	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	leave-entitlement.change	LeaveEntitlement	a8069042-af10-487b-a687-18852d1bcc45	\N	{"days": 50, "mode": "deduct", "year": 2026, "delta": -50, "user_id": "43af610e-e846-4f7c-88bd-c51fc43f0d12", "leave_type_id": "d13488b5-e96b-4e1c-8407-66086af68c00", "new_allocated": 0}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-11 21:16:19.114823+05
12a4d471-dade-4b0c-9040-93ae10ef77c3	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	leave-entitlement.bulk-assign	LeaveEntitlement	\N	\N	{"days": 50, "mode": "deduct", "year": 2026, "leave_type_id": "d13488b5-e96b-4e1c-8407-66086af68c00", "affected_users": ["43af610e-e846-4f7c-88bd-c51fc43f0d12"]}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-11 21:16:19.114823+05
2f94d737-7922-4e87-a7ae-4baafcb0caab	\N	system@mail-queue	email.failed	email_queue	617caf16-cc17-4d2e-8ccf-ebbe4fca195c	\N	{"to": "taa@gmail.com", "error": "Stored SMTP password could not be decrypted. It may have been written with a different SMTP_ENCRYPTION_KEY — re-enter the password in SMTP settings.", "attempts": 5, "template_key": "account_created"}	\N	\N	2026-08-11 21:57:50.032295+05
e2f70434-78fd-40c6-af98-32a20b5d2042	\N	system@mail-queue	email.failed	email_queue	f80fc3c4-b262-46f0-b67a-02575d35f2bb	\N	{"to": "taa@gmail.com", "error": "Stored SMTP password could not be decrypted. It may have been written with a different SMTP_ENCRYPTION_KEY — re-enter the password in SMTP settings.", "attempts": 5, "template_key": "welcome_employee"}	\N	\N	2026-08-11 21:57:50.053705+05
beb4333e-3e47-4a46-b130-10ecce99e2b8	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	leave-entitlement.change	LeaveEntitlement	a8069042-af10-487b-a687-18852d1bcc45	\N	{"days": 14, "mode": "increase", "year": 2026, "delta": 14, "user_id": "43af610e-e846-4f7c-88bd-c51fc43f0d12", "leave_type_id": "d13488b5-e96b-4e1c-8407-66086af68c00", "new_allocated": 14}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-12 09:51:54.873978+05
54e4a6d6-0f5e-4451-a0f2-30a5651ebcc8	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	leave-entitlement.bulk-assign	LeaveEntitlement	\N	\N	{"days": 14, "mode": "increase", "year": 2026, "leave_type_id": "d13488b5-e96b-4e1c-8407-66086af68c00", "affected_users": ["43af610e-e846-4f7c-88bd-c51fc43f0d12"]}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-12 09:51:54.873978+05
a7b32212-56d3-4702-9541-2777c727f0fa	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	employee.password.reset_link.sent	User	5269a7da-0db6-49b8-97eb-c2d482cb611a	\N	{"queued": true, "expires_at": "2026-08-12T06:39:36.294Z", "delivery_email": "engmuhammadhaseebiqbal@gmail.com", "issued_by_admin": false}	127.0.0.1	\N	2026-08-12 10:39:36.444559+05
50b913e1-9218-44f0-aac8-633c4d0d3629	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	appraisal.question.create	appraisal_questions	143e4596-f227-41c4-b959-2ad8517cde66	\N	{"option_count": 0, "question_text": "hhj", "question_type": "rating"}	\N	\N	2026-08-12 10:59:15.926051+05
86707195-4874-414f-b9d7-95047db3a858	\N	system@mail-queue	email.failed	email_queue	a0aeb61d-86fb-47ad-a335-6b498adab8f8	\N	{"to": "engmuhammadhaseebiqbal@gmail.com", "error": "Stored SMTP password could not be decrypted. It may have been written with a different SMTP_ENCRYPTION_KEY — re-enter the password in SMTP settings.", "attempts": 5, "template_key": "password_reset"}	\N	\N	2026-08-12 12:22:19.5277+05
1a042433-8f92-4139-95ae-90767efc8c39	\N	system@mail-queue	email.failed	email_queue	6d1d3bb9-9db6-4b60-aa80-016bc78a2a2e	\N	{"to": "general@clickupmarket.com", "error": "Stored SMTP password could not be decrypted. It may have been written with a different SMTP_ENCRYPTION_KEY — re-enter the password in SMTP settings.", "attempts": 5, "template_key": "appraisal_pending_reminder"}	\N	\N	2026-08-12 12:22:19.646398+05
3e0419bd-9652-45ee-83fe-6d72945390ab	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	leave-entitlement.change	LeaveEntitlement	2acdf773-40e5-4059-a6ff-0296f6903f2d	\N	{"days": 30, "mode": "set", "year": 2026, "delta": 30, "user_id": "8b4ba86e-6f24-4eed-83b0-d5f191eb7adf", "leave_type_id": "d13488b5-e96b-4e1c-8407-66086af68c00", "new_allocated": 50}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-12 12:49:35.037046+05
57bd684a-d353-4f2f-829e-9a50c0ded67a	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	leave-entitlement.bulk-assign	LeaveEntitlement	\N	\N	{"days": 30, "mode": "set", "year": 2026, "leave_type_id": "d13488b5-e96b-4e1c-8407-66086af68c00", "affected_users": ["8b4ba86e-6f24-4eed-83b0-d5f191eb7adf"]}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-12 12:49:35.037046+05
7a87e45a-2201-44d6-8c6f-c9dec4703a70	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	leave-entitlement.change	LeaveEntitlement	2acdf773-40e5-4059-a6ff-0296f6903f2d	\N	{"days": 35, "mode": "deduct", "year": 2026, "delta": -35, "user_id": "8b4ba86e-6f24-4eed-83b0-d5f191eb7adf", "leave_type_id": "d13488b5-e96b-4e1c-8407-66086af68c00", "new_allocated": 15}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-12 12:50:48.343286+05
a1165bf3-04a9-4724-89c4-ef5fb1efe1a5	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	leave-entitlement.bulk-assign	LeaveEntitlement	\N	\N	{"days": 35, "mode": "deduct", "year": 2026, "leave_type_id": "d13488b5-e96b-4e1c-8407-66086af68c00", "affected_users": ["8b4ba86e-6f24-4eed-83b0-d5f191eb7adf"]}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-12 12:50:48.343286+05
576f717b-c7a7-498d-b8f5-709203f59fa4	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	leave-entitlement.change	LeaveEntitlement	b6dfa2dc-91a8-4983-bccd-791b649fdd67	\N	{"days": 14, "mode": "increase", "year": 2026, "delta": 14, "user_id": "8b4ba86e-6f24-4eed-83b0-d5f191eb7adf", "leave_type_id": "588ad7bd-2e0c-40bd-bd0b-d4618b340e5c", "new_allocated": 14}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-12 13:18:05.753545+05
2ae6c9c2-8e2e-4794-a9c1-28350d0b8927	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	leave-entitlement.bulk-assign	LeaveEntitlement	\N	\N	{"days": 14, "mode": "increase", "year": 2026, "leave_type_id": "588ad7bd-2e0c-40bd-bd0b-d4618b340e5c", "affected_users": ["8b4ba86e-6f24-4eed-83b0-d5f191eb7adf"]}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-12 13:18:05.753545+05
61119ca7-6129-471a-b586-2f65b8bc6e5f	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	leave-entitlement.change	LeaveEntitlement	a8069042-af10-487b-a687-18852d1bcc45	\N	{"days": 14, "mode": "increase", "year": 2026, "delta": 14, "user_id": "43af610e-e846-4f7c-88bd-c51fc43f0d12", "leave_type_id": "d13488b5-e96b-4e1c-8407-66086af68c00", "new_allocated": 28}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-12 13:50:10.635154+05
b8440ac8-3117-4ee9-b895-86f8b1fb2982	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	leave-entitlement.bulk-assign	LeaveEntitlement	\N	\N	{"days": 14, "mode": "increase", "year": 2026, "leave_type_id": "d13488b5-e96b-4e1c-8407-66086af68c00", "affected_users": ["43af610e-e846-4f7c-88bd-c51fc43f0d12"]}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-12 13:50:10.635154+05
cd4e3564-00dd-4b1b-aff3-25f2b565ed93	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	leave-entitlement.change	LeaveEntitlement	acfd0ee9-49f2-4a77-a33b-467ed53e7b87	\N	{"days": 14, "mode": "increase", "year": 2026, "delta": 14, "user_id": "43af610e-e846-4f7c-88bd-c51fc43f0d12", "leave_type_id": "a27de783-fc24-4e40-a56c-9d88bd2149d0", "new_allocated": 19}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-12 13:50:10.737175+05
703e624c-f1a8-40cb-b1bf-7f8de118e86b	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	leave-entitlement.bulk-assign	LeaveEntitlement	\N	\N	{"days": 14, "mode": "increase", "year": 2026, "leave_type_id": "a27de783-fc24-4e40-a56c-9d88bd2149d0", "affected_users": ["43af610e-e846-4f7c-88bd-c51fc43f0d12"]}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-12 13:50:10.737175+05
aa458ac9-523e-4e7b-aeef-ee6c4b7c55db	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	leave-entitlement.change	LeaveEntitlement	0854971f-a56b-4bfa-b032-ddb44aec0d68	\N	{"days": 14, "mode": "increase", "year": 2026, "delta": 14, "user_id": "43af610e-e846-4f7c-88bd-c51fc43f0d12", "leave_type_id": "588ad7bd-2e0c-40bd-bd0b-d4618b340e5c", "new_allocated": 24}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-12 13:50:10.772433+05
4ee2d6aa-fc7e-49b9-baf1-d8c15ce11dba	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	leave-entitlement.bulk-assign	LeaveEntitlement	\N	\N	{"days": 14, "mode": "increase", "year": 2026, "leave_type_id": "588ad7bd-2e0c-40bd-bd0b-d4618b340e5c", "affected_users": ["43af610e-e846-4f7c-88bd-c51fc43f0d12"]}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-12 13:50:10.772433+05
9d148a47-dd21-41e5-b979-de2652712dea	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	leave-entitlement.change	LeaveEntitlement	25e855a0-f44d-4db6-925b-85ba36a61683	\N	{"days": 14, "mode": "increase", "year": 2026, "delta": 14, "user_id": "43af610e-e846-4f7c-88bd-c51fc43f0d12", "leave_type_id": "ea84a0d7-bc22-44c2-8c9f-701ea0dd087d", "new_allocated": 28}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-12 13:50:10.808638+05
045d8ddb-4e86-4760-95fd-fe27fd29685b	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	leave-entitlement.bulk-assign	LeaveEntitlement	\N	\N	{"days": 14, "mode": "increase", "year": 2026, "leave_type_id": "ea84a0d7-bc22-44c2-8c9f-701ea0dd087d", "affected_users": ["43af610e-e846-4f7c-88bd-c51fc43f0d12"]}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-12 13:50:10.808638+05
72874928-7986-42bb-ba8b-b085556e12b5	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	leave-entitlement.change	LeaveEntitlement	27cb594e-ee50-49ee-80e6-297f02f590d9	\N	{"days": 14, "mode": "increase", "year": 2026, "delta": 14, "user_id": "43af610e-e846-4f7c-88bd-c51fc43f0d12", "leave_type_id": "f9142969-dfb1-4670-a3fe-43177f6941cf", "new_allocated": 24}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-12 13:50:10.845367+05
cbc1c66a-7377-4491-817f-049b1e6a1162	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	leave-entitlement.bulk-assign	LeaveEntitlement	\N	\N	{"days": 14, "mode": "increase", "year": 2026, "leave_type_id": "f9142969-dfb1-4670-a3fe-43177f6941cf", "affected_users": ["43af610e-e846-4f7c-88bd-c51fc43f0d12"]}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-12 13:50:10.845367+05
dd51b65a-4fbb-498f-9e63-97a5bb318b01	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	leave-entitlement.change	LeaveEntitlement	2dd7b853-4c98-4317-b77b-c0dac11a2ce9	\N	{"days": 14, "mode": "increase", "year": 2026, "delta": 14, "user_id": "43af610e-e846-4f7c-88bd-c51fc43f0d12", "leave_type_id": "42d6822e-d8fa-4801-a9ec-70f25a39aab5", "new_allocated": 14}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-12 13:50:10.883121+05
7b08409f-f6a3-4597-a321-8cc79c21b38c	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	leave-entitlement.bulk-assign	LeaveEntitlement	\N	\N	{"days": 14, "mode": "increase", "year": 2026, "leave_type_id": "42d6822e-d8fa-4801-a9ec-70f25a39aab5", "affected_users": ["43af610e-e846-4f7c-88bd-c51fc43f0d12"]}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-12 13:50:10.883121+05
11c84c4e-fc93-4d32-8467-85a8c2d0a5bf	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	leave-entitlement.change	LeaveEntitlement	5032b277-65d6-4630-99c9-b72e8da06265	\N	{"days": 14, "mode": "increase", "year": 2026, "delta": 14, "user_id": "c64f66c9-639f-4913-8d6e-0304d51f1c20", "leave_type_id": "d13488b5-e96b-4e1c-8407-66086af68c00", "new_allocated": 14}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-12 13:58:06.434047+05
2e4d5152-372b-4412-ac18-9f23a504d4e8	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	leave-entitlement.change	LeaveEntitlement	2acdf773-40e5-4059-a6ff-0296f6903f2d	\N	{"days": 14, "mode": "increase", "year": 2026, "delta": 14, "user_id": "8b4ba86e-6f24-4eed-83b0-d5f191eb7adf", "leave_type_id": "d13488b5-e96b-4e1c-8407-66086af68c00", "new_allocated": 29}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-12 13:58:06.434047+05
b588df5f-b50f-4ba8-ab23-86e99ba44441	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	leave-entitlement.change	LeaveEntitlement	a8069042-af10-487b-a687-18852d1bcc45	\N	{"days": 14, "mode": "increase", "year": 2026, "delta": 14, "user_id": "43af610e-e846-4f7c-88bd-c51fc43f0d12", "leave_type_id": "d13488b5-e96b-4e1c-8407-66086af68c00", "new_allocated": 42}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-12 13:58:06.434047+05
5212967a-11a2-409f-81c3-8df210eee213	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	leave-entitlement.bulk-assign	LeaveEntitlement	\N	\N	{"days": 14, "mode": "increase", "year": 2026, "leave_type_id": "d13488b5-e96b-4e1c-8407-66086af68c00", "affected_users": ["c64f66c9-639f-4913-8d6e-0304d51f1c20", "8b4ba86e-6f24-4eed-83b0-d5f191eb7adf", "43af610e-e846-4f7c-88bd-c51fc43f0d12"]}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-12 13:58:06.434047+05
b30673ed-670f-4241-9b9f-a9b75cfb7f83	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	leave-entitlement.change	LeaveEntitlement	8d772e9b-4a76-4073-a827-f848aa16d129	\N	{"days": 14, "mode": "increase", "year": 2026, "delta": 14, "user_id": "c64f66c9-639f-4913-8d6e-0304d51f1c20", "leave_type_id": "42d6822e-d8fa-4801-a9ec-70f25a39aab5", "new_allocated": 14}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-12 13:58:06.662107+05
7e410895-11bb-434f-b720-d20016d063e7	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	leave-entitlement.change	LeaveEntitlement	593dabdd-86d2-4fa4-a89b-4a94ba0cada0	\N	{"days": 14, "mode": "increase", "year": 2026, "delta": 14, "user_id": "8b4ba86e-6f24-4eed-83b0-d5f191eb7adf", "leave_type_id": "42d6822e-d8fa-4801-a9ec-70f25a39aab5", "new_allocated": 14}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-12 13:58:06.662107+05
8b293639-795d-4a87-b73f-bdd89f636dcc	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	leave-entitlement.change	LeaveEntitlement	2dd7b853-4c98-4317-b77b-c0dac11a2ce9	\N	{"days": 14, "mode": "increase", "year": 2026, "delta": 14, "user_id": "43af610e-e846-4f7c-88bd-c51fc43f0d12", "leave_type_id": "42d6822e-d8fa-4801-a9ec-70f25a39aab5", "new_allocated": 28}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-12 13:58:06.662107+05
3f55503b-048e-4526-9a7b-f16ea151d909	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	leave-entitlement.bulk-assign	LeaveEntitlement	\N	\N	{"days": 14, "mode": "increase", "year": 2026, "leave_type_id": "42d6822e-d8fa-4801-a9ec-70f25a39aab5", "affected_users": ["c64f66c9-639f-4913-8d6e-0304d51f1c20", "8b4ba86e-6f24-4eed-83b0-d5f191eb7adf", "43af610e-e846-4f7c-88bd-c51fc43f0d12"]}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-12 13:58:06.662107+05
4f8b1c1a-aae1-46a4-ae54-55d11f7108e0	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	leave-entitlement.change	LeaveEntitlement	a63323c7-e651-4a10-ba95-19cf0427f3be	\N	{"days": 14, "mode": "increase", "year": 2026, "delta": 14, "user_id": "c64f66c9-639f-4913-8d6e-0304d51f1c20", "leave_type_id": "f9142969-dfb1-4670-a3fe-43177f6941cf", "new_allocated": 14}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-12 13:58:06.724575+05
7d7b7c5f-1563-4b49-8160-84984ac302ab	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	leave-entitlement.change	LeaveEntitlement	8a417b8a-ac66-4d4d-bf94-5e4ff23106c9	\N	{"days": 14, "mode": "increase", "year": 2026, "delta": 14, "user_id": "8b4ba86e-6f24-4eed-83b0-d5f191eb7adf", "leave_type_id": "f9142969-dfb1-4670-a3fe-43177f6941cf", "new_allocated": 14}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-12 13:58:06.724575+05
991739f8-7292-48c0-8625-7e942e371c93	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	leave-entitlement.change	LeaveEntitlement	27cb594e-ee50-49ee-80e6-297f02f590d9	\N	{"days": 14, "mode": "increase", "year": 2026, "delta": 14, "user_id": "43af610e-e846-4f7c-88bd-c51fc43f0d12", "leave_type_id": "f9142969-dfb1-4670-a3fe-43177f6941cf", "new_allocated": 38}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-12 13:58:06.724575+05
7134a6cb-5d78-4111-a25d-f7fe8e624a8c	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	leave-entitlement.bulk-assign	LeaveEntitlement	\N	\N	{"days": 14, "mode": "increase", "year": 2026, "leave_type_id": "f9142969-dfb1-4670-a3fe-43177f6941cf", "affected_users": ["c64f66c9-639f-4913-8d6e-0304d51f1c20", "8b4ba86e-6f24-4eed-83b0-d5f191eb7adf", "43af610e-e846-4f7c-88bd-c51fc43f0d12"]}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-12 13:58:06.724575+05
6dae018c-4ca5-43d5-baa6-dcfb20b4657a	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	leave-entitlement.change	LeaveEntitlement	a9e4d25a-25d5-4f04-b5df-d765ef525168	\N	{"days": 14, "mode": "increase", "year": 2026, "delta": 14, "user_id": "c64f66c9-639f-4913-8d6e-0304d51f1c20", "leave_type_id": "588ad7bd-2e0c-40bd-bd0b-d4618b340e5c", "new_allocated": 14}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-12 13:58:06.785001+05
785169dc-0aad-4b81-876b-de9dae8bd3f6	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	leave-entitlement.change	LeaveEntitlement	b6dfa2dc-91a8-4983-bccd-791b649fdd67	\N	{"days": 14, "mode": "increase", "year": 2026, "delta": 14, "user_id": "8b4ba86e-6f24-4eed-83b0-d5f191eb7adf", "leave_type_id": "588ad7bd-2e0c-40bd-bd0b-d4618b340e5c", "new_allocated": 28}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-12 13:58:06.785001+05
245b578a-ebfa-4ade-ac8c-6ca6faef23fb	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	leave-entitlement.change	LeaveEntitlement	0854971f-a56b-4bfa-b032-ddb44aec0d68	\N	{"days": 14, "mode": "increase", "year": 2026, "delta": 14, "user_id": "43af610e-e846-4f7c-88bd-c51fc43f0d12", "leave_type_id": "588ad7bd-2e0c-40bd-bd0b-d4618b340e5c", "new_allocated": 38}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-12 13:58:06.785001+05
84b38628-f77c-410b-8923-ff32e3f6dcfa	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	leave-entitlement.bulk-assign	LeaveEntitlement	\N	\N	{"days": 14, "mode": "increase", "year": 2026, "leave_type_id": "588ad7bd-2e0c-40bd-bd0b-d4618b340e5c", "affected_users": ["c64f66c9-639f-4913-8d6e-0304d51f1c20", "8b4ba86e-6f24-4eed-83b0-d5f191eb7adf", "43af610e-e846-4f7c-88bd-c51fc43f0d12"]}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-12 13:58:06.785001+05
7eb91326-8dc0-4681-96b2-1d20076ea8ae	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	leave-entitlement.change	LeaveEntitlement	c33f221f-4bc1-4b1e-acdb-5624cf8ad1f6	\N	{"days": 14, "mode": "increase", "year": 2026, "delta": 14, "user_id": "c64f66c9-639f-4913-8d6e-0304d51f1c20", "leave_type_id": "a27de783-fc24-4e40-a56c-9d88bd2149d0", "new_allocated": 14}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-12 13:58:06.845195+05
539231bc-daef-431a-9742-2b9e732e2ce6	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	leave-entitlement.change	LeaveEntitlement	f8e08395-11fb-4a7e-b13b-f8c309b1fcf1	\N	{"days": 14, "mode": "increase", "year": 2026, "delta": 14, "user_id": "8b4ba86e-6f24-4eed-83b0-d5f191eb7adf", "leave_type_id": "a27de783-fc24-4e40-a56c-9d88bd2149d0", "new_allocated": 14}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-12 13:58:06.845195+05
a74981e7-b789-4bde-a379-428491d0d66f	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	leave-entitlement.change	LeaveEntitlement	acfd0ee9-49f2-4a77-a33b-467ed53e7b87	\N	{"days": 14, "mode": "increase", "year": 2026, "delta": 14, "user_id": "43af610e-e846-4f7c-88bd-c51fc43f0d12", "leave_type_id": "a27de783-fc24-4e40-a56c-9d88bd2149d0", "new_allocated": 33}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-12 13:58:06.845195+05
98ab816d-ae87-4d23-9b52-c236ce95e570	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	leave-entitlement.bulk-assign	LeaveEntitlement	\N	\N	{"days": 14, "mode": "increase", "year": 2026, "leave_type_id": "a27de783-fc24-4e40-a56c-9d88bd2149d0", "affected_users": ["c64f66c9-639f-4913-8d6e-0304d51f1c20", "8b4ba86e-6f24-4eed-83b0-d5f191eb7adf", "43af610e-e846-4f7c-88bd-c51fc43f0d12"]}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-12 13:58:06.845195+05
a18b3e2e-2fe4-417b-8761-42d1bd4822e8	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	leave-entitlement.change	LeaveEntitlement	2ab6824e-2063-45c1-8ae9-789af0991112	\N	{"days": 14, "mode": "increase", "year": 2026, "delta": 14, "user_id": "c64f66c9-639f-4913-8d6e-0304d51f1c20", "leave_type_id": "ea84a0d7-bc22-44c2-8c9f-701ea0dd087d", "new_allocated": 14}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-12 13:58:06.919996+05
e3edd076-f953-4bb6-90ee-2de81a32bf59	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	leave-entitlement.change	LeaveEntitlement	d04aa12d-4ccc-4b3d-9447-5c84fba27e09	\N	{"days": 14, "mode": "increase", "year": 2026, "delta": 14, "user_id": "8b4ba86e-6f24-4eed-83b0-d5f191eb7adf", "leave_type_id": "ea84a0d7-bc22-44c2-8c9f-701ea0dd087d", "new_allocated": 14}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-12 13:58:06.919996+05
4044a37b-72b2-4fc8-bf82-3502e17c2a9e	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	leave-entitlement.change	LeaveEntitlement	25e855a0-f44d-4db6-925b-85ba36a61683	\N	{"days": 14, "mode": "increase", "year": 2026, "delta": 14, "user_id": "43af610e-e846-4f7c-88bd-c51fc43f0d12", "leave_type_id": "ea84a0d7-bc22-44c2-8c9f-701ea0dd087d", "new_allocated": 42}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-12 13:58:06.919996+05
889f168b-5e93-4963-b4bc-29191a1532a7	5269a7da-0db6-49b8-97eb-c2d482cb611a	engmuhammadhaseebiqbal@gmail.com	leave-entitlement.bulk-assign	LeaveEntitlement	\N	\N	{"days": 14, "mode": "increase", "year": 2026, "leave_type_id": "ea84a0d7-bc22-44c2-8c9f-701ea0dd087d", "affected_users": ["c64f66c9-639f-4913-8d6e-0304d51f1c20", "8b4ba86e-6f24-4eed-83b0-d5f191eb7adf", "43af610e-e846-4f7c-88bd-c51fc43f0d12"]}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-08-12 13:58:06.919996+05
\.


--
-- Data for Name: company_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.company_settings (id, legal_company_name, registration_number, industry, timezone, currency, working_days, company_name, logo_url, logo_collapsed_url, favicon_url, email, phone, address, website, primary_color, created_at, updated_at, ceo_name, ceo_signature_url, cofounder_name, cofounder_signature_url) FROM stdin;
1	TechnoCues 	1234	IT	UTC+5	USD	Mon-Fri	TechnoCues	https://technocues.com/wp-content/uploads/2020/09/330360314_589488222811539_5219190999614154994_n-removebg-preview.png	http://localhost:5173/src/assets/badge.png	http://localhost:5173/src/assets/badge.png	info@technocues.com	03123456789	Lahore	https://technocues.com	#F1B344	2026-08-01 16:01:35.749797+05	2026-08-10 18:59:47.104457+05	Shahbaz Afzal	/uploads/company-signatures/f23021f3-03d7-4655-b79f-c9f5ee071a57.png	Ali Afzal	/uploads/company-signatures/963f2347-6fd6-4cd8-8284-f28ee5eb3ac6.png
\.


--
-- Data for Name: departments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.departments (department_id, department_name, description) FROM stdin;
f04f68cc-db96-4411-926a-ce34cfc41fa0	Development	Development 
\.


--
-- Data for Name: designations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.designations (designation_id, title, department_id) FROM stdin;
ef95a6ad-7c2e-4861-ab66-afa005e4469e	Frontend	f04f68cc-db96-4411-926a-ce34cfc41fa0
3916c3d8-2428-4c10-9647-4a486094a428	Backend	f04f68cc-db96-4411-926a-ce34cfc41fa0
\.


--
-- Data for Name: email_queue; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.email_queue (email_queue_id, template_key, to_email, to_name, subject, body_html, status, attempts, max_attempts, next_attempt_at, last_error, sent_at, related_user_id, created_at, updated_at) FROM stdin;
ce5f7a01-848f-4036-aee1-cb399b595181	password_reset	engmuhammadhaseebiqbal@gmail.com	Haseeb Iqbal	Reset your TechnoCues password	<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8" />\n<meta name="viewport" content="width=device-width, initial-scale=1" />\n<title>Reset your TechnoCues password</title>\n</head>\n<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">\n<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:24px 12px;">\n<tr>\n<td align="center">\n<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">\n\n<tr>\n<td style="background-color:#F1B344;padding:24px 32px;text-align:center;">\n<img src="https://technocues.com/wp-content/uploads/2020/09/330360314_589488222811539_5219190999614154994_n-removebg-preview.png" alt="TechnoCues" width="120" style="display:block;margin:0 auto 12px;max-width:180px;height:auto;border:0;" />\n<div style="font-size:19px;font-weight:700;color:#1a1a1a;letter-spacing:-0.2px;">TechnoCues</div>\n</td>\n</tr>\n\n<tr>\n<td style="padding:32px;color:#3a3a3a;font-size:15px;line-height:1.65;">\n<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a1a1a;">Reset your password</h1>\n<p style="margin:0 0 14px;">Hello Haseeb Iqbal, we received a request to reset the password for your TechnoCues account.</p>\n<p style="margin:0 0 14px;">Click the button below to choose a new password. <strong>This link can be used once and expires in 60 minutes.</strong></p>\n<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">\n<tr>\n<td align="center" style="background-color:#F1B344;border-radius:8px;">\n<a href="http://localhost:5173/reset-password?token=QuDapNH1SGrpGI2R-i4qzWFkJhDJi6X2_Pcy0ZjNCNc" style="display:inline-block;padding:13px 30px;font-size:15px;font-weight:600;color:#1a1a1a;text-decoration:none;">Choose a new password</a>\n</td>\n</tr>\n</table>\n<p style="margin:0 0 14px;color:#8a8a8a;font-size:13px;">If the button does not work, copy and paste this address into your browser:<br />\n<span style="color:#9a6a17;word-break:break-all;">http://localhost:5173/reset-password?token=QuDapNH1SGrpGI2R-i4qzWFkJhDJi6X2_Pcy0ZjNCNc</span></p>\n<p style="margin:20px 0 0;padding:14px 16px;background-color:#fff8e6;border-left:3px solid #F1B344;color:#5a5a5a;font-size:13px;line-height:1.6;">\n<strong>Didn't request this?</strong> You can safely ignore this email — your password will not change unless you use the link above. If you are concerned, contact <a href="mailto:info@technocues.com" style="color:#9a6a17;">info@technocues.com</a>.\n</p>\n</td>\n</tr>\n\n<tr>\n<td style="background-color:#fafafa;border-top:1px solid #ededed;padding:24px 32px;color:#8a8a8a;font-size:12px;line-height:1.6;text-align:center;">\n<div style="margin-bottom:8px;font-weight:600;color:#5a5a5a;">TechnoCues</div>\n<div style="margin-bottom:4px;">Lahore</div>\n<div>03123456789 &nbsp;·&nbsp; <a href="mailto:info@technocues.com" style="color:#8a8a8a;text-decoration:underline;">info@technocues.com</a> &nbsp;·&nbsp; <a href="https://technocues.com/" style="color:#8a8a8a;text-decoration:underline;">https://technocues.com/</a></div>\n<div style="margin-top:12px;color:#a0a0a0;">\nThis is an automated message from the TechnoCues HR system. Please do not reply directly to this email.\n</div>\n<div style="margin-top:6px;color:#b0b0b0;">&copy; 2026 TechnoCues. All rights reserved.</div>\n</td>\n</tr>\n\n</table>\n</td>\n</tr>\n</table>\n</body>\n</html>	cancelled	2	5	2026-08-11 19:45:20.024+05	Stored SMTP password could not be decrypted. It may have been written with a different SMTP_ENCRYPTION_KEY — re-enter the password in SMTP settings.	\N	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-11 19:39:00.128022+05	2026-08-11 19:42:00.034337+05
a0aeb61d-86fb-47ad-a335-6b498adab8f8	password_reset	engmuhammadhaseebiqbal@gmail.com	Haseeb Iqbal	Reset your TechnoCues password	<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8" />\n<meta name="viewport" content="width=device-width, initial-scale=1" />\n<title>Reset your TechnoCues password</title>\n</head>\n<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">\n<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:24px 12px;">\n<tr>\n<td align="center">\n<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">\n\n<tr>\n<td style="background-color:#F1B344;padding:24px 32px;text-align:center;">\n<img src="https://technocues.com/wp-content/uploads/2020/09/330360314_589488222811539_5219190999614154994_n-removebg-preview.png" alt="TechnoCues" width="120" style="display:block;margin:0 auto 12px;max-width:180px;height:auto;border:0;" />\n<div style="font-size:19px;font-weight:700;color:#1a1a1a;letter-spacing:-0.2px;">TechnoCues</div>\n</td>\n</tr>\n\n<tr>\n<td style="padding:32px;color:#3a3a3a;font-size:15px;line-height:1.65;">\n<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a1a1a;">Reset your password</h1>\n<p style="margin:0 0 14px;">Hello Haseeb Iqbal, we received a request to reset the password for your TechnoCues account.</p>\n<p style="margin:0 0 14px;">Click the button below to choose a new password. <strong>This link can be used once and expires in 60 minutes.</strong></p>\n<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">\n<tr>\n<td align="center" style="background-color:#F1B344;border-radius:8px;">\n<a href="http://localhost:5173/reset-password?token=ycGclE_ptINf59MvLSpNQl74dqXACTk2dxD7SffP0YY" style="display:inline-block;padding:13px 30px;font-size:15px;font-weight:600;color:#1a1a1a;text-decoration:none;">Choose a new password</a>\n</td>\n</tr>\n</table>\n<p style="margin:0 0 14px;color:#8a8a8a;font-size:13px;">If the button does not work, copy and paste this address into your browser:<br />\n<span style="color:#9a6a17;word-break:break-all;">http://localhost:5173/reset-password?token=ycGclE_ptINf59MvLSpNQl74dqXACTk2dxD7SffP0YY</span></p>\n<p style="margin:20px 0 0;padding:14px 16px;background-color:#fff8e6;border-left:3px solid #F1B344;color:#5a5a5a;font-size:13px;line-height:1.6;">\n<strong>Didn't request this?</strong> You can safely ignore this email — your password will not change unless you use the link above. If you are concerned, contact <a href="mailto:info@technocues.com" style="color:#9a6a17;">info@technocues.com</a>.\n</p>\n</td>\n</tr>\n\n<tr>\n<td style="background-color:#fafafa;border-top:1px solid #ededed;padding:24px 32px;color:#8a8a8a;font-size:12px;line-height:1.6;text-align:center;">\n<div style="margin-bottom:8px;font-weight:600;color:#5a5a5a;">TechnoCues</div>\n<div style="margin-bottom:4px;">Lahore</div>\n<div>03123456789 &nbsp;·&nbsp; <a href="mailto:info@technocues.com" style="color:#8a8a8a;text-decoration:underline;">info@technocues.com</a> &nbsp;·&nbsp; <a href="https://technocues.com/" style="color:#8a8a8a;text-decoration:underline;">https://technocues.com/</a></div>\n<div style="margin-top:12px;color:#a0a0a0;">\nThis is an automated message from the TechnoCues HR system. Please do not reply directly to this email.\n</div>\n<div style="margin-top:6px;color:#b0b0b0;">&copy; 2026 TechnoCues. All rights reserved.</div>\n</td>\n</tr>\n\n</table>\n</td>\n</tr>\n</table>\n</body>\n</html>	failed	5	5	2026-08-12 12:01:10.042+05	Stored SMTP password could not be decrypted. It may have been written with a different SMTP_ENCRYPTION_KEY — re-enter the password in SMTP settings.	\N	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 10:39:36.349844+05	2026-08-12 12:22:19.510994+05
4111bdba-21a3-44c1-9b42-06f120278c10	welcome_employee	mudasseriqbal755@gmail.com	Muddasir Iqbal	Welcome to TechnoCues, Muddasir Iqbal!	<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8" />\n<meta name="viewport" content="width=device-width, initial-scale=1" />\n<title>Welcome to TechnoCues, Muddasir Iqbal!</title>\n</head>\n<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">\n<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:24px 12px;">\n<tr>\n<td align="center">\n<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">\n\n<tr>\n<td style="background-color:#F1B344;padding:24px 32px;text-align:center;">\n<img src="https://technocues.com/wp-content/uploads/2020/09/330360314_589488222811539_5219190999614154994_n-removebg-preview.png" alt="TechnoCues" width="120" style="display:block;margin:0 auto 12px;max-width:180px;height:auto;border:0;" />\n<div style="font-size:19px;font-weight:700;color:#1a1a1a;letter-spacing:-0.2px;">TechnoCues</div>\n</td>\n</tr>\n\n<tr>\n<td style="padding:32px;color:#3a3a3a;font-size:15px;line-height:1.65;">\n<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a1a1a;">Welcome aboard, Muddasir Iqbal!</h1>\n<p style="margin:0 0 14px;">We are delighted to have you join <strong>TechnoCues</strong> as Frontend in the Development team.</p>\n<p style="margin:0 0 14px;">Your employee record has been set up. You can sign in to the HR portal to view your profile, submit leave requests, check your attendance and see your payslips.</p>\n<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background-color:#fafafa;border-radius:8px;padding:8px 16px;">\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Employee ID</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">TC-EMP-004</td>\n</tr>\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Department</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">Development</td>\n</tr>\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Designation</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">Frontend</td>\n</tr>\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Work email</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">{{employee_email}}</td>\n</tr>\n</table>\n<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">\n<tr>\n<td align="center" style="background-color:#F1B344;border-radius:8px;">\n<a href="http://localhost:5173/login" style="display:inline-block;padding:13px 30px;font-size:15px;font-weight:600;color:#1a1a1a;text-decoration:none;">Sign in to the portal</a>\n</td>\n</tr>\n</table>\n<p style="margin:0;color:#8a8a8a;font-size:13px;">Questions about your account? Reach us at <a href="mailto:info@technocues.com" style="color:#9a6a17;">info@technocues.com</a>.</p>\n</td>\n</tr>\n\n<tr>\n<td style="background-color:#fafafa;border-top:1px solid #ededed;padding:24px 32px;color:#8a8a8a;font-size:12px;line-height:1.6;text-align:center;">\n<div style="margin-bottom:8px;font-weight:600;color:#5a5a5a;">TechnoCues</div>\n<div style="margin-bottom:4px;">Lahore</div>\n<div>03123456789 &nbsp;·&nbsp; <a href="mailto:info@technocues.com" style="color:#8a8a8a;text-decoration:underline;">info@technocues.com</a> &nbsp;·&nbsp; <a href="https://technocues.com/" style="color:#8a8a8a;text-decoration:underline;">https://technocues.com/</a></div>\n<div style="margin-top:12px;color:#a0a0a0;">\nThis is an automated message from the TechnoCues HR system. Please do not reply directly to this email.\n</div>\n<div style="margin-top:6px;color:#b0b0b0;">&copy; 2026 TechnoCues. All rights reserved.</div>\n</td>\n</tr>\n\n</table>\n</td>\n</tr>\n</table>\n</body>\n</html>	cancelled	3	5	2026-08-10 14:32:02.676+05	Invalid login: 535-5.7.8 Username and Password not accepted. For more information, go to\n535 5.7.8  https://support.google.com/mail/?p=BadCredentials ffacd0b85a97d-4800220aa83sm28104702f8f.36 - gsmtp	\N	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	2026-08-10 14:10:30.150784+05	2026-08-10 14:17:37.115307+05
3800869c-ef06-43f4-876c-fa92fbd12336	account_created	mudasseriqbal755@gmail.com	Muddasir Iqbal	Your TechnoCues account is ready	<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8" />\n<meta name="viewport" content="width=device-width, initial-scale=1" />\n<title>Your TechnoCues account is ready</title>\n</head>\n<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">\n<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:24px 12px;">\n<tr>\n<td align="center">\n<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">\n\n<tr>\n<td style="background-color:#F1B344;padding:24px 32px;text-align:center;">\n<img src="https://technocues.com/wp-content/uploads/2020/09/330360314_589488222811539_5219190999614154994_n-removebg-preview.png" alt="TechnoCues" width="120" style="display:block;margin:0 auto 12px;max-width:180px;height:auto;border:0;" />\n<div style="font-size:19px;font-weight:700;color:#1a1a1a;letter-spacing:-0.2px;">TechnoCues</div>\n</td>\n</tr>\n\n<tr>\n<td style="padding:32px;color:#3a3a3a;font-size:15px;line-height:1.65;">\n<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a1a1a;">Your account has been created</h1>\n<p style="margin:0 0 14px;">Hello Muddasir Iqbal, an account has been created for you on the TechnoCues HR portal.</p>\n<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background-color:#fafafa;border-radius:8px;padding:8px 16px;">\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Employee ID</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">TC-EMP-004</td>\n</tr>\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Sign-in email</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">{{employee_email}}</td>\n</tr>\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Department</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">Development</td>\n</tr>\n</table>\n<p style="margin:0 0 14px;">Use the button below to set your password and activate your access. This link expires in {{expiry_minutes}} minutes.</p>\n<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">\n<tr>\n<td align="center" style="background-color:#F1B344;border-radius:8px;">\n<a href="{{reset_link}}" style="display:inline-block;padding:13px 30px;font-size:15px;font-weight:600;color:#1a1a1a;text-decoration:none;">Set your password</a>\n</td>\n</tr>\n</table>\n<p style="margin:20px 0 0;padding:14px 16px;background-color:#fff8e6;border-left:3px solid #F1B344;color:#5a5a5a;font-size:13px;line-height:1.6;">\nIf you did not expect this email, please contact <a href="mailto:info@technocues.com" style="color:#9a6a17;">info@technocues.com</a> straight away.\n</p>\n</td>\n</tr>\n\n<tr>\n<td style="background-color:#fafafa;border-top:1px solid #ededed;padding:24px 32px;color:#8a8a8a;font-size:12px;line-height:1.6;text-align:center;">\n<div style="margin-bottom:8px;font-weight:600;color:#5a5a5a;">TechnoCues</div>\n<div style="margin-bottom:4px;">Lahore</div>\n<div>03123456789 &nbsp;·&nbsp; <a href="mailto:info@technocues.com" style="color:#8a8a8a;text-decoration:underline;">info@technocues.com</a> &nbsp;·&nbsp; <a href="https://technocues.com/" style="color:#8a8a8a;text-decoration:underline;">https://technocues.com/</a></div>\n<div style="margin-top:12px;color:#a0a0a0;">\nThis is an automated message from the TechnoCues HR system. Please do not reply directly to this email.\n</div>\n<div style="margin-top:6px;color:#b0b0b0;">&copy; 2026 TechnoCues. All rights reserved.</div>\n</td>\n</tr>\n\n</table>\n</td>\n</tr>\n</table>\n</body>\n</html>	cancelled	3	5	2026-08-10 14:32:01.348+05	Invalid login: 535-5.7.8 Username and Password not accepted. For more information, go to\n535 5.7.8  https://support.google.com/mail/?p=BadCredentials 5b1f17b1804b1-4995427a244sm404244435e9.10 - gsmtp	\N	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	2026-08-10 14:10:30.114967+05	2026-08-10 14:17:38.134264+05
6d1d3bb9-9db6-4b60-aa80-016bc78a2a2e	appraisal_pending_reminder	general@clickupmarket.com	Ashan Mustafa	Reminder: 2 appraisal(s) pending before shift end	<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8" />\n<meta name="viewport" content="width=device-width, initial-scale=1" />\n<title>Reminder: 2 appraisal(s) pending before shift end</title>\n</head>\n<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">\n<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:24px 12px;">\n<tr>\n<td align="center">\n<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">\n\n<tr>\n<td style="background-color:#F1B344;padding:24px 32px;text-align:center;">\n<img src="https://technocues.com/wp-content/uploads/2020/09/330360314_589488222811539_5219190999614154994_n-removebg-preview.png" alt="TechnoCues" width="120" style="display:block;margin:0 auto 12px;max-width:180px;height:auto;border:0;" />\n<div style="font-size:19px;font-weight:700;color:#1a1a1a;letter-spacing:-0.2px;">TechnoCues</div>\n</td>\n</tr>\n\n<tr>\n<td style="padding:32px;color:#3a3a3a;font-size:15px;line-height:1.65;">\n<p>Hi {{employee_name}},</p>\n<p>Your shift ends at 12:00:00 and you still have\n<strong>2</strong> appraisal form(s) awaiting submission\nfor {{review_date}}.</p>\n<p>Please complete them before the end of your shift.</p>\n<p><a href="http://localhost:5173/login">Open your appraisal dashboard</a></p>\n<p>&mdash; TechnoCues</p>\n</td>\n</tr>\n\n<tr>\n<td style="background-color:#fafafa;border-top:1px solid #ededed;padding:24px 32px;color:#8a8a8a;font-size:12px;line-height:1.6;text-align:center;">\n<div style="margin-bottom:8px;font-weight:600;color:#5a5a5a;">TechnoCues</div>\n<div style="margin-bottom:4px;">Lahore</div>\n<div>03123456789 &nbsp;·&nbsp; <a href="mailto:info@technocues.com" style="color:#8a8a8a;text-decoration:underline;">info@technocues.com</a> &nbsp;·&nbsp; <a href="https://technocues.com/" style="color:#8a8a8a;text-decoration:underline;">https://technocues.com/</a></div>\n<div style="margin-top:12px;color:#a0a0a0;">\nThis is an automated message from the TechnoCues HR system. Please do not reply directly to this email.\n</div>\n<div style="margin-top:6px;color:#b0b0b0;">&copy; 2026 TechnoCues. All rights reserved.</div>\n</td>\n</tr>\n\n</table>\n</td>\n</tr>\n</table>\n</body>\n</html>	failed	5	5	2026-08-12 12:21:30.047+05	Stored SMTP password could not be decrypted. It may have been written with a different SMTP_ENCRYPTION_KEY — re-enter the password in SMTP settings.	\N	c64f66c9-639f-4913-8d6e-0304d51f1c20	2026-08-12 11:00:00.100155+05	2026-08-12 12:22:19.626421+05
a9c8e6fb-7339-4eb5-8a35-54e3f41e7690	admin_reset_notification	general@clickupmarket.com	Ashan Mustafa	Your TechnoCues password has been reset by an administrator	<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8" />\n<meta name="viewport" content="width=device-width, initial-scale=1" />\n<title>Your TechnoCues password has been reset by an administrator</title>\n</head>\n<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">\n<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:24px 12px;">\n<tr>\n<td align="center">\n<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">\n\n<tr>\n<td style="background-color:#F1B344;padding:24px 32px;text-align:center;">\n<img src="https://technocues.com/wp-content/uploads/2020/09/330360314_589488222811539_5219190999614154994_n-removebg-preview.png" alt="TechnoCues" width="120" style="display:block;margin:0 auto 12px;max-width:180px;height:auto;border:0;" />\n<div style="font-size:19px;font-weight:700;color:#1a1a1a;letter-spacing:-0.2px;">TechnoCues</div>\n</td>\n</tr>\n\n<tr>\n<td style="padding:32px;color:#3a3a3a;font-size:15px;line-height:1.65;">\n<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a1a1a;">Your password was reset</h1>\n<p style="margin:0 0 14px;">Hello Ashan Mustafa, an administrator at TechnoCues reset the password on your account on {{event_time}}.</p>\n<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background-color:#fafafa;border-radius:8px;padding:8px 16px;">\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Employee ID</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">TC-EMP-005</td>\n</tr>\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Reset by</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">{{actor_name}}</td>\n</tr>\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">When</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">{{event_time}}</td>\n</tr>\n</table>\n<p style="margin:0 0 14px;">Use the link below to set a password only you know. It can be used once and expires in {{expiry_minutes}} minutes.</p>\n<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">\n<tr>\n<td align="center" style="background-color:#F1B344;border-radius:8px;">\n<a href="{{reset_link}}" style="display:inline-block;padding:13px 30px;font-size:15px;font-weight:600;color:#1a1a1a;text-decoration:none;">Set a new password</a>\n</td>\n</tr>\n</table>\n<p style="margin:20px 0 0;padding:14px 16px;background-color:#fff8e6;border-left:3px solid #F1B344;color:#5a5a5a;font-size:13px;line-height:1.6;">\nIf you did not expect this email, please contact <a href="mailto:info@technocues.com" style="color:#9a6a17;">info@technocues.com</a> straight away.\n</p>\n</td>\n</tr>\n\n<tr>\n<td style="background-color:#fafafa;border-top:1px solid #ededed;padding:24px 32px;color:#8a8a8a;font-size:12px;line-height:1.6;text-align:center;">\n<div style="margin-bottom:8px;font-weight:600;color:#5a5a5a;">TechnoCues</div>\n<div style="margin-bottom:4px;">Lahore</div>\n<div>03123456789 &nbsp;·&nbsp; <a href="mailto:info@technocues.com" style="color:#8a8a8a;text-decoration:underline;">info@technocues.com</a> &nbsp;·&nbsp; <a href="https://technocues.com/" style="color:#8a8a8a;text-decoration:underline;">https://technocues.com/</a></div>\n<div style="margin-top:12px;color:#a0a0a0;">\nThis is an automated message from the TechnoCues HR system. Please do not reply directly to this email.\n</div>\n<div style="margin-top:6px;color:#b0b0b0;">&copy; 2026 TechnoCues. All rights reserved.</div>\n</td>\n</tr>\n\n</table>\n</td>\n</tr>\n</table>\n</body>\n</html>	cancelled	5	5	2026-08-11 10:12:50.061+05	Stored SMTP password could not be decrypted. It may have been written with a different SMTP_ENCRYPTION_KEY — re-enter the password in SMTP settings.	\N	c64f66c9-639f-4913-8d6e-0304d51f1c20	2026-08-11 08:51:18.795242+05	2026-08-11 17:49:51.071696+05
2b0bdf40-ff51-4ba4-ab6f-25937c00c862	meeting_invitation	engmuhammadhaseebiqbal@gmail.com	Haseeb Iqbal	Meeting invitation: test	<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8" />\n<meta name="viewport" content="width=device-width, initial-scale=1" />\n<title>Meeting invitation: test</title>\n</head>\n<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">\n<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:24px 12px;">\n<tr>\n<td align="center">\n<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">\n\n<tr>\n<td style="background-color:#F1B344;padding:24px 32px;text-align:center;">\n<img src="https://technocues.com/wp-content/uploads/2020/09/330360314_589488222811539_5219190999614154994_n-removebg-preview.png" alt="TechnoCues" width="120" style="display:block;margin:0 auto 12px;max-width:180px;height:auto;border:0;" />\n<div style="font-size:19px;font-weight:700;color:#1a1a1a;letter-spacing:-0.2px;">TechnoCues</div>\n</td>\n</tr>\n\n<tr>\n<td style="padding:32px;color:#3a3a3a;font-size:15px;line-height:1.65;">\n<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a1a1a;">You are invited to a meeting</h1>\n<p style="margin:0 0 14px;">Hello Haseeb Iqbal, Haseeb Iqbal has scheduled <strong>test</strong> and would like you to attend.</p>\n<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background-color:#fafafa;border-radius:8px;padding:8px 16px;">\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Meeting</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">test</td>\n</tr>\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">When</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">12 Aug 2026, 12:00</td>\n</tr>\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Location</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">In Room</td>\n</tr>\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Organizer</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">Haseeb Iqbal</td>\n</tr>\n</table>\n<p style="margin:0 0 14px;padding:14px 16px;background-color:#f0f9ff;border-left:3px solid #F1B344;color:#5a5a5a;font-size:14px;line-height:1.6;"><strong>Agenda:</strong> No agenda was provided.</p>\n<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">\n<tr>\n<td align="center" style="background-color:#F1B344;border-radius:8px;">\n<a href="http://localhost:5173/meetings" style="display:inline-block;padding:13px 30px;font-size:15px;font-weight:600;color:#1a1a1a;text-decoration:none;">View in the portal</a>\n</td>\n</tr>\n</table>\n<p style="margin:0;color:#8a8a8a;font-size:13px;">Can't make it? Let Haseeb Iqbal know as early as you can.</p>\n</td>\n</tr>\n\n<tr>\n<td style="background-color:#fafafa;border-top:1px solid #ededed;padding:24px 32px;color:#8a8a8a;font-size:12px;line-height:1.6;text-align:center;">\n<div style="margin-bottom:8px;font-weight:600;color:#5a5a5a;">TechnoCues</div>\n<div style="margin-bottom:4px;">Lahore</div>\n<div>03123456789 &nbsp;·&nbsp; <a href="mailto:info@technocues.com" style="color:#8a8a8a;text-decoration:underline;">info@technocues.com</a> &nbsp;·&nbsp; <a href="https://technocues.com/" style="color:#8a8a8a;text-decoration:underline;">https://technocues.com/</a></div>\n<div style="margin-top:12px;color:#a0a0a0;">\nThis is an automated message from the TechnoCues HR system. Please do not reply directly to this email.\n</div>\n<div style="margin-top:6px;color:#b0b0b0;">&copy; 2026 TechnoCues. All rights reserved.</div>\n</td>\n</tr>\n\n</table>\n</td>\n</tr>\n</table>\n</body>\n</html>	cancelled	0	5	2026-08-10 14:17:34.646+05	\N	\N	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-10 14:11:57.961502+05	2026-08-10 14:17:35.45705+05
262b6b5e-9748-47b1-9757-b510b9e55feb	meeting_invitation	mudasseriqbal755@gmail.com	Muddasir Iqbal	Meeting invitation: test	<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8" />\n<meta name="viewport" content="width=device-width, initial-scale=1" />\n<title>Meeting invitation: test</title>\n</head>\n<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">\n<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:24px 12px;">\n<tr>\n<td align="center">\n<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">\n\n<tr>\n<td style="background-color:#F1B344;padding:24px 32px;text-align:center;">\n<img src="https://technocues.com/wp-content/uploads/2020/09/330360314_589488222811539_5219190999614154994_n-removebg-preview.png" alt="TechnoCues" width="120" style="display:block;margin:0 auto 12px;max-width:180px;height:auto;border:0;" />\n<div style="font-size:19px;font-weight:700;color:#1a1a1a;letter-spacing:-0.2px;">TechnoCues</div>\n</td>\n</tr>\n\n<tr>\n<td style="padding:32px;color:#3a3a3a;font-size:15px;line-height:1.65;">\n<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a1a1a;">You are invited to a meeting</h1>\n<p style="margin:0 0 14px;">Hello Muddasir Iqbal, Haseeb Iqbal has scheduled <strong>test</strong> and would like you to attend.</p>\n<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background-color:#fafafa;border-radius:8px;padding:8px 16px;">\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Meeting</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">test</td>\n</tr>\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">When</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">12 Aug 2026, 12:00</td>\n</tr>\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Location</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">In Room</td>\n</tr>\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Organizer</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">Haseeb Iqbal</td>\n</tr>\n</table>\n<p style="margin:0 0 14px;padding:14px 16px;background-color:#f0f9ff;border-left:3px solid #F1B344;color:#5a5a5a;font-size:14px;line-height:1.6;"><strong>Agenda:</strong> No agenda was provided.</p>\n<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">\n<tr>\n<td align="center" style="background-color:#F1B344;border-radius:8px;">\n<a href="http://localhost:5173/meetings" style="display:inline-block;padding:13px 30px;font-size:15px;font-weight:600;color:#1a1a1a;text-decoration:none;">View in the portal</a>\n</td>\n</tr>\n</table>\n<p style="margin:0;color:#8a8a8a;font-size:13px;">Can't make it? Let Haseeb Iqbal know as early as you can.</p>\n</td>\n</tr>\n\n<tr>\n<td style="background-color:#fafafa;border-top:1px solid #ededed;padding:24px 32px;color:#8a8a8a;font-size:12px;line-height:1.6;text-align:center;">\n<div style="margin-bottom:8px;font-weight:600;color:#5a5a5a;">TechnoCues</div>\n<div style="margin-bottom:4px;">Lahore</div>\n<div>03123456789 &nbsp;·&nbsp; <a href="mailto:info@technocues.com" style="color:#8a8a8a;text-decoration:underline;">info@technocues.com</a> &nbsp;·&nbsp; <a href="https://technocues.com/" style="color:#8a8a8a;text-decoration:underline;">https://technocues.com/</a></div>\n<div style="margin-top:12px;color:#a0a0a0;">\nThis is an automated message from the TechnoCues HR system. Please do not reply directly to this email.\n</div>\n<div style="margin-top:6px;color:#b0b0b0;">&copy; 2026 TechnoCues. All rights reserved.</div>\n</td>\n</tr>\n\n</table>\n</td>\n</tr>\n</table>\n</body>\n</html>	cancelled	2	5	2026-08-10 14:18:11.298+05	Invalid login: 535-5.7.8 Username and Password not accepted. For more information, go to\n535 5.7.8  https://support.google.com/mail/?p=BadCredentials ffacd0b85a97d-480021e8cd0sm32346509f8f.17 - gsmtp	\N	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	2026-08-10 14:11:57.956472+05	2026-08-10 14:17:36.26839+05
da9a4ca2-4332-4089-85ff-f708a8326da3	meeting_invitation	mudasseriqbal755@gmail.com	Muddasir Iqbal	Meeting invitation: 12323	<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8" />\n<meta name="viewport" content="width=device-width, initial-scale=1" />\n<title>Meeting invitation: 12323</title>\n</head>\n<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">\n<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:24px 12px;">\n<tr>\n<td align="center">\n<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">\n\n<tr>\n<td style="background-color:#F1B344;padding:24px 32px;text-align:center;">\n<img src="https://technocues.com/wp-content/uploads/2020/09/330360314_589488222811539_5219190999614154994_n-removebg-preview.png" alt="TechnoCues" width="120" style="display:block;margin:0 auto 12px;max-width:180px;height:auto;border:0;" />\n<div style="font-size:19px;font-weight:700;color:#1a1a1a;letter-spacing:-0.2px;">TechnoCues</div>\n</td>\n</tr>\n\n<tr>\n<td style="padding:32px;color:#3a3a3a;font-size:15px;line-height:1.65;">\n<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a1a1a;">You are invited to a meeting</h1>\n<p style="margin:0 0 14px;">Hello Muddasir Iqbal, Haseeb Iqbal has scheduled <strong>12323</strong> and would like you to attend.</p>\n<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background-color:#fafafa;border-radius:8px;padding:8px 16px;">\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Meeting</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">12323</td>\n</tr>\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">When</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">12 Aug 2026, 12:00</td>\n</tr>\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Location</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">https://education.github.com/pack</td>\n</tr>\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Organizer</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">Haseeb Iqbal</td>\n</tr>\n</table>\n<p style="margin:0 0 14px;padding:14px 16px;background-color:#f0f9ff;border-left:3px solid #F1B344;color:#5a5a5a;font-size:14px;line-height:1.6;"><strong>Agenda:</strong> Testing</p>\n<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">\n<tr>\n<td align="center" style="background-color:#F1B344;border-radius:8px;">\n<a href="http://localhost:5173/meetings" style="display:inline-block;padding:13px 30px;font-size:15px;font-weight:600;color:#1a1a1a;text-decoration:none;">View in the portal</a>\n</td>\n</tr>\n</table>\n<p style="margin:0;color:#8a8a8a;font-size:13px;">Can't make it? Let Haseeb Iqbal know as early as you can.</p>\n</td>\n</tr>\n\n<tr>\n<td style="background-color:#fafafa;border-top:1px solid #ededed;padding:24px 32px;color:#8a8a8a;font-size:12px;line-height:1.6;text-align:center;">\n<div style="margin-bottom:8px;font-weight:600;color:#5a5a5a;">TechnoCues</div>\n<div style="margin-bottom:4px;">Lahore</div>\n<div>03123456789 &nbsp;·&nbsp; <a href="mailto:info@technocues.com" style="color:#8a8a8a;text-decoration:underline;">info@technocues.com</a> &nbsp;·&nbsp; <a href="https://technocues.com/" style="color:#8a8a8a;text-decoration:underline;">https://technocues.com/</a></div>\n<div style="margin-top:12px;color:#a0a0a0;">\nThis is an automated message from the TechnoCues HR system. Please do not reply directly to this email.\n</div>\n<div style="margin-top:6px;color:#b0b0b0;">&copy; 2026 TechnoCues. All rights reserved.</div>\n</td>\n</tr>\n\n</table>\n</td>\n</tr>\n</table>\n</body>\n</html>	cancelled	5	5	2026-08-10 18:56:01.381+05	Invalid login: 535-5.7.8 Username and Password not accepted. For more information, go to\n535 5.7.8  https://support.google.com/mail/?p=BadCredentials ffacd0b85a97d-4800215078asm34129778f8f.12 - gsmtp	\N	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	2026-08-10 17:34:27.103186+05	2026-08-10 19:26:33.990071+05
617caf16-cc17-4d2e-8ccf-ebbe4fca195c	account_created	taa@gmail.com	Taha Tayyab	Your TechnoCues account is ready	<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8" />\n<meta name="viewport" content="width=device-width, initial-scale=1" />\n<title>Your TechnoCues account is ready</title>\n</head>\n<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">\n<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:24px 12px;">\n<tr>\n<td align="center">\n<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">\n\n<tr>\n<td style="background-color:#F1B344;padding:24px 32px;text-align:center;">\n<img src="https://technocues.com/wp-content/uploads/2020/09/330360314_589488222811539_5219190999614154994_n-removebg-preview.png" alt="TechnoCues" width="120" style="display:block;margin:0 auto 12px;max-width:180px;height:auto;border:0;" />\n<div style="font-size:19px;font-weight:700;color:#1a1a1a;letter-spacing:-0.2px;">TechnoCues</div>\n</td>\n</tr>\n\n<tr>\n<td style="padding:32px;color:#3a3a3a;font-size:15px;line-height:1.65;">\n<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a1a1a;">Your account has been created</h1>\n<p style="margin:0 0 14px;">Hello Taha Tayyab, an account has been created for you on the TechnoCues HR portal.</p>\n<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background-color:#fafafa;border-radius:8px;padding:8px 16px;">\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Employee ID</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">TC-EMP-006</td>\n</tr>\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Sign-in email</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">{{employee_email}}</td>\n</tr>\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Department</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">Development</td>\n</tr>\n</table>\n<p style="margin:0 0 14px;">Use the button below to set your password and activate your access. This link expires in {{expiry_minutes}} minutes.</p>\n<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">\n<tr>\n<td align="center" style="background-color:#F1B344;border-radius:8px;">\n<a href="{{reset_link}}" style="display:inline-block;padding:13px 30px;font-size:15px;font-weight:600;color:#1a1a1a;text-decoration:none;">Set your password</a>\n</td>\n</tr>\n</table>\n<p style="margin:20px 0 0;padding:14px 16px;background-color:#fff8e6;border-left:3px solid #F1B344;color:#5a5a5a;font-size:13px;line-height:1.6;">\nIf you did not expect this email, please contact <a href="mailto:info@technocues.com" style="color:#9a6a17;">info@technocues.com</a> straight away.\n</p>\n</td>\n</tr>\n\n<tr>\n<td style="background-color:#fafafa;border-top:1px solid #ededed;padding:24px 32px;color:#8a8a8a;font-size:12px;line-height:1.6;text-align:center;">\n<div style="margin-bottom:8px;font-weight:600;color:#5a5a5a;">TechnoCues</div>\n<div style="margin-bottom:4px;">Lahore</div>\n<div>03123456789 &nbsp;·&nbsp; <a href="mailto:info@technocues.com" style="color:#8a8a8a;text-decoration:underline;">info@technocues.com</a> &nbsp;·&nbsp; <a href="https://technocues.com/" style="color:#8a8a8a;text-decoration:underline;">https://technocues.com/</a></div>\n<div style="margin-top:12px;color:#a0a0a0;">\nThis is an automated message from the TechnoCues HR system. Please do not reply directly to this email.\n</div>\n<div style="margin-top:6px;color:#b0b0b0;">&copy; 2026 TechnoCues. All rights reserved.</div>\n</td>\n</tr>\n\n</table>\n</td>\n</tr>\n</table>\n</body>\n</html>	failed	5	5	2026-08-11 21:57:40.036+05	Stored SMTP password could not be decrypted. It may have been written with a different SMTP_ENCRYPTION_KEY — re-enter the password in SMTP settings.	\N	43af610e-e846-4f7c-88bd-c51fc43f0d12	2026-08-11 20:36:08.933115+05	2026-08-11 21:57:50.0288+05
5f419562-e7f9-41e6-935b-af66d3990230	meeting_invitation	engmuhammadhaseebiqbal@gmail.com	Haseeb Iqbal	Meeting invitation: 12323	<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8" />\n<meta name="viewport" content="width=device-width, initial-scale=1" />\n<title>Meeting invitation: 12323</title>\n</head>\n<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">\n<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:24px 12px;">\n<tr>\n<td align="center">\n<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">\n\n<tr>\n<td style="background-color:#F1B344;padding:24px 32px;text-align:center;">\n<img src="https://technocues.com/wp-content/uploads/2020/09/330360314_589488222811539_5219190999614154994_n-removebg-preview.png" alt="TechnoCues" width="120" style="display:block;margin:0 auto 12px;max-width:180px;height:auto;border:0;" />\n<div style="font-size:19px;font-weight:700;color:#1a1a1a;letter-spacing:-0.2px;">TechnoCues</div>\n</td>\n</tr>\n\n<tr>\n<td style="padding:32px;color:#3a3a3a;font-size:15px;line-height:1.65;">\n<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a1a1a;">You are invited to a meeting</h1>\n<p style="margin:0 0 14px;">Hello Haseeb Iqbal, Haseeb Iqbal has scheduled <strong>12323</strong> and would like you to attend.</p>\n<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background-color:#fafafa;border-radius:8px;padding:8px 16px;">\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Meeting</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">12323</td>\n</tr>\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">When</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">12 Aug 2026, 12:00</td>\n</tr>\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Location</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">https://education.github.com/pack</td>\n</tr>\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Organizer</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">Haseeb Iqbal</td>\n</tr>\n</table>\n<p style="margin:0 0 14px;padding:14px 16px;background-color:#f0f9ff;border-left:3px solid #F1B344;color:#5a5a5a;font-size:14px;line-height:1.6;"><strong>Agenda:</strong> Testing</p>\n<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">\n<tr>\n<td align="center" style="background-color:#F1B344;border-radius:8px;">\n<a href="http://localhost:5173/meetings" style="display:inline-block;padding:13px 30px;font-size:15px;font-weight:600;color:#1a1a1a;text-decoration:none;">View in the portal</a>\n</td>\n</tr>\n</table>\n<p style="margin:0;color:#8a8a8a;font-size:13px;">Can't make it? Let Haseeb Iqbal know as early as you can.</p>\n</td>\n</tr>\n\n<tr>\n<td style="background-color:#fafafa;border-top:1px solid #ededed;padding:24px 32px;color:#8a8a8a;font-size:12px;line-height:1.6;text-align:center;">\n<div style="margin-bottom:8px;font-weight:600;color:#5a5a5a;">TechnoCues</div>\n<div style="margin-bottom:4px;">Lahore</div>\n<div>03123456789 &nbsp;·&nbsp; <a href="mailto:info@technocues.com" style="color:#8a8a8a;text-decoration:underline;">info@technocues.com</a> &nbsp;·&nbsp; <a href="https://technocues.com/" style="color:#8a8a8a;text-decoration:underline;">https://technocues.com/</a></div>\n<div style="margin-top:12px;color:#a0a0a0;">\nThis is an automated message from the TechnoCues HR system. Please do not reply directly to this email.\n</div>\n<div style="margin-top:6px;color:#b0b0b0;">&copy; 2026 TechnoCues. All rights reserved.</div>\n</td>\n</tr>\n\n</table>\n</td>\n</tr>\n</table>\n</body>\n</html>	cancelled	5	5	2026-08-10 18:56:02.651+05	Invalid login: 535-5.7.8 Username and Password not accepted. For more information, go to\n535 5.7.8  https://support.google.com/mail/?p=BadCredentials 5b1f17b1804b1-4995427a4dcsm478337825e9.11 - gsmtp	\N	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-10 17:34:27.126422+05	2026-08-10 19:26:34.940546+05
9086c17a-2f9d-4c95-9e65-67fd8d7b33d1	profile_updated	general@clickupmarket.com	Ashan Mustafa	Your TechnoCues profile was updated	<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8" />\n<meta name="viewport" content="width=device-width, initial-scale=1" />\n<title>Your TechnoCues profile was updated</title>\n</head>\n<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">\n<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:24px 12px;">\n<tr>\n<td align="center">\n<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">\n\n<tr>\n<td style="background-color:#F1B344;padding:24px 32px;text-align:center;">\n<img src="https://technocues.com/wp-content/uploads/2020/09/330360314_589488222811539_5219190999614154994_n-removebg-preview.png" alt="TechnoCues" width="120" style="display:block;margin:0 auto 12px;max-width:180px;height:auto;border:0;" />\n<div style="font-size:19px;font-weight:700;color:#1a1a1a;letter-spacing:-0.2px;">TechnoCues</div>\n</td>\n</tr>\n\n<tr>\n<td style="padding:32px;color:#3a3a3a;font-size:15px;line-height:1.65;">\n<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a1a1a;">Your profile was updated</h1>\n<p style="margin:0 0 14px;">Hello Ashan Mustafa, changes were saved to your TechnoCues profile on {{event_time}}.</p>\n<p style="margin:0 0 14px;">The following fields changed:</p>\n<p style="margin:0 0 20px;padding:14px 16px;background-color:#fafafa;border-radius:8px;color:#1a1a1a;font-size:14px;">Date of birth, Joining date</p>\n<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">\n<tr>\n<td align="center" style="background-color:#F1B344;border-radius:8px;">\n<a href="http://localhost:5173/profile" style="display:inline-block;padding:13px 30px;font-size:15px;font-weight:600;color:#1a1a1a;text-decoration:none;">View your profile</a>\n</td>\n</tr>\n</table>\n<p style="margin:20px 0 0;padding:14px 16px;background-color:#fff8e6;border-left:3px solid #F1B344;color:#5a5a5a;font-size:13px;line-height:1.6;">\nIf you did not expect this email, please contact <a href="mailto:info@technocues.com" style="color:#9a6a17;">info@technocues.com</a> straight away.\n</p>\n</td>\n</tr>\n\n<tr>\n<td style="background-color:#fafafa;border-top:1px solid #ededed;padding:24px 32px;color:#8a8a8a;font-size:12px;line-height:1.6;text-align:center;">\n<div style="margin-bottom:8px;font-weight:600;color:#5a5a5a;">TechnoCues</div>\n<div style="margin-bottom:4px;">Lahore</div>\n<div>03123456789 &nbsp;·&nbsp; <a href="mailto:info@technocues.com" style="color:#8a8a8a;text-decoration:underline;">info@technocues.com</a> &nbsp;·&nbsp; <a href="https://technocues.com/" style="color:#8a8a8a;text-decoration:underline;">https://technocues.com/</a></div>\n<div style="margin-top:12px;color:#a0a0a0;">\nThis is an automated message from the TechnoCues HR system. Please do not reply directly to this email.\n</div>\n<div style="margin-top:6px;color:#b0b0b0;">&copy; 2026 TechnoCues. All rights reserved.</div>\n</td>\n</tr>\n\n</table>\n</td>\n</tr>\n</table>\n</body>\n</html>	cancelled	3	5	2026-08-11 19:41:50.032+05	Stored SMTP password could not be decrypted. It may have been written with a different SMTP_ENCRYPTION_KEY — re-enter the password in SMTP settings.	\N	c64f66c9-639f-4913-8d6e-0304d51f1c20	2026-08-11 19:20:29.327927+05	2026-08-11 19:41:58.975612+05
3dc3bf4a-9838-4431-af72-a0a6f7c5a609	profile_updated	general@clickupmarket.com	Ashan Mustafa	Your TechnoCues profile was updated	<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8" />\n<meta name="viewport" content="width=device-width, initial-scale=1" />\n<title>Your TechnoCues profile was updated</title>\n</head>\n<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">\n<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:24px 12px;">\n<tr>\n<td align="center">\n<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">\n\n<tr>\n<td style="background-color:#F1B344;padding:24px 32px;text-align:center;">\n<img src="https://technocues.com/wp-content/uploads/2020/09/330360314_589488222811539_5219190999614154994_n-removebg-preview.png" alt="TechnoCues" width="120" style="display:block;margin:0 auto 12px;max-width:180px;height:auto;border:0;" />\n<div style="font-size:19px;font-weight:700;color:#1a1a1a;letter-spacing:-0.2px;">TechnoCues</div>\n</td>\n</tr>\n\n<tr>\n<td style="padding:32px;color:#3a3a3a;font-size:15px;line-height:1.65;">\n<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a1a1a;">Your profile was updated</h1>\n<p style="margin:0 0 14px;">Hello Ashan Mustafa, changes were saved to your TechnoCues profile on {{event_time}}.</p>\n<p style="margin:0 0 14px;">The following fields changed:</p>\n<p style="margin:0 0 20px;padding:14px 16px;background-color:#fafafa;border-radius:8px;color:#1a1a1a;font-size:14px;">Date of birth, Joining date</p>\n<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">\n<tr>\n<td align="center" style="background-color:#F1B344;border-radius:8px;">\n<a href="http://localhost:5173/profile" style="display:inline-block;padding:13px 30px;font-size:15px;font-weight:600;color:#1a1a1a;text-decoration:none;">View your profile</a>\n</td>\n</tr>\n</table>\n<p style="margin:20px 0 0;padding:14px 16px;background-color:#fff8e6;border-left:3px solid #F1B344;color:#5a5a5a;font-size:13px;line-height:1.6;">\nIf you did not expect this email, please contact <a href="mailto:info@technocues.com" style="color:#9a6a17;">info@technocues.com</a> straight away.\n</p>\n</td>\n</tr>\n\n<tr>\n<td style="background-color:#fafafa;border-top:1px solid #ededed;padding:24px 32px;color:#8a8a8a;font-size:12px;line-height:1.6;text-align:center;">\n<div style="margin-bottom:8px;font-weight:600;color:#5a5a5a;">TechnoCues</div>\n<div style="margin-bottom:4px;">Lahore</div>\n<div>03123456789 &nbsp;·&nbsp; <a href="mailto:info@technocues.com" style="color:#8a8a8a;text-decoration:underline;">info@technocues.com</a> &nbsp;·&nbsp; <a href="https://technocues.com/" style="color:#8a8a8a;text-decoration:underline;">https://technocues.com/</a></div>\n<div style="margin-top:12px;color:#a0a0a0;">\nThis is an automated message from the TechnoCues HR system. Please do not reply directly to this email.\n</div>\n<div style="margin-top:6px;color:#b0b0b0;">&copy; 2026 TechnoCues. All rights reserved.</div>\n</td>\n</tr>\n\n</table>\n</td>\n</tr>\n</table>\n</body>\n</html>	cancelled	5	5	2026-08-11 10:12:50.073+05	Stored SMTP password could not be decrypted. It may have been written with a different SMTP_ENCRYPTION_KEY — re-enter the password in SMTP settings.	\N	c64f66c9-639f-4913-8d6e-0304d51f1c20	2026-08-11 08:51:17.368019+05	2026-08-11 17:49:52.809083+05
7dfb30c8-903a-4996-a768-7eadef4c77f0	welcome_employee	general@clickupmarket.com	Ashan Mustafa	Welcome to TechnoCues, Ashan Mustafa!	<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8" />\n<meta name="viewport" content="width=device-width, initial-scale=1" />\n<title>Welcome to TechnoCues, Ashan Mustafa!</title>\n</head>\n<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">\n<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:24px 12px;">\n<tr>\n<td align="center">\n<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">\n\n<tr>\n<td style="background-color:#F1B344;padding:24px 32px;text-align:center;">\n<img src="https://technocues.com/wp-content/uploads/2020/09/330360314_589488222811539_5219190999614154994_n-removebg-preview.png" alt="TechnoCues" width="120" style="display:block;margin:0 auto 12px;max-width:180px;height:auto;border:0;" />\n<div style="font-size:19px;font-weight:700;color:#1a1a1a;letter-spacing:-0.2px;">TechnoCues</div>\n</td>\n</tr>\n\n<tr>\n<td style="padding:32px;color:#3a3a3a;font-size:15px;line-height:1.65;">\n<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a1a1a;">Welcome aboard, Ashan Mustafa!</h1>\n<p style="margin:0 0 14px;">We are delighted to have you join <strong>TechnoCues</strong> as Frontend in the Development team.</p>\n<p style="margin:0 0 14px;">Your employee record has been set up. You can sign in to the HR portal to view your profile, submit leave requests, check your attendance and see your payslips.</p>\n<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background-color:#fafafa;border-radius:8px;padding:8px 16px;">\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Employee ID</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">TC-EMP-005</td>\n</tr>\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Department</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">Development</td>\n</tr>\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Designation</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">Frontend</td>\n</tr>\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Work email</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">{{employee_email}}</td>\n</tr>\n</table>\n<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">\n<tr>\n<td align="center" style="background-color:#F1B344;border-radius:8px;">\n<a href="http://localhost:5173/login" style="display:inline-block;padding:13px 30px;font-size:15px;font-weight:600;color:#1a1a1a;text-decoration:none;">Sign in to the portal</a>\n</td>\n</tr>\n</table>\n<p style="margin:0;color:#8a8a8a;font-size:13px;">Questions about your account? Reach us at <a href="mailto:info@technocues.com" style="color:#9a6a17;">info@technocues.com</a>.</p>\n</td>\n</tr>\n\n<tr>\n<td style="background-color:#fafafa;border-top:1px solid #ededed;padding:24px 32px;color:#8a8a8a;font-size:12px;line-height:1.6;text-align:center;">\n<div style="margin-bottom:8px;font-weight:600;color:#5a5a5a;">TechnoCues</div>\n<div style="margin-bottom:4px;">Lahore</div>\n<div>03123456789 &nbsp;·&nbsp; <a href="mailto:info@technocues.com" style="color:#8a8a8a;text-decoration:underline;">info@technocues.com</a> &nbsp;·&nbsp; <a href="https://technocues.com/" style="color:#8a8a8a;text-decoration:underline;">https://technocues.com/</a></div>\n<div style="margin-top:12px;color:#a0a0a0;">\nThis is an automated message from the TechnoCues HR system. Please do not reply directly to this email.\n</div>\n<div style="margin-top:6px;color:#b0b0b0;">&copy; 2026 TechnoCues. All rights reserved.</div>\n</td>\n</tr>\n\n</table>\n</td>\n</tr>\n</table>\n</body>\n</html>	cancelled	5	5	2026-08-11 10:11:10.094+05	Stored SMTP password could not be decrypted. It may have been written with a different SMTP_ENCRYPTION_KEY — re-enter the password in SMTP settings.	\N	c64f66c9-639f-4913-8d6e-0304d51f1c20	2026-08-11 08:49:34.443911+05	2026-08-11 17:49:54.618697+05
810c08f9-d70f-4c2d-a744-fff7bfa89ff2	account_created	general@clickupmarket.com	Ashan Mustafa	Your TechnoCues account is ready	<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8" />\n<meta name="viewport" content="width=device-width, initial-scale=1" />\n<title>Your TechnoCues account is ready</title>\n</head>\n<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">\n<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:24px 12px;">\n<tr>\n<td align="center">\n<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">\n\n<tr>\n<td style="background-color:#F1B344;padding:24px 32px;text-align:center;">\n<img src="https://technocues.com/wp-content/uploads/2020/09/330360314_589488222811539_5219190999614154994_n-removebg-preview.png" alt="TechnoCues" width="120" style="display:block;margin:0 auto 12px;max-width:180px;height:auto;border:0;" />\n<div style="font-size:19px;font-weight:700;color:#1a1a1a;letter-spacing:-0.2px;">TechnoCues</div>\n</td>\n</tr>\n\n<tr>\n<td style="padding:32px;color:#3a3a3a;font-size:15px;line-height:1.65;">\n<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a1a1a;">Your account has been created</h1>\n<p style="margin:0 0 14px;">Hello Ashan Mustafa, an account has been created for you on the TechnoCues HR portal.</p>\n<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background-color:#fafafa;border-radius:8px;padding:8px 16px;">\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Employee ID</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">TC-EMP-005</td>\n</tr>\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Sign-in email</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">{{employee_email}}</td>\n</tr>\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Department</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">Development</td>\n</tr>\n</table>\n<p style="margin:0 0 14px;">Use the button below to set your password and activate your access. This link expires in {{expiry_minutes}} minutes.</p>\n<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">\n<tr>\n<td align="center" style="background-color:#F1B344;border-radius:8px;">\n<a href="{{reset_link}}" style="display:inline-block;padding:13px 30px;font-size:15px;font-weight:600;color:#1a1a1a;text-decoration:none;">Set your password</a>\n</td>\n</tr>\n</table>\n<p style="margin:20px 0 0;padding:14px 16px;background-color:#fff8e6;border-left:3px solid #F1B344;color:#5a5a5a;font-size:13px;line-height:1.6;">\nIf you did not expect this email, please contact <a href="mailto:info@technocues.com" style="color:#9a6a17;">info@technocues.com</a> straight away.\n</p>\n</td>\n</tr>\n\n<tr>\n<td style="background-color:#fafafa;border-top:1px solid #ededed;padding:24px 32px;color:#8a8a8a;font-size:12px;line-height:1.6;text-align:center;">\n<div style="margin-bottom:8px;font-weight:600;color:#5a5a5a;">TechnoCues</div>\n<div style="margin-bottom:4px;">Lahore</div>\n<div>03123456789 &nbsp;·&nbsp; <a href="mailto:info@technocues.com" style="color:#8a8a8a;text-decoration:underline;">info@technocues.com</a> &nbsp;·&nbsp; <a href="https://technocues.com/" style="color:#8a8a8a;text-decoration:underline;">https://technocues.com/</a></div>\n<div style="margin-top:12px;color:#a0a0a0;">\nThis is an automated message from the TechnoCues HR system. Please do not reply directly to this email.\n</div>\n<div style="margin-top:6px;color:#b0b0b0;">&copy; 2026 TechnoCues. All rights reserved.</div>\n</td>\n</tr>\n\n</table>\n</td>\n</tr>\n</table>\n</body>\n</html>	cancelled	5	5	2026-08-11 10:11:10.08+05	Stored SMTP password could not be decrypted. It may have been written with a different SMTP_ENCRYPTION_KEY — re-enter the password in SMTP settings.	\N	c64f66c9-639f-4913-8d6e-0304d51f1c20	2026-08-11 08:49:34.397486+05	2026-08-11 17:49:56.238799+05
f80fc3c4-b262-46f0-b67a-02575d35f2bb	welcome_employee	taa@gmail.com	Taha Tayyab	Welcome to TechnoCues, Taha Tayyab!	<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8" />\n<meta name="viewport" content="width=device-width, initial-scale=1" />\n<title>Welcome to TechnoCues, Taha Tayyab!</title>\n</head>\n<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">\n<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:24px 12px;">\n<tr>\n<td align="center">\n<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">\n\n<tr>\n<td style="background-color:#F1B344;padding:24px 32px;text-align:center;">\n<img src="https://technocues.com/wp-content/uploads/2020/09/330360314_589488222811539_5219190999614154994_n-removebg-preview.png" alt="TechnoCues" width="120" style="display:block;margin:0 auto 12px;max-width:180px;height:auto;border:0;" />\n<div style="font-size:19px;font-weight:700;color:#1a1a1a;letter-spacing:-0.2px;">TechnoCues</div>\n</td>\n</tr>\n\n<tr>\n<td style="padding:32px;color:#3a3a3a;font-size:15px;line-height:1.65;">\n<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a1a1a;">Welcome aboard, Taha Tayyab!</h1>\n<p style="margin:0 0 14px;">We are delighted to have you join <strong>TechnoCues</strong> as Backend in the Development team.</p>\n<p style="margin:0 0 14px;">Your employee record has been set up. You can sign in to the HR portal to view your profile, submit leave requests, check your attendance and see your payslips.</p>\n<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background-color:#fafafa;border-radius:8px;padding:8px 16px;">\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Employee ID</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">TC-EMP-006</td>\n</tr>\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Department</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">Development</td>\n</tr>\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Designation</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">Backend</td>\n</tr>\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Work email</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">{{employee_email}}</td>\n</tr>\n</table>\n<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">\n<tr>\n<td align="center" style="background-color:#F1B344;border-radius:8px;">\n<a href="http://localhost:5173/login" style="display:inline-block;padding:13px 30px;font-size:15px;font-weight:600;color:#1a1a1a;text-decoration:none;">Sign in to the portal</a>\n</td>\n</tr>\n</table>\n<p style="margin:0;color:#8a8a8a;font-size:13px;">Questions about your account? Reach us at <a href="mailto:info@technocues.com" style="color:#9a6a17;">info@technocues.com</a>.</p>\n</td>\n</tr>\n\n<tr>\n<td style="background-color:#fafafa;border-top:1px solid #ededed;padding:24px 32px;color:#8a8a8a;font-size:12px;line-height:1.6;text-align:center;">\n<div style="margin-bottom:8px;font-weight:600;color:#5a5a5a;">TechnoCues</div>\n<div style="margin-bottom:4px;">Lahore</div>\n<div>03123456789 &nbsp;·&nbsp; <a href="mailto:info@technocues.com" style="color:#8a8a8a;text-decoration:underline;">info@technocues.com</a> &nbsp;·&nbsp; <a href="https://technocues.com/" style="color:#8a8a8a;text-decoration:underline;">https://technocues.com/</a></div>\n<div style="margin-top:12px;color:#a0a0a0;">\nThis is an automated message from the TechnoCues HR system. Please do not reply directly to this email.\n</div>\n<div style="margin-top:6px;color:#b0b0b0;">&copy; 2026 TechnoCues. All rights reserved.</div>\n</td>\n</tr>\n\n</table>\n</td>\n</tr>\n</table>\n</body>\n</html>	failed	5	5	2026-08-11 21:57:40.041+05	Stored SMTP password could not be decrypted. It may have been written with a different SMTP_ENCRYPTION_KEY — re-enter the password in SMTP settings.	\N	43af610e-e846-4f7c-88bd-c51fc43f0d12	2026-08-11 20:36:08.955759+05	2026-08-11 21:57:50.051491+05
\.


--
-- Data for Name: email_template_versions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.email_template_versions (email_template_version_id, email_template_id, version, subject, body_html, changed_by_user_id, changed_by_email, created_at) FROM stdin;
\.


--
-- Data for Name: email_templates; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.email_templates (email_template_id, template_key, name, description, subject, body_html, enabled, version, updated_by_user_id, created_at, updated_at) FROM stdin;
34615aba-b356-4fde-9578-e6b67b80d85c	welcome_employee	Welcome Employee	Sent after an employee account is created, introducing them to the HR portal.	Welcome to {{company_name}}, {{employee_name}}!	<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a1a1a;">Welcome aboard, {{employee_name}}!</h1>\n<p style="margin:0 0 14px;">We are delighted to have you join <strong>{{company_name}}</strong> as {{designation}} in the {{department}} team.</p>\n<p style="margin:0 0 14px;">Your employee record has been set up. You can sign in to the HR portal to view your profile, submit leave requests, check your attendance and see your payslips.</p>\n<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background-color:#fafafa;border-radius:8px;padding:8px 16px;">\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Employee ID</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">{{employee_id}}</td>\n</tr>\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Department</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">{{department}}</td>\n</tr>\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Designation</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">{{designation}}</td>\n</tr>\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Work email</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">{{employee_email}}</td>\n</tr>\n</table>\n<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">\n<tr>\n<td align="center" style="background-color:{{primary_color}};border-radius:8px;">\n<a href="{{login_url}}" style="display:inline-block;padding:13px 30px;font-size:15px;font-weight:600;color:#1a1a1a;text-decoration:none;">Sign in to the portal</a>\n</td>\n</tr>\n</table>\n<p style="margin:0;color:#8a8a8a;font-size:13px;">Questions about your account? Reach us at <a href="mailto:{{support_email}}" style="color:#9a6a17;">{{support_email}}</a>.</p>	t	1	\N	2026-08-02 16:30:42.007972+05	2026-08-02 16:30:42.007972+05
f19cc6c8-9d83-4176-9d3f-3eb64e22ab30	account_created	Account Created	Notifies an employee that their login account exists and how to set a password.	Your {{company_name}} account is ready	<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a1a1a;">Your account has been created</h1>\n<p style="margin:0 0 14px;">Hello {{employee_name}}, an account has been created for you on the {{company_name}} HR portal.</p>\n<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background-color:#fafafa;border-radius:8px;padding:8px 16px;">\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Employee ID</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">{{employee_id}}</td>\n</tr>\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Sign-in email</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">{{employee_email}}</td>\n</tr>\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Department</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">{{department}}</td>\n</tr>\n</table>\n<p style="margin:0 0 14px;">Use the button below to set your password and activate your access. This link expires in {{expiry_minutes}} minutes.</p>\n<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">\n<tr>\n<td align="center" style="background-color:{{primary_color}};border-radius:8px;">\n<a href="{{reset_link}}" style="display:inline-block;padding:13px 30px;font-size:15px;font-weight:600;color:#1a1a1a;text-decoration:none;">Set your password</a>\n</td>\n</tr>\n</table>\n<p style="margin:20px 0 0;padding:14px 16px;background-color:#fff8e6;border-left:3px solid {{primary_color}};color:#5a5a5a;font-size:13px;line-height:1.6;">\nIf you did not expect this email, please contact <a href="mailto:{{support_email}}" style="color:#9a6a17;">{{support_email}}</a> straight away.\n</p>	t	1	\N	2026-08-02 16:30:42.007972+05	2026-08-02 16:30:42.007972+05
0a0d6e2d-e7e3-4dc0-b45f-bc5fcdf27c8b	account_activated	Account Activated	Confirms that an account is now active and able to sign in.	Your {{company_name}} account is now active	<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a1a1a;">Your account is active</h1>\n<p style="margin:0 0 14px;">Good news, {{employee_name}} — your {{company_name}} account has been activated and you can now sign in.</p>\n<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">\n<tr>\n<td align="center" style="background-color:{{primary_color}};border-radius:8px;">\n<a href="{{login_url}}" style="display:inline-block;padding:13px 30px;font-size:15px;font-weight:600;color:#1a1a1a;text-decoration:none;">Sign in</a>\n</td>\n</tr>\n</table>\n<p style="margin:0;color:#8a8a8a;font-size:13px;">If you have trouble signing in, contact <a href="mailto:{{support_email}}" style="color:#9a6a17;">{{support_email}}</a>.</p>	t	1	\N	2026-08-02 16:30:42.007972+05	2026-08-02 16:30:42.007972+05
4b02d119-25ff-45d0-8921-8ac36d899ce8	password_reset	Password Reset	Carries the one-time reset link produced by the forgot-password flow.	Reset your {{company_name}} password	<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a1a1a;">Reset your password</h1>\n<p style="margin:0 0 14px;">Hello {{employee_name}}, we received a request to reset the password for your {{company_name}} account.</p>\n<p style="margin:0 0 14px;">Click the button below to choose a new password. <strong>This link can be used once and expires in {{expiry_minutes}} minutes.</strong></p>\n<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">\n<tr>\n<td align="center" style="background-color:{{primary_color}};border-radius:8px;">\n<a href="{{reset_link}}" style="display:inline-block;padding:13px 30px;font-size:15px;font-weight:600;color:#1a1a1a;text-decoration:none;">Choose a new password</a>\n</td>\n</tr>\n</table>\n<p style="margin:0 0 14px;color:#8a8a8a;font-size:13px;">If the button does not work, copy and paste this address into your browser:<br />\n<span style="color:#9a6a17;word-break:break-all;">{{reset_link}}</span></p>\n<p style="margin:20px 0 0;padding:14px 16px;background-color:#fff8e6;border-left:3px solid {{primary_color}};color:#5a5a5a;font-size:13px;line-height:1.6;">\n<strong>Didn't request this?</strong> You can safely ignore this email — your password will not change unless you use the link above. If you are concerned, contact <a href="mailto:{{support_email}}" style="color:#9a6a17;">{{support_email}}</a>.\n</p>	t	1	\N	2026-08-02 16:30:42.007972+05	2026-08-02 16:30:42.007972+05
fa33079b-fef8-4693-aa3d-a30efe209eb4	password_changed	Password Changed	Security notice sent whenever a password changes, however it changed.	Your {{company_name}} password was changed	<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a1a1a;">Your password was changed</h1>\n<p style="margin:0 0 14px;">Hello {{employee_name}}, the password for your {{company_name}} account was changed on {{event_time}}.</p>\n<p style="margin:0 0 14px;">All other active sessions have been signed out, so you will need to sign in again on your other devices.</p>\n<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">\n<tr>\n<td align="center" style="background-color:{{primary_color}};border-radius:8px;">\n<a href="{{login_url}}" style="display:inline-block;padding:13px 30px;font-size:15px;font-weight:600;color:#1a1a1a;text-decoration:none;">Sign in</a>\n</td>\n</tr>\n</table>\n<p style="margin:20px 0 0;padding:14px 16px;background-color:#fdecea;border-left:3px solid #d93025;color:#5a5a5a;font-size:13px;line-height:1.6;">\n<strong>Was this not you?</strong> Your account may be compromised. Contact <a href="mailto:{{support_email}}" style="color:#9a6a17;">{{support_email}}</a> immediately.\n</p>	t	1	\N	2026-08-02 16:30:42.007972+05	2026-08-02 16:30:42.007972+05
607fa704-2fe7-416a-af2f-4e0bf7f6cac2	admin_reset_notification	Admin Reset Notification	Tells an employee that an administrator reset their password on their behalf.	Your {{company_name}} password has been reset by an administrator	<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a1a1a;">Your password was reset</h1>\n<p style="margin:0 0 14px;">Hello {{employee_name}}, an administrator at {{company_name}} reset the password on your account on {{event_time}}.</p>\n<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background-color:#fafafa;border-radius:8px;padding:8px 16px;">\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Employee ID</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">{{employee_id}}</td>\n</tr>\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Reset by</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">{{actor_name}}</td>\n</tr>\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">When</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">{{event_time}}</td>\n</tr>\n</table>\n<p style="margin:0 0 14px;">Use the link below to set a password only you know. It can be used once and expires in {{expiry_minutes}} minutes.</p>\n<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">\n<tr>\n<td align="center" style="background-color:{{primary_color}};border-radius:8px;">\n<a href="{{reset_link}}" style="display:inline-block;padding:13px 30px;font-size:15px;font-weight:600;color:#1a1a1a;text-decoration:none;">Set a new password</a>\n</td>\n</tr>\n</table>\n<p style="margin:20px 0 0;padding:14px 16px;background-color:#fff8e6;border-left:3px solid {{primary_color}};color:#5a5a5a;font-size:13px;line-height:1.6;">\nIf you did not expect this email, please contact <a href="mailto:{{support_email}}" style="color:#9a6a17;">{{support_email}}</a> straight away.\n</p>	t	1	\N	2026-08-02 16:30:42.007972+05	2026-08-02 16:30:42.007972+05
917e8055-5641-4b16-9a92-13de1cdb97d7	profile_updated	Profile Updated	Confirms a change to an employee profile.	Your {{company_name}} profile was updated	<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a1a1a;">Your profile was updated</h1>\n<p style="margin:0 0 14px;">Hello {{employee_name}}, changes were saved to your {{company_name}} profile on {{event_time}}.</p>\n<p style="margin:0 0 14px;">The following fields changed:</p>\n<p style="margin:0 0 20px;padding:14px 16px;background-color:#fafafa;border-radius:8px;color:#1a1a1a;font-size:14px;">{{changed_fields}}</p>\n<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">\n<tr>\n<td align="center" style="background-color:{{primary_color}};border-radius:8px;">\n<a href="{{profile_url}}" style="display:inline-block;padding:13px 30px;font-size:15px;font-weight:600;color:#1a1a1a;text-decoration:none;">View your profile</a>\n</td>\n</tr>\n</table>\n<p style="margin:20px 0 0;padding:14px 16px;background-color:#fff8e6;border-left:3px solid {{primary_color}};color:#5a5a5a;font-size:13px;line-height:1.6;">\nIf you did not expect this email, please contact <a href="mailto:{{support_email}}" style="color:#9a6a17;">{{support_email}}</a> straight away.\n</p>	t	1	\N	2026-08-02 16:30:42.007972+05	2026-08-02 16:30:42.007972+05
e0b7ae81-a17e-4d40-a2d3-65c009d04fb2	email_changed	Email Changed	Sent to the new address after the account email is changed.	Your {{company_name}} sign-in email was changed	<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a1a1a;">Your email address was changed</h1>\n<p style="margin:0 0 14px;">Hello {{employee_name}}, the email address on your {{company_name}} account was changed on {{event_time}}.</p>\n<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background-color:#fafafa;border-radius:8px;padding:8px 16px;">\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Previous email</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">{{previous_email}}</td>\n</tr>\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">New email</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">{{employee_email}}</td>\n</tr>\n</table>\n<p style="margin:0 0 14px;">From now on, use <strong>{{employee_email}}</strong> to sign in.</p>\n<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">\n<tr>\n<td align="center" style="background-color:{{primary_color}};border-radius:8px;">\n<a href="{{login_url}}" style="display:inline-block;padding:13px 30px;font-size:15px;font-weight:600;color:#1a1a1a;text-decoration:none;">Sign in</a>\n</td>\n</tr>\n</table>\n<p style="margin:20px 0 0;padding:14px 16px;background-color:#fdecea;border-left:3px solid #d93025;color:#5a5a5a;font-size:13px;line-height:1.6;">\n<strong>Did you not make this change?</strong> Contact <a href="mailto:{{support_email}}" style="color:#9a6a17;">{{support_email}}</a> immediately.\n</p>	t	1	\N	2026-08-02 16:30:42.007972+05	2026-08-02 16:30:42.007972+05
83f5c828-81c3-4b6b-bd35-2f1342f71e50	account_deactivated	Account Deactivated	Informs an employee that their portal access was switched off.	Your {{company_name}} account has been deactivated	<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a1a1a;">Your account has been deactivated</h1>\n<p style="margin:0 0 14px;">Hello {{employee_name}}, access to your {{company_name}} HR portal account was deactivated on {{event_time}}.</p>\n<p style="margin:0 0 14px;">You will not be able to sign in until the account is reactivated. Your employee record and history are retained.</p>\n<p style="margin:0;color:#8a8a8a;font-size:13px;">If you believe this is a mistake, please contact <a href="mailto:{{support_email}}" style="color:#9a6a17;">{{support_email}}</a>.</p>	t	1	\N	2026-08-02 16:30:42.007972+05	2026-08-02 16:30:42.007972+05
b6125682-8ea0-44ca-83fd-8f056f8ce053	account_reactivated	Account Reactivated	Informs an employee that their portal access was restored.	Your {{company_name}} account has been reactivated	<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a1a1a;">Welcome back, {{employee_name}}</h1>\n<p style="margin:0 0 14px;">Your {{company_name}} HR portal account was reactivated on {{event_time}} and you can sign in again.</p>\n<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">\n<tr>\n<td align="center" style="background-color:{{primary_color}};border-radius:8px;">\n<a href="{{login_url}}" style="display:inline-block;padding:13px 30px;font-size:15px;font-weight:600;color:#1a1a1a;text-decoration:none;">Sign in</a>\n</td>\n</tr>\n</table>\n<p style="margin:0;color:#8a8a8a;font-size:13px;">If you have forgotten your password, use the "Forgot password" link on the sign-in page.</p>	t	1	\N	2026-08-02 16:30:42.007972+05	2026-08-02 16:30:42.007972+05
0d506a1d-714c-43c7-ab0f-702db2f6d8ae	employee_invitation	Employee Invitation	Invites a new joiner to activate their account before their start date.	You're invited to join {{company_name}}	<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a1a1a;">You're invited to join {{company_name}}</h1>\n<p style="margin:0 0 14px;">Hello {{employee_name}}, you have been invited to set up your account on the {{company_name}} HR portal.</p>\n<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background-color:#fafafa;border-radius:8px;padding:8px 16px;">\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Employee ID</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">{{employee_id}}</td>\n</tr>\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Department</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">{{department}}</td>\n</tr>\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Designation</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">{{designation}}</td>\n</tr>\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Joining date</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">{{joining_date}}</td>\n</tr>\n</table>\n<p style="margin:0 0 14px;">Accept your invitation and set a password using the link below. It expires in {{expiry_minutes}} minutes.</p>\n<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">\n<tr>\n<td align="center" style="background-color:{{primary_color}};border-radius:8px;">\n<a href="{{reset_link}}" style="display:inline-block;padding:13px 30px;font-size:15px;font-weight:600;color:#1a1a1a;text-decoration:none;">Accept invitation</a>\n</td>\n</tr>\n</table>\n<p style="margin:0;color:#8a8a8a;font-size:13px;">Need help getting started? Email <a href="mailto:{{support_email}}" style="color:#9a6a17;">{{support_email}}</a>.</p>	t	1	\N	2026-08-02 16:30:42.007972+05	2026-08-02 16:30:42.007972+05
74515925-d774-49c4-a831-b86864a2e15d	appraisal_pending_reminder	Appraisal Pending Reminder	\N	Reminder: {{pending_count}} appraisal(s) pending before shift end	<p>Hi {{employee_name}},</p>\n<p>Your shift ends at {{shift_end_time}} and you still have\n<strong>{{pending_count}}</strong> appraisal form(s) awaiting submission\nfor {{review_date}}.</p>\n<p>Please complete them before the end of your shift.</p>\n<p><a href="{{login_url}}">Open your appraisal dashboard</a></p>\n<p>&mdash; {{company_name}}</p>	t	1	\N	2026-08-03 19:54:07.268021+05	2026-08-03 19:54:07.268021+05
eade11fd-ec81-42f9-ae1d-f214a977e9d1	appraisal_status_changed	Appraisal Status Changed	Notifies the reviewer when HR approves, rejects, or reopens a review they submitted.	Appraisal for {{employee_name}} was {{review_status}}	<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a1a1a;">Appraisal {{review_status}}</h1>\n<p style="margin:0 0 14px;">Hello {{reviewer_name}}, the appraisal you submitted for {{employee_name}} has been {{review_status}} by HR.</p>\n<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background-color:#fafafa;border-radius:8px;padding:8px 16px;">\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Employee</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">{{employee_name}}</td>\n</tr>\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Form</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">{{form_name}}</td>\n</tr>\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Period</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">{{review_period}}</td>\n</tr>\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">New status</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">{{review_status}}</td>\n</tr>\n</table>\n<p style="margin:0 0 14px;">Note from HR: {{review_comment}}</p>\n<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">\n<tr>\n<td align="center" style="background-color:{{primary_color}};border-radius:8px;">\n<a href="{{dashboard_url}}" style="display:inline-block;padding:13px 30px;font-size:15px;font-weight:600;color:#1a1a1a;text-decoration:none;">View appraisal</a>\n</td>\n</tr>\n</table>\n<p style="margin:0;color:#8a8a8a;font-size:13px;">A reopened appraisal is editable again and needs resubmitting.</p>	t	1	\N	2026-08-03 19:54:07.268021+05	2026-08-03 19:54:07.268021+05
ef0bebde-24c6-45a2-b292-dc1a8ad54152	meeting_invitation	Meeting Invitation	Invites a participant to a newly scheduled meeting, with the time, location and agenda.	Meeting invitation: {{meeting_title}}	<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a1a1a;">You are invited to a meeting</h1>\n<p style="margin:0 0 14px;">Hello {{employee_name}}, {{organizer_name}} has scheduled <strong>{{meeting_title}}</strong> and would like you to attend.</p>\n<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background-color:#fafafa;border-radius:8px;padding:8px 16px;">\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Meeting</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">{{meeting_title}}</td>\n</tr>\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">When</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">{{meeting_datetime}}</td>\n</tr>\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Location</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">{{meeting_location}}</td>\n</tr>\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Organizer</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">{{organizer_name}}</td>\n</tr>\n</table>\n<p style="margin:0 0 14px;padding:14px 16px;background-color:#f0f9ff;border-left:3px solid {{primary_color}};color:#5a5a5a;font-size:14px;line-height:1.6;"><strong>Agenda:</strong> {{meeting_agenda}}</p>\n<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">\n<tr>\n<td align="center" style="background-color:{{primary_color}};border-radius:8px;">\n<a href="{{meeting_url}}" style="display:inline-block;padding:13px 30px;font-size:15px;font-weight:600;color:#1a1a1a;text-decoration:none;">View in the portal</a>\n</td>\n</tr>\n</table>\n<p style="margin:0;color:#8a8a8a;font-size:13px;">Can't make it? Let {{organizer_name}} know as early as you can.</p>	t	1	\N	2026-08-08 09:33:37.830146+05	2026-08-08 09:33:37.830146+05
ccf29cc8-39ed-411c-8f00-b55c7cc0bd08	meeting_updated	Meeting Updated	Notifies participants that the time, location or agenda of a scheduled meeting has changed.	Updated: {{meeting_title}}	<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a1a1a;">A meeting has been updated</h1>\n<p style="margin:0 0 14px;">Hello {{employee_name}}, {{organizer_name}} has changed the details of <strong>{{meeting_title}}</strong>. The current details are below.</p>\n<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background-color:#fafafa;border-radius:8px;padding:8px 16px;">\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Meeting</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">{{meeting_title}}</td>\n</tr>\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">When</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">{{meeting_datetime}}</td>\n</tr>\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Location</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">{{meeting_location}}</td>\n</tr>\n<tr>\n<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">Organizer</td>\n<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">{{organizer_name}}</td>\n</tr>\n</table>\n<p style="margin:0 0 14px;padding:14px 16px;background-color:#f0f9ff;border-left:3px solid {{primary_color}};color:#5a5a5a;font-size:14px;line-height:1.6;"><strong>Agenda:</strong> {{meeting_agenda}}</p>\n<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">\n<tr>\n<td align="center" style="background-color:{{primary_color}};border-radius:8px;">\n<a href="{{meeting_url}}" style="display:inline-block;padding:13px 30px;font-size:15px;font-weight:600;color:#1a1a1a;text-decoration:none;">View in the portal</a>\n</td>\n</tr>\n</table>\n<p style="margin:0;color:#8a8a8a;font-size:13px;">Please update your calendar to match the time above.</p>	t	1	\N	2026-08-08 09:33:37.830146+05	2026-08-08 09:33:37.830146+05
b6d0b569-c41a-4cf1-8959-6ab823cb3018	meeting_cancelled	Meeting Cancelled	Tells participants a scheduled meeting was cancelled, and why.	Cancelled: {{meeting_title}}	<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a1a1a;">A meeting has been cancelled</h1>\n<p style="margin:0 0 14px;">Hello {{employee_name}}, <strong>{{meeting_title}}</strong>, scheduled for {{meeting_datetime}}, has been cancelled by {{organizer_name}}.</p>\n<p style="margin:0 0 14px;padding:14px 16px;background-color:#fff8e6;border-left:3px solid {{primary_color}};color:#5a5a5a;font-size:14px;line-height:1.6;"><strong>Reason:</strong> {{cancellation_reason}}</p>\n<p style="margin:0;color:#8a8a8a;font-size:13px;">You can remove this from your calendar. No further action is needed.</p>	t	1	\N	2026-08-08 09:33:37.830146+05	2026-08-08 09:33:37.830146+05
\.


--
-- Data for Name: employee_component_overrides; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.employee_component_overrides (override_id, user_id, component_id, override_calculation_type, override_amount, override_formula, effective_from, effective_to, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: employee_documents; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.employee_documents (document_id, "employeeId", category, original_name, stored_name, mime_type, size_bytes, uploaded_by, uploaded_at) FROM stdin;
\.


--
-- Data for Name: employee_loans; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.employee_loans (loan_id, user_id, name, principal, outstanding, installment_amount, start_period_id, status, remarks, created_at, updated_at, requested_at, decided_by, decided_at, decision_note) FROM stdin;
03fbdf55-ecf9-48a1-be57-f23ef2e0bcea	c64f66c9-639f-4913-8d6e-0304d51f1c20	Loan	1200000.00	200000.00	100000.00	\N	active	Repayment on every month from salary	2026-08-11 17:38:05.824255+05	2026-08-12 14:16:54.77592+05	2026-08-11 17:38:05.822+05	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-11 17:38:51.264+05	Approved
03cfdd24-3aa7-49f4-836d-79c3635834d2	c64f66c9-639f-4913-8d6e-0304d51f1c20	UI walkthrough — phone advance	36000.00	12000.00	12000.00	\N	active	Submitted from the employee tab during verification.	2026-08-11 18:28:02.991627+05	2026-08-12 14:16:54.77934+05	2026-08-11 18:28:02.99+05	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 09:25:46.456+05	\N
b520359a-5673-45e5-a908-e8c67b101b29	c64f66c9-639f-4913-8d6e-0304d51f1c20	Laptop advance (E2E Verify)	50000.00	0.00	10000.00	\N	rejected	\N	2026-08-11 18:10:22.659333+05	2026-08-11 18:10:22.756069+05	2026-08-11 18:10:22.658+05	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	2026-08-11 18:10:22.752+05	Existing advance still outstanding.
4ff72be7-047e-4320-9b3e-c8ed2582c6e1	c64f66c9-639f-4913-8d6e-0304d51f1c20	Bike advance (E2E Verify)	24000.00	0.00	24000.00	\N	closed	Filed by verify-payroll-e2e.	2026-08-11 18:10:22.117925+05	2026-08-11 18:10:23.808847+05	2026-08-11 18:10:22.116+05	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	2026-08-11 18:10:22.465+05	Approved by verify-payroll-e2e.
6d4df8d7-4714-46e4-97a4-f9fb9fe0c19d	c64f66c9-639f-4913-8d6e-0304d51f1c20	Laptop advance (E2E Verify)	50000.00	0.00	10000.00	\N	rejected	\N	2026-08-11 18:19:27.632532+05	2026-08-11 18:19:27.709023+05	2026-08-11 18:19:27.631+05	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	2026-08-11 18:19:27.704+05	Existing advance still outstanding.
f5060e7a-c9fd-4aa9-b3d3-0a7076ed7497	c64f66c9-639f-4913-8d6e-0304d51f1c20	Bike advance (E2E Verify)	24000.00	0.00	24000.00	\N	closed	Filed by verify-payroll-e2e.	2026-08-11 18:19:27.295816+05	2026-08-11 18:19:28.457807+05	2026-08-11 18:19:27.294+05	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	2026-08-11 18:19:27.485+05	Approved by verify-payroll-e2e.
d9c8d725-62bb-47ed-8ddb-91e2986f4077	c64f66c9-639f-4913-8d6e-0304d51f1c20	Salary advance (E2E Verify)	120000.00	0.00	10000.00	\N	closed	Created by verify-payroll-e2e.	2026-08-11 12:35:57.195955+05	2026-08-11 18:19:46.63459+05	\N	\N	\N	\N
dd588f49-be76-49a7-8986-03feed169683	c64f66c9-639f-4913-8d6e-0304d51f1c20	Laptop advance (E2E Verify)	50000.00	0.00	10000.00	\N	rejected	\N	2026-08-11 18:19:47.160401+05	2026-08-11 18:19:47.229453+05	2026-08-11 18:19:47.159+05	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	2026-08-11 18:19:47.226+05	Existing advance still outstanding.
7f4a1430-073c-49ac-8c42-bdd2f05ccafa	c64f66c9-639f-4913-8d6e-0304d51f1c20	Bike advance (E2E Verify)	24000.00	0.00	24000.00	\N	closed	Filed by verify-payroll-e2e.	2026-08-11 18:19:46.855301+05	2026-08-11 18:19:47.931063+05	2026-08-11 18:19:46.854+05	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	2026-08-11 18:19:47.006+05	Approved by verify-payroll-e2e.
\.


--
-- Data for Name: holidays; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.holidays (holiday_id, name, holiday_date, description, department_id, is_recurring, created_at, updated_at, event_type, notify, notified_at) FROM stdin;
c2b660b1-ada7-4f0c-8255-defbbc463679	Happy Independance Holidays	2026-08-14	\N	\N	t	2026-08-07 19:04:47.667742+05	2026-08-07 19:04:47.667742+05	Holiday	f	\N
\.


--
-- Data for Name: job_categories; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.job_categories (job_category_id, job_category_name, description) FROM stdin;
ef1e26a6-6712-44dd-8cd1-5bce35ca5f62	Permament	\n
\.


--
-- Data for Name: leave_entitlements; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.leave_entitlements (leave_entitlement_id, user_id, leave_type_id, year, entitled_days, carried_forward_days, adjusted_days, expired_days, created_by, created_at, updated_at) FROM stdin;
5032b277-65d6-4630-99c9-b72e8da06265	c64f66c9-639f-4913-8d6e-0304d51f1c20	d13488b5-e96b-4e1c-8407-66086af68c00	2026	0.00	0.00	14.00	0.00	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 13:58:06.434047+05	2026-08-12 13:58:06.434047+05
2acdf773-40e5-4059-a6ff-0296f6903f2d	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	d13488b5-e96b-4e1c-8407-66086af68c00	2026	30.00	0.00	-21.00	0.00	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 12:49:35.037046+05	2026-08-12 13:58:06.434047+05
a8069042-af10-487b-a687-18852d1bcc45	43af610e-e846-4f7c-88bd-c51fc43f0d12	d13488b5-e96b-4e1c-8407-66086af68c00	2026	30.00	0.00	-8.00	0.00	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-11 21:15:09.609626+05	2026-08-12 13:58:06.434047+05
8d772e9b-4a76-4073-a827-f848aa16d129	c64f66c9-639f-4913-8d6e-0304d51f1c20	42d6822e-d8fa-4801-a9ec-70f25a39aab5	2026	0.00	0.00	14.00	0.00	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 13:58:06.662107+05	2026-08-12 13:58:06.662107+05
593dabdd-86d2-4fa4-a89b-4a94ba0cada0	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	42d6822e-d8fa-4801-a9ec-70f25a39aab5	2026	0.00	0.00	14.00	0.00	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 13:58:06.662107+05	2026-08-12 13:58:06.662107+05
2dd7b853-4c98-4317-b77b-c0dac11a2ce9	43af610e-e846-4f7c-88bd-c51fc43f0d12	42d6822e-d8fa-4801-a9ec-70f25a39aab5	2026	0.00	0.00	28.00	0.00	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 13:50:10.883121+05	2026-08-12 13:58:06.662107+05
a63323c7-e651-4a10-ba95-19cf0427f3be	c64f66c9-639f-4913-8d6e-0304d51f1c20	f9142969-dfb1-4670-a3fe-43177f6941cf	2026	0.00	0.00	14.00	0.00	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 13:58:06.724575+05	2026-08-12 13:58:06.724575+05
8a417b8a-ac66-4d4d-bf94-5e4ff23106c9	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	f9142969-dfb1-4670-a3fe-43177f6941cf	2026	0.00	0.00	14.00	0.00	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 13:58:06.724575+05	2026-08-12 13:58:06.724575+05
27cb594e-ee50-49ee-80e6-297f02f590d9	43af610e-e846-4f7c-88bd-c51fc43f0d12	f9142969-dfb1-4670-a3fe-43177f6941cf	2026	0.00	0.00	28.00	0.00	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 13:50:10.845367+05	2026-08-12 13:58:06.724575+05
a9e4d25a-25d5-4f04-b5df-d765ef525168	c64f66c9-639f-4913-8d6e-0304d51f1c20	588ad7bd-2e0c-40bd-bd0b-d4618b340e5c	2026	0.00	0.00	14.00	0.00	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 13:58:06.785001+05	2026-08-12 13:58:06.785001+05
b6dfa2dc-91a8-4983-bccd-791b649fdd67	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	588ad7bd-2e0c-40bd-bd0b-d4618b340e5c	2026	0.00	0.00	28.00	0.00	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 13:18:05.753545+05	2026-08-12 13:58:06.785001+05
0854971f-a56b-4bfa-b032-ddb44aec0d68	43af610e-e846-4f7c-88bd-c51fc43f0d12	588ad7bd-2e0c-40bd-bd0b-d4618b340e5c	2026	0.00	0.00	28.00	0.00	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 13:50:10.772433+05	2026-08-12 13:58:06.785001+05
c33f221f-4bc1-4b1e-acdb-5624cf8ad1f6	c64f66c9-639f-4913-8d6e-0304d51f1c20	a27de783-fc24-4e40-a56c-9d88bd2149d0	2026	0.00	0.00	14.00	0.00	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 13:58:06.845195+05	2026-08-12 13:58:06.845195+05
f8e08395-11fb-4a7e-b13b-f8c309b1fcf1	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	a27de783-fc24-4e40-a56c-9d88bd2149d0	2026	0.00	0.00	14.00	0.00	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 13:58:06.845195+05	2026-08-12 13:58:06.845195+05
acfd0ee9-49f2-4a77-a33b-467ed53e7b87	43af610e-e846-4f7c-88bd-c51fc43f0d12	a27de783-fc24-4e40-a56c-9d88bd2149d0	2026	0.00	0.00	28.00	0.00	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 13:50:10.737175+05	2026-08-12 13:58:06.845195+05
2ab6824e-2063-45c1-8ae9-789af0991112	c64f66c9-639f-4913-8d6e-0304d51f1c20	ea84a0d7-bc22-44c2-8c9f-701ea0dd087d	2026	0.00	0.00	14.00	0.00	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 13:58:06.919996+05	2026-08-12 13:58:06.919996+05
d04aa12d-4ccc-4b3d-9447-5c84fba27e09	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	ea84a0d7-bc22-44c2-8c9f-701ea0dd087d	2026	0.00	0.00	14.00	0.00	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 13:58:06.919996+05	2026-08-12 13:58:06.919996+05
25e855a0-f44d-4db6-925b-85ba36a61683	43af610e-e846-4f7c-88bd-c51fc43f0d12	ea84a0d7-bc22-44c2-8c9f-701ea0dd087d	2026	0.00	0.00	28.00	0.00	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 13:50:10.808638+05	2026-08-12 13:58:06.919996+05
\.


--
-- Data for Name: leave_history; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.leave_history (leave_history_id, user_id, leave_type_id, year, type, amount, balance_after, note, reference_id, reference_type, performed_by, created_at) FROM stdin;
0be3e6ab-f8cb-47c7-af56-4d454cee0c6f	43af610e-e846-4f7c-88bd-c51fc43f0d12	d13488b5-e96b-4e1c-8407-66086af68c00	2026	Entitlement	10.00	30.00	\N	a8069042-af10-487b-a687-18852d1bcc45	LeaveEntitlement	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-11 21:15:09.609626+05
6b31e5f1-bd75-4709-9c1c-acec497deea6	43af610e-e846-4f7c-88bd-c51fc43f0d12	d13488b5-e96b-4e1c-8407-66086af68c00	2026	Entitlement	20.00	50.00	\N	a8069042-af10-487b-a687-18852d1bcc45	LeaveEntitlement	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-11 21:15:56.399627+05
9d293e40-522e-4574-a76f-064960aa1fa9	43af610e-e846-4f7c-88bd-c51fc43f0d12	d13488b5-e96b-4e1c-8407-66086af68c00	2026	Adjustment	-50.00	0.00	\N	a8069042-af10-487b-a687-18852d1bcc45	LeaveEntitlement	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-11 21:16:19.114823+05
41c84045-393b-4ab6-9578-ffa58fbdef59	43af610e-e846-4f7c-88bd-c51fc43f0d12	d13488b5-e96b-4e1c-8407-66086af68c00	2026	Adjustment	14.00	14.00	\N	a8069042-af10-487b-a687-18852d1bcc45	LeaveEntitlement	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 09:51:54.873978+05
4cc69923-d568-48b9-b345-d62d75544c20	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	d13488b5-e96b-4e1c-8407-66086af68c00	2026	Entitlement	30.00	50.00	\N	2acdf773-40e5-4059-a6ff-0296f6903f2d	LeaveEntitlement	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 12:49:35.037046+05
dcfb6440-df85-46ca-834f-1efaf77726f1	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	d13488b5-e96b-4e1c-8407-66086af68c00	2026	Adjustment	-35.00	15.00	\N	2acdf773-40e5-4059-a6ff-0296f6903f2d	LeaveEntitlement	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 12:50:48.343286+05
4b0be508-a9e1-45d2-82cb-d7501d34dee4	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	588ad7bd-2e0c-40bd-bd0b-d4618b340e5c	2026	Adjustment	14.00	14.00	\N	b6dfa2dc-91a8-4983-bccd-791b649fdd67	LeaveEntitlement	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 13:18:05.753545+05
2218edd4-b7a1-422e-93b4-d7bab7af441b	43af610e-e846-4f7c-88bd-c51fc43f0d12	d13488b5-e96b-4e1c-8407-66086af68c00	2026	Adjustment	14.00	28.00	\N	a8069042-af10-487b-a687-18852d1bcc45	LeaveEntitlement	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 13:50:10.635154+05
34cf7a0a-0ae4-4d50-9ef1-0824da322622	43af610e-e846-4f7c-88bd-c51fc43f0d12	a27de783-fc24-4e40-a56c-9d88bd2149d0	2026	Adjustment	14.00	19.00	\N	acfd0ee9-49f2-4a77-a33b-467ed53e7b87	LeaveEntitlement	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 13:50:10.737175+05
3fee9fa6-e987-4ab5-af5f-c229c7417022	43af610e-e846-4f7c-88bd-c51fc43f0d12	588ad7bd-2e0c-40bd-bd0b-d4618b340e5c	2026	Adjustment	14.00	24.00	\N	0854971f-a56b-4bfa-b032-ddb44aec0d68	LeaveEntitlement	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 13:50:10.772433+05
0727bfbf-92ae-462d-8880-838c6507087a	43af610e-e846-4f7c-88bd-c51fc43f0d12	ea84a0d7-bc22-44c2-8c9f-701ea0dd087d	2026	Adjustment	14.00	28.00	\N	25e855a0-f44d-4db6-925b-85ba36a61683	LeaveEntitlement	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 13:50:10.808638+05
7ca64446-6f64-43dc-85e9-184470ff1221	43af610e-e846-4f7c-88bd-c51fc43f0d12	f9142969-dfb1-4670-a3fe-43177f6941cf	2026	Adjustment	14.00	24.00	\N	27cb594e-ee50-49ee-80e6-297f02f590d9	LeaveEntitlement	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 13:50:10.845367+05
5bc0d23b-b088-499a-9224-5eb2ee4b9cd4	43af610e-e846-4f7c-88bd-c51fc43f0d12	42d6822e-d8fa-4801-a9ec-70f25a39aab5	2026	Adjustment	14.00	14.00	\N	2dd7b853-4c98-4317-b77b-c0dac11a2ce9	LeaveEntitlement	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 13:50:10.883121+05
6f1e14f7-8227-40c1-90c6-1f0a97142884	c64f66c9-639f-4913-8d6e-0304d51f1c20	d13488b5-e96b-4e1c-8407-66086af68c00	2026	Adjustment	14.00	14.00	\N	5032b277-65d6-4630-99c9-b72e8da06265	LeaveEntitlement	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 13:58:06.434047+05
c4822acc-ecf1-4154-b914-e3e4ac8aba5d	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	d13488b5-e96b-4e1c-8407-66086af68c00	2026	Adjustment	14.00	29.00	\N	2acdf773-40e5-4059-a6ff-0296f6903f2d	LeaveEntitlement	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 13:58:06.434047+05
53dcaaa0-7316-479d-aa00-6d799c3ecf00	43af610e-e846-4f7c-88bd-c51fc43f0d12	d13488b5-e96b-4e1c-8407-66086af68c00	2026	Adjustment	14.00	42.00	\N	a8069042-af10-487b-a687-18852d1bcc45	LeaveEntitlement	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 13:58:06.434047+05
575987f2-7379-4a06-a80f-9973e78b9823	c64f66c9-639f-4913-8d6e-0304d51f1c20	42d6822e-d8fa-4801-a9ec-70f25a39aab5	2026	Adjustment	14.00	14.00	\N	8d772e9b-4a76-4073-a827-f848aa16d129	LeaveEntitlement	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 13:58:06.662107+05
3bcfaff9-cfd6-4a07-b955-2192ff79d946	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	42d6822e-d8fa-4801-a9ec-70f25a39aab5	2026	Adjustment	14.00	14.00	\N	593dabdd-86d2-4fa4-a89b-4a94ba0cada0	LeaveEntitlement	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 13:58:06.662107+05
5c7d278b-7f80-4f64-8970-fcdcfbf93663	43af610e-e846-4f7c-88bd-c51fc43f0d12	42d6822e-d8fa-4801-a9ec-70f25a39aab5	2026	Adjustment	14.00	28.00	\N	2dd7b853-4c98-4317-b77b-c0dac11a2ce9	LeaveEntitlement	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 13:58:06.662107+05
cffefd00-14dd-4974-b9ad-52ce0dbabbbc	c64f66c9-639f-4913-8d6e-0304d51f1c20	f9142969-dfb1-4670-a3fe-43177f6941cf	2026	Adjustment	14.00	14.00	\N	a63323c7-e651-4a10-ba95-19cf0427f3be	LeaveEntitlement	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 13:58:06.724575+05
beaec970-e364-4525-8877-a144e29c8965	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	f9142969-dfb1-4670-a3fe-43177f6941cf	2026	Adjustment	14.00	14.00	\N	8a417b8a-ac66-4d4d-bf94-5e4ff23106c9	LeaveEntitlement	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 13:58:06.724575+05
156cd839-99b8-47e1-bf33-90ad224b3e9a	43af610e-e846-4f7c-88bd-c51fc43f0d12	f9142969-dfb1-4670-a3fe-43177f6941cf	2026	Adjustment	14.00	38.00	\N	27cb594e-ee50-49ee-80e6-297f02f590d9	LeaveEntitlement	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 13:58:06.724575+05
c730779e-4693-43d8-98e5-480e9147a2b2	c64f66c9-639f-4913-8d6e-0304d51f1c20	588ad7bd-2e0c-40bd-bd0b-d4618b340e5c	2026	Adjustment	14.00	14.00	\N	a9e4d25a-25d5-4f04-b5df-d765ef525168	LeaveEntitlement	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 13:58:06.785001+05
7b96769a-7a9c-415d-9d21-1a4cc27c47e6	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	588ad7bd-2e0c-40bd-bd0b-d4618b340e5c	2026	Adjustment	14.00	28.00	\N	b6dfa2dc-91a8-4983-bccd-791b649fdd67	LeaveEntitlement	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 13:58:06.785001+05
4f45a046-2b77-48d4-b7a3-9160b6ee31e8	43af610e-e846-4f7c-88bd-c51fc43f0d12	588ad7bd-2e0c-40bd-bd0b-d4618b340e5c	2026	Adjustment	14.00	38.00	\N	0854971f-a56b-4bfa-b032-ddb44aec0d68	LeaveEntitlement	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 13:58:06.785001+05
13486141-c335-48ce-b83c-c38ab405ce8f	c64f66c9-639f-4913-8d6e-0304d51f1c20	a27de783-fc24-4e40-a56c-9d88bd2149d0	2026	Adjustment	14.00	14.00	\N	c33f221f-4bc1-4b1e-acdb-5624cf8ad1f6	LeaveEntitlement	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 13:58:06.845195+05
78a7f9c4-98e8-4c17-8544-13221f23608f	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	a27de783-fc24-4e40-a56c-9d88bd2149d0	2026	Adjustment	14.00	14.00	\N	f8e08395-11fb-4a7e-b13b-f8c309b1fcf1	LeaveEntitlement	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 13:58:06.845195+05
5ad34abe-e36b-4ef7-ba4c-120cea10ba9b	43af610e-e846-4f7c-88bd-c51fc43f0d12	a27de783-fc24-4e40-a56c-9d88bd2149d0	2026	Adjustment	14.00	33.00	\N	acfd0ee9-49f2-4a77-a33b-467ed53e7b87	LeaveEntitlement	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 13:58:06.845195+05
b1199fdd-6855-48e4-a658-a340de3391b3	c64f66c9-639f-4913-8d6e-0304d51f1c20	ea84a0d7-bc22-44c2-8c9f-701ea0dd087d	2026	Adjustment	14.00	14.00	\N	2ab6824e-2063-45c1-8ae9-789af0991112	LeaveEntitlement	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 13:58:06.919996+05
06de2be0-b7b8-451c-82f4-5238179d9fdf	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	ea84a0d7-bc22-44c2-8c9f-701ea0dd087d	2026	Adjustment	14.00	14.00	\N	d04aa12d-4ccc-4b3d-9447-5c84fba27e09	LeaveEntitlement	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 13:58:06.919996+05
06415083-e248-433d-978a-b952995318a8	43af610e-e846-4f7c-88bd-c51fc43f0d12	ea84a0d7-bc22-44c2-8c9f-701ea0dd087d	2026	Adjustment	14.00	42.00	\N	25e855a0-f44d-4db6-925b-85ba36a61683	LeaveEntitlement	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 13:58:06.919996+05
\.


--
-- Data for Name: leave_requests; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.leave_requests (leave_id, leave_type, start_date, end_date, reason, status, applied_date, approved_date, user_id, approved_by, leave_type_id, is_half_day, days_count, duration_type, attachment_path, attachment_name, approval_reason, rejection_reason, cancellation_reason) FROM stdin;
86085c15-dcea-460c-8bce-57376a7e3b85	Annual Leave	2026-08-12	2026-08-12	abc	Rejected	2026-08-11 20:37:56.030755	\N	43af610e-e846-4f7c-88bd-c51fc43f0d12	\N	d13488b5-e96b-4e1c-8407-66086af68c00	f	\N	Full Day	\N	\N	\N	nhi ho skti	\N
\.


--
-- Data for Name: leave_types; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.leave_types (leave_type_id, name, description, is_paid, max_days_per_year, carry_forward_allowed, max_carry_forward_days, is_active, created_at, updated_at) FROM stdin;
d13488b5-e96b-4e1c-8407-66086af68c00	Annual Leave	Paid annual vacation entitlement	t	20	t	5	t	2026-08-01 16:07:51.898906+05	2026-08-01 16:07:51.898906+05
f9142969-dfb1-4670-a3fe-43177f6941cf	Sick Leave	Paid leave for illness or medical appointments	t	10	f	0	t	2026-08-01 16:07:51.898906+05	2026-08-01 16:07:51.898906+05
588ad7bd-2e0c-40bd-bd0b-d4618b340e5c	Casual Leave	Short-notice paid leave for personal matters	t	10	f	0	t	2026-08-01 16:07:51.898906+05	2026-08-01 16:07:51.898906+05
ea84a0d7-bc22-44c2-8c9f-701ea0dd087d	Paternity Leave	Paid leave following the birth of a child	t	14	f	0	t	2026-08-01 16:07:51.898906+05	2026-08-01 16:07:51.898906+05
a27de783-fc24-4e40-a56c-9d88bd2149d0	Bereavement Leave	Paid leave following the death of a family member	t	5	f	0	t	2026-08-01 16:07:51.898906+05	2026-08-01 16:07:51.898906+05
42d6822e-d8fa-4801-a9ec-70f25a39aab5	Unpaid Leave	Approved absence without pay	f	0	f	0	t	2026-08-01 16:07:51.898906+05	2026-08-01 16:07:51.898906+05
\.


--
-- Data for Name: loan_installments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.loan_installments (installment_id, loan_id, period_id, sequence, amount, status, balance_after, deducted_on, created_at) FROM stdin;
75f41d6e-b4ac-44d9-a3a1-b8db98be9b52	03fbdf55-ecf9-48a1-be57-f23ef2e0bcea	7df2fd08-d84e-465b-93a4-1d4320388650	3	100000.00	deducted	900000.00	2026-08-11 18:19:27.058+05	2026-08-11 17:38:55.358271+05
6823c193-977a-4984-b4a5-41cbf5639afa	03fbdf55-ecf9-48a1-be57-f23ef2e0bcea	e58d7e45-e64f-4204-9518-a28be5cbb016	4	100000.00	deducted	800000.00	2026-08-11 18:19:28.44+05	2026-08-11 17:38:55.358271+05
f3ab745f-5633-4a9a-bb1e-755a2237b464	f5060e7a-c9fd-4aa9-b3d3-0a7076ed7497	e58d7e45-e64f-4204-9518-a28be5cbb016	1	24000.00	deducted	0.00	2026-08-11 18:19:28.45+05	2026-08-11 18:19:27.495588+05
4dd6aaf6-967b-4b2d-a55f-7868233c19cf	03fbdf55-ecf9-48a1-be57-f23ef2e0bcea	9ecc2c16-336d-4f99-b363-ad4d994f914f	5	100000.00	deducted	700000.00	2026-08-11 18:19:30.068+05	2026-08-11 17:38:55.358271+05
b06b5cdc-0269-4e2f-a107-23b8bd0974d3	d9c8d725-62bb-47ed-8ddb-91e2986f4077	786e413c-7efa-480b-bf65-9e79a8a0cd7d	1	10000.00	deducted	110000.00	2026-08-11 12:35:57.556+05	2026-08-11 12:35:57.257+05
407683e8-dfbe-43f7-80ff-cb1b2c7cd883	d9c8d725-62bb-47ed-8ddb-91e2986f4077	56963f10-9845-4b19-ab24-53f541a99fcb	2	10000.00	deducted	100000.00	2026-08-11 12:51:59.782+05	2026-08-11 12:51:59.137+05
64cd1463-dcaa-4d76-9132-bb17760ad6b3	d9c8d725-62bb-47ed-8ddb-91e2986f4077	b3ccb701-b0ba-4a27-b632-2268e762aa44	3	10000.00	deducted	90000.00	2026-08-11 13:44:46.375+05	2026-08-11 13:44:45.671+05
2861a712-2f46-4635-a2ae-f1a9fb8e31c6	d9c8d725-62bb-47ed-8ddb-91e2986f4077	d776cd73-25b0-4a48-9846-6be4e3a3888d	4	10000.00	deducted	80000.00	2026-08-11 13:45:06.897+05	2026-08-11 13:45:06.196+05
7543b3d8-40ac-410a-ae11-b84786be4800	d9c8d725-62bb-47ed-8ddb-91e2986f4077	e4631de4-85d8-4c21-8673-5f48f08ff43b	5	10000.00	deducted	70000.00	2026-08-11 13:48:00.975+05	2026-08-11 13:48:00.189+05
3491b4d5-a7a4-404e-ae8a-c217353c31fe	d9c8d725-62bb-47ed-8ddb-91e2986f4077	60b5eed7-1cf5-41c4-99b7-4930a3a8acc7	6	10000.00	deducted	60000.00	2026-08-11 13:54:41.205+05	2026-08-11 13:48:00.189+05
ace689d3-46cf-4ed8-b996-9e44cd5f08ad	d9c8d725-62bb-47ed-8ddb-91e2986f4077	8e1c7908-84aa-4b65-9aa4-d0e78e4dfaad	7	10000.00	deducted	50000.00	2026-08-11 18:10:23.787+05	2026-08-11 18:10:21.463+05
55d09c8e-0810-426a-b3ca-0ae25dd1d943	d9c8d725-62bb-47ed-8ddb-91e2986f4077	5cee7748-a6ee-4672-99bd-079ec4e5ca7b	8	10000.00	deducted	40000.00	2026-08-11 18:10:25.477+05	2026-08-11 18:10:21.463+05
65bf46af-056f-465f-b206-454eda2e3f87	d9c8d725-62bb-47ed-8ddb-91e2986f4077	7df2fd08-d84e-465b-93a4-1d4320388650	9	10000.00	deducted	30000.00	2026-08-11 18:19:27.044+05	2026-08-11 18:19:26.454+05
3f5564c6-9da4-47b8-adde-e5270aaeb9e8	d9c8d725-62bb-47ed-8ddb-91e2986f4077	e58d7e45-e64f-4204-9518-a28be5cbb016	10	10000.00	deducted	20000.00	2026-08-11 18:19:28.429+05	2026-08-11 18:19:26.454+05
82c15c56-8417-46bb-bfd6-079dd835c416	d9c8d725-62bb-47ed-8ddb-91e2986f4077	9ecc2c16-336d-4f99-b363-ad4d994f914f	11	10000.00	deducted	10000.00	2026-08-11 18:19:30.058+05	2026-08-11 18:19:26.454+05
54f8cc25-822c-49e4-bef2-7c8a5ae84b74	03fbdf55-ecf9-48a1-be57-f23ef2e0bcea	b691a08f-f870-4d60-949f-d22355f5c7f8	6	100000.00	deducted	600000.00	2026-08-11 18:19:46.614+05	2026-08-11 17:38:55.358271+05
0c0d7040-b61b-4efa-b7cd-e1c5195afe08	d9c8d725-62bb-47ed-8ddb-91e2986f4077	b691a08f-f870-4d60-949f-d22355f5c7f8	12	10000.00	deducted	0.00	2026-08-11 18:19:46.625+05	2026-08-11 18:19:46.166625+05
92cddbb9-4213-4666-bbaf-19ecf0f0fcb4	03fbdf55-ecf9-48a1-be57-f23ef2e0bcea	39aba0a9-4946-4284-8b47-85dbe87992ab	7	100000.00	deducted	500000.00	2026-08-11 18:19:47.912+05	2026-08-11 17:38:55.358271+05
3ec13074-ce06-41b2-bbcf-c84df3034804	7f4a1430-073c-49ac-8c42-bdd2f05ccafa	39aba0a9-4946-4284-8b47-85dbe87992ab	1	24000.00	deducted	0.00	2026-08-11 18:19:47.922+05	2026-08-11 18:19:47.017762+05
9ea70113-5ba5-4ef9-9d43-1517363358f9	03fbdf55-ecf9-48a1-be57-f23ef2e0bcea	e0b4ebd0-cc8c-44a8-9183-447c53eebce8	8	100000.00	deducted	400000.00	2026-08-11 18:19:49.591+05	2026-08-11 17:38:55.358271+05
b4947754-cc52-4570-b567-f507e76ce0d9	03fbdf55-ecf9-48a1-be57-f23ef2e0bcea	\N	11	100000.00	scheduled	100000.00	\N	2026-08-11 17:38:55.358271+05
13b4293f-d674-4adb-9904-cee695c37a4d	03fbdf55-ecf9-48a1-be57-f23ef2e0bcea	\N	12	100000.00	scheduled	0.00	\N	2026-08-11 17:38:55.358271+05
227972f4-4ffa-4ba5-92b8-c32ed6e23fbc	03fbdf55-ecf9-48a1-be57-f23ef2e0bcea	8e1c7908-84aa-4b65-9aa4-d0e78e4dfaad	1	100000.00	deducted	1100000.00	2026-08-11 18:10:23.77+05	2026-08-11 17:38:55.358271+05
5d2a924d-2325-44e2-845f-dc568d6982d8	03cfdd24-3aa7-49f4-836d-79c3635834d2	\N	3	12000.00	scheduled	0.00	\N	2026-08-12 09:25:48.427054+05
7047ef2c-ab69-4ea5-8768-0ade975d3384	03fbdf55-ecf9-48a1-be57-f23ef2e0bcea	b1d57c8c-22b0-454c-8daf-59a5c0daa4c0	9	100000.00	deducted	300000.00	2026-08-12 13:25:33.996+05	2026-08-11 17:38:55.358271+05
c98cd562-64ef-4b7d-ad76-89e7ea5c652e	03cfdd24-3aa7-49f4-836d-79c3635834d2	b1d57c8c-22b0-454c-8daf-59a5c0daa4c0	1	12000.00	deducted	24000.00	2026-08-12 13:25:34.031+05	2026-08-12 09:25:48.427054+05
0d7083f3-4317-4358-9f40-739a0f5512d8	03fbdf55-ecf9-48a1-be57-f23ef2e0bcea	3362fd5c-5532-4068-9f86-62d64ac93ca5	10	100000.00	deducted	200000.00	2026-08-12 14:16:54.769+05	2026-08-11 17:38:55.358271+05
09a38809-27ad-4ab0-817f-8142df2bac6a	03cfdd24-3aa7-49f4-836d-79c3635834d2	3362fd5c-5532-4068-9f86-62d64ac93ca5	2	12000.00	deducted	12000.00	2026-08-12 14:16:54.776+05	2026-08-12 09:25:48.427054+05
76f8f6a7-b7af-4d4b-af5b-19e38defc56d	4ff72be7-047e-4320-9b3e-c8ed2582c6e1	8e1c7908-84aa-4b65-9aa4-d0e78e4dfaad	1	24000.00	deducted	0.00	2026-08-11 18:10:23.8+05	2026-08-11 18:10:22.487489+05
e6d64c01-b04d-44b8-9f06-7211212e7e17	03fbdf55-ecf9-48a1-be57-f23ef2e0bcea	5cee7748-a6ee-4672-99bd-079ec4e5ca7b	2	100000.00	deducted	1000000.00	2026-08-11 18:10:25.467+05	2026-08-11 17:38:55.358271+05
\.


--
-- Data for Name: meeting_participants; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.meeting_participants (meeting_participant_id, meeting_id, user_id, created_at) FROM stdin;
025dbfb9-e6bb-46a6-b065-d83c1c32f989	733a0f44-db9e-4f75-8433-957ff2013a50	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	2026-08-10 14:11:57.832994+05
fc1e8c3d-fcda-4732-be33-4565d3df4967	733a0f44-db9e-4f75-8433-957ff2013a50	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-10 14:11:57.832994+05
a2b8d2c0-b69e-4194-a744-9598b8e5ed33	eb50adfb-77ea-41dd-9005-0c6e14beed43	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	2026-08-10 17:34:26.873131+05
26d59dc3-9181-4fb0-bfab-98185bbeb537	eb50adfb-77ea-41dd-9005-0c6e14beed43	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-10 17:34:26.873131+05
\.


--
-- Data for Name: meetings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.meetings (meeting_id, title, scheduled_at, location, agenda, audience_type, audience_department_id, notify_email, notify_in_app, status, cancellation_reason, organizer_id, created_at, updated_at) FROM stdin;
733a0f44-db9e-4f75-8433-957ff2013a50	test	2026-08-12 12:00:00+05	In Room	\N	Specific	\N	t	t	Scheduled	\N	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-10 14:11:57.832994+05	2026-08-10 14:11:57.832994+05
eb50adfb-77ea-41dd-9005-0c6e14beed43	12323	2026-08-12 12:00:00+05	https://education.github.com/pack	Testing	All	\N	t	t	Scheduled	\N	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-10 17:34:26.873131+05	2026-08-10 17:34:26.873131+05
\.


--
-- Data for Name: migrations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.migrations (id, "timestamp", name) FROM stdin;
1	1784888634524	SecondLastSchema1784888634524
2	1785235704186	AppraisalAndPerformanceFinal1785235704186
3	1785409543305	UpdatedSchema1785409543305
4	1785500000000	AppraisalVerticalFixes1785500000000
5	1785600000000	SeedThreeRoleRbac1785600000000
6	1785700000000	AppraisalAssignments1785700000000
7	1785800000000	SeedTestAccounts1785800000000
8	1785900000000	RevokeLeadAuthoringGrants1785900000000
9	1786000000000	PermissionTaxonomyAndHrAdminGrants1786000000000
10	1786100000000	CreateRefreshTokens1786100000000
11	1786200000000	CreateCompanySettings1786200000000
15	1786300000000	CreateLeaveTypes1786300000000
16	1786400000000	SeedSettingsPermissions1786400000000
17	1786500000000	AddShiftBreakDuration1786500000000
18	1786600000000	CreateWorkingDaySchedules1786600000000
19	1786700000000	SeedWorkingDaysPermissions1786700000000
20	1786800000000	EmployeeManagementSchema1786800000000
21	1786900000000	SeedEmployeeManagementPermissions1786900000000
24	1787000000000	CreatePasswordResetTokens1787000000000
25	1787100000000	CreateMailInfrastructure1787100000000
32	1787200000000	AppraisalDynamicForms1787200000000
33	1787300000000	SeedAppraisalWorkflowPermissions1787300000000
34	1787400000000	AddFormQuestionActive1787400000000
35	1787500000000	SeedAppraisalEmailTemplates1787500000000
36	1787600000000	AddFormQuestionDescription1787600000000
37	1787700000000	GrantOrgWideEvaluation1787700000000
38	1787800000000	SeedPermissionUpdateGrant1787800000000
39	1787900000000	AttendanceCheckInNullable1787900000000
40	1788000000000	AddFormVersioning1788000000000
41	1788100000000	CreateEmployeeDocumentsTable1788100000000
42	1788200000000	CreateLeaveEntitlementSystem1788200000000
43	1788300000000	SeedLeaveEntitlementPermissions1788300000000
44	1788400000000	LeaveNotificationsAndRequestColumns1788400000000
45	1788500000000	GrantEmployeeLeaveTypeRead1788500000000
46	1788600000000	CreateMeetingsTables1788600000000
47	1788700000000	SeedMeetingPermissions1788700000000
48	1788800000000	SeedMeetingEmailTemplates1788800000000
49	1788900000000	WidenBankRoutingCodeForIban1788900000000
50	1789000000000	NotificationAudienceTargeting1789000000000
51	1789100000000	NotificationAttachmentAndSignatories1789100000000
52	1789200000000	CreatePayrollEngineSchema1789200000000
54	1789200000001	SeedPayrollModulePermissions1789200000001
55	1789200000002	SeedPayrollPhase2Permissions1789200000002
56	1789200000003	CreatePayrollPhase2Schema1789200000003
57	1789200000004	CreatePayrollPhase3Schema1789200000004
58	1789200000005	SeedPayrollPhase3Permissions1789200000005
59	1789200000006	AppraisalRatingMin1789200000006
60	1789300000000	AddEventSupportToHolidays1789300000000
\.


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.notifications (notification_id, title, message, created_at, created_by, category, recipient_id, read_at, link, reference_id, reference_type, batch_id, audience_type, audience_department_id, attachment_url, attachment_name, attachment_mime, attachment_size) FROM stdin;
839cb537-f37e-4b02-ac89-5dbd0d9f95fb	Ashan Mustafa submitted a loan request	Ashan Mustafa submitted a loan request: Laptop advance (E2E Verify) — 50000.00. Pending your approval.	2026-08-11 18:19:27.643	\N	Payroll	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 18:47:34.877111	/payroll/loans	6d4df8d7-4714-46e4-97a4-f9fb9fe0c19d	EmployeeLoan	\N	All	\N	\N	\N	\N	\N
833592fb-ed49-4c35-a36f-6be8414df786	Meeting invitation: test	Haseeb Iqbal invited you to "test" on 12 Aug 2026, 12:00 (In Room).	2026-08-10 14:11:57.932432	\N	Meeting Invitation	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	\N	/meetings	733a0f44-db9e-4f75-8433-957ff2013a50	Meeting	\N	All	\N	\N	\N	\N	\N
3aba6c2a-e7c8-48f7-a867-17553db15604	Meeting invitation: test	Haseeb Iqbal invited you to "test" on 12 Aug 2026, 12:00 (In Room).	2026-08-10 14:11:57.932432	\N	Meeting Invitation	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-10 14:12:23.613	/meetings	733a0f44-db9e-4f75-8433-957ff2013a50	Meeting	\N	All	\N	\N	\N	\N	\N
490b0c82-0642-4a65-99ef-e6ca583a5e71	Ashan Mustafa submitted a loan request	Ashan Mustafa submitted a loan request: Laptop advance (E2E Verify) — 50000.00. Pending your approval.	2026-08-11 18:19:27.643	\N	Payroll	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	\N	/payroll/loans	6d4df8d7-4714-46e4-97a4-f9fb9fe0c19d	EmployeeLoan	\N	All	\N	\N	\N	\N	\N
1763d510-a43a-4940-a39f-ca1852128ba0	Loan request rejected	Your loan request (Laptop advance (E2E Verify) — 50000.00) was rejected. Note: Existing advance still outstanding.	2026-08-11 18:19:27.716336	\N	Payroll	c64f66c9-639f-4913-8d6e-0304d51f1c20	\N	/payroll/my-loans	6d4df8d7-4714-46e4-97a4-f9fb9fe0c19d	EmployeeLoan	\N	All	\N	\N	\N	\N	\N
be3e19f2-0e96-4bdd-aea3-9fac4229221f	Ashan Mustafa submitted a expense claim	Ashan Mustafa submitted a expense claim: Client visit taxi (E2E Verify) — 3500.00. Pending your approval.	2026-08-11 18:19:27.91655	\N	Payroll	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	\N	/payroll/reimbursements	b5a115cf-0b27-4dc8-b8c1-c96fbbb1f0b9	Reimbursement	\N	All	\N	\N	\N	\N	\N
77a9ab53-90d3-4450-94f3-21d4b80bc1cd	Ashan Mustafa submitted a loan request	Ashan Mustafa submitted a loan request: Loan — 1200000.00. Pending your approval.	2026-08-11 17:38:06.03079	\N	Payroll	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	\N	/payroll/loans	03fbdf55-ecf9-48a1-be57-f23ef2e0bcea	EmployeeLoan	\N	All	\N	\N	\N	\N	\N
d4666ec8-9956-4f47-acad-fbce55caf3c3	Ashan Mustafa submitted a loan request	Ashan Mustafa submitted a loan request: Loan — 1200000.00. Pending your approval.	2026-08-11 17:38:06.03079	\N	Payroll	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-11 17:38:36.344	/payroll/loans	03fbdf55-ecf9-48a1-be57-f23ef2e0bcea	EmployeeLoan	\N	All	\N	\N	\N	\N	\N
f47cda99-00ea-492e-af8e-1fa428d825b5	Ashan Mustafa submitted a expense claim	Ashan Mustafa submitted a expense claim: Client — 20000.00. Pending your approval.	2026-08-11 17:39:24.805869	\N	Payroll	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	\N	/payroll/reimbursements	5794e838-015d-40d4-a028-adc166f2ea72	Reimbursement	\N	All	\N	\N	\N	\N	\N
e48df037-9315-4be2-a6b8-de1703e6ecb4	Ashan Mustafa submitted a expense claim	Ashan Mustafa submitted a expense claim: Client — 20000.00. Pending your approval.	2026-08-11 17:39:24.805869	\N	Payroll	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-11 17:39:38.479	/payroll/reimbursements	5794e838-015d-40d4-a028-adc166f2ea72	Reimbursement	\N	All	\N	\N	\N	\N	\N
e428702e-2a1b-4334-bacd-e04f8a87a0f7	Loan request approved	Your loan request (Loan — 1200000.00) was approved. Note: Approved Repayment installments start from your next payslip.	2026-08-11 17:38:51.315558	\N	Payroll	c64f66c9-639f-4913-8d6e-0304d51f1c20	2026-08-11 17:39:45.493	/payroll/my-loans	03fbdf55-ecf9-48a1-be57-f23ef2e0bcea	EmployeeLoan	\N	All	\N	\N	\N	\N	\N
72326e18-1dfb-4b06-8045-8b0f034ceab6	Expense claim approved	Your expense claim (Client — 20000.00) was approved. It will be added to your next payslip.	2026-08-11 17:39:41.795243	\N	Payroll	c64f66c9-639f-4913-8d6e-0304d51f1c20	2026-08-11 17:39:54.129	/payroll/my-reimbursements	5794e838-015d-40d4-a028-adc166f2ea72	Reimbursement	\N	All	\N	\N	\N	\N	\N
7f5dd921-7321-4e2a-93ee-28d1a45a24fb	Ashan Mustafa submitted a loan request	Ashan Mustafa submitted a loan request: Bike advance (E2E Verify) — 24000.00. Pending your approval.	2026-08-11 18:10:22.153879	\N	Payroll	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	\N	/payroll/loans	4ff72be7-047e-4320-9b3e-c8ed2582c6e1	EmployeeLoan	\N	All	\N	\N	\N	\N	\N
b7afb0b1-8842-4471-8723-434e8377eeb5	Loan request approved	Your loan request (Bike advance (E2E Verify) — 24000.00) was approved. Note: Approved by verify-payroll-e2e. Repayment installments start from your next payslip.	2026-08-11 18:10:22.505102	\N	Payroll	c64f66c9-639f-4913-8d6e-0304d51f1c20	\N	/payroll/my-loans	4ff72be7-047e-4320-9b3e-c8ed2582c6e1	EmployeeLoan	\N	All	\N	\N	\N	\N	\N
de01cbd4-d17d-4984-96c9-8e3ad3585717	Ashan Mustafa submitted a loan request	Ashan Mustafa submitted a loan request: Laptop advance (E2E Verify) — 50000.00. Pending your approval.	2026-08-11 18:10:22.670802	\N	Payroll	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	\N	/payroll/loans	b520359a-5673-45e5-a908-e8c67b101b29	EmployeeLoan	\N	All	\N	\N	\N	\N	\N
2b382f28-5e7a-4ab7-b1ae-595ee5de376c	Loan request rejected	Your loan request (Laptop advance (E2E Verify) — 50000.00) was rejected. Note: Existing advance still outstanding.	2026-08-11 18:10:22.762629	\N	Payroll	c64f66c9-639f-4913-8d6e-0304d51f1c20	\N	/payroll/my-loans	b520359a-5673-45e5-a908-e8c67b101b29	EmployeeLoan	\N	All	\N	\N	\N	\N	\N
95260be9-ba10-4e5a-95b4-ab85a8ccfb4c	Ashan Mustafa submitted a expense claim	Ashan Mustafa submitted a expense claim: Client visit taxi (E2E Verify) — 3500.00. Pending your approval.	2026-08-11 18:10:23.03372	\N	Payroll	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	\N	/payroll/reimbursements	953758ba-8239-45b3-a26a-8840296758b6	Reimbursement	\N	All	\N	\N	\N	\N	\N
8c7fbc3e-a3f6-499a-bf40-d1459abd247f	Expense claim approved	Your expense claim (Client visit taxi (E2E Verify) — 3500.00) was approved. Note: Receipt verified. It will be added to your next payslip.	2026-08-11 18:10:23.28956	\N	Payroll	c64f66c9-639f-4913-8d6e-0304d51f1c20	\N	/payroll/my-reimbursements	953758ba-8239-45b3-a26a-8840296758b6	Reimbursement	\N	All	\N	\N	\N	\N	\N
a70f5e05-9070-496c-8631-145b70dc863d	Ashan Mustafa submitted a expense claim	Ashan Mustafa submitted a expense claim: Client visit taxi (E2E Verify) — 3500.00. Pending your approval.	2026-08-11 18:10:23.03372	\N	Payroll	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-11 18:18:43.304	/payroll/reimbursements	953758ba-8239-45b3-a26a-8840296758b6	Reimbursement	\N	All	\N	\N	\N	\N	\N
ff0962e8-7735-484a-82cb-2169aa2da0b4	Ashan Mustafa submitted a loan request	Ashan Mustafa submitted a loan request: Bike advance (E2E Verify) — 24000.00. Pending your approval.	2026-08-11 18:19:27.306973	\N	Payroll	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	\N	/payroll/loans	f5060e7a-c9fd-4aa9-b3d3-0a7076ed7497	EmployeeLoan	\N	All	\N	\N	\N	\N	\N
227df6c0-1078-4ef4-97a5-e02ced6ee087	Loan request approved	Your loan request (Bike advance (E2E Verify) — 24000.00) was approved. Note: Approved by verify-payroll-e2e. Repayment installments start from your next payslip.	2026-08-11 18:19:27.505484	\N	Payroll	c64f66c9-639f-4913-8d6e-0304d51f1c20	\N	/payroll/my-loans	f5060e7a-c9fd-4aa9-b3d3-0a7076ed7497	EmployeeLoan	\N	All	\N	\N	\N	\N	\N
0cf2d178-b6a0-40d2-989f-19187f03d9c7	Ashan Mustafa submitted a loan request	Ashan Mustafa submitted a loan request: Bike advance (E2E Verify) — 24000.00. Pending your approval.	2026-08-11 18:10:22.153879	\N	Payroll	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 18:47:34.877111	/payroll/loans	4ff72be7-047e-4320-9b3e-c8ed2582c6e1	EmployeeLoan	\N	All	\N	\N	\N	\N	\N
16c8322d-bc4a-40b4-a14b-317044b332d6	Ashan Mustafa submitted a loan request	Ashan Mustafa submitted a loan request: Laptop advance (E2E Verify) — 50000.00. Pending your approval.	2026-08-11 18:10:22.670802	\N	Payroll	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 18:47:34.877111	/payroll/loans	b520359a-5673-45e5-a908-e8c67b101b29	EmployeeLoan	\N	All	\N	\N	\N	\N	\N
363bafe9-0687-4c69-8508-17047ef0467b	Ashan Mustafa submitted a loan request	Ashan Mustafa submitted a loan request: Bike advance (E2E Verify) — 24000.00. Pending your approval.	2026-08-11 18:19:27.306973	\N	Payroll	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 18:47:34.877111	/payroll/loans	f5060e7a-c9fd-4aa9-b3d3-0a7076ed7497	EmployeeLoan	\N	All	\N	\N	\N	\N	\N
ff997cf2-c41d-4568-8a8c-42bf31741e84	Expense claim approved	Your expense claim (Client visit taxi (E2E Verify) — 3500.00) was approved. Note: Receipt verified. It will be added to your next payslip.	2026-08-11 18:19:28.083018	\N	Payroll	c64f66c9-639f-4913-8d6e-0304d51f1c20	\N	/payroll/my-reimbursements	b5a115cf-0b27-4dc8-b8c1-c96fbbb1f0b9	Reimbursement	\N	All	\N	\N	\N	\N	\N
1602eb36-acc7-40bb-93d7-be498b9bbad4	Ashan Mustafa submitted a loan request	Ashan Mustafa submitted a loan request: Bike advance (E2E Verify) — 24000.00. Pending your approval.	2026-08-11 18:19:46.866522	\N	Payroll	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	\N	/payroll/loans	7f4a1430-073c-49ac-8c42-bdd2f05ccafa	EmployeeLoan	\N	All	\N	\N	\N	\N	\N
06bc552b-b074-4049-9846-df525cf39b9e	Loan request approved	Your loan request (Bike advance (E2E Verify) — 24000.00) was approved. Note: Approved by verify-payroll-e2e. Repayment installments start from your next payslip.	2026-08-11 18:19:47.028339	\N	Payroll	c64f66c9-639f-4913-8d6e-0304d51f1c20	\N	/payroll/my-loans	7f4a1430-073c-49ac-8c42-bdd2f05ccafa	EmployeeLoan	\N	All	\N	\N	\N	\N	\N
9e5b2394-5c0f-47a9-a92f-82182f995a3e	Ashan Mustafa submitted a loan request	Ashan Mustafa submitted a loan request: Laptop advance (E2E Verify) — 50000.00. Pending your approval.	2026-08-11 18:19:47.170649	\N	Payroll	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	\N	/payroll/loans	dd588f49-be76-49a7-8986-03feed169683	EmployeeLoan	\N	All	\N	\N	\N	\N	\N
6e44515f-e37b-4f96-9526-23e04473d04b	Loan request rejected	Your loan request (Laptop advance (E2E Verify) — 50000.00) was rejected. Note: Existing advance still outstanding.	2026-08-11 18:19:47.234803	\N	Payroll	c64f66c9-639f-4913-8d6e-0304d51f1c20	\N	/payroll/my-loans	dd588f49-be76-49a7-8986-03feed169683	EmployeeLoan	\N	All	\N	\N	\N	\N	\N
c663d5e6-1179-40eb-934f-1197c8338aeb	Ashan Mustafa submitted a expense claim	Ashan Mustafa submitted a expense claim: Client visit taxi (E2E Verify) — 3500.00. Pending your approval.	2026-08-11 18:19:47.403785	\N	Payroll	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	\N	/payroll/reimbursements	a2f77372-e846-49c2-9ded-a7040aa8da8c	Reimbursement	\N	All	\N	\N	\N	\N	\N
55b52eab-16c1-4178-8914-a6260fe0cc79	Ashan Mustafa submitted a loan request	Ashan Mustafa submitted a loan request: UI walkthrough — phone advance — 36000.00. Pending your approval.	2026-08-11 18:28:03.020367	\N	Payroll	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	\N	/payroll/loans	03cfdd24-3aa7-49f4-836d-79c3635834d2	EmployeeLoan	\N	All	\N	\N	\N	\N	\N
82c06766-dceb-4fd3-864f-fc32f2f4ef9b	Ashan Mustafa submitted a expense claim	Ashan Mustafa submitted a expense claim: UI walkthrough — client dinner — 2750.00. Pending your approval.	2026-08-11 18:30:20.251972	\N	Payroll	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	\N	/payroll/reimbursements	6a8f6305-7733-483d-896c-97fe0ab1bbe9	Reimbursement	\N	All	\N	\N	\N	\N	\N
9eb8503f-0221-4d19-9c5a-9133cff39d6a	Ashan Mustafa submitted a expense claim	Ashan Mustafa submitted a expense claim: UI walkthrough — client dinner — 2750.00. Pending your approval.	2026-08-11 18:30:20.251972	\N	Payroll	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-11 18:32:36.397	/payroll/reimbursements	6a8f6305-7733-483d-896c-97fe0ab1bbe9	Reimbursement	\N	All	\N	\N	\N	\N	\N
f82f31a2-4b89-429b-81f5-275313a9e96a	Ashan Mustafa submitted a loan request	Ashan Mustafa submitted a loan request: UI walkthrough — phone advance — 36000.00. Pending your approval.	2026-08-11 18:28:03.020367	\N	Payroll	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-11 18:32:39.064	/payroll/loans	03cfdd24-3aa7-49f4-836d-79c3635834d2	EmployeeLoan	\N	All	\N	\N	\N	\N	\N
1990c9fe-ced8-4300-a9b7-c93e03b2d8ca	Ashan Mustafa submitted a loan request	Ashan Mustafa submitted a loan request: Laptop advance (E2E Verify) — 50000.00. Pending your approval.	2026-08-11 18:19:47.170649	\N	Payroll	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-11 18:32:40.66	/payroll/loans	dd588f49-be76-49a7-8986-03feed169683	EmployeeLoan	\N	All	\N	\N	\N	\N	\N
5bd3dcb9-02b4-4802-8e38-6a747548dd1d	Ashan Mustafa submitted a expense claim	Ashan Mustafa submitted a expense claim: Client visit taxi (E2E Verify) — 3500.00. Pending your approval.	2026-08-11 18:19:27.91655	\N	Payroll	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-11 18:32:47.374	/payroll/reimbursements	b5a115cf-0b27-4dc8-b8c1-c96fbbb1f0b9	Reimbursement	\N	All	\N	\N	\N	\N	\N
225f8f59-52aa-4104-8e7f-79bca345ce09	Ashan Mustafa submitted a expense claim	Ashan Mustafa submitted a expense claim: Client visit taxi (E2E Verify) — 3500.00. Pending your approval.	2026-08-11 18:19:47.403785	\N	Payroll	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-11 19:07:07.976	/payroll/reimbursements	a2f77372-e846-49c2-9ded-a7040aa8da8c	Reimbursement	\N	All	\N	\N	\N	\N	\N
ec704be9-7380-4b7c-b112-4954642f197d	Ashan Mustafa submitted a loan request	Ashan Mustafa submitted a loan request: Bike advance (E2E Verify) — 24000.00. Pending your approval.	2026-08-11 18:19:46.866522	\N	Payroll	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-11 19:07:46.967	/payroll/loans	7f4a1430-073c-49ac-8c42-bdd2f05ccafa	EmployeeLoan	\N	All	\N	\N	\N	\N	\N
bcd5016d-0348-45c4-9bf2-a4255a798463	Expense claim approved	Your expense claim (Client visit taxi (E2E Verify) — 3500.00) was approved. Note: Receipt verified. It will be added to your next payslip.	2026-08-11 18:19:47.560033	\N	Payroll	c64f66c9-639f-4913-8d6e-0304d51f1c20	2026-08-11 19:21:10.771	/payroll/my-reimbursements	a2f77372-e846-49c2-9ded-a7040aa8da8c	Reimbursement	\N	All	\N	\N	\N	\N	\N
b0fe1b06-7cc0-4adb-88e3-47cee8a9640e	Taha Tayyab requested Annual Leave	Taha Tayyab requested Annual Leave from 2026-08-12 to 2026-08-12 (pending approval).	2026-08-11 20:37:56.030755	\N	Leave Submitted	c64f66c9-639f-4913-8d6e-0304d51f1c20	\N	/leave/requests	86085c15-dcea-460c-8bce-57376a7e3b85	LeaveRequest	\N	All	\N	\N	\N	\N	\N
1c604677-51f9-4099-893c-9f6f76d073cd	Taha Tayyab requested Annual Leave	Taha Tayyab requested Annual Leave from 2026-08-12 to 2026-08-12 (pending approval).	2026-08-11 20:37:56.030755	\N	Leave Submitted	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	\N	/leave/requests	86085c15-dcea-460c-8bce-57376a7e3b85	LeaveRequest	\N	All	\N	\N	\N	\N	\N
6b754cb2-3988-4b0a-9d1d-eb778f13369d	Taha Tayyab requested Annual Leave	Taha Tayyab requested Annual Leave from 2026-08-12 to 2026-08-12 (pending approval).	2026-08-11 20:37:56.030755	\N	Leave Submitted	43af610e-e846-4f7c-88bd-c51fc43f0d12	\N	/leave/requests	86085c15-dcea-460c-8bce-57376a7e3b85	LeaveRequest	\N	All	\N	\N	\N	\N	\N
ad425172-b42b-4bb2-acdb-39db0b7dd0c4	Leave request rejected	Taha Tayyab's Annual Leave request (2026-08-12 to 2026-08-12) was rejected. Reason: nhi ho skti	2026-08-11 20:39:23.86986	\N	Leave Rejected	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	\N	/leave/requests	86085c15-dcea-460c-8bce-57376a7e3b85	LeaveRequest	\N	All	\N	\N	\N	\N	\N
f23d8dfb-e7bc-4a97-8a60-e8a74baf6c60	Leave request rejected	Taha Tayyab's Annual Leave request (2026-08-12 to 2026-08-12) was rejected. Reason: nhi ho skti	2026-08-11 20:39:23.86986	\N	Leave Rejected	43af610e-e846-4f7c-88bd-c51fc43f0d12	\N	/leave/requests	86085c15-dcea-460c-8bce-57376a7e3b85	LeaveRequest	\N	All	\N	\N	\N	\N	\N
54c9ddba-3bdd-47da-8347-95a3a91710eb	Leave request rejected	Taha Tayyab's Annual Leave request (2026-08-12 to 2026-08-12) was rejected. Reason: nhi ho skti	2026-08-11 20:39:23.86986	\N	Leave Rejected	c64f66c9-639f-4913-8d6e-0304d51f1c20	2026-08-11 20:56:14.151	/leave/requests	86085c15-dcea-460c-8bce-57376a7e3b85	LeaveRequest	\N	All	\N	\N	\N	\N	\N
69da146e-eec3-4f1d-942f-a2b7cdbb8787	Leave balance updated	Your Annual Leave balance for 2026 was granted. You now have 10 day(s) entitled.	2026-08-11 21:15:09.679721	\N	Leave Balance Updated	43af610e-e846-4f7c-88bd-c51fc43f0d12	\N	/leave	\N	LeaveEntitlement	\N	All	\N	\N	\N	\N	\N
1d79be59-8e4c-4e02-a48f-16c00a47db5f	Leave balance updated	Your Annual Leave balance for 2026 was granted. You now have 30 day(s) entitled.	2026-08-11 21:15:56.456119	\N	Leave Balance Updated	43af610e-e846-4f7c-88bd-c51fc43f0d12	\N	/leave	\N	LeaveEntitlement	\N	All	\N	\N	\N	\N	\N
53cf38c8-608c-4c65-92f6-2f7b5802565b	Leave balance updated	Your Annual Leave balance for 2026 was deducted. You now have -20 day(s) entitled.	2026-08-11 21:16:19.146516	\N	Leave Balance Updated	43af610e-e846-4f7c-88bd-c51fc43f0d12	\N	/leave	\N	LeaveEntitlement	\N	All	\N	\N	\N	\N	\N
e146e264-48c4-4a49-b487-832b07a06ff2	Loan request approved	Your loan request (UI walkthrough — phone advance — 36000.00) was approved. Repayment installments start from your next payslip.	2026-08-12 09:25:46.486797	\N	Payroll	c64f66c9-639f-4913-8d6e-0304d51f1c20	\N	/payroll/my-loans	03cfdd24-3aa7-49f4-836d-79c3635834d2	EmployeeLoan	\N	All	\N	\N	\N	\N	\N
6e455df5-6148-4641-af36-29f1502a7455	Expense claim approved	Your expense claim (UI walkthrough — client dinner — 2750.00) was approved. It will be added to your next payslip.	2026-08-12 09:31:51.507261	\N	Payroll	c64f66c9-639f-4913-8d6e-0304d51f1c20	\N	/payroll/my-reimbursements	6a8f6305-7733-483d-896c-97fe0ab1bbe9	Reimbursement	\N	All	\N	\N	\N	\N	\N
534111c8-59ec-454d-a72e-fd6f137e5542	Taha Tayyab requested Annual Leave	Taha Tayyab requested Annual Leave from 2026-08-12 to 2026-08-12 (pending approval).	2026-08-11 20:37:56.030755	\N	Leave Submitted	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 18:47:34.877111	/leave/requests	86085c15-dcea-460c-8bce-57376a7e3b85	LeaveRequest	\N	All	\N	\N	\N	\N	\N
9dcd565c-77eb-4b34-a913-5bf677dd6a7a	Leave balance updated	Your Annual Leave balance for 2026 was increased. You now have -6 day(s) entitled.	2026-08-12 09:51:55.00271	\N	Leave Balance Updated	43af610e-e846-4f7c-88bd-c51fc43f0d12	\N	/leave	\N	LeaveEntitlement	\N	All	\N	\N	\N	\N	\N
7af76acb-5faf-4fbe-87e0-d7bcf56b5367	Leave balance updated	Your Annual Leave balance for 2026 was granted. You now have 30 day(s) entitled.	2026-08-12 12:49:35.144621	\N	Leave Balance Updated	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	\N	/leave	\N	LeaveEntitlement	\N	All	\N	\N	\N	\N	\N
64508b60-853a-4e31-b56b-f28c46e008e3	Leave balance updated	Your Annual Leave balance for 2026 was deducted. You now have -5 day(s) entitled.	2026-08-12 12:50:48.398254	\N	Leave Balance Updated	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	\N	/leave	\N	LeaveEntitlement	\N	All	\N	\N	\N	\N	\N
098b02e6-c098-49ba-bc3a-2f75a433c101	Leave balance updated	Your Casual Leave balance for 2026 was increased. You now have 14 day(s) entitled.	2026-08-12 13:18:05.834749	\N	Leave Balance Updated	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	\N	/leave	\N	LeaveEntitlement	\N	All	\N	\N	\N	\N	\N
83ea2e49-cfb0-4f9f-a355-9000c4528cf6	Leave balance updated	Your Annual Leave balance for 2026 was increased. You now have 8 day(s) entitled.	2026-08-12 13:50:10.695147	\N	Leave Balance Updated	43af610e-e846-4f7c-88bd-c51fc43f0d12	\N	/leave	\N	LeaveEntitlement	\N	All	\N	\N	\N	\N	\N
a0936397-084c-4b08-aa28-9c6e41bf7bfb	Leave balance updated	Your Bereavement Leave balance for 2026 was increased. You now have 14 day(s) entitled.	2026-08-12 13:50:10.748736	\N	Leave Balance Updated	43af610e-e846-4f7c-88bd-c51fc43f0d12	\N	/leave	\N	LeaveEntitlement	\N	All	\N	\N	\N	\N	\N
e54234a5-60c7-4824-8aad-b7259670561b	Leave balance updated	Your Casual Leave balance for 2026 was increased. You now have 14 day(s) entitled.	2026-08-12 13:50:10.783819	\N	Leave Balance Updated	43af610e-e846-4f7c-88bd-c51fc43f0d12	\N	/leave	\N	LeaveEntitlement	\N	All	\N	\N	\N	\N	\N
04f5f531-a7da-4eda-9766-e862fd91031c	Leave balance updated	Your Paternity Leave balance for 2026 was increased. You now have 14 day(s) entitled.	2026-08-12 13:50:10.821511	\N	Leave Balance Updated	43af610e-e846-4f7c-88bd-c51fc43f0d12	\N	/leave	\N	LeaveEntitlement	\N	All	\N	\N	\N	\N	\N
aa12388a-362c-4039-8765-d610a47fdf4c	Leave balance updated	Your Sick Leave balance for 2026 was increased. You now have 14 day(s) entitled.	2026-08-12 13:50:10.856035	\N	Leave Balance Updated	43af610e-e846-4f7c-88bd-c51fc43f0d12	\N	/leave	\N	LeaveEntitlement	\N	All	\N	\N	\N	\N	\N
d1ee7355-99e7-44eb-83b5-f6c79211cd4c	Leave balance updated	Your Unpaid Leave balance for 2026 was increased. You now have 14 day(s) entitled.	2026-08-12 13:50:10.895392	\N	Leave Balance Updated	43af610e-e846-4f7c-88bd-c51fc43f0d12	\N	/leave	\N	LeaveEntitlement	\N	All	\N	\N	\N	\N	\N
908df7f5-7bd9-4edd-b2e9-0a3d958913c7	Leave balance updated	Your Annual Leave balance for 2026 was increased. You now have 14 day(s) entitled.	2026-08-12 13:58:06.606978	\N	Leave Balance Updated	c64f66c9-639f-4913-8d6e-0304d51f1c20	\N	/leave	\N	LeaveEntitlement	\N	All	\N	\N	\N	\N	\N
ea7d934e-2de4-475b-aa2b-0e7f3274c8ee	Leave balance updated	Your Annual Leave balance for 2026 was increased. You now have 9 day(s) entitled.	2026-08-12 13:58:06.620975	\N	Leave Balance Updated	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	\N	/leave	\N	LeaveEntitlement	\N	All	\N	\N	\N	\N	\N
2f669edb-37cc-44ed-a4bc-7d052a81c7ac	Leave balance updated	Your Annual Leave balance for 2026 was increased. You now have 22 day(s) entitled.	2026-08-12 13:58:06.624282	\N	Leave Balance Updated	43af610e-e846-4f7c-88bd-c51fc43f0d12	\N	/leave	\N	LeaveEntitlement	\N	All	\N	\N	\N	\N	\N
ebf4aba4-a440-4910-b9af-b7180527c1a3	Leave balance updated	Your Unpaid Leave balance for 2026 was increased. You now have 14 day(s) entitled.	2026-08-12 13:58:06.689905	\N	Leave Balance Updated	c64f66c9-639f-4913-8d6e-0304d51f1c20	\N	/leave	\N	LeaveEntitlement	\N	All	\N	\N	\N	\N	\N
21e97dd4-3531-4b3b-9f10-cb37797bca07	Leave balance updated	Your Unpaid Leave balance for 2026 was increased. You now have 14 day(s) entitled.	2026-08-12 13:58:06.692768	\N	Leave Balance Updated	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	\N	/leave	\N	LeaveEntitlement	\N	All	\N	\N	\N	\N	\N
e7f2d939-c521-474d-ab8f-434ab8102fe3	Leave balance updated	Your Unpaid Leave balance for 2026 was increased. You now have 28 day(s) entitled.	2026-08-12 13:58:06.696546	\N	Leave Balance Updated	43af610e-e846-4f7c-88bd-c51fc43f0d12	\N	/leave	\N	LeaveEntitlement	\N	All	\N	\N	\N	\N	\N
b8c2e261-0fef-4e28-a9f5-5f13b57c135c	Leave balance updated	Your Sick Leave balance for 2026 was increased. You now have 14 day(s) entitled.	2026-08-12 13:58:06.754252	\N	Leave Balance Updated	c64f66c9-639f-4913-8d6e-0304d51f1c20	\N	/leave	\N	LeaveEntitlement	\N	All	\N	\N	\N	\N	\N
7194f67e-6d61-4d85-993d-4310680c54ae	Leave balance updated	Your Sick Leave balance for 2026 was increased. You now have 14 day(s) entitled.	2026-08-12 13:58:06.757298	\N	Leave Balance Updated	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	\N	/leave	\N	LeaveEntitlement	\N	All	\N	\N	\N	\N	\N
65dfcdaf-035b-44e0-9041-990076517565	Leave balance updated	Your Sick Leave balance for 2026 was increased. You now have 28 day(s) entitled.	2026-08-12 13:58:06.759966	\N	Leave Balance Updated	43af610e-e846-4f7c-88bd-c51fc43f0d12	\N	/leave	\N	LeaveEntitlement	\N	All	\N	\N	\N	\N	\N
b9274bc3-fd28-457c-a9ed-845154609625	Leave balance updated	Your Casual Leave balance for 2026 was increased. You now have 14 day(s) entitled.	2026-08-12 13:58:06.813534	\N	Leave Balance Updated	c64f66c9-639f-4913-8d6e-0304d51f1c20	\N	/leave	\N	LeaveEntitlement	\N	All	\N	\N	\N	\N	\N
ae6efcf2-5c7c-4ba3-b1fc-18d2ff886be2	Leave balance updated	Your Casual Leave balance for 2026 was increased. You now have 28 day(s) entitled.	2026-08-12 13:58:06.81612	\N	Leave Balance Updated	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	\N	/leave	\N	LeaveEntitlement	\N	All	\N	\N	\N	\N	\N
924e1c9a-d411-49d8-80b4-2f329278b5e5	Leave balance updated	Your Casual Leave balance for 2026 was increased. You now have 28 day(s) entitled.	2026-08-12 13:58:06.819031	\N	Leave Balance Updated	43af610e-e846-4f7c-88bd-c51fc43f0d12	\N	/leave	\N	LeaveEntitlement	\N	All	\N	\N	\N	\N	\N
3b0f41bc-cc3d-4b39-bd10-cd015dad0948	Leave balance updated	Your Bereavement Leave balance for 2026 was increased. You now have 14 day(s) entitled.	2026-08-12 13:58:06.873802	\N	Leave Balance Updated	c64f66c9-639f-4913-8d6e-0304d51f1c20	\N	/leave	\N	LeaveEntitlement	\N	All	\N	\N	\N	\N	\N
498efb26-00c3-4078-93f1-6f05d1c1a12c	Leave balance updated	Your Bereavement Leave balance for 2026 was increased. You now have 14 day(s) entitled.	2026-08-12 13:58:06.876857	\N	Leave Balance Updated	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	\N	/leave	\N	LeaveEntitlement	\N	All	\N	\N	\N	\N	\N
943e17d4-6249-466b-abbd-c659cc8593c0	Leave balance updated	Your Bereavement Leave balance for 2026 was increased. You now have 28 day(s) entitled.	2026-08-12 13:58:06.879519	\N	Leave Balance Updated	43af610e-e846-4f7c-88bd-c51fc43f0d12	\N	/leave	\N	LeaveEntitlement	\N	All	\N	\N	\N	\N	\N
8633b793-1bed-47d8-9c68-9d8df7d296cd	Leave balance updated	Your Paternity Leave balance for 2026 was increased. You now have 14 day(s) entitled.	2026-08-12 13:58:06.959258	\N	Leave Balance Updated	c64f66c9-639f-4913-8d6e-0304d51f1c20	\N	/leave	\N	LeaveEntitlement	\N	All	\N	\N	\N	\N	\N
1edff483-2064-4995-9189-c7d1f2baaa78	Leave balance updated	Your Paternity Leave balance for 2026 was increased. You now have 14 day(s) entitled.	2026-08-12 13:58:06.9624	\N	Leave Balance Updated	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	\N	/leave	\N	LeaveEntitlement	\N	All	\N	\N	\N	\N	\N
831adf82-a573-46b3-b859-c9cf042112e5	Leave balance updated	Your Paternity Leave balance for 2026 was increased. You now have 28 day(s) entitled.	2026-08-12 13:58:06.965158	\N	Leave Balance Updated	43af610e-e846-4f7c-88bd-c51fc43f0d12	\N	/leave	\N	LeaveEntitlement	\N	All	\N	\N	\N	\N	\N
410c7c28-0b2b-4866-abe4-930a5b990a1b	Leave request rejected	Taha Tayyab's Annual Leave request (2026-08-12 to 2026-08-12) was rejected. Reason: nhi ho skti	2026-08-11 20:39:23.86986	\N	Leave Rejected	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 18:47:30.307	/leave/requests	86085c15-dcea-460c-8bce-57376a7e3b85	LeaveRequest	\N	All	\N	\N	\N	\N	\N
\.


--
-- Data for Name: password_history; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.password_history (password_history_id, user_id, password_hash, created_at) FROM stdin;
2dbb12fa-70fd-4eb3-958e-fa0e0e5b4520	c64f66c9-639f-4913-8d6e-0304d51f1c20	$2b$12$5OldqaTBLAIuW.0HdkJu1ODn/70sZg5VO43CBxHqL4w4jGzWk7Iuy	2026-08-11 08:51:18.762735+05
\.


--
-- Data for Name: password_reset_tokens; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.password_reset_tokens (password_reset_token_id, user_id, token_hash, delivery_email, expires_at, used_at, invalidated_at, created_by_user_id, created_ip, created_at) FROM stdin;
79415cf5-9278-4128-83d1-66d008d6c09e	5269a7da-0db6-49b8-97eb-c2d482cb611a	690875ecbeb45d874bb9cd9446a9e623c78488f1ab96fd3d871a653f1ce96b1f	engmuhammadhaseebiqbal@gmail.com	2026-08-11 20:39:00.034+05	\N	2026-08-12 10:39:36.295+05	\N	127.0.0.1	2026-08-11 19:39:00.035769+05
5283b1c3-d45d-4782-b115-fa4027354cb3	5269a7da-0db6-49b8-97eb-c2d482cb611a	943182dccf2f6f8b40c31faacec54446a809b4af91620407d0333a1dfec91f8b	engmuhammadhaseebiqbal@gmail.com	2026-08-12 11:39:36.294+05	\N	\N	\N	127.0.0.1	2026-08-12 10:39:36.294761+05
\.


--
-- Data for Name: payroll; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.payroll (payroll_id, payroll_month, basic_salary, allowance, bonus, deduction, tax, net_salary, payment_date, user_id) FROM stdin;
303f9f18-5318-42ef-9010-6fffacd517ce	2026-08-01	599999.91	59999.99	0.00	12000.00	47999.99	599999.91	2026-08-05	c64f66c9-639f-4913-8d6e-0304d51f1c20
\.


--
-- Data for Name: payroll_periods; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.payroll_periods (period_id, name, frequency, period_start, period_end, pay_date, working_days, status, prepared_by, approved_by, processed_at, approved_at, locked_at, notes, created_at, updated_at) FROM stdin;
3c604777-f4f6-402c-a924-46117f2cebb4	October 2026	monthly	2026-11-01	2026-11-30	2026-12-02	0	draft	\N	\N	\N	\N	\N	\N	2026-08-12 14:43:39.925317+05	2026-08-12 14:43:39.925317+05
3362fd5c-5532-4068-9f86-62d64ac93ca5	September 2026	monthly	2026-10-01	2026-10-31	2026-10-09	0	locked	\N	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 14:16:54.668+05	2026-08-12 17:08:50.804+05	2026-08-12 17:08:53.541+05	\N	2026-08-12 14:16:14.860834+05	2026-08-12 17:08:53.54462+05
56963f10-9845-4b19-ab24-53f541a99fcb	E2E Verify — September 2026	monthly	2026-09-01	2026-09-30	2026-10-01	22	locked	\N	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	2026-08-11 12:51:59.723+05	2026-08-11 12:51:59.855+05	2026-08-11 12:51:59.887+05	\N	2026-08-11 12:51:59.681813+05	2026-08-11 12:51:59.889274+05
b1d57c8c-22b0-454c-8daf-59a5c0daa4c0	Sept	monthly	2026-09-01	2026-09-30	2026-10-02	0	locked	\N	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 13:25:30.343+05	2026-08-12 17:08:58.292+05	2026-08-12 17:09:00.568+05	\N	2026-08-12 13:25:06.241971+05	2026-08-12 17:09:00.571783+05
9ecc2c16-336d-4f99-b363-ad4d994f914f	E2E Verify — Approval Flow #5	monthly	2026-09-01	2026-09-30	2026-10-01	22	locked	\N	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	2026-08-11 18:19:29.966+05	2026-08-11 18:19:30.176+05	2026-08-11 18:19:30.233+05	\N	2026-08-11 18:19:29.91164+05	2026-08-11 18:19:30.235248+05
b3ccb701-b0ba-4a27-b632-2268e762aa44	E2E Verify — Approval Flow #1	monthly	2026-09-01	2026-09-30	2026-10-01	22	locked	\N	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	2026-08-11 13:44:46.277+05	2026-08-11 13:44:46.441+05	2026-08-11 13:44:46.47+05	\N	2026-08-11 13:44:46.240413+05	2026-08-11 13:44:46.471992+05
d776cd73-25b0-4a48-9846-6be4e3a3888d	E2E Verify — Approval Flow #2	monthly	2026-09-01	2026-09-30	2026-10-01	22	locked	\N	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	2026-08-11 13:45:06.823+05	2026-08-11 13:45:06.966+05	2026-08-11 13:45:06.999+05	\N	2026-08-11 13:45:06.7811+05	2026-08-11 13:45:07.000941+05
e4631de4-85d8-4c21-8673-5f48f08ff43b	E2E Verify — Approval Flow #3	monthly	2026-09-01	2026-09-30	2026-10-01	22	locked	\N	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	2026-08-11 13:48:00.916+05	2026-08-11 13:48:01.05+05	2026-08-11 13:48:01.082+05	\N	2026-08-11 13:48:00.86365+05	2026-08-11 13:48:01.084281+05
786e413c-7efa-480b-bf65-9e79a8a0cd7d	E2E Verify — August 2026	monthly	2026-08-01	2026-08-31	2026-09-01	21	locked	\N	\N	2026-08-11 13:48:00.402+05	2026-08-11 13:48:00.541+05	2026-08-11 14:00:55.418+05	\N	2026-08-11 12:35:56.449631+05	2026-08-11 14:00:55.420981+05
60b5eed7-1cf5-41c4-99b7-4930a3a8acc7	Sept 2026	monthly	2026-08-01	2026-08-31	2026-09-01	0	locked	\N	\N	2026-08-11 13:54:41.055+05	2026-08-11 13:54:41.226+05	2026-08-11 14:00:57.505+05	\N	2026-08-11 13:53:55.168361+05	2026-08-11 14:00:57.50638+05
e0b4ebd0-cc8c-44a8-9183-447c53eebce8	E2E Verify — Approval Flow #6	monthly	2026-09-01	2026-09-30	2026-10-01	22	locked	\N	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	2026-08-11 18:19:49.491+05	2026-08-11 18:19:49.716+05	2026-08-11 18:19:49.779+05	\N	2026-08-11 18:19:49.432805+05	2026-08-11 18:19:49.781695+05
8e1c7908-84aa-4b65-9aa4-d0e78e4dfaad	E2E Verify — Phase 3 #1	monthly	2026-10-01	2026-10-31	2026-11-01	22	locked	\N	\N	2026-08-11 18:10:24.062+05	2026-08-11 18:10:24.265+05	2026-08-11 19:46:21.251+05	\N	2026-08-11 18:10:21.987187+05	2026-08-11 19:46:21.254853+05
e58d7e45-e64f-4204-9518-a28be5cbb016	E2E Verify — Phase 3 #2	monthly	2026-10-01	2026-10-31	2026-11-01	22	locked	\N	\N	2026-08-11 18:19:28.69+05	2026-08-11 18:19:28.857+05	2026-08-11 19:46:22.849+05	\N	2026-08-11 18:19:27.213088+05	2026-08-11 19:46:22.851525+05
39aba0a9-4946-4284-8b47-85dbe87992ab	E2E Verify — Phase 3 #3	monthly	2026-10-01	2026-10-31	2026-11-01	22	locked	\N	\N	2026-08-11 18:19:48.175+05	2026-08-11 18:19:48.338+05	2026-08-11 19:46:23.959+05	\N	2026-08-11 18:19:46.782971+05	2026-08-11 19:46:23.961522+05
5cee7748-a6ee-4672-99bd-079ec4e5ca7b	E2E Verify — Approval Flow #4	monthly	2026-09-01	2026-09-30	2026-10-01	22	locked	\N	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	2026-08-11 18:10:25.704+05	2026-08-11 19:46:15.048+05	2026-08-11 19:46:26.501+05	\N	2026-08-11 18:10:25.311697+05	2026-08-11 19:46:26.504001+05
b691a08f-f870-4d60-949f-d22355f5c7f8	E2E Verify — August 2026 #3	monthly	2026-08-01	2026-08-31	2026-09-01	21	locked	\N	\N	2026-08-11 18:19:46.467+05	2026-08-11 18:19:46.677+05	2026-08-11 21:43:52.477+05	\N	2026-08-11 18:19:45.443547+05	2026-08-11 21:43:52.480414+05
7df2fd08-d84e-465b-93a4-1d4320388650	E2E Verify — August 2026 #2	monthly	2026-08-01	2026-08-31	2026-09-01	21	locked	\N	\N	2026-08-11 18:19:26.802+05	2026-08-11 18:19:27.11+05	2026-08-11 21:43:55.81+05	\N	2026-08-11 18:19:25.712187+05	2026-08-11 21:43:55.813113+05
\.


--
-- Data for Name: payroll_rules; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.payroll_rules (rule_id, rule_type, name, scope_type, scope_id, config, priority, is_active, effective_from, effective_to, version, superseded_by, created_at, updated_at) FROM stdin;
d293164b-92b8-491d-b2ce-dc340e967bc2	late	Late arrivals (E2E Verify)	company	\N	{"unit": "per_minute", "amount": 20, "grace_minutes": 15}	0	t	2026-01-01	\N	1	\N	2026-08-11 12:35:56.981636+05	2026-08-11 12:35:56.981636+05
b0708593-f453-4ce5-9156-23e637bb85d9	bonus	Monthly performance bonus (E2E Verify)	company	\N	{"amount": 5, "taxable": true, "trigger": "percent_gross"}	0	t	2026-01-01	\N	1	\N	2026-08-11 12:35:57.014256+05	2026-08-11 12:35:57.014256+05
bef57c2e-31d8-433c-90e0-ba3d3ae6a6a3	overtime	Weekend & holiday OT (E2E Verify)	company	\N	{"enabled": true, "applies_to": ["non_working_day", "govt_holiday"], "rate_multiplier": 2}	0	f	2026-01-01	\N	1	2bf9874e-e2e5-4cc6-ab94-f909619edf44	2026-08-11 12:35:56.88902+05	2026-08-11 12:35:57.053879+05
2bf9874e-e2e5-4cc6-ab94-f909619edf44	overtime	Weekend & holiday OT (E2E Verify)	company	\N	{"enabled": true, "applies_to": ["non_working_day", "govt_holiday"], "rate_multiplier": 1.5}	0	f	2026-01-01	\N	2	bd43350e-002c-403c-9b6b-5e99685c17f4	2026-08-11 12:35:57.047462+05	2026-08-11 12:50:42.233206+05
bd43350e-002c-403c-9b6b-5e99685c17f4	overtime	Weekend & holiday OT (E2E Verify)	company	\N	{"enabled": true, "applies_to": ["non_working_day", "govt_holiday"], "rate_multiplier": 1.5}	0	f	2026-01-01	\N	3	09f6628e-b2f2-4efc-82e2-757738615eef	2026-08-11 12:50:42.213359+05	2026-08-11 12:51:58.987447+05
3ec69e3b-6ce1-4d9f-a293-3bf38f8b14fc	overtime	E2E Verify — OT default check	department	f04f68cc-db96-4411-926a-ce34cfc41fa0	{"enabled": false, "applies_to": ["non_working_day"], "rate_multiplier": 1}	0	t	2026-01-01	\N	2	\N	2026-08-11 13:15:57.516917+05	2026-08-11 13:15:57.516917+05
21fa472e-efa4-4fe2-a980-5059744503b1	overtime	E2E Verify — OT default check	department	\N	{"enabled": false, "applies_to": ["non_working_day"], "rate_multiplier": 1}	0	f	2026-01-01	\N	1	3ec69e3b-6ce1-4d9f-a293-3bf38f8b14fc	2026-08-11 12:35:56.922161+05	2026-08-11 13:15:57.542933+05
09f6628e-b2f2-4efc-82e2-757738615eef	overtime	Weekend & holiday OT (E2E Verify)	company	\N	{"enabled": true, "applies_to": ["non_working_day", "govt_holiday"], "rate_multiplier": 1.5}	0	f	2026-01-01	\N	4	ed3b0bd4-f48c-460e-966a-5fe745967b21	2026-08-11 12:51:58.979389+05	2026-08-11 13:43:11.997732+05
ed3b0bd4-f48c-460e-966a-5fe745967b21	overtime	Weekend & holiday OT (E2E Verify)	company	\N	{"enabled": true, "applies_to": ["non_working_day", "govt_holiday"], "rate_multiplier": 1.5}	0	f	2026-01-01	\N	5	b91de4b4-b45d-4aff-800d-d6f800b02d88	2026-08-11 13:43:11.956606+05	2026-08-11 13:44:45.484473+05
b91de4b4-b45d-4aff-800d-d6f800b02d88	overtime	Weekend & holiday OT (E2E Verify)	company	\N	{"enabled": true, "applies_to": ["non_working_day", "govt_holiday"], "rate_multiplier": 1.5}	0	f	2026-01-01	\N	6	cd056c52-9963-4f0e-b86b-f3cdcdb1e371	2026-08-11 13:44:45.471437+05	2026-08-11 13:45:05.98027+05
cd056c52-9963-4f0e-b86b-f3cdcdb1e371	overtime	Weekend & holiday OT (E2E Verify)	company	\N	{"enabled": true, "applies_to": ["non_working_day", "govt_holiday"], "rate_multiplier": 1.5}	0	f	2026-01-01	\N	7	e64560d2-2ffb-44ea-9ccd-f52620116bf2	2026-08-11 13:45:05.972028+05	2026-08-11 13:47:59.951821+05
6e724cb0-dfe8-490c-9654-68e59a22bf20	absent	Standard absence deduction	company	\N	{"mode": "per_day", "multiplier": 1}	0	t	\N	\N	1	\N	2026-08-11 15:50:27.592195+05	2026-08-11 15:50:27.592195+05
e64560d2-2ffb-44ea-9ccd-f52620116bf2	overtime	Weekend & holiday OT (E2E Verify)	company	\N	{"enabled": true, "applies_to": ["non_working_day", "govt_holiday"], "rate_multiplier": 1.5}	0	f	2026-01-01	\N	8	3b1637bf-404c-4f2d-bef2-0cf2b7c6fa4d	2026-08-11 13:47:59.911824+05	2026-08-11 18:10:21.089087+05
3b1637bf-404c-4f2d-bef2-0cf2b7c6fa4d	overtime	Weekend & holiday OT (E2E Verify)	company	\N	{"enabled": true, "applies_to": ["non_working_day", "govt_holiday"], "rate_multiplier": 1.5}	0	f	2026-01-01	\N	9	664f3a86-709b-4d52-a8c3-b3508259d96f	2026-08-11 18:10:21.041868+05	2026-08-11 18:19:26.184924+05
767f780f-b69a-4956-926e-9be1a30c4c1c	overtime	Weekend & holiday OT (E2E Verify)	company	\N	{"enabled": true, "applies_to": ["non_working_day", "govt_holiday"], "rate_multiplier": 1.5}	0	t	2026-01-01	\N	11	\N	2026-08-11 18:19:45.903755+05	2026-08-11 18:19:45.903755+05
664f3a86-709b-4d52-a8c3-b3508259d96f	overtime	Weekend & holiday OT (E2E Verify)	company	\N	{"enabled": true, "applies_to": ["non_working_day", "govt_holiday"], "rate_multiplier": 1.5}	0	f	2026-01-01	\N	10	767f780f-b69a-4956-926e-9be1a30c4c1c	2026-08-11 18:19:26.17698+05	2026-08-11 18:19:45.908947+05
\.


--
-- Data for Name: payroll_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.payroll_settings (id, frequency, period_type, currency, working_days_source, fixed_working_days, working_hours_per_day, approval_enabled, auto_generate_payslip, employee_self_service, payroll_locking_enabled, payslip_close_day, overtime_enabled, rounding, created_at, updated_at) FROM stdin;
1	monthly	calendar	PKR	attendance	26	8.00	t	t	t	t	20	t	nearest	2026-08-11 06:28:16.910148+05	2026-08-11 19:44:27.127935+05
\.


--
-- Data for Name: payslip_lines; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.payslip_lines (line_id, payslip_id, component_id, label, type, amount, calc_note, display_order) FROM stdin;
19241234-a776-41c3-af75-bbd9781439d0	4f0d4d89-28ef-463d-a80d-e769bc0f5d00	\N	Basic Salary	earning	200000.00	Base salary for the period = 200000.00.	0
3b11a56d-bf4d-4bc3-abf4-1f738de21124	4f0d4d89-28ef-463d-a80d-e769bc0f5d00	311448ee-b38c-4503-a60b-b48ffbea70bf	House Rent Allowance (E2E Verify)	earning	80000.00	40% of BASIC (200000.00) = 80000.00.	1
73afbb22-7b8d-46c5-9f76-503517af9739	4f0d4d89-28ef-463d-a80d-e769bc0f5d00	\N	Monthly performance bonus (E2E Verify)	earning	14000.00	Bonus 5% of gross (280000.00) = 14000.00.	2
2300f533-5288-4365-8d95-f2f175ac3484	4f0d4d89-28ef-463d-a80d-e769bc0f5d00	3324ec1c-6276-4326-b290-c1954e02cce9	Provident Fund (E2E Verify)	deduction	10000.00	Formula "BASIC * 0.05" = 10000.00.	2
3143a3e2-f198-4f21-87f0-c5d3320059ff	4f0d4d89-28ef-463d-a80d-e769bc0f5d00	\N	Income Tax	deduction	44033.33	Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per "FBR Salaried 2026-27 (E2E Verify)")	9990
9ee74990-adb1-4a16-8a84-a7f1222810a3	4f0d4d89-28ef-463d-a80d-e769bc0f5d00	\N	Absence Deduction	deduction	19047.62	2 unpaid day(s) (2 absent + 0 unpaid leave) × daily rate (BASIC 200000.00 / 21 working days = 9523.81) = 19047.62.	9999
d1206165-aa7b-420f-b131-c8f15ad1fcf2	2552b8a8-87da-4cb5-8c26-5b379ddb302c	\N	Basic Salary	earning	200000.00	Base salary for the period = 200000.00.	0
d8a11e48-a310-45b1-8431-2985b692cf8e	2552b8a8-87da-4cb5-8c26-5b379ddb302c	311448ee-b38c-4503-a60b-b48ffbea70bf	House Rent Allowance (E2E Verify)	earning	80000.00	40% of BASIC (200000.00) = 80000.00.	1
3b4900f1-91fd-450f-a2f0-760b20130e81	2552b8a8-87da-4cb5-8c26-5b379ddb302c	\N	Monthly performance bonus (E2E Verify)	earning	14000.00	Bonus 5% of gross (280000.00) = 14000.00.	2
0c2bf4c7-b048-4456-bb98-14ec09325e68	2552b8a8-87da-4cb5-8c26-5b379ddb302c	3324ec1c-6276-4326-b290-c1954e02cce9	Provident Fund (E2E Verify)	deduction	10000.00	Formula "BASIC * 0.05" = 10000.00.	2
eb3e77de-d924-4fbb-be5a-d95967b108e8	2552b8a8-87da-4cb5-8c26-5b379ddb302c	\N	Income Tax	deduction	44033.33	Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per "FBR Salaried 2026-27 (E2E Verify)")	9990
32e3f497-ab38-4eb7-b6c8-39eed70e4f91	2552b8a8-87da-4cb5-8c26-5b379ddb302c	\N	Loan Repayment	deduction	10000.00	Salary advance (E2E Verify): 10000.00 (outstanding 90000.00 → 80000.00)	9991
d1f5ca5c-f344-4d6e-98d8-b952667cb65b	2552b8a8-87da-4cb5-8c26-5b379ddb302c	\N	Absence Deduction	deduction	9523.81	1 unpaid day(s) (1 absent + 0 unpaid leave) × daily rate (BASIC 200000.00 / 21 working days = 9523.81) = 9523.81.	9999
2018c41b-7a5c-4b8a-b9d1-28da8b3f2c1b	05aabf0d-c8d9-4953-9f8c-7ce882596c5a	\N	Basic Salary	earning	200000.00	Base salary for the period = 200000.00.	0
5adbe7d0-1686-4fa2-95ce-9687304b1d18	05aabf0d-c8d9-4953-9f8c-7ce882596c5a	311448ee-b38c-4503-a60b-b48ffbea70bf	House Rent Allowance (E2E Verify)	earning	80000.00	40% of BASIC (200000.00) = 80000.00.	1
0aaf92da-88b2-46d1-a9c2-ebff17b5845f	05aabf0d-c8d9-4953-9f8c-7ce882596c5a	\N	Monthly performance bonus (E2E Verify)	earning	14000.00	Bonus 5% of gross (280000.00) = 14000.00.	2
f1b6d1ca-d49c-4e5b-a82d-0ea0b4699750	05aabf0d-c8d9-4953-9f8c-7ce882596c5a	3324ec1c-6276-4326-b290-c1954e02cce9	Provident Fund (E2E Verify)	deduction	10000.00	Formula "BASIC * 0.05" = 10000.00.	2
0f1b5328-5550-4583-8259-2c8f673d30ee	05aabf0d-c8d9-4953-9f8c-7ce882596c5a	\N	Income Tax	deduction	44033.33	Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per "FBR Salaried 2026-27 (E2E Verify)")	9990
e580c3c6-0fdd-4a16-b7e2-9eee6cd903e8	7080b686-8d4d-4767-b880-03b97b3e4208	\N	Basic Salary	earning	200000.00	Base salary for the period = 200000.00.	0
27454a17-dab0-4ba9-bada-9bb52b1834fc	7080b686-8d4d-4767-b880-03b97b3e4208	311448ee-b38c-4503-a60b-b48ffbea70bf	House Rent Allowance (E2E Verify)	earning	80000.00	40% of BASIC (200000.00) = 80000.00.	1
ed347945-4b20-405d-b464-cf9726745a60	7080b686-8d4d-4767-b880-03b97b3e4208	\N	Monthly performance bonus (E2E Verify)	earning	14000.00	Bonus 5% of gross (280000.00) = 14000.00.	2
20416719-1487-4a5f-87b4-3a393ae940d9	7080b686-8d4d-4767-b880-03b97b3e4208	3324ec1c-6276-4326-b290-c1954e02cce9	Provident Fund (E2E Verify)	deduction	10000.00	Formula "BASIC * 0.05" = 10000.00.	2
227a9844-41c6-4afb-a491-af2269de7587	7080b686-8d4d-4767-b880-03b97b3e4208	\N	Income Tax	deduction	44033.33	Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per "FBR Salaried 2026-27 (E2E Verify)")	9990
a3be658d-b4b1-46b6-93a1-d819c5231609	dacc632c-9aa3-440d-938d-e5b70c2d0133	\N	Basic Salary	earning	200000.00	Base salary for the period = 200000.00.	0
91648dfe-b1d9-4d60-a67d-90d5af36cb16	dacc632c-9aa3-440d-938d-e5b70c2d0133	311448ee-b38c-4503-a60b-b48ffbea70bf	House Rent Allowance (E2E Verify)	earning	80000.00	40% of BASIC (200000.00) = 80000.00.	1
57ad8ade-a9e3-4bcc-988e-8edc224deef8	dacc632c-9aa3-440d-938d-e5b70c2d0133	\N	Monthly performance bonus (E2E Verify)	earning	14000.00	Bonus 5% of gross (280000.00) = 14000.00.	2
d4cedb79-071b-4b3c-8de1-51acf3b6f00b	dacc632c-9aa3-440d-938d-e5b70c2d0133	3324ec1c-6276-4326-b290-c1954e02cce9	Provident Fund (E2E Verify)	deduction	10000.00	Formula "BASIC * 0.05" = 10000.00.	2
ec8784ed-1cd0-4cad-a048-18dfcc813077	dacc632c-9aa3-440d-938d-e5b70c2d0133	\N	Income Tax	deduction	44033.33	Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per "FBR Salaried 2026-27 (E2E Verify)")	9990
dae931ae-81df-44fe-b337-34e5ddb18e9e	dacc632c-9aa3-440d-938d-e5b70c2d0133	\N	Loan Repayment	deduction	10000.00	Salary advance (E2E Verify): 10000.00 (outstanding 80000.00 → 70000.00)	9991
155fcddc-4e24-4bb8-afd0-20eb7fd74cf3	060778a9-1f5d-4f99-b722-d10c04e8813d	\N	Basic Salary	earning	200000.00	Base salary for the period = 200000.00.	0
9f0241a9-da1c-4a3d-a262-f61c441f1cb7	060778a9-1f5d-4f99-b722-d10c04e8813d	311448ee-b38c-4503-a60b-b48ffbea70bf	House Rent Allowance (E2E Verify)	earning	80000.00	40% of BASIC (200000.00) = 80000.00.	1
6cf0cc3d-04df-42c1-b792-4344e8d886fb	155cef2e-d2c5-4319-8695-7cd2ae131b44	\N	Basic Salary	earning	200000.00	Base salary for the period = 200000.00.	0
34a55205-9b34-42c3-8493-c0bab502f3b4	155cef2e-d2c5-4319-8695-7cd2ae131b44	311448ee-b38c-4503-a60b-b48ffbea70bf	House Rent Allowance (E2E Verify)	earning	80000.00	40% of BASIC (200000.00) = 80000.00.	1
bb561765-472a-46ad-b3a5-11e8d14170eb	155cef2e-d2c5-4319-8695-7cd2ae131b44	\N	Monthly performance bonus (E2E Verify)	earning	14000.00	Bonus 5% of gross (280000.00) = 14000.00.	2
2b7e9e0a-cf4e-4399-b8a7-020021acfb79	155cef2e-d2c5-4319-8695-7cd2ae131b44	3324ec1c-6276-4326-b290-c1954e02cce9	Provident Fund (E2E Verify)	deduction	10000.00	Formula "BASIC * 0.05" = 10000.00.	2
f8e12759-b01a-4012-aaaf-1fc81a8c3f74	155cef2e-d2c5-4319-8695-7cd2ae131b44	\N	Income Tax	deduction	44033.33	Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per "FBR Salaried 2026-27 (E2E Verify)")	9990
88917422-aa92-4f2a-ba00-9bf5d97b581b	f36bdfdc-96cc-463f-bfa7-94a6fff7ad32	\N	Basic Salary	earning	200000.00	Base salary for the period = 200000.00.	0
abe9298a-051c-4bc2-8132-f705759ae4fa	f36bdfdc-96cc-463f-bfa7-94a6fff7ad32	311448ee-b38c-4503-a60b-b48ffbea70bf	House Rent Allowance (E2E Verify)	earning	80000.00	40% of BASIC (200000.00) = 80000.00.	1
13292897-f39c-4cc4-97c5-a4c7bf40260f	f36bdfdc-96cc-463f-bfa7-94a6fff7ad32	\N	Monthly performance bonus (E2E Verify)	earning	14000.00	Bonus 5% of gross (280000.00) = 14000.00.	2
708f82e6-f1b5-4397-b6d7-b7d437b445e2	f36bdfdc-96cc-463f-bfa7-94a6fff7ad32	3324ec1c-6276-4326-b290-c1954e02cce9	Provident Fund (E2E Verify)	deduction	10000.00	Formula "BASIC * 0.05" = 10000.00.	2
14b06f17-7f9b-40de-b9a0-87f6368a63d3	f36bdfdc-96cc-463f-bfa7-94a6fff7ad32	\N	Income Tax	deduction	44033.33	Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per "FBR Salaried 2026-27 (E2E Verify)")	9990
adf36792-46b6-4076-b892-b01553d43e07	f36bdfdc-96cc-463f-bfa7-94a6fff7ad32	\N	Loan Repayment	deduction	10000.00	Salary advance (E2E Verify): 10000.00 (outstanding 110000.00 → 100000.00)	9991
3b2b6b91-d0ce-4006-a9d6-bb933fcaab6c	9b29072f-9db9-4a0e-86ab-34af6aeea0e3	\N	Basic Salary	earning	200000.00	Base salary for the period = 200000.00.	0
69abce6c-3353-41cc-8909-52fb6129e671	9b29072f-9db9-4a0e-86ab-34af6aeea0e3	311448ee-b38c-4503-a60b-b48ffbea70bf	House Rent Allowance (E2E Verify)	earning	80000.00	40% of BASIC (200000.00) = 80000.00.	1
ccc5b639-c023-46e4-a688-a595d4fe9483	9b29072f-9db9-4a0e-86ab-34af6aeea0e3	\N	Monthly performance bonus (E2E Verify)	earning	14000.00	Bonus 5% of gross (280000.00) = 14000.00.	2
1e67192c-35e2-4026-b361-671a64ab486c	9b29072f-9db9-4a0e-86ab-34af6aeea0e3	3324ec1c-6276-4326-b290-c1954e02cce9	Provident Fund (E2E Verify)	deduction	10000.00	Formula "BASIC * 0.05" = 10000.00.	2
76d4a775-1995-4805-8674-f65228f26911	9b29072f-9db9-4a0e-86ab-34af6aeea0e3	\N	Income Tax	deduction	44033.33	Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per "FBR Salaried 2026-27 (E2E Verify)")	9990
7cf8a994-56ce-4f6f-85dc-e32050cd4b92	060778a9-1f5d-4f99-b722-d10c04e8813d	\N	Monthly performance bonus (E2E Verify)	earning	14000.00	Bonus 5% of gross (280000.00) = 14000.00.	2
8f5ff362-c72e-47e2-90a5-72c0942fa72a	060778a9-1f5d-4f99-b722-d10c04e8813d	3324ec1c-6276-4326-b290-c1954e02cce9	Provident Fund (E2E Verify)	deduction	10000.00	Formula "BASIC * 0.05" = 10000.00.	2
65e124d4-4758-457c-81d5-88d2f5218dfd	060778a9-1f5d-4f99-b722-d10c04e8813d	\N	Income Tax	deduction	44033.33	Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per "FBR Salaried 2026-27 (E2E Verify)")	9990
1aec12ba-17ee-4a7e-acc6-e7d7a7085c2e	ef9aadd2-baad-441d-9c82-95c228aba4b6	\N	Basic Salary	earning	200000.00	Base salary for the period = 200000.00.	0
14688364-f4a3-4474-91c5-94845eae5725	ef9aadd2-baad-441d-9c82-95c228aba4b6	311448ee-b38c-4503-a60b-b48ffbea70bf	House Rent Allowance (E2E Verify)	earning	80000.00	40% of BASIC (200000.00) = 80000.00.	1
3dadf94f-5f3d-4e8e-9806-053c22178f87	ef9aadd2-baad-441d-9c82-95c228aba4b6	\N	Monthly performance bonus (E2E Verify)	earning	14000.00	Bonus 5% of gross (280000.00) = 14000.00.	2
abcb4c71-6edd-40a0-845c-a77e4a64a0c8	ef9aadd2-baad-441d-9c82-95c228aba4b6	3324ec1c-6276-4326-b290-c1954e02cce9	Provident Fund (E2E Verify)	deduction	10000.00	Formula "BASIC * 0.05" = 10000.00.	2
2e1218da-7b38-427e-99e2-4ee7bd3ea582	ef9aadd2-baad-441d-9c82-95c228aba4b6	\N	Income Tax	deduction	44033.33	Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per "FBR Salaried 2026-27 (E2E Verify)")	9990
32840992-e677-493a-9662-a215d0ad3a4a	f83830ee-70d5-49f3-a524-7043df125dce	\N	Basic Salary	earning	200000.00	Base salary for the period = 200000.00.	0
01659d2d-e7c6-44a2-96aa-3af030dd603a	f83830ee-70d5-49f3-a524-7043df125dce	311448ee-b38c-4503-a60b-b48ffbea70bf	House Rent Allowance (E2E Verify)	earning	80000.00	40% of BASIC (200000.00) = 80000.00.	1
f22e1ee4-b3d1-40b2-8d26-dfe1a6f97cd7	f83830ee-70d5-49f3-a524-7043df125dce	\N	Monthly performance bonus (E2E Verify)	earning	14000.00	Bonus 5% of gross (280000.00) = 14000.00.	2
3cafa98a-426a-4912-8603-6c7905a81cdb	f83830ee-70d5-49f3-a524-7043df125dce	3324ec1c-6276-4326-b290-c1954e02cce9	Provident Fund (E2E Verify)	deduction	10000.00	Formula "BASIC * 0.05" = 10000.00.	2
3bbcb01b-3958-41e7-bace-6fd681c3b67e	93f3b7fd-9a9b-414c-a5d7-ba36464ed606	\N	Basic Salary	earning	200000.00	Base salary for the period = 200000.00.	0
d55d79bd-48f7-48ef-8c63-f9b4e75edf67	93f3b7fd-9a9b-414c-a5d7-ba36464ed606	311448ee-b38c-4503-a60b-b48ffbea70bf	House Rent Allowance (E2E Verify)	earning	80000.00	40% of BASIC (200000.00) = 80000.00.	1
2bdafbce-4e50-43aa-ba13-560d4214ad9d	93f3b7fd-9a9b-414c-a5d7-ba36464ed606	\N	Monthly performance bonus (E2E Verify)	earning	14000.00	Bonus 5% of gross (280000.00) = 14000.00.	2
8db001c1-5137-43a5-af9b-be586e036daa	93f3b7fd-9a9b-414c-a5d7-ba36464ed606	3324ec1c-6276-4326-b290-c1954e02cce9	Provident Fund (E2E Verify)	deduction	10000.00	Formula "BASIC * 0.05" = 10000.00.	2
7f545de1-6f4b-4cc3-809e-38c33ddfba8b	93f3b7fd-9a9b-414c-a5d7-ba36464ed606	\N	Income Tax	deduction	44033.33	Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per "FBR Salaried 2026-27 (E2E Verify)")	9990
14fd2663-ea06-4700-8084-9447525b098d	93f3b7fd-9a9b-414c-a5d7-ba36464ed606	\N	Absence Deduction	deduction	20000.00	2 unpaid day(s) (2 absent + 0 unpaid leave) × daily rate (BASIC 200000.00 / 20 working days = 10000.00) = 20000.00.	9999
5a2a35d8-ba9b-4a70-9e78-30f063fb33ad	3f37712a-0277-40a8-8eb7-c33a9327d0ad	\N	Basic Salary	earning	200000.00	Base salary for the period = 200000.00.	0
6282347a-64bc-4ee1-805d-e453898543b4	8fb9866e-6f2d-4e73-bef0-db90cdf68bdd	\N	Basic Salary	earning	200000.00	Base salary for the period = 200000.00.	0
f6da4a41-088e-43e3-a1e3-5680a0fbf352	8fb9866e-6f2d-4e73-bef0-db90cdf68bdd	311448ee-b38c-4503-a60b-b48ffbea70bf	House Rent Allowance (E2E Verify)	earning	80000.00	40% of BASIC (200000.00) = 80000.00.	1
7f295d89-3045-4748-aa05-c77d1ebb0e7e	8fb9866e-6f2d-4e73-bef0-db90cdf68bdd	\N	Monthly performance bonus (E2E Verify)	earning	14000.00	Bonus 5% of gross (280000.00) = 14000.00.	2
c4542de1-2fc2-447a-b069-1e4b42af303a	8fb9866e-6f2d-4e73-bef0-db90cdf68bdd	3324ec1c-6276-4326-b290-c1954e02cce9	Provident Fund (E2E Verify)	deduction	10000.00	Formula "BASIC * 0.05" = 10000.00.	2
e2bdcc55-bf64-4d60-892f-5df75f95c1d5	8fb9866e-6f2d-4e73-bef0-db90cdf68bdd	\N	Income Tax	deduction	44033.33	Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per "FBR Salaried 2026-27 (E2E Verify)")	9990
f44d0bfc-7b25-4e1f-8491-56c3320a17a9	453f8ab2-14f3-4180-bbb0-78683e205740	\N	Basic Salary	earning	200000.00	Base salary for the period = 200000.00.	0
a7576283-1b1a-4960-a2fa-4bdfc9815d1a	453f8ab2-14f3-4180-bbb0-78683e205740	311448ee-b38c-4503-a60b-b48ffbea70bf	House Rent Allowance (E2E Verify)	earning	80000.00	40% of BASIC (200000.00) = 80000.00.	1
72918807-4407-4cda-b647-4d5086247487	453f8ab2-14f3-4180-bbb0-78683e205740	\N	Monthly performance bonus (E2E Verify)	earning	14000.00	Bonus 5% of gross (280000.00) = 14000.00.	2
b7363c8a-3a46-4965-872a-93ef3761501f	453f8ab2-14f3-4180-bbb0-78683e205740	3324ec1c-6276-4326-b290-c1954e02cce9	Provident Fund (E2E Verify)	deduction	10000.00	Formula "BASIC * 0.05" = 10000.00.	2
b92cef73-3599-4ee3-8c15-3b5113d4d223	453f8ab2-14f3-4180-bbb0-78683e205740	\N	Income Tax	deduction	44033.33	Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per "FBR Salaried 2026-27 (E2E Verify)")	9990
6f337497-526e-475e-9f11-89902c355c75	453f8ab2-14f3-4180-bbb0-78683e205740	\N	Loan Repayment	deduction	10000.00	Salary advance (E2E Verify): 10000.00 (outstanding 100000.00 → 90000.00)	9991
043b6862-14df-44dc-ae2e-7bbaceb03839	1bfb68d7-fd42-4f6a-8265-acd64e0e3a82	\N	Basic Salary	earning	200000.00	Base salary for the period = 200000.00.	0
f1cf2d85-8c7b-4d32-b3d4-af639449acff	1bfb68d7-fd42-4f6a-8265-acd64e0e3a82	311448ee-b38c-4503-a60b-b48ffbea70bf	House Rent Allowance (E2E Verify)	earning	80000.00	40% of BASIC (200000.00) = 80000.00.	1
603a6c0c-7707-47d2-8891-cdc0b5aa4bad	1bfb68d7-fd42-4f6a-8265-acd64e0e3a82	\N	Monthly performance bonus (E2E Verify)	earning	14000.00	Bonus 5% of gross (280000.00) = 14000.00.	2
14786931-76ff-480f-85c5-36b41cf6e938	1bfb68d7-fd42-4f6a-8265-acd64e0e3a82	3324ec1c-6276-4326-b290-c1954e02cce9	Provident Fund (E2E Verify)	deduction	10000.00	Formula "BASIC * 0.05" = 10000.00.	2
c100d1c8-4d8c-49ed-8f0e-c439330b799f	1bfb68d7-fd42-4f6a-8265-acd64e0e3a82	\N	Income Tax	deduction	44033.33	Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per "FBR Salaried 2026-27 (E2E Verify)")	9990
1d11486f-31de-4fd5-836e-908a6649c78d	15e25df0-5626-4649-9d09-ae16eb310bf6	\N	Basic Salary	earning	200000.00	Base salary for the period = 200000.00.	0
5acddbfd-6e18-4824-9a1f-5d1e7b2344f4	15e25df0-5626-4649-9d09-ae16eb310bf6	311448ee-b38c-4503-a60b-b48ffbea70bf	House Rent Allowance (E2E Verify)	earning	80000.00	40% of BASIC (200000.00) = 80000.00.	1
48d2fb27-d792-4403-9a87-78d0af05ceb7	15e25df0-5626-4649-9d09-ae16eb310bf6	\N	Monthly performance bonus (E2E Verify)	earning	14000.00	Bonus 5% of gross (280000.00) = 14000.00.	2
a83ea5eb-8b62-45b8-857b-19a5e84f23e7	15e25df0-5626-4649-9d09-ae16eb310bf6	3324ec1c-6276-4326-b290-c1954e02cce9	Provident Fund (E2E Verify)	deduction	10000.00	Formula "BASIC * 0.05" = 10000.00.	2
f4b124f4-1a40-489f-92e8-064e3e0b829a	15e25df0-5626-4649-9d09-ae16eb310bf6	\N	Income Tax	deduction	44033.33	Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per "FBR Salaried 2026-27 (E2E Verify)")	9990
1ce8470c-fd1a-4569-8f55-643d893076d8	f42bded6-ea4b-463c-9285-dba58b262c09	\N	Basic Salary	earning	200000.00	Base salary for the period = 200000.00.	0
4cc6d6c7-bea6-43a6-a660-2672a7a8b7db	f42bded6-ea4b-463c-9285-dba58b262c09	311448ee-b38c-4503-a60b-b48ffbea70bf	House Rent Allowance (E2E Verify)	earning	80000.00	40% of BASIC (200000.00) = 80000.00.	1
6b5cc28d-8aba-41b3-a608-e1abe0365c5b	f42bded6-ea4b-463c-9285-dba58b262c09	\N	Monthly performance bonus (E2E Verify)	earning	14000.00	Bonus 5% of gross (280000.00) = 14000.00.	2
31829474-c1a9-40a6-b1d3-b597fec71f96	f42bded6-ea4b-463c-9285-dba58b262c09	3324ec1c-6276-4326-b290-c1954e02cce9	Provident Fund (E2E Verify)	deduction	10000.00	Formula "BASIC * 0.05" = 10000.00.	2
a8800a73-b572-4a75-8a2f-def316e6e606	f42bded6-ea4b-463c-9285-dba58b262c09	\N	Income Tax	deduction	44033.33	Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per "FBR Salaried 2026-27 (E2E Verify)")	9990
dc40ce23-7b8c-471a-8694-442e1bf60b19	f42bded6-ea4b-463c-9285-dba58b262c09	\N	Loan Repayment	deduction	10000.00	Salary advance (E2E Verify): 10000.00 (outstanding 90000.00 → 80000.00)	9991
31f3f56e-65f7-47b0-a4f5-f7818283d86e	f4da971f-8b5e-45ec-a702-8cf12c502c34	\N	Basic Salary	earning	200000.00	Base salary for the period = 200000.00.	0
b5d8e8dd-7687-4cf5-a932-9ac15114e822	f4da971f-8b5e-45ec-a702-8cf12c502c34	311448ee-b38c-4503-a60b-b48ffbea70bf	House Rent Allowance (E2E Verify)	earning	80000.00	40% of BASIC (200000.00) = 80000.00.	1
c96b9c75-0a97-4667-bcc2-866cc195ef0b	f4da971f-8b5e-45ec-a702-8cf12c502c34	\N	Monthly performance bonus (E2E Verify)	earning	14000.00	Bonus 5% of gross (280000.00) = 14000.00.	2
fb940475-9b71-44cd-8efd-7d14dc3ab46e	f4da971f-8b5e-45ec-a702-8cf12c502c34	3324ec1c-6276-4326-b290-c1954e02cce9	Provident Fund (E2E Verify)	deduction	10000.00	Formula "BASIC * 0.05" = 10000.00.	2
52c59650-909b-4293-a581-3553f9940c5f	f4da971f-8b5e-45ec-a702-8cf12c502c34	\N	Income Tax	deduction	44033.33	Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per "FBR Salaried 2026-27 (E2E Verify)")	9990
da67d18c-4060-4910-b4f5-652669a7d4f2	3f37712a-0277-40a8-8eb7-c33a9327d0ad	311448ee-b38c-4503-a60b-b48ffbea70bf	House Rent Allowance (E2E Verify)	earning	80000.00	40% of BASIC (200000.00) = 80000.00.	1
157a868c-9fda-4cc9-822a-f2232d5931fc	3f37712a-0277-40a8-8eb7-c33a9327d0ad	\N	Monthly performance bonus (E2E Verify)	earning	14000.00	Bonus 5% of gross (280000.00) = 14000.00.	2
2892bc29-ccd9-4daf-9654-01ec6504d4c8	3f37712a-0277-40a8-8eb7-c33a9327d0ad	3324ec1c-6276-4326-b290-c1954e02cce9	Provident Fund (E2E Verify)	deduction	10000.00	Formula "BASIC * 0.05" = 10000.00.	2
dc653349-fc18-4d4a-b502-ed2fd24cf5a0	3f37712a-0277-40a8-8eb7-c33a9327d0ad	\N	Income Tax	deduction	44033.33	Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per "FBR Salaried 2026-27 (E2E Verify)")	9990
1278da0e-9370-45c3-b430-f0e6c75a33f7	3f37712a-0277-40a8-8eb7-c33a9327d0ad	\N	Loan Repayment	deduction	10000.00	Salary advance (E2E Verify): 10000.00 (outstanding 70000.00 → 60000.00)	9991
e5dc6fef-093f-4220-b29f-5f057b755bb1	3f37712a-0277-40a8-8eb7-c33a9327d0ad	\N	Absence Deduction	deduction	10000.00	1 unpaid day(s) (1 absent + 0 unpaid leave) × daily rate (BASIC 200000.00 / 20 working days = 10000.00) = 10000.00.	9999
b73e3df5-5de5-4676-99c7-8956a19ff527	43496f88-c3bd-4e39-a6d2-8f06d6d5dc89	\N	Basic Salary	earning	200000.00	Base salary for the period = 200000.00.	0
54135e73-2e7a-4629-b7d5-30adc35a701e	43496f88-c3bd-4e39-a6d2-8f06d6d5dc89	311448ee-b38c-4503-a60b-b48ffbea70bf	House Rent Allowance (E2E Verify)	earning	80000.00	40% of BASIC (200000.00) = 80000.00.	1
85e8f699-16e9-44eb-87b1-65001806c40e	43496f88-c3bd-4e39-a6d2-8f06d6d5dc89	\N	Monthly performance bonus (E2E Verify)	earning	14000.00	Bonus 5% of gross (280000.00) = 14000.00.	2
a38249e1-b14c-40b6-aa83-3afedb45b934	43496f88-c3bd-4e39-a6d2-8f06d6d5dc89	3324ec1c-6276-4326-b290-c1954e02cce9	Provident Fund (E2E Verify)	deduction	10000.00	Formula "BASIC * 0.05" = 10000.00.	2
385e2cee-81b9-46d3-b6f6-e6de9fefe8df	43496f88-c3bd-4e39-a6d2-8f06d6d5dc89	\N	Income Tax	deduction	44033.33	Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per "FBR Salaried 2026-27 (E2E Verify)")	9990
d56473ef-2582-4c19-9f71-c833f700d557	f83830ee-70d5-49f3-a524-7043df125dce	\N	Income Tax	deduction	44033.33	Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per "FBR Salaried 2026-27 (E2E Verify)")	9990
1eba58ac-11ad-4d9a-8fb6-75958cd33fa9	f83830ee-70d5-49f3-a524-7043df125dce	\N	Loan Repayment	deduction	110000.00	Loan: 100000.00 (outstanding 1200000.00 → 1100000.00); Salary advance (E2E Verify): 10000.00 (outstanding 60000.00 → 50000.00)	9991
ad35fce2-bad4-44b8-9d5b-0ee0a3e29852	f83830ee-70d5-49f3-a524-7043df125dce	\N	Reimbursement	earning	3500.00	1 approved claim in this period — Travel 3500.00. Paid in full and not taxed (expense repayment, not income), so it is excluded from gross.	9994
d3ee58b7-7dcf-471e-887e-2aaf2020fcb9	7c09d758-7fcc-4e25-a52d-86f622347ff0	\N	Basic Salary	earning	200000.00	Base salary for the period = 200000.00.	0
69262a7f-7e52-4a5c-911a-cf4020eddf6f	7c09d758-7fcc-4e25-a52d-86f622347ff0	311448ee-b38c-4503-a60b-b48ffbea70bf	House Rent Allowance (E2E Verify)	earning	80000.00	40% of BASIC (200000.00) = 80000.00.	1
272ad5dc-7511-4e14-95c8-f69701f89c6d	7c09d758-7fcc-4e25-a52d-86f622347ff0	\N	Monthly performance bonus (E2E Verify)	earning	14000.00	Bonus 5% of gross (280000.00) = 14000.00.	2
08928912-288e-4e7d-af8e-78ba4b0814fa	7c09d758-7fcc-4e25-a52d-86f622347ff0	3324ec1c-6276-4326-b290-c1954e02cce9	Provident Fund (E2E Verify)	deduction	10000.00	Formula "BASIC * 0.05" = 10000.00.	2
cf7e0f76-bdbc-4e59-8a43-037f33dbecbe	7c09d758-7fcc-4e25-a52d-86f622347ff0	\N	Income Tax	deduction	44033.33	Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per "FBR Salaried 2026-27 (E2E Verify)")	9990
7459eb6b-a153-47ae-ba70-acf99f6a43c8	7b004d25-bc6e-4449-b37c-201cf83b205f	\N	Basic Salary	earning	200000.00	Base salary for the period = 200000.00.	0
dab82e4f-1d37-43b6-902a-b380ac84d892	7b004d25-bc6e-4449-b37c-201cf83b205f	311448ee-b38c-4503-a60b-b48ffbea70bf	House Rent Allowance (E2E Verify)	earning	80000.00	40% of BASIC (200000.00) = 80000.00.	1
c24bed70-7cc3-4e52-b80f-e8c6c55c5bed	7b004d25-bc6e-4449-b37c-201cf83b205f	\N	Monthly performance bonus (E2E Verify)	earning	14000.00	Bonus 5% of gross (280000.00) = 14000.00.	2
eb0cb92a-67c5-428f-996f-3c11982d1177	7b004d25-bc6e-4449-b37c-201cf83b205f	3324ec1c-6276-4326-b290-c1954e02cce9	Provident Fund (E2E Verify)	deduction	10000.00	Formula "BASIC * 0.05" = 10000.00.	2
05493db6-7205-4ef6-8ea1-05246380c3d9	7b004d25-bc6e-4449-b37c-201cf83b205f	\N	Income Tax	deduction	44033.33	Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per "FBR Salaried 2026-27 (E2E Verify)")	9990
9af6fc60-50d3-480f-9200-649806f6361f	6dd441b1-3c1e-4c68-9aca-13bee3499085	\N	Basic Salary	earning	200000.00	Base salary for the period = 200000.00.	0
f38d48a8-1da2-4c2c-ba17-2754dd704203	6dd441b1-3c1e-4c68-9aca-13bee3499085	311448ee-b38c-4503-a60b-b48ffbea70bf	House Rent Allowance (E2E Verify)	earning	80000.00	40% of BASIC (200000.00) = 80000.00.	1
993818f0-252b-4d0f-8e1c-f6c3dca17115	6dd441b1-3c1e-4c68-9aca-13bee3499085	\N	Monthly performance bonus (E2E Verify)	earning	14000.00	Bonus 5% of gross (280000.00) = 14000.00.	2
06622584-acde-4e9d-9b8c-eb9e5dcd9278	6dd441b1-3c1e-4c68-9aca-13bee3499085	3324ec1c-6276-4326-b290-c1954e02cce9	Provident Fund (E2E Verify)	deduction	10000.00	Formula "BASIC * 0.05" = 10000.00.	2
b90880da-bfbc-4568-9d68-19217c441641	6dd441b1-3c1e-4c68-9aca-13bee3499085	\N	Income Tax	deduction	44033.33	Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per "FBR Salaried 2026-27 (E2E Verify)")	9990
4766d73d-a316-4c33-a433-1965b4b281d5	6dd441b1-3c1e-4c68-9aca-13bee3499085	\N	Loan Repayment	deduction	110000.00	Loan: 100000.00 (outstanding 1100000.00 → 1000000.00); Salary advance (E2E Verify): 10000.00 (outstanding 50000.00 → 40000.00)	9991
a1e2463c-0dd3-4abc-96f6-92e0ea77828c	feeba00e-73d1-47a5-9c1b-6ea8bfafc9ce	\N	Basic Salary	earning	200000.00	Base salary for the period = 200000.00.	0
57122b72-4816-4b3b-9ee1-1213913d4726	feeba00e-73d1-47a5-9c1b-6ea8bfafc9ce	311448ee-b38c-4503-a60b-b48ffbea70bf	House Rent Allowance (E2E Verify)	earning	80000.00	40% of BASIC (200000.00) = 80000.00.	1
d10cee45-8e90-40b8-8d56-bc8d1ab7e4dd	feeba00e-73d1-47a5-9c1b-6ea8bfafc9ce	\N	Monthly performance bonus (E2E Verify)	earning	14000.00	Bonus 5% of gross (280000.00) = 14000.00.	2
cfed656f-daa9-4eb5-91d4-b386762f0754	feeba00e-73d1-47a5-9c1b-6ea8bfafc9ce	3324ec1c-6276-4326-b290-c1954e02cce9	Provident Fund (E2E Verify)	deduction	10000.00	Formula "BASIC * 0.05" = 10000.00.	2
56a8bdef-8e47-4cdb-ba1d-4b3da24beb49	feeba00e-73d1-47a5-9c1b-6ea8bfafc9ce	\N	Income Tax	deduction	44033.33	Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per "FBR Salaried 2026-27 (E2E Verify)")	9990
e4760141-a308-48de-9249-7a6e3768d0c6	8e12f466-bea0-47bc-a8ce-d2bb03588e07	\N	Basic Salary	earning	200000.00	Base salary for the period = 200000.00.	0
36720203-0ed6-4d2d-97fb-193b692dd0a1	8e12f466-bea0-47bc-a8ce-d2bb03588e07	311448ee-b38c-4503-a60b-b48ffbea70bf	House Rent Allowance (E2E Verify)	earning	80000.00	40% of BASIC (200000.00) = 80000.00.	1
5f6cb85c-30ad-407c-a0a1-be78065366fa	8e12f466-bea0-47bc-a8ce-d2bb03588e07	\N	Monthly performance bonus (E2E Verify)	earning	14000.00	Bonus 5% of gross (280000.00) = 14000.00.	2
9d767dcb-ab2c-416f-a24a-b7f99d261811	8e12f466-bea0-47bc-a8ce-d2bb03588e07	3324ec1c-6276-4326-b290-c1954e02cce9	Provident Fund (E2E Verify)	deduction	10000.00	Formula "BASIC * 0.05" = 10000.00.	2
f981c914-ee7f-474b-bbae-f9212513bacc	8e12f466-bea0-47bc-a8ce-d2bb03588e07	\N	Income Tax	deduction	44033.33	Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per "FBR Salaried 2026-27 (E2E Verify)")	9990
e1d6758f-69a1-4c53-aca0-833fccb7be27	8e12f466-bea0-47bc-a8ce-d2bb03588e07	\N	Standard absence deduction	deduction	19047.62	2 unpaid day(s) × daily rate 9523.81 = 19047.62.	9999
3a92e7ad-5192-47c8-bb65-cc1f668f1d57	1647bac1-f687-4a63-b455-d229796d42a1	\N	Basic Salary	earning	200000.00	Base salary for the period = 200000.00.	0
114c1b19-1c79-4d73-9911-1e5261c6aee0	1647bac1-f687-4a63-b455-d229796d42a1	311448ee-b38c-4503-a60b-b48ffbea70bf	House Rent Allowance (E2E Verify)	earning	80000.00	40% of BASIC (200000.00) = 80000.00.	1
1ef321be-0b10-4205-98cb-4906f1cc473f	1647bac1-f687-4a63-b455-d229796d42a1	\N	Monthly performance bonus (E2E Verify)	earning	14000.00	Bonus 5% of gross (280000.00) = 14000.00.	2
b3cd6ca8-9427-4e28-acba-c036013fc744	1647bac1-f687-4a63-b455-d229796d42a1	3324ec1c-6276-4326-b290-c1954e02cce9	Provident Fund (E2E Verify)	deduction	10000.00	Formula "BASIC * 0.05" = 10000.00.	2
ba2c9be3-13f7-4d75-8584-7e55acf4b3b2	1647bac1-f687-4a63-b455-d229796d42a1	\N	Income Tax	deduction	44033.33	Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per "FBR Salaried 2026-27 (E2E Verify)")	9990
21b58d2d-49ae-4519-9623-75f704e8640b	1647bac1-f687-4a63-b455-d229796d42a1	\N	Loan Repayment	deduction	110000.00	Salary advance (E2E Verify): 10000.00 (outstanding 40000.00 → 30000.00); Loan: 100000.00 (outstanding 1000000.00 → 900000.00)	9991
10aecb35-7a11-466d-9701-150112886450	1647bac1-f687-4a63-b455-d229796d42a1	\N	Reimbursement	earning	20000.00	1 approved claim in this period — Travel 20000.00. Paid in full and not taxed (expense repayment, not income), so it is excluded from gross.	9994
b0930836-5fc9-4e09-aa98-2ddc6a5d6f5b	4d1eeacc-1ce6-49f2-baf6-bc89be74615b	\N	Basic Salary	earning	200000.00	Base salary for the period = 200000.00.	0
96f306df-e293-4a5e-a176-42d19265d769	4d1eeacc-1ce6-49f2-baf6-bc89be74615b	311448ee-b38c-4503-a60b-b48ffbea70bf	House Rent Allowance (E2E Verify)	earning	80000.00	40% of BASIC (200000.00) = 80000.00.	1
bbcb485d-eaf5-47ce-bf1f-ccb4b0a6215d	4d1eeacc-1ce6-49f2-baf6-bc89be74615b	\N	Monthly performance bonus (E2E Verify)	earning	14000.00	Bonus 5% of gross (280000.00) = 14000.00.	2
e268d68e-5f30-446c-a8d8-be4c30ab1d47	4d1eeacc-1ce6-49f2-baf6-bc89be74615b	3324ec1c-6276-4326-b290-c1954e02cce9	Provident Fund (E2E Verify)	deduction	10000.00	Formula "BASIC * 0.05" = 10000.00.	2
526adab2-6859-4edc-ac1c-cd72f9fcc290	4d1eeacc-1ce6-49f2-baf6-bc89be74615b	\N	Income Tax	deduction	44033.33	Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per "FBR Salaried 2026-27 (E2E Verify)")	9990
7486fb88-fc76-47f5-a446-74fee78d0101	fb5c48bc-ea41-4728-b71a-49efe75c6d6e	\N	Basic Salary	earning	200000.00	Base salary for the period = 200000.00.	0
f9e0d22c-8fec-4f15-af06-47fe64db3e9c	338e07d5-441d-4026-8b62-3b5ee4ed5be1	\N	Basic Salary	earning	200000.00	Base salary for the period = 200000.00.	0
2fcf5257-0b3f-4aa6-a943-54d0247cf57c	338e07d5-441d-4026-8b62-3b5ee4ed5be1	311448ee-b38c-4503-a60b-b48ffbea70bf	House Rent Allowance (E2E Verify)	earning	80000.00	40% of BASIC (200000.00) = 80000.00.	1
3d9e36e0-6111-4775-b42d-037b61ee8789	338e07d5-441d-4026-8b62-3b5ee4ed5be1	\N	Monthly performance bonus (E2E Verify)	earning	14000.00	Bonus 5% of gross (280000.00) = 14000.00.	2
a261e22c-09fa-4f8b-9f70-0de8a296bea0	338e07d5-441d-4026-8b62-3b5ee4ed5be1	3324ec1c-6276-4326-b290-c1954e02cce9	Provident Fund (E2E Verify)	deduction	10000.00	Formula "BASIC * 0.05" = 10000.00.	2
ada70ed4-7751-49ef-b30c-e970daa18574	338e07d5-441d-4026-8b62-3b5ee4ed5be1	\N	Income Tax	deduction	44033.33	Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per "FBR Salaried 2026-27 (E2E Verify)")	9990
eb76eeaa-ddad-4353-8946-30b2d332deff	fab1b819-ed97-4d7b-a959-691475d7742a	\N	Basic Salary	earning	200000.00	Base salary for the period = 200000.00.	0
8fdc91cc-d30c-45dd-88d8-ad786c2c88db	fab1b819-ed97-4d7b-a959-691475d7742a	311448ee-b38c-4503-a60b-b48ffbea70bf	House Rent Allowance (E2E Verify)	earning	80000.00	40% of BASIC (200000.00) = 80000.00.	1
a246a4f1-a06d-430c-bac0-9db03a6c9213	fab1b819-ed97-4d7b-a959-691475d7742a	\N	Monthly performance bonus (E2E Verify)	earning	14000.00	Bonus 5% of gross (280000.00) = 14000.00.	2
793312a1-9b5c-4ad3-b129-67740a2c6376	fab1b819-ed97-4d7b-a959-691475d7742a	3324ec1c-6276-4326-b290-c1954e02cce9	Provident Fund (E2E Verify)	deduction	10000.00	Formula "BASIC * 0.05" = 10000.00.	2
f306ccc2-f665-4ac2-9d5a-627a46dab192	fab1b819-ed97-4d7b-a959-691475d7742a	\N	Income Tax	deduction	44033.33	Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per "FBR Salaried 2026-27 (E2E Verify)")	9990
e7098d15-cc81-471b-9ccc-bff823b27ef3	fab1b819-ed97-4d7b-a959-691475d7742a	\N	Loan Repayment	deduction	110000.00	Salary advance (E2E Verify): 10000.00 (outstanding 20000.00 → 10000.00); Loan: 100000.00 (outstanding 800000.00 → 700000.00)	9991
538318a3-1a51-480c-8d93-b6e57ab2c192	7f8ed1b3-13b1-4ecd-8380-e232e38644f4	\N	Basic Salary	earning	200000.00	Base salary for the period = 200000.00.	0
cf380b3e-04c9-4d3b-b5a1-d1e70c0d1eae	7f8ed1b3-13b1-4ecd-8380-e232e38644f4	311448ee-b38c-4503-a60b-b48ffbea70bf	House Rent Allowance (E2E Verify)	earning	80000.00	40% of BASIC (200000.00) = 80000.00.	1
7cf172dd-0ab7-44b8-972c-a488b8069143	7f8ed1b3-13b1-4ecd-8380-e232e38644f4	\N	Monthly performance bonus (E2E Verify)	earning	14000.00	Bonus 5% of gross (280000.00) = 14000.00.	2
818b04c4-47c7-40a7-a059-c50b1e0b2ad4	7f8ed1b3-13b1-4ecd-8380-e232e38644f4	3324ec1c-6276-4326-b290-c1954e02cce9	Provident Fund (E2E Verify)	deduction	10000.00	Formula "BASIC * 0.05" = 10000.00.	2
3b7a0359-6b22-4bfe-b5da-79500a4075f8	7f8ed1b3-13b1-4ecd-8380-e232e38644f4	\N	Income Tax	deduction	44033.33	Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per "FBR Salaried 2026-27 (E2E Verify)")	9990
84e258fc-c4a8-42c2-95e6-3ef97ae8a77b	fb5c48bc-ea41-4728-b71a-49efe75c6d6e	311448ee-b38c-4503-a60b-b48ffbea70bf	House Rent Allowance (E2E Verify)	earning	80000.00	40% of BASIC (200000.00) = 80000.00.	1
a4c1ab3e-4170-4549-b190-34abb1626dc4	fb5c48bc-ea41-4728-b71a-49efe75c6d6e	\N	Monthly performance bonus (E2E Verify)	earning	14000.00	Bonus 5% of gross (280000.00) = 14000.00.	2
a3081039-e7a0-4a66-80cb-f73de7ad1fdd	fb5c48bc-ea41-4728-b71a-49efe75c6d6e	3324ec1c-6276-4326-b290-c1954e02cce9	Provident Fund (E2E Verify)	deduction	10000.00	Formula "BASIC * 0.05" = 10000.00.	2
f10f504b-f065-4354-9756-5e5a5dd81fac	fb5c48bc-ea41-4728-b71a-49efe75c6d6e	\N	Income Tax	deduction	44033.33	Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per "FBR Salaried 2026-27 (E2E Verify)")	9990
4e413f34-34be-4855-89af-e9ff56af68f2	06fe26ed-f208-4466-a888-ab33118649a8	\N	Basic Salary	earning	200000.00	Base salary for the period = 200000.00.	0
8cae7ad5-3689-402c-8706-6a692b13f2fe	06fe26ed-f208-4466-a888-ab33118649a8	311448ee-b38c-4503-a60b-b48ffbea70bf	House Rent Allowance (E2E Verify)	earning	80000.00	40% of BASIC (200000.00) = 80000.00.	1
bc8b927b-fc1d-48d3-9e11-fcc22c4267fc	06fe26ed-f208-4466-a888-ab33118649a8	\N	Monthly performance bonus (E2E Verify)	earning	14000.00	Bonus 5% of gross (280000.00) = 14000.00.	2
d013d606-ad7f-4b94-a8f7-93cff01299e3	06fe26ed-f208-4466-a888-ab33118649a8	3324ec1c-6276-4326-b290-c1954e02cce9	Provident Fund (E2E Verify)	deduction	10000.00	Formula "BASIC * 0.05" = 10000.00.	2
8c0d321e-0b57-4262-9fa6-3f1057c7f973	06fe26ed-f208-4466-a888-ab33118649a8	\N	Income Tax	deduction	44033.33	Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per "FBR Salaried 2026-27 (E2E Verify)")	9990
654a3c9f-e234-4871-8c85-001c81c67dfb	06fe26ed-f208-4466-a888-ab33118649a8	\N	Loan Repayment	deduction	110000.00	Salary advance (E2E Verify): 10000.00 (outstanding 30000.00 → 20000.00); Loan: 100000.00 (outstanding 900000.00 → 800000.00)	9991
58955c72-de4b-4563-93d9-b26c15dcd830	06fe26ed-f208-4466-a888-ab33118649a8	\N	Reimbursement	earning	3500.00	1 approved claim in this period — Travel 3500.00. Paid in full and not taxed (expense repayment, not income), so it is excluded from gross.	9994
3511f084-9300-414d-958d-949143b9987e	a50a8c8a-f1db-43d5-bf77-9cce47f7183e	\N	Basic Salary	earning	200000.00	Base salary for the period = 200000.00.	0
7fdface7-bda8-48c1-b1ad-f7dd53168f81	a50a8c8a-f1db-43d5-bf77-9cce47f7183e	311448ee-b38c-4503-a60b-b48ffbea70bf	House Rent Allowance (E2E Verify)	earning	80000.00	40% of BASIC (200000.00) = 80000.00.	1
813d95d8-d40f-418a-bf04-108973e3c501	a50a8c8a-f1db-43d5-bf77-9cce47f7183e	\N	Monthly performance bonus (E2E Verify)	earning	14000.00	Bonus 5% of gross (280000.00) = 14000.00.	2
b823d98a-0932-4c2c-be90-aadcae8949e2	a50a8c8a-f1db-43d5-bf77-9cce47f7183e	3324ec1c-6276-4326-b290-c1954e02cce9	Provident Fund (E2E Verify)	deduction	10000.00	Formula "BASIC * 0.05" = 10000.00.	2
d3639333-a75e-4c8e-8b1d-c435f9382d58	a50a8c8a-f1db-43d5-bf77-9cce47f7183e	\N	Income Tax	deduction	44033.33	Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per "FBR Salaried 2026-27 (E2E Verify)")	9990
597151c6-d69f-4d0b-8d70-e1a17e43b73a	1124b06e-784b-49f0-9994-1b8524f4f877	\N	Basic Salary	earning	200000.00	Base salary for the period = 200000.00.	0
2b3e2cb7-409f-4beb-bf31-24af87b76823	1124b06e-784b-49f0-9994-1b8524f4f877	311448ee-b38c-4503-a60b-b48ffbea70bf	House Rent Allowance (E2E Verify)	earning	80000.00	40% of BASIC (200000.00) = 80000.00.	1
0a163ce8-4f7c-4e1a-b399-f69d91cc22e6	1124b06e-784b-49f0-9994-1b8524f4f877	\N	Monthly performance bonus (E2E Verify)	earning	14000.00	Bonus 5% of gross (280000.00) = 14000.00.	2
b01e22c1-00e0-48b7-b827-cb5c243e7b7a	1124b06e-784b-49f0-9994-1b8524f4f877	3324ec1c-6276-4326-b290-c1954e02cce9	Provident Fund (E2E Verify)	deduction	10000.00	Formula "BASIC * 0.05" = 10000.00.	2
2390f378-edb4-4345-a457-b7ececcf277f	1124b06e-784b-49f0-9994-1b8524f4f877	\N	Income Tax	deduction	44033.33	Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per "FBR Salaried 2026-27 (E2E Verify)")	9990
7b7f233c-9daa-48fe-bbde-175e453962b9	1124b06e-784b-49f0-9994-1b8524f4f877	\N	Standard absence deduction	deduction	19047.62	2 unpaid day(s) × daily rate 9523.81 = 19047.62.	9999
03d37eb0-6659-400d-b065-dfe3a8dda994	37b697fa-f5fc-41a0-bf42-b28631064884	\N	Basic Salary	earning	200000.00	Base salary for the period = 200000.00.	0
622c9b72-8402-444e-9311-dc4be27870e9	37b697fa-f5fc-41a0-bf42-b28631064884	311448ee-b38c-4503-a60b-b48ffbea70bf	House Rent Allowance (E2E Verify)	earning	80000.00	40% of BASIC (200000.00) = 80000.00.	1
303414b9-b4eb-48f3-9f09-d03298ee5751	37b697fa-f5fc-41a0-bf42-b28631064884	\N	Monthly performance bonus (E2E Verify)	earning	14000.00	Bonus 5% of gross (280000.00) = 14000.00.	2
ce86e0c0-218f-4143-9e1e-bdda78add6f3	37b697fa-f5fc-41a0-bf42-b28631064884	3324ec1c-6276-4326-b290-c1954e02cce9	Provident Fund (E2E Verify)	deduction	10000.00	Formula "BASIC * 0.05" = 10000.00.	2
d01ebba2-0bcf-429d-b8e9-723d0986d166	37b697fa-f5fc-41a0-bf42-b28631064884	\N	Income Tax	deduction	44033.33	Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per "FBR Salaried 2026-27 (E2E Verify)")	9990
c9563894-8660-43c6-9f1f-0ca30c127696	37b697fa-f5fc-41a0-bf42-b28631064884	\N	Loan Repayment	deduction	110000.00	Loan: 100000.00 (outstanding 700000.00 → 600000.00); Salary advance (E2E Verify): 10000.00 (outstanding 10000.00 → 0.00)	9991
1d160a3a-c4f9-4950-a619-6934de2c3180	34c9f0a4-92a6-4ea8-a004-156434f5747a	\N	Basic Salary	earning	200000.00	Base salary for the period = 200000.00.	0
d146f764-fd87-4725-951a-8aaa461be895	34c9f0a4-92a6-4ea8-a004-156434f5747a	311448ee-b38c-4503-a60b-b48ffbea70bf	House Rent Allowance (E2E Verify)	earning	80000.00	40% of BASIC (200000.00) = 80000.00.	1
12997781-ce9b-4486-9aa1-4a9594ac3126	34c9f0a4-92a6-4ea8-a004-156434f5747a	\N	Monthly performance bonus (E2E Verify)	earning	14000.00	Bonus 5% of gross (280000.00) = 14000.00.	2
9af0125a-2a4b-4362-a905-feafbb87cf39	34c9f0a4-92a6-4ea8-a004-156434f5747a	3324ec1c-6276-4326-b290-c1954e02cce9	Provident Fund (E2E Verify)	deduction	10000.00	Formula "BASIC * 0.05" = 10000.00.	2
958821a7-ed3b-4b58-8162-09bbdd95aff3	34c9f0a4-92a6-4ea8-a004-156434f5747a	\N	Income Tax	deduction	44033.33	Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per "FBR Salaried 2026-27 (E2E Verify)")	9990
ca374539-ba0d-4d48-b6ec-bcc9740cce3a	ea17e83c-ddd5-4fb4-aa19-05e72f502037	\N	Basic Salary	earning	200000.00	Base salary for the period = 200000.00.	0
5ee6e089-0206-4cfc-ac28-429df59f7e68	ea17e83c-ddd5-4fb4-aa19-05e72f502037	311448ee-b38c-4503-a60b-b48ffbea70bf	House Rent Allowance (E2E Verify)	earning	80000.00	40% of BASIC (200000.00) = 80000.00.	1
c9c575fa-ff66-494f-a2c1-07ae8951fa44	ea17e83c-ddd5-4fb4-aa19-05e72f502037	\N	Monthly performance bonus (E2E Verify)	earning	14000.00	Bonus 5% of gross (280000.00) = 14000.00.	2
cc7eb000-368d-4151-9e6c-5a5e997ebf36	ea17e83c-ddd5-4fb4-aa19-05e72f502037	3324ec1c-6276-4326-b290-c1954e02cce9	Provident Fund (E2E Verify)	deduction	10000.00	Formula "BASIC * 0.05" = 10000.00.	2
44c45d95-9faf-4a14-9c79-94ee35aef248	ea17e83c-ddd5-4fb4-aa19-05e72f502037	\N	Income Tax	deduction	44033.33	Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per "FBR Salaried 2026-27 (E2E Verify)")	9990
3916988d-a9f1-4a11-8bd6-87498cbca5fa	210b8f6c-cadd-4e46-a38c-a22b83c6cb86	\N	Basic Salary	earning	200000.00	Base salary for the period = 200000.00.	0
72db3630-d88f-444c-baad-83468c3b5480	210b8f6c-cadd-4e46-a38c-a22b83c6cb86	311448ee-b38c-4503-a60b-b48ffbea70bf	House Rent Allowance (E2E Verify)	earning	80000.00	40% of BASIC (200000.00) = 80000.00.	1
e2c2d719-e194-4d89-a254-4d8d9ea8246a	210b8f6c-cadd-4e46-a38c-a22b83c6cb86	\N	Monthly performance bonus (E2E Verify)	earning	14000.00	Bonus 5% of gross (280000.00) = 14000.00.	2
3e96ee00-c7b1-4922-a51a-82d3ffdcddf6	210b8f6c-cadd-4e46-a38c-a22b83c6cb86	3324ec1c-6276-4326-b290-c1954e02cce9	Provident Fund (E2E Verify)	deduction	10000.00	Formula "BASIC * 0.05" = 10000.00.	2
7e603bde-277b-44bc-8597-f13e157cb694	210b8f6c-cadd-4e46-a38c-a22b83c6cb86	\N	Income Tax	deduction	44033.33	Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per "FBR Salaried 2026-27 (E2E Verify)")	9990
fc30c9af-f889-47e3-9c01-c28e9220cab3	210b8f6c-cadd-4e46-a38c-a22b83c6cb86	\N	Loan Repayment	deduction	100000.00	Loan: 100000.00 (outstanding 600000.00 → 500000.00)	9991
b242115e-9f7e-4487-865e-c1705772ed1d	210b8f6c-cadd-4e46-a38c-a22b83c6cb86	\N	Reimbursement	earning	3500.00	1 approved claim in this period — Travel 3500.00. Paid in full and not taxed (expense repayment, not income), so it is excluded from gross.	9994
73839898-505e-413e-8d5c-72025c8543a3	46a57df8-6a97-4184-98fe-2f8a50d42bc8	\N	Basic Salary	earning	200000.00	Base salary for the period = 200000.00.	0
a08c5260-519b-4d9c-bb66-21c9dd760bba	46a57df8-6a97-4184-98fe-2f8a50d42bc8	311448ee-b38c-4503-a60b-b48ffbea70bf	House Rent Allowance (E2E Verify)	earning	80000.00	40% of BASIC (200000.00) = 80000.00.	1
fca33f8e-dd20-4d99-bc82-dc06010662c7	46a57df8-6a97-4184-98fe-2f8a50d42bc8	\N	Monthly performance bonus (E2E Verify)	earning	14000.00	Bonus 5% of gross (280000.00) = 14000.00.	2
78f32657-b725-4a25-b362-ad987fd50821	46a57df8-6a97-4184-98fe-2f8a50d42bc8	3324ec1c-6276-4326-b290-c1954e02cce9	Provident Fund (E2E Verify)	deduction	10000.00	Formula "BASIC * 0.05" = 10000.00.	2
df38d057-28f5-4640-b966-afc3965e466a	46a57df8-6a97-4184-98fe-2f8a50d42bc8	\N	Income Tax	deduction	44033.33	Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per "FBR Salaried 2026-27 (E2E Verify)")	9990
a007818b-8eec-4610-931e-eb4fa2732368	b12cc68d-c9d0-4d32-818b-49aaa0926610	\N	Basic Salary	earning	200000.00	Base salary for the period = 200000.00.	0
de77956f-f26f-4510-a8de-cf18d2efdb6a	b12cc68d-c9d0-4d32-818b-49aaa0926610	311448ee-b38c-4503-a60b-b48ffbea70bf	House Rent Allowance (E2E Verify)	earning	80000.00	40% of BASIC (200000.00) = 80000.00.	1
3ac57f38-a90b-495a-96b7-91a5b7f50344	b12cc68d-c9d0-4d32-818b-49aaa0926610	\N	Monthly performance bonus (E2E Verify)	earning	14000.00	Bonus 5% of gross (280000.00) = 14000.00.	2
fe49c483-bf63-403a-bf3b-0c51e0785fc2	b12cc68d-c9d0-4d32-818b-49aaa0926610	3324ec1c-6276-4326-b290-c1954e02cce9	Provident Fund (E2E Verify)	deduction	10000.00	Formula "BASIC * 0.05" = 10000.00.	2
8c89f2fb-9a4f-4fca-ac60-eac1d6eba6ca	b12cc68d-c9d0-4d32-818b-49aaa0926610	\N	Income Tax	deduction	44033.33	Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per "FBR Salaried 2026-27 (E2E Verify)")	9990
925db319-73a0-4ab1-bf06-dcb0b205829c	d74a96d4-6ee7-4d3b-8ad5-16df4ea55e38	\N	Basic Salary	earning	200000.00	Base salary for the period = 200000.00.	0
1a3e6c1d-5e0b-4d31-bd33-832eec444d02	d74a96d4-6ee7-4d3b-8ad5-16df4ea55e38	311448ee-b38c-4503-a60b-b48ffbea70bf	House Rent Allowance (E2E Verify)	earning	80000.00	40% of BASIC (200000.00) = 80000.00.	1
83764bae-eacd-4af0-bba9-8e24fc0dc16c	d74a96d4-6ee7-4d3b-8ad5-16df4ea55e38	\N	Monthly performance bonus (E2E Verify)	earning	14000.00	Bonus 5% of gross (280000.00) = 14000.00.	2
02fac3d4-0d3a-45ed-85b5-20ddab1a4998	d74a96d4-6ee7-4d3b-8ad5-16df4ea55e38	3324ec1c-6276-4326-b290-c1954e02cce9	Provident Fund (E2E Verify)	deduction	10000.00	Formula "BASIC * 0.05" = 10000.00.	2
5858bb19-ce87-4bf5-933e-25af261a5231	d74a96d4-6ee7-4d3b-8ad5-16df4ea55e38	\N	Income Tax	deduction	44033.33	Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per "FBR Salaried 2026-27 (E2E Verify)")	9990
84e78187-3a19-4fff-81f9-c0c094c1fa85	d74a96d4-6ee7-4d3b-8ad5-16df4ea55e38	\N	Loan Repayment	deduction	100000.00	Loan: 100000.00 (outstanding 500000.00 → 400000.00)	9991
38cf79ff-ac3a-47b5-9e06-5904d9e41483	a14486b8-d3e3-4ee9-9f6f-a36afea656cb	\N	Basic Salary	earning	200000.00	Base salary for the period = 200000.00.	0
f7ef7e44-5e2f-4a7f-9000-fbab85c76351	a14486b8-d3e3-4ee9-9f6f-a36afea656cb	311448ee-b38c-4503-a60b-b48ffbea70bf	House Rent Allowance (E2E Verify)	earning	80000.00	40% of BASIC (200000.00) = 80000.00.	1
179ed578-73b8-473e-b0be-f6ba4c9f77d4	a14486b8-d3e3-4ee9-9f6f-a36afea656cb	\N	Monthly performance bonus (E2E Verify)	earning	14000.00	Bonus 5% of gross (280000.00) = 14000.00.	2
74382c23-34f3-43cf-9f90-64cbc7f13a6c	a14486b8-d3e3-4ee9-9f6f-a36afea656cb	3324ec1c-6276-4326-b290-c1954e02cce9	Provident Fund (E2E Verify)	deduction	10000.00	Formula "BASIC * 0.05" = 10000.00.	2
594aebda-b252-4083-b91c-bd2f64151b63	a14486b8-d3e3-4ee9-9f6f-a36afea656cb	\N	Income Tax	deduction	44033.33	Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per "FBR Salaried 2026-27 (E2E Verify)")	9990
095d0466-873e-4c3e-bc39-b31827e1f6f6	a74fad65-9bb3-4da9-8e49-3a5842ac7dd0	\N	Basic Salary	earning	200000.00	Base salary for the period = 200000.00.	0
38dcaad9-692f-44ff-b508-70eeb02a5980	a74fad65-9bb3-4da9-8e49-3a5842ac7dd0	311448ee-b38c-4503-a60b-b48ffbea70bf	House Rent Allowance (E2E Verify)	earning	80000.00	40% of BASIC (200000.00) = 80000.00.	1
218e8bda-fe55-468b-8964-d16afd5cfa2f	a74fad65-9bb3-4da9-8e49-3a5842ac7dd0	\N	Monthly performance bonus (E2E Verify)	earning	14000.00	Bonus 5% of gross (280000.00) = 14000.00.	2
cb495102-5bd5-45eb-9dd1-aafbc25b7f9e	a74fad65-9bb3-4da9-8e49-3a5842ac7dd0	3324ec1c-6276-4326-b290-c1954e02cce9	Provident Fund (E2E Verify)	deduction	10000.00	Formula "BASIC * 0.05" = 10000.00.	2
c97a2be3-12eb-4e58-9de9-b9b2195766c4	a74fad65-9bb3-4da9-8e49-3a5842ac7dd0	\N	Income Tax	deduction	44033.33	Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per "FBR Salaried 2026-27 (E2E Verify)")	9990
23040c37-c010-46d9-a476-77f639617c9a	f81450bf-68b4-4429-9f0e-62ba844f56d9	\N	Basic Salary	earning	200000.00	Base salary for the period = 200000.00.	0
a91e1c29-96e8-42dd-b886-ee7e3742ef69	f81450bf-68b4-4429-9f0e-62ba844f56d9	311448ee-b38c-4503-a60b-b48ffbea70bf	House Rent Allowance (E2E Verify)	earning	80000.00	40% of BASIC (200000.00) = 80000.00.	1
76bd7d24-9f9d-43cf-b6a5-2c0bf350ca8a	f81450bf-68b4-4429-9f0e-62ba844f56d9	\N	Monthly performance bonus (E2E Verify)	earning	14000.00	Bonus 5% of gross (280000.00) = 14000.00.	2
6ec9464b-4069-4fc0-b321-0915e0badf1d	f81450bf-68b4-4429-9f0e-62ba844f56d9	3324ec1c-6276-4326-b290-c1954e02cce9	Provident Fund (E2E Verify)	deduction	10000.00	Formula "BASIC * 0.05" = 10000.00.	2
0c37bf6b-70eb-40b9-bd89-85b2f622354f	f81450bf-68b4-4429-9f0e-62ba844f56d9	\N	Income Tax	deduction	44033.33	Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per "FBR Salaried 2026-27 (E2E Verify)")	9990
f853bfa8-f7f9-485f-abd0-45dda74652b3	f81450bf-68b4-4429-9f0e-62ba844f56d9	\N	Loan Repayment	deduction	112000.00	Loan: 100000.00 (outstanding 400000.00 → 300000.00); UI walkthrough — phone advance: 12000.00 (outstanding 36000.00 → 24000.00)	9991
ba82de44-1a8f-47da-828d-509bdbc5d97b	e12098dc-8dcb-4cf1-beab-157b90614519	\N	Basic Salary	earning	200000.00	Base salary for the period = 200000.00.	0
e569404d-baf8-4c44-884d-6d2db057d8b3	e12098dc-8dcb-4cf1-beab-157b90614519	311448ee-b38c-4503-a60b-b48ffbea70bf	House Rent Allowance (E2E Verify)	earning	80000.00	40% of BASIC (200000.00) = 80000.00.	1
60d008df-f889-4e26-862b-c49b9ea6022e	e12098dc-8dcb-4cf1-beab-157b90614519	\N	Monthly performance bonus (E2E Verify)	earning	14000.00	Bonus 5% of gross (280000.00) = 14000.00.	2
269dec48-8211-4cb3-922f-f20f1042db46	e12098dc-8dcb-4cf1-beab-157b90614519	3324ec1c-6276-4326-b290-c1954e02cce9	Provident Fund (E2E Verify)	deduction	10000.00	Formula "BASIC * 0.05" = 10000.00.	2
6137e719-15e8-44de-b9d2-f15eb0a744f6	e12098dc-8dcb-4cf1-beab-157b90614519	\N	Income Tax	deduction	44033.33	Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per "FBR Salaried 2026-27 (E2E Verify)")	9990
a4ede5a9-2b8b-4ef6-abbd-ac83be4e6162	da44dd74-000f-480c-a6d2-be9a7ce6dbaa	\N	Basic Salary	earning	200000.00	Base salary for the period = 200000.00.	0
0e8544e6-87fe-446f-8ee9-d66461286702	da44dd74-000f-480c-a6d2-be9a7ce6dbaa	311448ee-b38c-4503-a60b-b48ffbea70bf	House Rent Allowance (E2E Verify)	earning	80000.00	40% of BASIC (200000.00) = 80000.00.	1
ae923a1f-3440-4765-89b4-50c642eb0211	da44dd74-000f-480c-a6d2-be9a7ce6dbaa	\N	Monthly performance bonus (E2E Verify)	earning	14000.00	Bonus 5% of gross (280000.00) = 14000.00.	2
cc77b38b-c546-47c7-a8ce-516f61e37d0b	da44dd74-000f-480c-a6d2-be9a7ce6dbaa	3324ec1c-6276-4326-b290-c1954e02cce9	Provident Fund (E2E Verify)	deduction	10000.00	Formula "BASIC * 0.05" = 10000.00.	2
060d37b2-e3fe-41bd-9baa-884873fc1d80	da44dd74-000f-480c-a6d2-be9a7ce6dbaa	\N	Income Tax	deduction	44033.33	Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per "FBR Salaried 2026-27 (E2E Verify)")	9990
02b45328-e638-4d0b-908a-960ca7e58492	22b8f5e6-51c9-46c5-8362-7a8ba071b526	\N	Basic Salary	earning	200000.00	Base salary for the period = 200000.00.	0
758c3438-7742-42e4-89b9-c0cd81b249fd	22b8f5e6-51c9-46c5-8362-7a8ba071b526	311448ee-b38c-4503-a60b-b48ffbea70bf	House Rent Allowance (E2E Verify)	earning	80000.00	40% of BASIC (200000.00) = 80000.00.	1
dadd593b-c861-45fb-9fd2-4616760d2de7	22b8f5e6-51c9-46c5-8362-7a8ba071b526	\N	Monthly performance bonus (E2E Verify)	earning	14000.00	Bonus 5% of gross (280000.00) = 14000.00.	2
5aea3887-031c-497c-b53d-a40fc913d0f8	22b8f5e6-51c9-46c5-8362-7a8ba071b526	3324ec1c-6276-4326-b290-c1954e02cce9	Provident Fund (E2E Verify)	deduction	10000.00	Formula "BASIC * 0.05" = 10000.00.	2
824a46e9-2658-4dfb-adc3-32a6dfe70ea9	22b8f5e6-51c9-46c5-8362-7a8ba071b526	\N	Income Tax	deduction	44033.33	Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per "FBR Salaried 2026-27 (E2E Verify)")	9990
1fb9b435-1090-4309-be86-91882a3c0dcd	78d9dc22-149b-4d8f-b17d-dce4af913c22	\N	Basic Salary	earning	200000.00	Base salary for the period = 200000.00.	0
f9a1ff26-6438-4276-9f5f-febb3a3b0641	78d9dc22-149b-4d8f-b17d-dce4af913c22	311448ee-b38c-4503-a60b-b48ffbea70bf	House Rent Allowance (E2E Verify)	earning	80000.00	40% of BASIC (200000.00) = 80000.00.	1
38262167-c3bc-45f0-a728-290b882fcb10	78d9dc22-149b-4d8f-b17d-dce4af913c22	\N	Monthly performance bonus (E2E Verify)	earning	14000.00	Bonus 5% of gross (280000.00) = 14000.00.	2
d136af83-b8ed-4d78-ae6e-9bdecddcd67b	78d9dc22-149b-4d8f-b17d-dce4af913c22	3324ec1c-6276-4326-b290-c1954e02cce9	Provident Fund (E2E Verify)	deduction	10000.00	Formula "BASIC * 0.05" = 10000.00.	2
2b4b8ace-9c87-4ee3-a26b-29ecb3277f81	78d9dc22-149b-4d8f-b17d-dce4af913c22	\N	Income Tax	deduction	44033.33	Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per "FBR Salaried 2026-27 (E2E Verify)")	9990
b9a7805a-befe-41f9-9195-22551aab2e3a	78d9dc22-149b-4d8f-b17d-dce4af913c22	\N	Loan Repayment	deduction	112000.00	Loan: 100000.00 (outstanding 300000.00 → 200000.00); UI walkthrough — phone advance: 12000.00 (outstanding 24000.00 → 12000.00)	9991
abe157bf-3773-48ed-bd6a-87391486e1ec	d147e7b6-3d70-4f5b-935a-0314e7b5953c	\N	Basic Salary	earning	200000.00	Base salary for the period = 200000.00.	0
7f5ee3a6-4094-454e-86cc-dac4fac7bb1e	d147e7b6-3d70-4f5b-935a-0314e7b5953c	311448ee-b38c-4503-a60b-b48ffbea70bf	House Rent Allowance (E2E Verify)	earning	80000.00	40% of BASIC (200000.00) = 80000.00.	1
60e464a7-90bf-4182-8889-051f2f50c76e	d147e7b6-3d70-4f5b-935a-0314e7b5953c	\N	Monthly performance bonus (E2E Verify)	earning	14000.00	Bonus 5% of gross (280000.00) = 14000.00.	2
eeb31948-879d-445c-83d4-6490b7689b20	d147e7b6-3d70-4f5b-935a-0314e7b5953c	3324ec1c-6276-4326-b290-c1954e02cce9	Provident Fund (E2E Verify)	deduction	10000.00	Formula "BASIC * 0.05" = 10000.00.	2
bc0bd75c-9c0a-4d70-b495-bbf9b29d44ee	d147e7b6-3d70-4f5b-935a-0314e7b5953c	\N	Income Tax	deduction	44033.33	Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per "FBR Salaried 2026-27 (E2E Verify)")	9990
4c02223b-f40d-492d-b160-b6ae839022e1	b93d1ce1-6a78-404f-a2ca-cb33e9212bfb	\N	Basic Salary	earning	200000.00	Base salary for the period = 200000.00.	0
f17cc7de-9393-4f23-a73a-9118d32a578f	b93d1ce1-6a78-404f-a2ca-cb33e9212bfb	311448ee-b38c-4503-a60b-b48ffbea70bf	House Rent Allowance (E2E Verify)	earning	80000.00	40% of BASIC (200000.00) = 80000.00.	1
8cf2c503-b4a1-4903-a5cd-4da5e12b95c9	b93d1ce1-6a78-404f-a2ca-cb33e9212bfb	\N	Monthly performance bonus (E2E Verify)	earning	14000.00	Bonus 5% of gross (280000.00) = 14000.00.	2
85c39d17-e4e6-408b-aa3a-f0fad776b7c6	b93d1ce1-6a78-404f-a2ca-cb33e9212bfb	3324ec1c-6276-4326-b290-c1954e02cce9	Provident Fund (E2E Verify)	deduction	10000.00	Formula "BASIC * 0.05" = 10000.00.	2
0f536228-9081-4b6d-a5bc-49b69754b649	b93d1ce1-6a78-404f-a2ca-cb33e9212bfb	\N	Income Tax	deduction	44033.33	Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per "FBR Salaried 2026-27 (E2E Verify)")	9990
\.


--
-- Data for Name: payslips; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.payslips (payslip_id, period_id, user_id, structure_id, basic_salary, gross_salary, total_earnings, total_deductions, net_salary, working_days, present_days, absent_days, paid_leave_days, unpaid_leave_days, late_count, overtime_hours, overtime_amount, status, calculation_json, payment_date, created_at, updated_at) FROM stdin;
a74fad65-9bb3-4da9-8e49-3a5842ac7dd0	b1d57c8c-22b0-454c-8daf-59a5c0daa4c0	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	411df72c-7665-4a69-85e2-44eb546083a4	200000.00	294000.00	294000.00	54033.33	239967.00	22	0.00	0.00	0.00	0.00	0	0.00	0.00	locked	{"lines": [{"code": "BASIC", "type": "earning", "label": "Basic Salary", "amount": 200000, "calc_note": "Base salary for the period = 200000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_HRA", "type": "earning", "label": "House Rent Allowance (E2E Verify)", "amount": 80000, "calc_note": "40% of BASIC (200000.00) = 80000.00.", "component_id": "311448ee-b38c-4503-a60b-b48ffbea70bf", "display_order": 1, "calculation_type": "percent_basic"}, {"code": "BONUS", "type": "earning", "label": "Monthly performance bonus (E2E Verify)", "amount": 14000, "calc_note": "Bonus 5% of gross (280000.00) = 14000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_PF", "type": "deduction", "label": "Provident Fund (E2E Verify)", "amount": 10000, "calc_note": "Formula \\"BASIC * 0.05\\" = 10000.00.", "component_id": "3324ec1c-6276-4326-b290-c1954e02cce9", "display_order": 2, "calculation_type": "formula"}, {"code": "TAX", "type": "deduction", "label": "Income Tax", "amount": 44033.33, "calc_note": "Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per \\"FBR Salaried 2026-27 (E2E Verify)\\")", "component_id": null, "display_order": 9990, "calculation_type": "formula"}], "inputs": {"late_count": 0, "absent_days": 0, "late_minutes": 0, "present_days": 0, "working_days": 22, "overtime_hours": 0, "overtime_amount": 0, "paid_leave_days": 0, "unpaid_leave_days": 0}, "user_id": "8b4ba86e-6f24-4eed-83b0-d5f191eb7adf", "currency": "PKR", "warnings": [], "period_id": "b1d57c8c-22b0-454c-8daf-59a5c0daa4c0", "net_salary": 239967, "period_end": "2026-09-30", "period_name": "Sept", "basic_salary": 200000, "gross_salary": 294000, "period_start": "2026-09-01", "structure_id": "411df72c-7665-4a69-85e2-44eb546083a4", "employee_code": "TC-EMP-004", "employee_name": "Muddasir Iqbal", "structure_name": "Standard Staff (E2E Verify)", "total_earnings": 294000, "total_deductions": 54033.33, "reimbursement_ids": []}	\N	2026-08-12 13:25:32.093809+05	2026-08-12 17:09:00.578919+05
22b8f5e6-51c9-46c5-8362-7a8ba071b526	3362fd5c-5532-4068-9f86-62d64ac93ca5	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	411df72c-7665-4a69-85e2-44eb546083a4	200000.00	294000.00	294000.00	54033.33	239967.00	22	0.00	0.00	0.00	0.00	0	0.00	0.00	locked	{"lines": [{"code": "BASIC", "type": "earning", "label": "Basic Salary", "amount": 200000, "calc_note": "Base salary for the period = 200000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_HRA", "type": "earning", "label": "House Rent Allowance (E2E Verify)", "amount": 80000, "calc_note": "40% of BASIC (200000.00) = 80000.00.", "component_id": "311448ee-b38c-4503-a60b-b48ffbea70bf", "display_order": 1, "calculation_type": "percent_basic"}, {"code": "BONUS", "type": "earning", "label": "Monthly performance bonus (E2E Verify)", "amount": 14000, "calc_note": "Bonus 5% of gross (280000.00) = 14000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_PF", "type": "deduction", "label": "Provident Fund (E2E Verify)", "amount": 10000, "calc_note": "Formula \\"BASIC * 0.05\\" = 10000.00.", "component_id": "3324ec1c-6276-4326-b290-c1954e02cce9", "display_order": 2, "calculation_type": "formula"}, {"code": "TAX", "type": "deduction", "label": "Income Tax", "amount": 44033.33, "calc_note": "Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per \\"FBR Salaried 2026-27 (E2E Verify)\\")", "component_id": null, "display_order": 9990, "calculation_type": "formula"}], "inputs": {"late_count": 0, "absent_days": 0, "late_minutes": 0, "present_days": 0, "working_days": 22, "overtime_hours": 0, "overtime_amount": 0, "paid_leave_days": 0, "unpaid_leave_days": 0}, "user_id": "8b4ba86e-6f24-4eed-83b0-d5f191eb7adf", "currency": "PKR", "warnings": [], "period_id": "3362fd5c-5532-4068-9f86-62d64ac93ca5", "net_salary": 239967, "period_end": "2026-10-31", "period_name": "September 2026", "basic_salary": 200000, "gross_salary": 294000, "period_start": "2026-10-01", "structure_id": "411df72c-7665-4a69-85e2-44eb546083a4", "employee_code": "TC-EMP-004", "employee_name": "Muddasir Iqbal", "structure_name": "Standard Staff (E2E Verify)", "total_earnings": 294000, "total_deductions": 54033.33, "reimbursement_ids": []}	\N	2026-08-12 14:16:54.726671+05	2026-08-12 17:08:53.550375+05
78d9dc22-149b-4d8f-b17d-dce4af913c22	3362fd5c-5532-4068-9f86-62d64ac93ca5	c64f66c9-639f-4913-8d6e-0304d51f1c20	411df72c-7665-4a69-85e2-44eb546083a4	200000.00	294000.00	294000.00	166033.33	127967.00	22	0.00	0.00	0.00	0.00	0	0.00	0.00	locked	{"lines": [{"code": "BASIC", "type": "earning", "label": "Basic Salary", "amount": 200000, "calc_note": "Base salary for the period = 200000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_HRA", "type": "earning", "label": "House Rent Allowance (E2E Verify)", "amount": 80000, "calc_note": "40% of BASIC (200000.00) = 80000.00.", "component_id": "311448ee-b38c-4503-a60b-b48ffbea70bf", "display_order": 1, "calculation_type": "percent_basic"}, {"code": "BONUS", "type": "earning", "label": "Monthly performance bonus (E2E Verify)", "amount": 14000, "calc_note": "Bonus 5% of gross (280000.00) = 14000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_PF", "type": "deduction", "label": "Provident Fund (E2E Verify)", "amount": 10000, "calc_note": "Formula \\"BASIC * 0.05\\" = 10000.00.", "component_id": "3324ec1c-6276-4326-b290-c1954e02cce9", "display_order": 2, "calculation_type": "formula"}, {"code": "TAX", "type": "deduction", "label": "Income Tax", "amount": 44033.33, "calc_note": "Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per \\"FBR Salaried 2026-27 (E2E Verify)\\")", "component_id": null, "display_order": 9990, "calculation_type": "formula"}, {"code": "LOAN", "type": "deduction", "label": "Loan Repayment", "amount": 112000, "calc_note": "Loan: 100000.00 (outstanding 300000.00 → 200000.00); UI walkthrough — phone advance: 12000.00 (outstanding 24000.00 → 12000.00)", "component_id": null, "display_order": 9991, "calculation_type": "fixed"}], "inputs": {"late_count": 0, "absent_days": 0, "late_minutes": 0, "present_days": 0, "working_days": 22, "overtime_hours": 0, "overtime_amount": 0, "paid_leave_days": 0, "unpaid_leave_days": 0}, "user_id": "c64f66c9-639f-4913-8d6e-0304d51f1c20", "currency": "PKR", "warnings": [], "period_id": "3362fd5c-5532-4068-9f86-62d64ac93ca5", "net_salary": 127967, "period_end": "2026-10-31", "period_name": "September 2026", "basic_salary": 200000, "gross_salary": 294000, "period_start": "2026-10-01", "structure_id": "411df72c-7665-4a69-85e2-44eb546083a4", "employee_code": "TC-EMP-005", "employee_name": "Ashan Mustafa", "structure_name": "Standard Staff (E2E Verify)", "total_earnings": 294000, "total_deductions": 166033.33, "reimbursement_ids": []}	\N	2026-08-12 14:16:54.758427+05	2026-08-12 17:08:53.550375+05
d147e7b6-3d70-4f5b-935a-0314e7b5953c	3362fd5c-5532-4068-9f86-62d64ac93ca5	43af610e-e846-4f7c-88bd-c51fc43f0d12	411df72c-7665-4a69-85e2-44eb546083a4	200000.00	294000.00	294000.00	54033.33	239967.00	22	0.00	0.00	0.00	0.00	0	0.00	0.00	locked	{"lines": [{"code": "BASIC", "type": "earning", "label": "Basic Salary", "amount": 200000, "calc_note": "Base salary for the period = 200000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_HRA", "type": "earning", "label": "House Rent Allowance (E2E Verify)", "amount": 80000, "calc_note": "40% of BASIC (200000.00) = 80000.00.", "component_id": "311448ee-b38c-4503-a60b-b48ffbea70bf", "display_order": 1, "calculation_type": "percent_basic"}, {"code": "BONUS", "type": "earning", "label": "Monthly performance bonus (E2E Verify)", "amount": 14000, "calc_note": "Bonus 5% of gross (280000.00) = 14000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_PF", "type": "deduction", "label": "Provident Fund (E2E Verify)", "amount": 10000, "calc_note": "Formula \\"BASIC * 0.05\\" = 10000.00.", "component_id": "3324ec1c-6276-4326-b290-c1954e02cce9", "display_order": 2, "calculation_type": "formula"}, {"code": "TAX", "type": "deduction", "label": "Income Tax", "amount": 44033.33, "calc_note": "Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per \\"FBR Salaried 2026-27 (E2E Verify)\\")", "component_id": null, "display_order": 9990, "calculation_type": "formula"}], "inputs": {"late_count": 0, "absent_days": 0, "late_minutes": 0, "present_days": 0, "working_days": 22, "overtime_hours": 0, "overtime_amount": 0, "paid_leave_days": 0, "unpaid_leave_days": 0}, "user_id": "43af610e-e846-4f7c-88bd-c51fc43f0d12", "currency": "PKR", "warnings": [], "period_id": "3362fd5c-5532-4068-9f86-62d64ac93ca5", "net_salary": 239967, "period_end": "2026-10-31", "period_name": "September 2026", "basic_salary": 200000, "gross_salary": 294000, "period_start": "2026-10-01", "structure_id": "411df72c-7665-4a69-85e2-44eb546083a4", "employee_code": "TC-EMP-006", "employee_name": "Taha Tayyab", "structure_name": "Standard Staff (E2E Verify)", "total_earnings": 294000, "total_deductions": 54033.33, "reimbursement_ids": []}	\N	2026-08-12 14:16:54.787854+05	2026-08-12 17:08:53.550375+05
b93d1ce1-6a78-404f-a2ca-cb33e9212bfb	3362fd5c-5532-4068-9f86-62d64ac93ca5	5269a7da-0db6-49b8-97eb-c2d482cb611a	411df72c-7665-4a69-85e2-44eb546083a4	200000.00	294000.00	294000.00	54033.33	239967.00	22	0.00	0.00	0.00	0.00	0	0.00	0.00	locked	{"lines": [{"code": "BASIC", "type": "earning", "label": "Basic Salary", "amount": 200000, "calc_note": "Base salary for the period = 200000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_HRA", "type": "earning", "label": "House Rent Allowance (E2E Verify)", "amount": 80000, "calc_note": "40% of BASIC (200000.00) = 80000.00.", "component_id": "311448ee-b38c-4503-a60b-b48ffbea70bf", "display_order": 1, "calculation_type": "percent_basic"}, {"code": "BONUS", "type": "earning", "label": "Monthly performance bonus (E2E Verify)", "amount": 14000, "calc_note": "Bonus 5% of gross (280000.00) = 14000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_PF", "type": "deduction", "label": "Provident Fund (E2E Verify)", "amount": 10000, "calc_note": "Formula \\"BASIC * 0.05\\" = 10000.00.", "component_id": "3324ec1c-6276-4326-b290-c1954e02cce9", "display_order": 2, "calculation_type": "formula"}, {"code": "TAX", "type": "deduction", "label": "Income Tax", "amount": 44033.33, "calc_note": "Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per \\"FBR Salaried 2026-27 (E2E Verify)\\")", "component_id": null, "display_order": 9990, "calculation_type": "formula"}], "inputs": {"late_count": 0, "absent_days": 0, "late_minutes": 0, "present_days": 0, "working_days": 22, "overtime_hours": 0, "overtime_amount": 0, "paid_leave_days": 0, "unpaid_leave_days": 0}, "user_id": "5269a7da-0db6-49b8-97eb-c2d482cb611a", "currency": "PKR", "warnings": [], "period_id": "3362fd5c-5532-4068-9f86-62d64ac93ca5", "net_salary": 239967, "period_end": "2026-10-31", "period_name": "September 2026", "basic_salary": 200000, "gross_salary": 294000, "period_start": "2026-10-01", "structure_id": "411df72c-7665-4a69-85e2-44eb546083a4", "employee_code": "TC-EMP-003", "employee_name": "Haseeb Iqbal", "structure_name": "Standard Staff (E2E Verify)", "total_earnings": 294000, "total_deductions": 54033.33, "reimbursement_ids": []}	\N	2026-08-12 14:16:54.803954+05	2026-08-12 17:08:53.550375+05
155cef2e-d2c5-4319-8695-7cd2ae131b44	56963f10-9845-4b19-ab24-53f541a99fcb	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	411df72c-7665-4a69-85e2-44eb546083a4	200000.00	294000.00	294000.00	54033.33	239967.00	22	0.00	0.00	0.00	0.00	0	0.00	0.00	locked	{"lines": [{"code": "BASIC", "type": "earning", "label": "Basic Salary", "amount": 200000, "calc_note": "Base salary for the period = 200000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_HRA", "type": "earning", "label": "House Rent Allowance (E2E Verify)", "amount": 80000, "calc_note": "40% of BASIC (200000.00) = 80000.00.", "component_id": "311448ee-b38c-4503-a60b-b48ffbea70bf", "display_order": 1, "calculation_type": "percent_basic"}, {"code": "BONUS", "type": "earning", "label": "Monthly performance bonus (E2E Verify)", "amount": 14000, "calc_note": "Bonus 5% of gross (280000.00) = 14000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_PF", "type": "deduction", "label": "Provident Fund (E2E Verify)", "amount": 10000, "calc_note": "Formula \\"BASIC * 0.05\\" = 10000.00.", "component_id": "3324ec1c-6276-4326-b290-c1954e02cce9", "display_order": 2, "calculation_type": "formula"}, {"code": "TAX", "type": "deduction", "label": "Income Tax", "amount": 44033.33, "calc_note": "Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per \\"FBR Salaried 2026-27 (E2E Verify)\\")", "component_id": null, "display_order": 9990, "calculation_type": "formula"}], "inputs": {"late_count": 0, "absent_days": 0, "late_minutes": 0, "present_days": 0, "working_days": 22, "overtime_hours": 0, "overtime_amount": 0, "paid_leave_days": 0, "unpaid_leave_days": 0}, "user_id": "8b4ba86e-6f24-4eed-83b0-d5f191eb7adf", "currency": "PKR", "warnings": [], "period_id": "56963f10-9845-4b19-ab24-53f541a99fcb", "net_salary": 239967, "period_end": "2026-09-30", "period_name": "E2E Verify — September 2026", "basic_salary": 200000, "gross_salary": 294000, "period_start": "2026-09-01", "structure_id": "411df72c-7665-4a69-85e2-44eb546083a4", "employee_code": "TC-EMP-004", "employee_name": "Muddasir Iqbal", "structure_name": "Standard Staff (E2E Verify)", "total_earnings": 294000, "total_deductions": 54033.33}	\N	2026-08-11 12:51:59.742+05	2026-08-11 12:51:59.890538+05
f36bdfdc-96cc-463f-bfa7-94a6fff7ad32	56963f10-9845-4b19-ab24-53f541a99fcb	c64f66c9-639f-4913-8d6e-0304d51f1c20	411df72c-7665-4a69-85e2-44eb546083a4	200000.00	294000.00	294000.00	64033.33	229967.00	22	0.00	0.00	0.00	0.00	0	0.00	0.00	locked	{"lines": [{"code": "BASIC", "type": "earning", "label": "Basic Salary", "amount": 200000, "calc_note": "Base salary for the period = 200000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_HRA", "type": "earning", "label": "House Rent Allowance (E2E Verify)", "amount": 80000, "calc_note": "40% of BASIC (200000.00) = 80000.00.", "component_id": "311448ee-b38c-4503-a60b-b48ffbea70bf", "display_order": 1, "calculation_type": "percent_basic"}, {"code": "BONUS", "type": "earning", "label": "Monthly performance bonus (E2E Verify)", "amount": 14000, "calc_note": "Bonus 5% of gross (280000.00) = 14000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_PF", "type": "deduction", "label": "Provident Fund (E2E Verify)", "amount": 10000, "calc_note": "Formula \\"BASIC * 0.05\\" = 10000.00.", "component_id": "3324ec1c-6276-4326-b290-c1954e02cce9", "display_order": 2, "calculation_type": "formula"}, {"code": "TAX", "type": "deduction", "label": "Income Tax", "amount": 44033.33, "calc_note": "Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per \\"FBR Salaried 2026-27 (E2E Verify)\\")", "component_id": null, "display_order": 9990, "calculation_type": "formula"}, {"code": "LOAN", "type": "deduction", "label": "Loan Repayment", "amount": 10000, "calc_note": "Salary advance (E2E Verify): 10000.00 (outstanding 110000.00 → 100000.00)", "component_id": null, "display_order": 9991, "calculation_type": "fixed"}], "inputs": {"late_count": 0, "absent_days": 0, "late_minutes": 0, "present_days": 0, "working_days": 22, "overtime_hours": 0, "overtime_amount": 0, "paid_leave_days": 0, "unpaid_leave_days": 0}, "user_id": "c64f66c9-639f-4913-8d6e-0304d51f1c20", "currency": "PKR", "warnings": [], "period_id": "56963f10-9845-4b19-ab24-53f541a99fcb", "net_salary": 229967, "period_end": "2026-09-30", "period_name": "E2E Verify — September 2026", "basic_salary": 200000, "gross_salary": 294000, "period_start": "2026-09-01", "structure_id": "411df72c-7665-4a69-85e2-44eb546083a4", "employee_code": "TC-EMP-005", "employee_name": "Ashan Mustafa", "structure_name": "Standard Staff (E2E Verify)", "total_earnings": 294000, "total_deductions": 64033.33}	\N	2026-08-11 12:51:59.773047+05	2026-08-11 12:51:59.890538+05
9b29072f-9db9-4a0e-86ab-34af6aeea0e3	56963f10-9845-4b19-ab24-53f541a99fcb	5269a7da-0db6-49b8-97eb-c2d482cb611a	411df72c-7665-4a69-85e2-44eb546083a4	200000.00	294000.00	294000.00	54033.33	239967.00	22	0.00	0.00	0.00	0.00	0	0.00	0.00	locked	{"lines": [{"code": "BASIC", "type": "earning", "label": "Basic Salary", "amount": 200000, "calc_note": "Base salary for the period = 200000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_HRA", "type": "earning", "label": "House Rent Allowance (E2E Verify)", "amount": 80000, "calc_note": "40% of BASIC (200000.00) = 80000.00.", "component_id": "311448ee-b38c-4503-a60b-b48ffbea70bf", "display_order": 1, "calculation_type": "percent_basic"}, {"code": "BONUS", "type": "earning", "label": "Monthly performance bonus (E2E Verify)", "amount": 14000, "calc_note": "Bonus 5% of gross (280000.00) = 14000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_PF", "type": "deduction", "label": "Provident Fund (E2E Verify)", "amount": 10000, "calc_note": "Formula \\"BASIC * 0.05\\" = 10000.00.", "component_id": "3324ec1c-6276-4326-b290-c1954e02cce9", "display_order": 2, "calculation_type": "formula"}, {"code": "TAX", "type": "deduction", "label": "Income Tax", "amount": 44033.33, "calc_note": "Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per \\"FBR Salaried 2026-27 (E2E Verify)\\")", "component_id": null, "display_order": 9990, "calculation_type": "formula"}], "inputs": {"late_count": 0, "absent_days": 0, "late_minutes": 0, "present_days": 0, "working_days": 22, "overtime_hours": 0, "overtime_amount": 0, "paid_leave_days": 0, "unpaid_leave_days": 0}, "user_id": "5269a7da-0db6-49b8-97eb-c2d482cb611a", "currency": "PKR", "warnings": [], "period_id": "56963f10-9845-4b19-ab24-53f541a99fcb", "net_salary": 239967, "period_end": "2026-09-30", "period_name": "E2E Verify — September 2026", "basic_salary": 200000, "gross_salary": 294000, "period_start": "2026-09-01", "structure_id": "411df72c-7665-4a69-85e2-44eb546083a4", "employee_code": "TC-EMP-003", "employee_name": "Haseeb Iqbal", "structure_name": "Standard Staff (E2E Verify)", "total_earnings": 294000, "total_deductions": 54033.33}	\N	2026-08-11 12:51:59.79854+05	2026-08-11 12:51:59.890538+05
f81450bf-68b4-4429-9f0e-62ba844f56d9	b1d57c8c-22b0-454c-8daf-59a5c0daa4c0	c64f66c9-639f-4913-8d6e-0304d51f1c20	411df72c-7665-4a69-85e2-44eb546083a4	200000.00	294000.00	294000.00	166033.33	127967.00	22	0.00	0.00	0.00	0.00	0	0.00	0.00	locked	{"lines": [{"code": "BASIC", "type": "earning", "label": "Basic Salary", "amount": 200000, "calc_note": "Base salary for the period = 200000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_HRA", "type": "earning", "label": "House Rent Allowance (E2E Verify)", "amount": 80000, "calc_note": "40% of BASIC (200000.00) = 80000.00.", "component_id": "311448ee-b38c-4503-a60b-b48ffbea70bf", "display_order": 1, "calculation_type": "percent_basic"}, {"code": "BONUS", "type": "earning", "label": "Monthly performance bonus (E2E Verify)", "amount": 14000, "calc_note": "Bonus 5% of gross (280000.00) = 14000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_PF", "type": "deduction", "label": "Provident Fund (E2E Verify)", "amount": 10000, "calc_note": "Formula \\"BASIC * 0.05\\" = 10000.00.", "component_id": "3324ec1c-6276-4326-b290-c1954e02cce9", "display_order": 2, "calculation_type": "formula"}, {"code": "TAX", "type": "deduction", "label": "Income Tax", "amount": 44033.33, "calc_note": "Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per \\"FBR Salaried 2026-27 (E2E Verify)\\")", "component_id": null, "display_order": 9990, "calculation_type": "formula"}, {"code": "LOAN", "type": "deduction", "label": "Loan Repayment", "amount": 112000, "calc_note": "Loan: 100000.00 (outstanding 400000.00 → 300000.00); UI walkthrough — phone advance: 12000.00 (outstanding 36000.00 → 24000.00)", "component_id": null, "display_order": 9991, "calculation_type": "fixed"}], "inputs": {"late_count": 0, "absent_days": 0, "late_minutes": 0, "present_days": 0, "working_days": 22, "overtime_hours": 0, "overtime_amount": 0, "paid_leave_days": 0, "unpaid_leave_days": 0}, "user_id": "c64f66c9-639f-4913-8d6e-0304d51f1c20", "currency": "PKR", "warnings": [], "period_id": "b1d57c8c-22b0-454c-8daf-59a5c0daa4c0", "net_salary": 127967, "period_end": "2026-09-30", "period_name": "Sept", "basic_salary": 200000, "gross_salary": 294000, "period_start": "2026-09-01", "structure_id": "411df72c-7665-4a69-85e2-44eb546083a4", "employee_code": "TC-EMP-005", "employee_name": "Ashan Mustafa", "structure_name": "Standard Staff (E2E Verify)", "total_earnings": 294000, "total_deductions": 166033.33, "reimbursement_ids": []}	\N	2026-08-12 13:25:33.954096+05	2026-08-12 17:09:00.578919+05
e12098dc-8dcb-4cf1-beab-157b90614519	b1d57c8c-22b0-454c-8daf-59a5c0daa4c0	43af610e-e846-4f7c-88bd-c51fc43f0d12	411df72c-7665-4a69-85e2-44eb546083a4	200000.00	294000.00	294000.00	54033.33	239967.00	22	0.00	0.00	0.00	0.00	0	0.00	0.00	locked	{"lines": [{"code": "BASIC", "type": "earning", "label": "Basic Salary", "amount": 200000, "calc_note": "Base salary for the period = 200000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_HRA", "type": "earning", "label": "House Rent Allowance (E2E Verify)", "amount": 80000, "calc_note": "40% of BASIC (200000.00) = 80000.00.", "component_id": "311448ee-b38c-4503-a60b-b48ffbea70bf", "display_order": 1, "calculation_type": "percent_basic"}, {"code": "BONUS", "type": "earning", "label": "Monthly performance bonus (E2E Verify)", "amount": 14000, "calc_note": "Bonus 5% of gross (280000.00) = 14000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_PF", "type": "deduction", "label": "Provident Fund (E2E Verify)", "amount": 10000, "calc_note": "Formula \\"BASIC * 0.05\\" = 10000.00.", "component_id": "3324ec1c-6276-4326-b290-c1954e02cce9", "display_order": 2, "calculation_type": "formula"}, {"code": "TAX", "type": "deduction", "label": "Income Tax", "amount": 44033.33, "calc_note": "Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per \\"FBR Salaried 2026-27 (E2E Verify)\\")", "component_id": null, "display_order": 9990, "calculation_type": "formula"}], "inputs": {"late_count": 0, "absent_days": 0, "late_minutes": 0, "present_days": 0, "working_days": 22, "overtime_hours": 0, "overtime_amount": 0, "paid_leave_days": 0, "unpaid_leave_days": 0}, "user_id": "43af610e-e846-4f7c-88bd-c51fc43f0d12", "currency": "PKR", "warnings": [], "period_id": "b1d57c8c-22b0-454c-8daf-59a5c0daa4c0", "net_salary": 239967, "period_end": "2026-09-30", "period_name": "Sept", "basic_salary": 200000, "gross_salary": 294000, "period_start": "2026-09-01", "structure_id": "411df72c-7665-4a69-85e2-44eb546083a4", "employee_code": "TC-EMP-006", "employee_name": "Taha Tayyab", "structure_name": "Standard Staff (E2E Verify)", "total_earnings": 294000, "total_deductions": 54033.33, "reimbursement_ids": []}	\N	2026-08-12 13:25:34.04745+05	2026-08-12 17:09:00.578919+05
da44dd74-000f-480c-a6d2-be9a7ce6dbaa	b1d57c8c-22b0-454c-8daf-59a5c0daa4c0	5269a7da-0db6-49b8-97eb-c2d482cb611a	411df72c-7665-4a69-85e2-44eb546083a4	200000.00	294000.00	294000.00	54033.33	239967.00	22	0.00	0.00	0.00	0.00	0	0.00	0.00	locked	{"lines": [{"code": "BASIC", "type": "earning", "label": "Basic Salary", "amount": 200000, "calc_note": "Base salary for the period = 200000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_HRA", "type": "earning", "label": "House Rent Allowance (E2E Verify)", "amount": 80000, "calc_note": "40% of BASIC (200000.00) = 80000.00.", "component_id": "311448ee-b38c-4503-a60b-b48ffbea70bf", "display_order": 1, "calculation_type": "percent_basic"}, {"code": "BONUS", "type": "earning", "label": "Monthly performance bonus (E2E Verify)", "amount": 14000, "calc_note": "Bonus 5% of gross (280000.00) = 14000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_PF", "type": "deduction", "label": "Provident Fund (E2E Verify)", "amount": 10000, "calc_note": "Formula \\"BASIC * 0.05\\" = 10000.00.", "component_id": "3324ec1c-6276-4326-b290-c1954e02cce9", "display_order": 2, "calculation_type": "formula"}, {"code": "TAX", "type": "deduction", "label": "Income Tax", "amount": 44033.33, "calc_note": "Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per \\"FBR Salaried 2026-27 (E2E Verify)\\")", "component_id": null, "display_order": 9990, "calculation_type": "formula"}], "inputs": {"late_count": 0, "absent_days": 0, "late_minutes": 0, "present_days": 0, "working_days": 22, "overtime_hours": 0, "overtime_amount": 0, "paid_leave_days": 0, "unpaid_leave_days": 0}, "user_id": "5269a7da-0db6-49b8-97eb-c2d482cb611a", "currency": "PKR", "warnings": [], "period_id": "b1d57c8c-22b0-454c-8daf-59a5c0daa4c0", "net_salary": 239967, "period_end": "2026-09-30", "period_name": "Sept", "basic_salary": 200000, "gross_salary": 294000, "period_start": "2026-09-01", "structure_id": "411df72c-7665-4a69-85e2-44eb546083a4", "employee_code": "TC-EMP-003", "employee_name": "Haseeb Iqbal", "structure_name": "Standard Staff (E2E Verify)", "total_earnings": 294000, "total_deductions": 54033.33, "reimbursement_ids": []}	\N	2026-08-12 13:25:34.073516+05	2026-08-12 17:09:00.578919+05
8fb9866e-6f2d-4e73-bef0-db90cdf68bdd	b3ccb701-b0ba-4a27-b632-2268e762aa44	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	411df72c-7665-4a69-85e2-44eb546083a4	200000.00	294000.00	294000.00	54033.33	239967.00	22	0.00	0.00	0.00	0.00	0	0.00	0.00	locked	{"lines": [{"code": "BASIC", "type": "earning", "label": "Basic Salary", "amount": 200000, "calc_note": "Base salary for the period = 200000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_HRA", "type": "earning", "label": "House Rent Allowance (E2E Verify)", "amount": 80000, "calc_note": "40% of BASIC (200000.00) = 80000.00.", "component_id": "311448ee-b38c-4503-a60b-b48ffbea70bf", "display_order": 1, "calculation_type": "percent_basic"}, {"code": "BONUS", "type": "earning", "label": "Monthly performance bonus (E2E Verify)", "amount": 14000, "calc_note": "Bonus 5% of gross (280000.00) = 14000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_PF", "type": "deduction", "label": "Provident Fund (E2E Verify)", "amount": 10000, "calc_note": "Formula \\"BASIC * 0.05\\" = 10000.00.", "component_id": "3324ec1c-6276-4326-b290-c1954e02cce9", "display_order": 2, "calculation_type": "formula"}, {"code": "TAX", "type": "deduction", "label": "Income Tax", "amount": 44033.33, "calc_note": "Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per \\"FBR Salaried 2026-27 (E2E Verify)\\")", "component_id": null, "display_order": 9990, "calculation_type": "formula"}], "inputs": {"late_count": 0, "absent_days": 0, "late_minutes": 0, "present_days": 0, "working_days": 22, "overtime_hours": 0, "overtime_amount": 0, "paid_leave_days": 0, "unpaid_leave_days": 0}, "user_id": "8b4ba86e-6f24-4eed-83b0-d5f191eb7adf", "currency": "PKR", "warnings": [], "period_id": "b3ccb701-b0ba-4a27-b632-2268e762aa44", "net_salary": 239967, "period_end": "2026-09-30", "period_name": "E2E Verify — Approval Flow #1", "basic_salary": 200000, "gross_salary": 294000, "period_start": "2026-09-01", "structure_id": "411df72c-7665-4a69-85e2-44eb546083a4", "employee_code": "TC-EMP-004", "employee_name": "Muddasir Iqbal", "structure_name": "Standard Staff (E2E Verify)", "total_earnings": 294000, "total_deductions": 54033.33}	\N	2026-08-11 13:44:46.344513+05	2026-08-11 13:44:46.473407+05
453f8ab2-14f3-4180-bbb0-78683e205740	b3ccb701-b0ba-4a27-b632-2268e762aa44	c64f66c9-639f-4913-8d6e-0304d51f1c20	411df72c-7665-4a69-85e2-44eb546083a4	200000.00	294000.00	294000.00	64033.33	229967.00	22	0.00	0.00	0.00	0.00	0	0.00	0.00	locked	{"lines": [{"code": "BASIC", "type": "earning", "label": "Basic Salary", "amount": 200000, "calc_note": "Base salary for the period = 200000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_HRA", "type": "earning", "label": "House Rent Allowance (E2E Verify)", "amount": 80000, "calc_note": "40% of BASIC (200000.00) = 80000.00.", "component_id": "311448ee-b38c-4503-a60b-b48ffbea70bf", "display_order": 1, "calculation_type": "percent_basic"}, {"code": "BONUS", "type": "earning", "label": "Monthly performance bonus (E2E Verify)", "amount": 14000, "calc_note": "Bonus 5% of gross (280000.00) = 14000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_PF", "type": "deduction", "label": "Provident Fund (E2E Verify)", "amount": 10000, "calc_note": "Formula \\"BASIC * 0.05\\" = 10000.00.", "component_id": "3324ec1c-6276-4326-b290-c1954e02cce9", "display_order": 2, "calculation_type": "formula"}, {"code": "TAX", "type": "deduction", "label": "Income Tax", "amount": 44033.33, "calc_note": "Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per \\"FBR Salaried 2026-27 (E2E Verify)\\")", "component_id": null, "display_order": 9990, "calculation_type": "formula"}, {"code": "LOAN", "type": "deduction", "label": "Loan Repayment", "amount": 10000, "calc_note": "Salary advance (E2E Verify): 10000.00 (outstanding 100000.00 → 90000.00)", "component_id": null, "display_order": 9991, "calculation_type": "fixed"}], "inputs": {"late_count": 0, "absent_days": 0, "late_minutes": 0, "present_days": 0, "working_days": 22, "overtime_hours": 0, "overtime_amount": 0, "paid_leave_days": 0, "unpaid_leave_days": 0}, "user_id": "c64f66c9-639f-4913-8d6e-0304d51f1c20", "currency": "PKR", "warnings": [], "period_id": "b3ccb701-b0ba-4a27-b632-2268e762aa44", "net_salary": 229967, "period_end": "2026-09-30", "period_name": "E2E Verify — Approval Flow #1", "basic_salary": 200000, "gross_salary": 294000, "period_start": "2026-09-01", "structure_id": "411df72c-7665-4a69-85e2-44eb546083a4", "employee_code": "TC-EMP-005", "employee_name": "Ashan Mustafa", "structure_name": "Standard Staff (E2E Verify)", "total_earnings": 294000, "total_deductions": 64033.33}	\N	2026-08-11 13:44:46.365886+05	2026-08-11 13:44:46.473407+05
1bfb68d7-fd42-4f6a-8265-acd64e0e3a82	b3ccb701-b0ba-4a27-b632-2268e762aa44	5269a7da-0db6-49b8-97eb-c2d482cb611a	411df72c-7665-4a69-85e2-44eb546083a4	200000.00	294000.00	294000.00	54033.33	239967.00	22	0.00	0.00	0.00	0.00	0	0.00	0.00	locked	{"lines": [{"code": "BASIC", "type": "earning", "label": "Basic Salary", "amount": 200000, "calc_note": "Base salary for the period = 200000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_HRA", "type": "earning", "label": "House Rent Allowance (E2E Verify)", "amount": 80000, "calc_note": "40% of BASIC (200000.00) = 80000.00.", "component_id": "311448ee-b38c-4503-a60b-b48ffbea70bf", "display_order": 1, "calculation_type": "percent_basic"}, {"code": "BONUS", "type": "earning", "label": "Monthly performance bonus (E2E Verify)", "amount": 14000, "calc_note": "Bonus 5% of gross (280000.00) = 14000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_PF", "type": "deduction", "label": "Provident Fund (E2E Verify)", "amount": 10000, "calc_note": "Formula \\"BASIC * 0.05\\" = 10000.00.", "component_id": "3324ec1c-6276-4326-b290-c1954e02cce9", "display_order": 2, "calculation_type": "formula"}, {"code": "TAX", "type": "deduction", "label": "Income Tax", "amount": 44033.33, "calc_note": "Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per \\"FBR Salaried 2026-27 (E2E Verify)\\")", "component_id": null, "display_order": 9990, "calculation_type": "formula"}], "inputs": {"late_count": 0, "absent_days": 0, "late_minutes": 0, "present_days": 0, "working_days": 22, "overtime_hours": 0, "overtime_amount": 0, "paid_leave_days": 0, "unpaid_leave_days": 0}, "user_id": "5269a7da-0db6-49b8-97eb-c2d482cb611a", "currency": "PKR", "warnings": [], "period_id": "b3ccb701-b0ba-4a27-b632-2268e762aa44", "net_salary": 239967, "period_end": "2026-09-30", "period_name": "E2E Verify — Approval Flow #1", "basic_salary": 200000, "gross_salary": 294000, "period_start": "2026-09-01", "structure_id": "411df72c-7665-4a69-85e2-44eb546083a4", "employee_code": "TC-EMP-003", "employee_name": "Haseeb Iqbal", "structure_name": "Standard Staff (E2E Verify)", "total_earnings": 294000, "total_deductions": 54033.33}	\N	2026-08-11 13:44:46.389179+05	2026-08-11 13:44:46.473407+05
15e25df0-5626-4649-9d09-ae16eb310bf6	d776cd73-25b0-4a48-9846-6be4e3a3888d	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	411df72c-7665-4a69-85e2-44eb546083a4	200000.00	294000.00	294000.00	54033.33	239967.00	22	0.00	0.00	0.00	0.00	0	0.00	0.00	locked	{"lines": [{"code": "BASIC", "type": "earning", "label": "Basic Salary", "amount": 200000, "calc_note": "Base salary for the period = 200000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_HRA", "type": "earning", "label": "House Rent Allowance (E2E Verify)", "amount": 80000, "calc_note": "40% of BASIC (200000.00) = 80000.00.", "component_id": "311448ee-b38c-4503-a60b-b48ffbea70bf", "display_order": 1, "calculation_type": "percent_basic"}, {"code": "BONUS", "type": "earning", "label": "Monthly performance bonus (E2E Verify)", "amount": 14000, "calc_note": "Bonus 5% of gross (280000.00) = 14000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_PF", "type": "deduction", "label": "Provident Fund (E2E Verify)", "amount": 10000, "calc_note": "Formula \\"BASIC * 0.05\\" = 10000.00.", "component_id": "3324ec1c-6276-4326-b290-c1954e02cce9", "display_order": 2, "calculation_type": "formula"}, {"code": "TAX", "type": "deduction", "label": "Income Tax", "amount": 44033.33, "calc_note": "Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per \\"FBR Salaried 2026-27 (E2E Verify)\\")", "component_id": null, "display_order": 9990, "calculation_type": "formula"}], "inputs": {"late_count": 0, "absent_days": 0, "late_minutes": 0, "present_days": 0, "working_days": 22, "overtime_hours": 0, "overtime_amount": 0, "paid_leave_days": 0, "unpaid_leave_days": 0}, "user_id": "8b4ba86e-6f24-4eed-83b0-d5f191eb7adf", "currency": "PKR", "warnings": [], "period_id": "d776cd73-25b0-4a48-9846-6be4e3a3888d", "net_salary": 239967, "period_end": "2026-09-30", "period_name": "E2E Verify — Approval Flow #2", "basic_salary": 200000, "gross_salary": 294000, "period_start": "2026-09-01", "structure_id": "411df72c-7665-4a69-85e2-44eb546083a4", "employee_code": "TC-EMP-004", "employee_name": "Muddasir Iqbal", "structure_name": "Standard Staff (E2E Verify)", "total_earnings": 294000, "total_deductions": 54033.33}	\N	2026-08-11 13:45:06.864777+05	2026-08-11 13:45:07.002502+05
f42bded6-ea4b-463c-9285-dba58b262c09	d776cd73-25b0-4a48-9846-6be4e3a3888d	c64f66c9-639f-4913-8d6e-0304d51f1c20	411df72c-7665-4a69-85e2-44eb546083a4	200000.00	294000.00	294000.00	64033.33	229967.00	22	0.00	0.00	0.00	0.00	0	0.00	0.00	locked	{"lines": [{"code": "BASIC", "type": "earning", "label": "Basic Salary", "amount": 200000, "calc_note": "Base salary for the period = 200000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_HRA", "type": "earning", "label": "House Rent Allowance (E2E Verify)", "amount": 80000, "calc_note": "40% of BASIC (200000.00) = 80000.00.", "component_id": "311448ee-b38c-4503-a60b-b48ffbea70bf", "display_order": 1, "calculation_type": "percent_basic"}, {"code": "BONUS", "type": "earning", "label": "Monthly performance bonus (E2E Verify)", "amount": 14000, "calc_note": "Bonus 5% of gross (280000.00) = 14000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_PF", "type": "deduction", "label": "Provident Fund (E2E Verify)", "amount": 10000, "calc_note": "Formula \\"BASIC * 0.05\\" = 10000.00.", "component_id": "3324ec1c-6276-4326-b290-c1954e02cce9", "display_order": 2, "calculation_type": "formula"}, {"code": "TAX", "type": "deduction", "label": "Income Tax", "amount": 44033.33, "calc_note": "Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per \\"FBR Salaried 2026-27 (E2E Verify)\\")", "component_id": null, "display_order": 9990, "calculation_type": "formula"}, {"code": "LOAN", "type": "deduction", "label": "Loan Repayment", "amount": 10000, "calc_note": "Salary advance (E2E Verify): 10000.00 (outstanding 90000.00 → 80000.00)", "component_id": null, "display_order": 9991, "calculation_type": "fixed"}], "inputs": {"late_count": 0, "absent_days": 0, "late_minutes": 0, "present_days": 0, "working_days": 22, "overtime_hours": 0, "overtime_amount": 0, "paid_leave_days": 0, "unpaid_leave_days": 0}, "user_id": "c64f66c9-639f-4913-8d6e-0304d51f1c20", "currency": "PKR", "warnings": [], "period_id": "d776cd73-25b0-4a48-9846-6be4e3a3888d", "net_salary": 229967, "period_end": "2026-09-30", "period_name": "E2E Verify — Approval Flow #2", "basic_salary": 200000, "gross_salary": 294000, "period_start": "2026-09-01", "structure_id": "411df72c-7665-4a69-85e2-44eb546083a4", "employee_code": "TC-EMP-005", "employee_name": "Ashan Mustafa", "structure_name": "Standard Staff (E2E Verify)", "total_earnings": 294000, "total_deductions": 64033.33}	\N	2026-08-11 13:45:06.887137+05	2026-08-11 13:45:07.002502+05
f4da971f-8b5e-45ec-a702-8cf12c502c34	d776cd73-25b0-4a48-9846-6be4e3a3888d	5269a7da-0db6-49b8-97eb-c2d482cb611a	411df72c-7665-4a69-85e2-44eb546083a4	200000.00	294000.00	294000.00	54033.33	239967.00	22	0.00	0.00	0.00	0.00	0	0.00	0.00	locked	{"lines": [{"code": "BASIC", "type": "earning", "label": "Basic Salary", "amount": 200000, "calc_note": "Base salary for the period = 200000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_HRA", "type": "earning", "label": "House Rent Allowance (E2E Verify)", "amount": 80000, "calc_note": "40% of BASIC (200000.00) = 80000.00.", "component_id": "311448ee-b38c-4503-a60b-b48ffbea70bf", "display_order": 1, "calculation_type": "percent_basic"}, {"code": "BONUS", "type": "earning", "label": "Monthly performance bonus (E2E Verify)", "amount": 14000, "calc_note": "Bonus 5% of gross (280000.00) = 14000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_PF", "type": "deduction", "label": "Provident Fund (E2E Verify)", "amount": 10000, "calc_note": "Formula \\"BASIC * 0.05\\" = 10000.00.", "component_id": "3324ec1c-6276-4326-b290-c1954e02cce9", "display_order": 2, "calculation_type": "formula"}, {"code": "TAX", "type": "deduction", "label": "Income Tax", "amount": 44033.33, "calc_note": "Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per \\"FBR Salaried 2026-27 (E2E Verify)\\")", "component_id": null, "display_order": 9990, "calculation_type": "formula"}], "inputs": {"late_count": 0, "absent_days": 0, "late_minutes": 0, "present_days": 0, "working_days": 22, "overtime_hours": 0, "overtime_amount": 0, "paid_leave_days": 0, "unpaid_leave_days": 0}, "user_id": "5269a7da-0db6-49b8-97eb-c2d482cb611a", "currency": "PKR", "warnings": [], "period_id": "d776cd73-25b0-4a48-9846-6be4e3a3888d", "net_salary": 239967, "period_end": "2026-09-30", "period_name": "E2E Verify — Approval Flow #2", "basic_salary": 200000, "gross_salary": 294000, "period_start": "2026-09-01", "structure_id": "411df72c-7665-4a69-85e2-44eb546083a4", "employee_code": "TC-EMP-003", "employee_name": "Haseeb Iqbal", "structure_name": "Standard Staff (E2E Verify)", "total_earnings": 294000, "total_deductions": 54033.33}	\N	2026-08-11 13:45:06.910232+05	2026-08-11 13:45:07.002502+05
7080b686-8d4d-4767-b880-03b97b3e4208	e4631de4-85d8-4c21-8673-5f48f08ff43b	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	411df72c-7665-4a69-85e2-44eb546083a4	200000.00	294000.00	294000.00	54033.33	239967.00	22	0.00	0.00	0.00	0.00	0	0.00	0.00	locked	{"lines": [{"code": "BASIC", "type": "earning", "label": "Basic Salary", "amount": 200000, "calc_note": "Base salary for the period = 200000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_HRA", "type": "earning", "label": "House Rent Allowance (E2E Verify)", "amount": 80000, "calc_note": "40% of BASIC (200000.00) = 80000.00.", "component_id": "311448ee-b38c-4503-a60b-b48ffbea70bf", "display_order": 1, "calculation_type": "percent_basic"}, {"code": "BONUS", "type": "earning", "label": "Monthly performance bonus (E2E Verify)", "amount": 14000, "calc_note": "Bonus 5% of gross (280000.00) = 14000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_PF", "type": "deduction", "label": "Provident Fund (E2E Verify)", "amount": 10000, "calc_note": "Formula \\"BASIC * 0.05\\" = 10000.00.", "component_id": "3324ec1c-6276-4326-b290-c1954e02cce9", "display_order": 2, "calculation_type": "formula"}, {"code": "TAX", "type": "deduction", "label": "Income Tax", "amount": 44033.33, "calc_note": "Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per \\"FBR Salaried 2026-27 (E2E Verify)\\")", "component_id": null, "display_order": 9990, "calculation_type": "formula"}], "inputs": {"late_count": 0, "absent_days": 0, "late_minutes": 0, "present_days": 0, "working_days": 22, "overtime_hours": 0, "overtime_amount": 0, "paid_leave_days": 0, "unpaid_leave_days": 0}, "user_id": "8b4ba86e-6f24-4eed-83b0-d5f191eb7adf", "currency": "PKR", "warnings": [], "period_id": "e4631de4-85d8-4c21-8673-5f48f08ff43b", "net_salary": 239967, "period_end": "2026-09-30", "period_name": "E2E Verify — Approval Flow #3", "basic_salary": 200000, "gross_salary": 294000, "period_start": "2026-09-01", "structure_id": "411df72c-7665-4a69-85e2-44eb546083a4", "employee_code": "TC-EMP-004", "employee_name": "Muddasir Iqbal", "structure_name": "Standard Staff (E2E Verify)", "total_earnings": 294000, "total_deductions": 54033.33}	\N	2026-08-11 13:48:00.934385+05	2026-08-11 13:48:01.085579+05
dacc632c-9aa3-440d-938d-e5b70c2d0133	e4631de4-85d8-4c21-8673-5f48f08ff43b	c64f66c9-639f-4913-8d6e-0304d51f1c20	411df72c-7665-4a69-85e2-44eb546083a4	200000.00	294000.00	294000.00	64033.33	229967.00	22	0.00	0.00	0.00	0.00	0	0.00	0.00	locked	{"lines": [{"code": "BASIC", "type": "earning", "label": "Basic Salary", "amount": 200000, "calc_note": "Base salary for the period = 200000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_HRA", "type": "earning", "label": "House Rent Allowance (E2E Verify)", "amount": 80000, "calc_note": "40% of BASIC (200000.00) = 80000.00.", "component_id": "311448ee-b38c-4503-a60b-b48ffbea70bf", "display_order": 1, "calculation_type": "percent_basic"}, {"code": "BONUS", "type": "earning", "label": "Monthly performance bonus (E2E Verify)", "amount": 14000, "calc_note": "Bonus 5% of gross (280000.00) = 14000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_PF", "type": "deduction", "label": "Provident Fund (E2E Verify)", "amount": 10000, "calc_note": "Formula \\"BASIC * 0.05\\" = 10000.00.", "component_id": "3324ec1c-6276-4326-b290-c1954e02cce9", "display_order": 2, "calculation_type": "formula"}, {"code": "TAX", "type": "deduction", "label": "Income Tax", "amount": 44033.33, "calc_note": "Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per \\"FBR Salaried 2026-27 (E2E Verify)\\")", "component_id": null, "display_order": 9990, "calculation_type": "formula"}, {"code": "LOAN", "type": "deduction", "label": "Loan Repayment", "amount": 10000, "calc_note": "Salary advance (E2E Verify): 10000.00 (outstanding 80000.00 → 70000.00)", "component_id": null, "display_order": 9991, "calculation_type": "fixed"}], "inputs": {"late_count": 0, "absent_days": 0, "late_minutes": 0, "present_days": 0, "working_days": 22, "overtime_hours": 0, "overtime_amount": 0, "paid_leave_days": 0, "unpaid_leave_days": 0}, "user_id": "c64f66c9-639f-4913-8d6e-0304d51f1c20", "currency": "PKR", "warnings": [], "period_id": "e4631de4-85d8-4c21-8673-5f48f08ff43b", "net_salary": 229967, "period_end": "2026-09-30", "period_name": "E2E Verify — Approval Flow #3", "basic_salary": 200000, "gross_salary": 294000, "period_start": "2026-09-01", "structure_id": "411df72c-7665-4a69-85e2-44eb546083a4", "employee_code": "TC-EMP-005", "employee_name": "Ashan Mustafa", "structure_name": "Standard Staff (E2E Verify)", "total_earnings": 294000, "total_deductions": 64033.33}	\N	2026-08-11 13:48:00.964919+05	2026-08-11 13:48:01.085579+05
060778a9-1f5d-4f99-b722-d10c04e8813d	e4631de4-85d8-4c21-8673-5f48f08ff43b	5269a7da-0db6-49b8-97eb-c2d482cb611a	411df72c-7665-4a69-85e2-44eb546083a4	200000.00	294000.00	294000.00	54033.33	239967.00	22	0.00	0.00	0.00	0.00	0	0.00	0.00	locked	{"lines": [{"code": "BASIC", "type": "earning", "label": "Basic Salary", "amount": 200000, "calc_note": "Base salary for the period = 200000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_HRA", "type": "earning", "label": "House Rent Allowance (E2E Verify)", "amount": 80000, "calc_note": "40% of BASIC (200000.00) = 80000.00.", "component_id": "311448ee-b38c-4503-a60b-b48ffbea70bf", "display_order": 1, "calculation_type": "percent_basic"}, {"code": "BONUS", "type": "earning", "label": "Monthly performance bonus (E2E Verify)", "amount": 14000, "calc_note": "Bonus 5% of gross (280000.00) = 14000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_PF", "type": "deduction", "label": "Provident Fund (E2E Verify)", "amount": 10000, "calc_note": "Formula \\"BASIC * 0.05\\" = 10000.00.", "component_id": "3324ec1c-6276-4326-b290-c1954e02cce9", "display_order": 2, "calculation_type": "formula"}, {"code": "TAX", "type": "deduction", "label": "Income Tax", "amount": 44033.33, "calc_note": "Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per \\"FBR Salaried 2026-27 (E2E Verify)\\")", "component_id": null, "display_order": 9990, "calculation_type": "formula"}], "inputs": {"late_count": 0, "absent_days": 0, "late_minutes": 0, "present_days": 0, "working_days": 22, "overtime_hours": 0, "overtime_amount": 0, "paid_leave_days": 0, "unpaid_leave_days": 0}, "user_id": "5269a7da-0db6-49b8-97eb-c2d482cb611a", "currency": "PKR", "warnings": [], "period_id": "e4631de4-85d8-4c21-8673-5f48f08ff43b", "net_salary": 239967, "period_end": "2026-09-30", "period_name": "E2E Verify — Approval Flow #3", "basic_salary": 200000, "gross_salary": 294000, "period_start": "2026-09-01", "structure_id": "411df72c-7665-4a69-85e2-44eb546083a4", "employee_code": "TC-EMP-003", "employee_name": "Haseeb Iqbal", "structure_name": "Standard Staff (E2E Verify)", "total_earnings": 294000, "total_deductions": 54033.33}	\N	2026-08-11 13:48:00.993555+05	2026-08-11 13:48:01.085579+05
4f0d4d89-28ef-463d-a80d-e769bc0f5d00	786e413c-7efa-480b-bf65-9e79a8a0cd7d	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	411df72c-7665-4a69-85e2-44eb546083a4	200000.00	294000.00	294000.00	73080.95	220919.00	21	0.00	2.00	0.00	0.00	0	0.00	0.00	locked	{"lines": [{"code": "BASIC", "type": "earning", "label": "Basic Salary", "amount": 200000, "calc_note": "Base salary for the period = 200000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_HRA", "type": "earning", "label": "House Rent Allowance (E2E Verify)", "amount": 80000, "calc_note": "40% of BASIC (200000.00) = 80000.00.", "component_id": "311448ee-b38c-4503-a60b-b48ffbea70bf", "display_order": 1, "calculation_type": "percent_basic"}, {"code": "BONUS", "type": "earning", "label": "Monthly performance bonus (E2E Verify)", "amount": 14000, "calc_note": "Bonus 5% of gross (280000.00) = 14000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_PF", "type": "deduction", "label": "Provident Fund (E2E Verify)", "amount": 10000, "calc_note": "Formula \\"BASIC * 0.05\\" = 10000.00.", "component_id": "3324ec1c-6276-4326-b290-c1954e02cce9", "display_order": 2, "calculation_type": "formula"}, {"code": "TAX", "type": "deduction", "label": "Income Tax", "amount": 44033.33, "calc_note": "Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per \\"FBR Salaried 2026-27 (E2E Verify)\\")", "component_id": null, "display_order": 9990, "calculation_type": "formula"}, {"code": "ABSENCE", "type": "deduction", "label": "Absence Deduction", "amount": 19047.62, "calc_note": "2 unpaid day(s) (2 absent + 0 unpaid leave) × daily rate (BASIC 200000.00 / 21 working days = 9523.81) = 19047.62.", "component_id": null, "display_order": 9999, "calculation_type": "per_day"}], "inputs": {"late_count": 0, "absent_days": 2, "late_minutes": 0, "present_days": 0, "working_days": 21, "overtime_hours": 0, "overtime_amount": 0, "paid_leave_days": 0, "unpaid_leave_days": 0}, "user_id": "8b4ba86e-6f24-4eed-83b0-d5f191eb7adf", "currency": "PKR", "warnings": [], "period_id": "786e413c-7efa-480b-bf65-9e79a8a0cd7d", "net_salary": 220919, "period_end": "2026-08-31", "period_name": "E2E Verify — August 2026", "basic_salary": 200000, "gross_salary": 294000, "period_start": "2026-08-01", "structure_id": "411df72c-7665-4a69-85e2-44eb546083a4", "employee_code": "TC-EMP-004", "employee_name": "Muddasir Iqbal", "structure_name": "Standard Staff (E2E Verify)", "total_earnings": 294000, "total_deductions": 73080.95}	\N	2026-08-11 13:48:00.461287+05	2026-08-11 14:00:55.423919+05
2552b8a8-87da-4cb5-8c26-5b379ddb302c	786e413c-7efa-480b-bf65-9e79a8a0cd7d	c64f66c9-639f-4913-8d6e-0304d51f1c20	411df72c-7665-4a69-85e2-44eb546083a4	200000.00	294000.00	294000.00	73557.14	220443.00	21	0.00	1.00	0.00	0.00	0	0.00	0.00	locked	{"lines": [{"code": "BASIC", "type": "earning", "label": "Basic Salary", "amount": 200000, "calc_note": "Base salary for the period = 200000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_HRA", "type": "earning", "label": "House Rent Allowance (E2E Verify)", "amount": 80000, "calc_note": "40% of BASIC (200000.00) = 80000.00.", "component_id": "311448ee-b38c-4503-a60b-b48ffbea70bf", "display_order": 1, "calculation_type": "percent_basic"}, {"code": "BONUS", "type": "earning", "label": "Monthly performance bonus (E2E Verify)", "amount": 14000, "calc_note": "Bonus 5% of gross (280000.00) = 14000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_PF", "type": "deduction", "label": "Provident Fund (E2E Verify)", "amount": 10000, "calc_note": "Formula \\"BASIC * 0.05\\" = 10000.00.", "component_id": "3324ec1c-6276-4326-b290-c1954e02cce9", "display_order": 2, "calculation_type": "formula"}, {"code": "TAX", "type": "deduction", "label": "Income Tax", "amount": 44033.33, "calc_note": "Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per \\"FBR Salaried 2026-27 (E2E Verify)\\")", "component_id": null, "display_order": 9990, "calculation_type": "formula"}, {"code": "LOAN", "type": "deduction", "label": "Loan Repayment", "amount": 10000, "calc_note": "Salary advance (E2E Verify): 10000.00 (outstanding 90000.00 → 80000.00)", "component_id": null, "display_order": 9991, "calculation_type": "fixed"}, {"code": "ABSENCE", "type": "deduction", "label": "Absence Deduction", "amount": 9523.81, "calc_note": "1 unpaid day(s) (1 absent + 0 unpaid leave) × daily rate (BASIC 200000.00 / 21 working days = 9523.81) = 9523.81.", "component_id": null, "display_order": 9999, "calculation_type": "per_day"}], "inputs": {"late_count": 0, "absent_days": 1, "late_minutes": 0, "present_days": 0, "working_days": 21, "overtime_hours": 0, "overtime_amount": 0, "paid_leave_days": 0, "unpaid_leave_days": 0}, "user_id": "c64f66c9-639f-4913-8d6e-0304d51f1c20", "currency": "PKR", "warnings": [], "period_id": "786e413c-7efa-480b-bf65-9e79a8a0cd7d", "net_salary": 220443, "period_end": "2026-08-31", "period_name": "E2E Verify — August 2026", "basic_salary": 200000, "gross_salary": 294000, "period_start": "2026-08-01", "structure_id": "411df72c-7665-4a69-85e2-44eb546083a4", "employee_code": "TC-EMP-005", "employee_name": "Ashan Mustafa", "structure_name": "Standard Staff (E2E Verify)", "total_earnings": 294000, "total_deductions": 73557.14}	\N	2026-08-11 13:48:00.503827+05	2026-08-11 14:00:55.423919+05
05aabf0d-c8d9-4953-9f8c-7ce882596c5a	786e413c-7efa-480b-bf65-9e79a8a0cd7d	5269a7da-0db6-49b8-97eb-c2d482cb611a	411df72c-7665-4a69-85e2-44eb546083a4	200000.00	294000.00	294000.00	54033.33	239967.00	21	1.00	0.00	0.00	0.00	0	0.00	0.00	locked	{"lines": [{"code": "BASIC", "type": "earning", "label": "Basic Salary", "amount": 200000, "calc_note": "Base salary for the period = 200000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_HRA", "type": "earning", "label": "House Rent Allowance (E2E Verify)", "amount": 80000, "calc_note": "40% of BASIC (200000.00) = 80000.00.", "component_id": "311448ee-b38c-4503-a60b-b48ffbea70bf", "display_order": 1, "calculation_type": "percent_basic"}, {"code": "BONUS", "type": "earning", "label": "Monthly performance bonus (E2E Verify)", "amount": 14000, "calc_note": "Bonus 5% of gross (280000.00) = 14000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_PF", "type": "deduction", "label": "Provident Fund (E2E Verify)", "amount": 10000, "calc_note": "Formula \\"BASIC * 0.05\\" = 10000.00.", "component_id": "3324ec1c-6276-4326-b290-c1954e02cce9", "display_order": 2, "calculation_type": "formula"}, {"code": "TAX", "type": "deduction", "label": "Income Tax", "amount": 44033.33, "calc_note": "Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per \\"FBR Salaried 2026-27 (E2E Verify)\\")", "component_id": null, "display_order": 9990, "calculation_type": "formula"}], "inputs": {"late_count": 0, "absent_days": 0, "late_minutes": 0, "present_days": 1, "working_days": 21, "overtime_hours": 0, "overtime_amount": 0, "paid_leave_days": 0, "unpaid_leave_days": 0}, "user_id": "5269a7da-0db6-49b8-97eb-c2d482cb611a", "currency": "PKR", "warnings": [], "period_id": "786e413c-7efa-480b-bf65-9e79a8a0cd7d", "net_salary": 239967, "period_end": "2026-08-31", "period_name": "E2E Verify — August 2026", "basic_salary": 200000, "gross_salary": 294000, "period_start": "2026-08-01", "structure_id": "411df72c-7665-4a69-85e2-44eb546083a4", "employee_code": "TC-EMP-003", "employee_name": "Haseeb Iqbal", "structure_name": "Standard Staff (E2E Verify)", "total_earnings": 294000, "total_deductions": 54033.33}	\N	2026-08-11 13:48:00.52775+05	2026-08-11 14:00:55.423919+05
93f3b7fd-9a9b-414c-a5d7-ba36464ed606	60b5eed7-1cf5-41c4-99b7-4930a3a8acc7	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	411df72c-7665-4a69-85e2-44eb546083a4	200000.00	294000.00	294000.00	74033.33	219967.00	20	0.00	2.00	0.00	0.00	0	0.00	0.00	locked	{"lines": [{"code": "BASIC", "type": "earning", "label": "Basic Salary", "amount": 200000, "calc_note": "Base salary for the period = 200000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_HRA", "type": "earning", "label": "House Rent Allowance (E2E Verify)", "amount": 80000, "calc_note": "40% of BASIC (200000.00) = 80000.00.", "component_id": "311448ee-b38c-4503-a60b-b48ffbea70bf", "display_order": 1, "calculation_type": "percent_basic"}, {"code": "BONUS", "type": "earning", "label": "Monthly performance bonus (E2E Verify)", "amount": 14000, "calc_note": "Bonus 5% of gross (280000.00) = 14000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_PF", "type": "deduction", "label": "Provident Fund (E2E Verify)", "amount": 10000, "calc_note": "Formula \\"BASIC * 0.05\\" = 10000.00.", "component_id": "3324ec1c-6276-4326-b290-c1954e02cce9", "display_order": 2, "calculation_type": "formula"}, {"code": "TAX", "type": "deduction", "label": "Income Tax", "amount": 44033.33, "calc_note": "Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per \\"FBR Salaried 2026-27 (E2E Verify)\\")", "component_id": null, "display_order": 9990, "calculation_type": "formula"}, {"code": "ABSENCE", "type": "deduction", "label": "Absence Deduction", "amount": 20000, "calc_note": "2 unpaid day(s) (2 absent + 0 unpaid leave) × daily rate (BASIC 200000.00 / 20 working days = 10000.00) = 20000.00.", "component_id": null, "display_order": 9999, "calculation_type": "per_day"}], "inputs": {"late_count": 0, "absent_days": 2, "late_minutes": 0, "present_days": 0, "working_days": 20, "overtime_hours": 0, "overtime_amount": 0, "paid_leave_days": 0, "unpaid_leave_days": 0}, "user_id": "8b4ba86e-6f24-4eed-83b0-d5f191eb7adf", "currency": "PKR", "warnings": [], "period_id": "60b5eed7-1cf5-41c4-99b7-4930a3a8acc7", "net_salary": 219967, "period_end": "2026-08-31", "period_name": "Sept 2026", "basic_salary": 200000, "gross_salary": 294000, "period_start": "2026-08-01", "structure_id": "411df72c-7665-4a69-85e2-44eb546083a4", "employee_code": "TC-EMP-004", "employee_name": "Muddasir Iqbal", "structure_name": "Standard Staff (E2E Verify)", "total_earnings": 294000, "total_deductions": 74033.33}	\N	2026-08-11 13:54:41.125591+05	2026-08-11 14:00:57.507494+05
3f37712a-0277-40a8-8eb7-c33a9327d0ad	60b5eed7-1cf5-41c4-99b7-4930a3a8acc7	c64f66c9-639f-4913-8d6e-0304d51f1c20	411df72c-7665-4a69-85e2-44eb546083a4	200000.00	294000.00	294000.00	74033.33	219967.00	20	0.00	1.00	0.00	0.00	0	0.00	0.00	locked	{"lines": [{"code": "BASIC", "type": "earning", "label": "Basic Salary", "amount": 200000, "calc_note": "Base salary for the period = 200000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_HRA", "type": "earning", "label": "House Rent Allowance (E2E Verify)", "amount": 80000, "calc_note": "40% of BASIC (200000.00) = 80000.00.", "component_id": "311448ee-b38c-4503-a60b-b48ffbea70bf", "display_order": 1, "calculation_type": "percent_basic"}, {"code": "BONUS", "type": "earning", "label": "Monthly performance bonus (E2E Verify)", "amount": 14000, "calc_note": "Bonus 5% of gross (280000.00) = 14000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_PF", "type": "deduction", "label": "Provident Fund (E2E Verify)", "amount": 10000, "calc_note": "Formula \\"BASIC * 0.05\\" = 10000.00.", "component_id": "3324ec1c-6276-4326-b290-c1954e02cce9", "display_order": 2, "calculation_type": "formula"}, {"code": "TAX", "type": "deduction", "label": "Income Tax", "amount": 44033.33, "calc_note": "Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per \\"FBR Salaried 2026-27 (E2E Verify)\\")", "component_id": null, "display_order": 9990, "calculation_type": "formula"}, {"code": "LOAN", "type": "deduction", "label": "Loan Repayment", "amount": 10000, "calc_note": "Salary advance (E2E Verify): 10000.00 (outstanding 70000.00 → 60000.00)", "component_id": null, "display_order": 9991, "calculation_type": "fixed"}, {"code": "ABSENCE", "type": "deduction", "label": "Absence Deduction", "amount": 10000, "calc_note": "1 unpaid day(s) (1 absent + 0 unpaid leave) × daily rate (BASIC 200000.00 / 20 working days = 10000.00) = 10000.00.", "component_id": null, "display_order": 9999, "calculation_type": "per_day"}], "inputs": {"late_count": 0, "absent_days": 1, "late_minutes": 0, "present_days": 0, "working_days": 20, "overtime_hours": 0, "overtime_amount": 0, "paid_leave_days": 0, "unpaid_leave_days": 0}, "user_id": "c64f66c9-639f-4913-8d6e-0304d51f1c20", "currency": "PKR", "warnings": [], "period_id": "60b5eed7-1cf5-41c4-99b7-4930a3a8acc7", "net_salary": 219967, "period_end": "2026-08-31", "period_name": "Sept 2026", "basic_salary": 200000, "gross_salary": 294000, "period_start": "2026-08-01", "structure_id": "411df72c-7665-4a69-85e2-44eb546083a4", "employee_code": "TC-EMP-005", "employee_name": "Ashan Mustafa", "structure_name": "Standard Staff (E2E Verify)", "total_earnings": 294000, "total_deductions": 74033.33}	\N	2026-08-11 13:54:41.188355+05	2026-08-11 14:00:57.507494+05
43496f88-c3bd-4e39-a6d2-8f06d6d5dc89	60b5eed7-1cf5-41c4-99b7-4930a3a8acc7	5269a7da-0db6-49b8-97eb-c2d482cb611a	411df72c-7665-4a69-85e2-44eb546083a4	200000.00	294000.00	294000.00	54033.33	239967.00	20	1.00	0.00	0.00	0.00	0	0.00	0.00	locked	{"lines": [{"code": "BASIC", "type": "earning", "label": "Basic Salary", "amount": 200000, "calc_note": "Base salary for the period = 200000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_HRA", "type": "earning", "label": "House Rent Allowance (E2E Verify)", "amount": 80000, "calc_note": "40% of BASIC (200000.00) = 80000.00.", "component_id": "311448ee-b38c-4503-a60b-b48ffbea70bf", "display_order": 1, "calculation_type": "percent_basic"}, {"code": "BONUS", "type": "earning", "label": "Monthly performance bonus (E2E Verify)", "amount": 14000, "calc_note": "Bonus 5% of gross (280000.00) = 14000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_PF", "type": "deduction", "label": "Provident Fund (E2E Verify)", "amount": 10000, "calc_note": "Formula \\"BASIC * 0.05\\" = 10000.00.", "component_id": "3324ec1c-6276-4326-b290-c1954e02cce9", "display_order": 2, "calculation_type": "formula"}, {"code": "TAX", "type": "deduction", "label": "Income Tax", "amount": 44033.33, "calc_note": "Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per \\"FBR Salaried 2026-27 (E2E Verify)\\")", "component_id": null, "display_order": 9990, "calculation_type": "formula"}], "inputs": {"late_count": 0, "absent_days": 0, "late_minutes": 0, "present_days": 1, "working_days": 20, "overtime_hours": 0, "overtime_amount": 0, "paid_leave_days": 0, "unpaid_leave_days": 0}, "user_id": "5269a7da-0db6-49b8-97eb-c2d482cb611a", "currency": "PKR", "warnings": [], "period_id": "60b5eed7-1cf5-41c4-99b7-4930a3a8acc7", "net_salary": 239967, "period_end": "2026-08-31", "period_name": "Sept 2026", "basic_salary": 200000, "gross_salary": 294000, "period_start": "2026-08-01", "structure_id": "411df72c-7665-4a69-85e2-44eb546083a4", "employee_code": "TC-EMP-003", "employee_name": "Haseeb Iqbal", "structure_name": "Standard Staff (E2E Verify)", "total_earnings": 294000, "total_deductions": 54033.33}	\N	2026-08-11 13:54:41.226187+05	2026-08-11 14:00:57.507494+05
8e12f466-bea0-47bc-a8ce-d2bb03588e07	7df2fd08-d84e-465b-93a4-1d4320388650	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	411df72c-7665-4a69-85e2-44eb546083a4	200000.00	294000.00	294000.00	73080.95	220919.00	21	0.00	2.00	0.00	0.00	0	0.00	0.00	locked	{"lines": [{"code": "BASIC", "type": "earning", "label": "Basic Salary", "amount": 200000, "calc_note": "Base salary for the period = 200000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_HRA", "type": "earning", "label": "House Rent Allowance (E2E Verify)", "amount": 80000, "calc_note": "40% of BASIC (200000.00) = 80000.00.", "component_id": "311448ee-b38c-4503-a60b-b48ffbea70bf", "display_order": 1, "calculation_type": "percent_basic"}, {"code": "BONUS", "type": "earning", "label": "Monthly performance bonus (E2E Verify)", "amount": 14000, "calc_note": "Bonus 5% of gross (280000.00) = 14000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_PF", "type": "deduction", "label": "Provident Fund (E2E Verify)", "amount": 10000, "calc_note": "Formula \\"BASIC * 0.05\\" = 10000.00.", "component_id": "3324ec1c-6276-4326-b290-c1954e02cce9", "display_order": 2, "calculation_type": "formula"}, {"code": "TAX", "type": "deduction", "label": "Income Tax", "amount": 44033.33, "calc_note": "Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per \\"FBR Salaried 2026-27 (E2E Verify)\\")", "component_id": null, "display_order": 9990, "calculation_type": "formula"}, {"code": "ABSENCE", "type": "deduction", "label": "Standard absence deduction", "amount": 19047.62, "calc_note": "2 unpaid day(s) × daily rate 9523.81 = 19047.62.", "component_id": null, "display_order": 9999, "calculation_type": "per_day"}], "inputs": {"late_count": 0, "absent_days": 2, "late_minutes": 0, "present_days": 0, "working_days": 21, "overtime_hours": 0, "overtime_amount": 0, "paid_leave_days": 0, "unpaid_leave_days": 0}, "user_id": "8b4ba86e-6f24-4eed-83b0-d5f191eb7adf", "currency": "PKR", "warnings": [], "period_id": "7df2fd08-d84e-465b-93a4-1d4320388650", "net_salary": 220919, "period_end": "2026-08-31", "period_name": "E2E Verify — August 2026 #2", "basic_salary": 200000, "gross_salary": 294000, "period_start": "2026-08-01", "structure_id": "411df72c-7665-4a69-85e2-44eb546083a4", "employee_code": "TC-EMP-004", "employee_name": "Muddasir Iqbal", "structure_name": "Standard Staff (E2E Verify)", "total_earnings": 294000, "total_deductions": 73080.95, "reimbursement_ids": []}	\N	2026-08-11 18:19:26.911061+05	2026-08-11 21:43:55.815985+05
338e07d5-441d-4026-8b62-3b5ee4ed5be1	9ecc2c16-336d-4f99-b363-ad4d994f914f	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	411df72c-7665-4a69-85e2-44eb546083a4	200000.00	294000.00	294000.00	54033.33	239967.00	22	0.00	0.00	0.00	0.00	0	0.00	0.00	locked	{"lines": [{"code": "BASIC", "type": "earning", "label": "Basic Salary", "amount": 200000, "calc_note": "Base salary for the period = 200000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_HRA", "type": "earning", "label": "House Rent Allowance (E2E Verify)", "amount": 80000, "calc_note": "40% of BASIC (200000.00) = 80000.00.", "component_id": "311448ee-b38c-4503-a60b-b48ffbea70bf", "display_order": 1, "calculation_type": "percent_basic"}, {"code": "BONUS", "type": "earning", "label": "Monthly performance bonus (E2E Verify)", "amount": 14000, "calc_note": "Bonus 5% of gross (280000.00) = 14000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_PF", "type": "deduction", "label": "Provident Fund (E2E Verify)", "amount": 10000, "calc_note": "Formula \\"BASIC * 0.05\\" = 10000.00.", "component_id": "3324ec1c-6276-4326-b290-c1954e02cce9", "display_order": 2, "calculation_type": "formula"}, {"code": "TAX", "type": "deduction", "label": "Income Tax", "amount": 44033.33, "calc_note": "Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per \\"FBR Salaried 2026-27 (E2E Verify)\\")", "component_id": null, "display_order": 9990, "calculation_type": "formula"}], "inputs": {"late_count": 0, "absent_days": 0, "late_minutes": 0, "present_days": 0, "working_days": 22, "overtime_hours": 0, "overtime_amount": 0, "paid_leave_days": 0, "unpaid_leave_days": 0}, "user_id": "8b4ba86e-6f24-4eed-83b0-d5f191eb7adf", "currency": "PKR", "warnings": [], "period_id": "9ecc2c16-336d-4f99-b363-ad4d994f914f", "net_salary": 239967, "period_end": "2026-09-30", "period_name": "E2E Verify — Approval Flow #5", "basic_salary": 200000, "gross_salary": 294000, "period_start": "2026-09-01", "structure_id": "411df72c-7665-4a69-85e2-44eb546083a4", "employee_code": "TC-EMP-004", "employee_name": "Muddasir Iqbal", "structure_name": "Standard Staff (E2E Verify)", "total_earnings": 294000, "total_deductions": 54033.33, "reimbursement_ids": []}	\N	2026-08-11 18:19:29.994327+05	2026-08-11 18:19:30.238161+05
fb5c48bc-ea41-4728-b71a-49efe75c6d6e	e58d7e45-e64f-4204-9518-a28be5cbb016	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	411df72c-7665-4a69-85e2-44eb546083a4	200000.00	294000.00	294000.00	54033.33	239967.00	22	0.00	0.00	0.00	0.00	0	0.00	0.00	locked	{"lines": [{"code": "BASIC", "type": "earning", "label": "Basic Salary", "amount": 200000, "calc_note": "Base salary for the period = 200000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_HRA", "type": "earning", "label": "House Rent Allowance (E2E Verify)", "amount": 80000, "calc_note": "40% of BASIC (200000.00) = 80000.00.", "component_id": "311448ee-b38c-4503-a60b-b48ffbea70bf", "display_order": 1, "calculation_type": "percent_basic"}, {"code": "BONUS", "type": "earning", "label": "Monthly performance bonus (E2E Verify)", "amount": 14000, "calc_note": "Bonus 5% of gross (280000.00) = 14000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_PF", "type": "deduction", "label": "Provident Fund (E2E Verify)", "amount": 10000, "calc_note": "Formula \\"BASIC * 0.05\\" = 10000.00.", "component_id": "3324ec1c-6276-4326-b290-c1954e02cce9", "display_order": 2, "calculation_type": "formula"}, {"code": "TAX", "type": "deduction", "label": "Income Tax", "amount": 44033.33, "calc_note": "Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per \\"FBR Salaried 2026-27 (E2E Verify)\\")", "component_id": null, "display_order": 9990, "calculation_type": "formula"}], "inputs": {"late_count": 0, "absent_days": 0, "late_minutes": 0, "present_days": 0, "working_days": 22, "overtime_hours": 0, "overtime_amount": 0, "paid_leave_days": 0, "unpaid_leave_days": 0}, "user_id": "8b4ba86e-6f24-4eed-83b0-d5f191eb7adf", "currency": "PKR", "warnings": [], "period_id": "e58d7e45-e64f-4204-9518-a28be5cbb016", "net_salary": 239967, "period_end": "2026-10-31", "period_name": "E2E Verify — Phase 3 #2", "basic_salary": 200000, "gross_salary": 294000, "period_start": "2026-10-01", "structure_id": "411df72c-7665-4a69-85e2-44eb546083a4", "employee_code": "TC-EMP-004", "employee_name": "Muddasir Iqbal", "structure_name": "Standard Staff (E2E Verify)", "total_earnings": 294000, "total_deductions": 54033.33, "reimbursement_ids": []}	\N	2026-08-11 18:19:28.72807+05	2026-08-11 19:46:22.855362+05
fab1b819-ed97-4d7b-a959-691475d7742a	9ecc2c16-336d-4f99-b363-ad4d994f914f	c64f66c9-639f-4913-8d6e-0304d51f1c20	411df72c-7665-4a69-85e2-44eb546083a4	200000.00	294000.00	294000.00	164033.33	129967.00	22	0.00	0.00	0.00	0.00	0	0.00	0.00	locked	{"lines": [{"code": "BASIC", "type": "earning", "label": "Basic Salary", "amount": 200000, "calc_note": "Base salary for the period = 200000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_HRA", "type": "earning", "label": "House Rent Allowance (E2E Verify)", "amount": 80000, "calc_note": "40% of BASIC (200000.00) = 80000.00.", "component_id": "311448ee-b38c-4503-a60b-b48ffbea70bf", "display_order": 1, "calculation_type": "percent_basic"}, {"code": "BONUS", "type": "earning", "label": "Monthly performance bonus (E2E Verify)", "amount": 14000, "calc_note": "Bonus 5% of gross (280000.00) = 14000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_PF", "type": "deduction", "label": "Provident Fund (E2E Verify)", "amount": 10000, "calc_note": "Formula \\"BASIC * 0.05\\" = 10000.00.", "component_id": "3324ec1c-6276-4326-b290-c1954e02cce9", "display_order": 2, "calculation_type": "formula"}, {"code": "TAX", "type": "deduction", "label": "Income Tax", "amount": 44033.33, "calc_note": "Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per \\"FBR Salaried 2026-27 (E2E Verify)\\")", "component_id": null, "display_order": 9990, "calculation_type": "formula"}, {"code": "LOAN", "type": "deduction", "label": "Loan Repayment", "amount": 110000, "calc_note": "Salary advance (E2E Verify): 10000.00 (outstanding 20000.00 → 10000.00); Loan: 100000.00 (outstanding 800000.00 → 700000.00)", "component_id": null, "display_order": 9991, "calculation_type": "fixed"}], "inputs": {"late_count": 0, "absent_days": 0, "late_minutes": 0, "present_days": 0, "working_days": 22, "overtime_hours": 0, "overtime_amount": 0, "paid_leave_days": 0, "unpaid_leave_days": 0}, "user_id": "c64f66c9-639f-4913-8d6e-0304d51f1c20", "currency": "PKR", "warnings": [], "period_id": "9ecc2c16-336d-4f99-b363-ad4d994f914f", "net_salary": 129967, "period_end": "2026-09-30", "period_name": "E2E Verify — Approval Flow #5", "basic_salary": 200000, "gross_salary": 294000, "period_start": "2026-09-01", "structure_id": "411df72c-7665-4a69-85e2-44eb546083a4", "employee_code": "TC-EMP-005", "employee_name": "Ashan Mustafa", "structure_name": "Standard Staff (E2E Verify)", "total_earnings": 294000, "total_deductions": 164033.33, "reimbursement_ids": []}	\N	2026-08-11 18:19:30.036311+05	2026-08-11 18:19:30.238161+05
7f8ed1b3-13b1-4ecd-8380-e232e38644f4	9ecc2c16-336d-4f99-b363-ad4d994f914f	5269a7da-0db6-49b8-97eb-c2d482cb611a	411df72c-7665-4a69-85e2-44eb546083a4	200000.00	294000.00	294000.00	54033.33	239967.00	22	0.00	0.00	0.00	0.00	0	0.00	0.00	locked	{"lines": [{"code": "BASIC", "type": "earning", "label": "Basic Salary", "amount": 200000, "calc_note": "Base salary for the period = 200000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_HRA", "type": "earning", "label": "House Rent Allowance (E2E Verify)", "amount": 80000, "calc_note": "40% of BASIC (200000.00) = 80000.00.", "component_id": "311448ee-b38c-4503-a60b-b48ffbea70bf", "display_order": 1, "calculation_type": "percent_basic"}, {"code": "BONUS", "type": "earning", "label": "Monthly performance bonus (E2E Verify)", "amount": 14000, "calc_note": "Bonus 5% of gross (280000.00) = 14000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_PF", "type": "deduction", "label": "Provident Fund (E2E Verify)", "amount": 10000, "calc_note": "Formula \\"BASIC * 0.05\\" = 10000.00.", "component_id": "3324ec1c-6276-4326-b290-c1954e02cce9", "display_order": 2, "calculation_type": "formula"}, {"code": "TAX", "type": "deduction", "label": "Income Tax", "amount": 44033.33, "calc_note": "Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per \\"FBR Salaried 2026-27 (E2E Verify)\\")", "component_id": null, "display_order": 9990, "calculation_type": "formula"}], "inputs": {"late_count": 0, "absent_days": 0, "late_minutes": 0, "present_days": 0, "working_days": 22, "overtime_hours": 0, "overtime_amount": 0, "paid_leave_days": 0, "unpaid_leave_days": 0}, "user_id": "5269a7da-0db6-49b8-97eb-c2d482cb611a", "currency": "PKR", "warnings": [], "period_id": "9ecc2c16-336d-4f99-b363-ad4d994f914f", "net_salary": 239967, "period_end": "2026-09-30", "period_name": "E2E Verify — Approval Flow #5", "basic_salary": 200000, "gross_salary": 294000, "period_start": "2026-09-01", "structure_id": "411df72c-7665-4a69-85e2-44eb546083a4", "employee_code": "TC-EMP-003", "employee_name": "Haseeb Iqbal", "structure_name": "Standard Staff (E2E Verify)", "total_earnings": 294000, "total_deductions": 54033.33, "reimbursement_ids": []}	\N	2026-08-11 18:19:30.096282+05	2026-08-11 18:19:30.238161+05
ea17e83c-ddd5-4fb4-aa19-05e72f502037	39aba0a9-4946-4284-8b47-85dbe87992ab	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	411df72c-7665-4a69-85e2-44eb546083a4	200000.00	294000.00	294000.00	54033.33	239967.00	22	0.00	0.00	0.00	0.00	0	0.00	0.00	locked	{"lines": [{"code": "BASIC", "type": "earning", "label": "Basic Salary", "amount": 200000, "calc_note": "Base salary for the period = 200000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_HRA", "type": "earning", "label": "House Rent Allowance (E2E Verify)", "amount": 80000, "calc_note": "40% of BASIC (200000.00) = 80000.00.", "component_id": "311448ee-b38c-4503-a60b-b48ffbea70bf", "display_order": 1, "calculation_type": "percent_basic"}, {"code": "BONUS", "type": "earning", "label": "Monthly performance bonus (E2E Verify)", "amount": 14000, "calc_note": "Bonus 5% of gross (280000.00) = 14000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_PF", "type": "deduction", "label": "Provident Fund (E2E Verify)", "amount": 10000, "calc_note": "Formula \\"BASIC * 0.05\\" = 10000.00.", "component_id": "3324ec1c-6276-4326-b290-c1954e02cce9", "display_order": 2, "calculation_type": "formula"}, {"code": "TAX", "type": "deduction", "label": "Income Tax", "amount": 44033.33, "calc_note": "Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per \\"FBR Salaried 2026-27 (E2E Verify)\\")", "component_id": null, "display_order": 9990, "calculation_type": "formula"}], "inputs": {"late_count": 0, "absent_days": 0, "late_minutes": 0, "present_days": 0, "working_days": 22, "overtime_hours": 0, "overtime_amount": 0, "paid_leave_days": 0, "unpaid_leave_days": 0}, "user_id": "8b4ba86e-6f24-4eed-83b0-d5f191eb7adf", "currency": "PKR", "warnings": [], "period_id": "39aba0a9-4946-4284-8b47-85dbe87992ab", "net_salary": 239967, "period_end": "2026-10-31", "period_name": "E2E Verify — Phase 3 #3", "basic_salary": 200000, "gross_salary": 294000, "period_start": "2026-10-01", "structure_id": "411df72c-7665-4a69-85e2-44eb546083a4", "employee_code": "TC-EMP-004", "employee_name": "Muddasir Iqbal", "structure_name": "Standard Staff (E2E Verify)", "total_earnings": 294000, "total_deductions": 54033.33, "reimbursement_ids": []}	\N	2026-08-11 18:19:48.216988+05	2026-08-11 19:46:23.964259+05
b12cc68d-c9d0-4d32-818b-49aaa0926610	e0b4ebd0-cc8c-44a8-9183-447c53eebce8	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	411df72c-7665-4a69-85e2-44eb546083a4	200000.00	294000.00	294000.00	54033.33	239967.00	22	0.00	0.00	0.00	0.00	0	0.00	0.00	locked	{"lines": [{"code": "BASIC", "type": "earning", "label": "Basic Salary", "amount": 200000, "calc_note": "Base salary for the period = 200000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_HRA", "type": "earning", "label": "House Rent Allowance (E2E Verify)", "amount": 80000, "calc_note": "40% of BASIC (200000.00) = 80000.00.", "component_id": "311448ee-b38c-4503-a60b-b48ffbea70bf", "display_order": 1, "calculation_type": "percent_basic"}, {"code": "BONUS", "type": "earning", "label": "Monthly performance bonus (E2E Verify)", "amount": 14000, "calc_note": "Bonus 5% of gross (280000.00) = 14000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_PF", "type": "deduction", "label": "Provident Fund (E2E Verify)", "amount": 10000, "calc_note": "Formula \\"BASIC * 0.05\\" = 10000.00.", "component_id": "3324ec1c-6276-4326-b290-c1954e02cce9", "display_order": 2, "calculation_type": "formula"}, {"code": "TAX", "type": "deduction", "label": "Income Tax", "amount": 44033.33, "calc_note": "Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per \\"FBR Salaried 2026-27 (E2E Verify)\\")", "component_id": null, "display_order": 9990, "calculation_type": "formula"}], "inputs": {"late_count": 0, "absent_days": 0, "late_minutes": 0, "present_days": 0, "working_days": 22, "overtime_hours": 0, "overtime_amount": 0, "paid_leave_days": 0, "unpaid_leave_days": 0}, "user_id": "8b4ba86e-6f24-4eed-83b0-d5f191eb7adf", "currency": "PKR", "warnings": [], "period_id": "e0b4ebd0-cc8c-44a8-9183-447c53eebce8", "net_salary": 239967, "period_end": "2026-09-30", "period_name": "E2E Verify — Approval Flow #6", "basic_salary": 200000, "gross_salary": 294000, "period_start": "2026-09-01", "structure_id": "411df72c-7665-4a69-85e2-44eb546083a4", "employee_code": "TC-EMP-004", "employee_name": "Muddasir Iqbal", "structure_name": "Standard Staff (E2E Verify)", "total_earnings": 294000, "total_deductions": 54033.33, "reimbursement_ids": []}	\N	2026-08-11 18:19:49.522902+05	2026-08-11 18:19:49.784937+05
a14486b8-d3e3-4ee9-9f6f-a36afea656cb	e0b4ebd0-cc8c-44a8-9183-447c53eebce8	5269a7da-0db6-49b8-97eb-c2d482cb611a	411df72c-7665-4a69-85e2-44eb546083a4	200000.00	294000.00	294000.00	54033.33	239967.00	22	0.00	0.00	0.00	0.00	0	0.00	0.00	locked	{"lines": [{"code": "BASIC", "type": "earning", "label": "Basic Salary", "amount": 200000, "calc_note": "Base salary for the period = 200000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_HRA", "type": "earning", "label": "House Rent Allowance (E2E Verify)", "amount": 80000, "calc_note": "40% of BASIC (200000.00) = 80000.00.", "component_id": "311448ee-b38c-4503-a60b-b48ffbea70bf", "display_order": 1, "calculation_type": "percent_basic"}, {"code": "BONUS", "type": "earning", "label": "Monthly performance bonus (E2E Verify)", "amount": 14000, "calc_note": "Bonus 5% of gross (280000.00) = 14000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_PF", "type": "deduction", "label": "Provident Fund (E2E Verify)", "amount": 10000, "calc_note": "Formula \\"BASIC * 0.05\\" = 10000.00.", "component_id": "3324ec1c-6276-4326-b290-c1954e02cce9", "display_order": 2, "calculation_type": "formula"}, {"code": "TAX", "type": "deduction", "label": "Income Tax", "amount": 44033.33, "calc_note": "Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per \\"FBR Salaried 2026-27 (E2E Verify)\\")", "component_id": null, "display_order": 9990, "calculation_type": "formula"}], "inputs": {"late_count": 0, "absent_days": 0, "late_minutes": 0, "present_days": 0, "working_days": 22, "overtime_hours": 0, "overtime_amount": 0, "paid_leave_days": 0, "unpaid_leave_days": 0}, "user_id": "5269a7da-0db6-49b8-97eb-c2d482cb611a", "currency": "PKR", "warnings": [], "period_id": "e0b4ebd0-cc8c-44a8-9183-447c53eebce8", "net_salary": 239967, "period_end": "2026-09-30", "period_name": "E2E Verify — Approval Flow #6", "basic_salary": 200000, "gross_salary": 294000, "period_start": "2026-09-01", "structure_id": "411df72c-7665-4a69-85e2-44eb546083a4", "employee_code": "TC-EMP-003", "employee_name": "Haseeb Iqbal", "structure_name": "Standard Staff (E2E Verify)", "total_earnings": 294000, "total_deductions": 54033.33, "reimbursement_ids": []}	\N	2026-08-11 18:19:49.623727+05	2026-08-11 18:19:49.784937+05
7b004d25-bc6e-4449-b37c-201cf83b205f	5cee7748-a6ee-4672-99bd-079ec4e5ca7b	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	411df72c-7665-4a69-85e2-44eb546083a4	200000.00	294000.00	294000.00	54033.33	239967.00	22	0.00	0.00	0.00	0.00	0	0.00	0.00	locked	{"lines": [{"code": "BASIC", "type": "earning", "label": "Basic Salary", "amount": 200000, "calc_note": "Base salary for the period = 200000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_HRA", "type": "earning", "label": "House Rent Allowance (E2E Verify)", "amount": 80000, "calc_note": "40% of BASIC (200000.00) = 80000.00.", "component_id": "311448ee-b38c-4503-a60b-b48ffbea70bf", "display_order": 1, "calculation_type": "percent_basic"}, {"code": "BONUS", "type": "earning", "label": "Monthly performance bonus (E2E Verify)", "amount": 14000, "calc_note": "Bonus 5% of gross (280000.00) = 14000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_PF", "type": "deduction", "label": "Provident Fund (E2E Verify)", "amount": 10000, "calc_note": "Formula \\"BASIC * 0.05\\" = 10000.00.", "component_id": "3324ec1c-6276-4326-b290-c1954e02cce9", "display_order": 2, "calculation_type": "formula"}, {"code": "TAX", "type": "deduction", "label": "Income Tax", "amount": 44033.33, "calc_note": "Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per \\"FBR Salaried 2026-27 (E2E Verify)\\")", "component_id": null, "display_order": 9990, "calculation_type": "formula"}], "inputs": {"late_count": 0, "absent_days": 0, "late_minutes": 0, "present_days": 0, "working_days": 22, "overtime_hours": 0, "overtime_amount": 0, "paid_leave_days": 0, "unpaid_leave_days": 0}, "user_id": "8b4ba86e-6f24-4eed-83b0-d5f191eb7adf", "currency": "PKR", "warnings": [], "period_id": "5cee7748-a6ee-4672-99bd-079ec4e5ca7b", "net_salary": 239967, "period_end": "2026-09-30", "period_name": "E2E Verify — Approval Flow #4", "basic_salary": 200000, "gross_salary": 294000, "period_start": "2026-09-01", "structure_id": "411df72c-7665-4a69-85e2-44eb546083a4", "employee_code": "TC-EMP-004", "employee_name": "Muddasir Iqbal", "structure_name": "Standard Staff (E2E Verify)", "total_earnings": 294000, "total_deductions": 54033.33, "reimbursement_ids": []}	\N	2026-08-11 18:10:25.7382+05	2026-08-11 19:46:26.50705+05
6dd441b1-3c1e-4c68-9aca-13bee3499085	5cee7748-a6ee-4672-99bd-079ec4e5ca7b	c64f66c9-639f-4913-8d6e-0304d51f1c20	411df72c-7665-4a69-85e2-44eb546083a4	200000.00	294000.00	294000.00	164033.33	129967.00	22	0.00	0.00	0.00	0.00	0	0.00	0.00	locked	{"lines": [{"code": "BASIC", "type": "earning", "label": "Basic Salary", "amount": 200000, "calc_note": "Base salary for the period = 200000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_HRA", "type": "earning", "label": "House Rent Allowance (E2E Verify)", "amount": 80000, "calc_note": "40% of BASIC (200000.00) = 80000.00.", "component_id": "311448ee-b38c-4503-a60b-b48ffbea70bf", "display_order": 1, "calculation_type": "percent_basic"}, {"code": "BONUS", "type": "earning", "label": "Monthly performance bonus (E2E Verify)", "amount": 14000, "calc_note": "Bonus 5% of gross (280000.00) = 14000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_PF", "type": "deduction", "label": "Provident Fund (E2E Verify)", "amount": 10000, "calc_note": "Formula \\"BASIC * 0.05\\" = 10000.00.", "component_id": "3324ec1c-6276-4326-b290-c1954e02cce9", "display_order": 2, "calculation_type": "formula"}, {"code": "TAX", "type": "deduction", "label": "Income Tax", "amount": 44033.33, "calc_note": "Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per \\"FBR Salaried 2026-27 (E2E Verify)\\")", "component_id": null, "display_order": 9990, "calculation_type": "formula"}, {"code": "LOAN", "type": "deduction", "label": "Loan Repayment", "amount": 110000, "calc_note": "Loan: 100000.00 (outstanding 1100000.00 → 1000000.00); Salary advance (E2E Verify): 10000.00 (outstanding 50000.00 → 40000.00)", "component_id": null, "display_order": 9991, "calculation_type": "fixed"}], "inputs": {"late_count": 0, "absent_days": 0, "late_minutes": 0, "present_days": 0, "working_days": 22, "overtime_hours": 0, "overtime_amount": 0, "paid_leave_days": 0, "unpaid_leave_days": 0}, "user_id": "c64f66c9-639f-4913-8d6e-0304d51f1c20", "currency": "PKR", "warnings": [], "period_id": "5cee7748-a6ee-4672-99bd-079ec4e5ca7b", "net_salary": 129967, "period_end": "2026-09-30", "period_name": "E2E Verify — Approval Flow #4", "basic_salary": 200000, "gross_salary": 294000, "period_start": "2026-09-01", "structure_id": "411df72c-7665-4a69-85e2-44eb546083a4", "employee_code": "TC-EMP-005", "employee_name": "Ashan Mustafa", "structure_name": "Standard Staff (E2E Verify)", "total_earnings": 294000, "total_deductions": 164033.33, "reimbursement_ids": []}	\N	2026-08-11 18:10:25.785629+05	2026-08-11 19:46:26.50705+05
feeba00e-73d1-47a5-9c1b-6ea8bfafc9ce	5cee7748-a6ee-4672-99bd-079ec4e5ca7b	5269a7da-0db6-49b8-97eb-c2d482cb611a	411df72c-7665-4a69-85e2-44eb546083a4	200000.00	294000.00	294000.00	54033.33	239967.00	22	0.00	0.00	0.00	0.00	0	0.00	0.00	locked	{"lines": [{"code": "BASIC", "type": "earning", "label": "Basic Salary", "amount": 200000, "calc_note": "Base salary for the period = 200000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_HRA", "type": "earning", "label": "House Rent Allowance (E2E Verify)", "amount": 80000, "calc_note": "40% of BASIC (200000.00) = 80000.00.", "component_id": "311448ee-b38c-4503-a60b-b48ffbea70bf", "display_order": 1, "calculation_type": "percent_basic"}, {"code": "BONUS", "type": "earning", "label": "Monthly performance bonus (E2E Verify)", "amount": 14000, "calc_note": "Bonus 5% of gross (280000.00) = 14000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_PF", "type": "deduction", "label": "Provident Fund (E2E Verify)", "amount": 10000, "calc_note": "Formula \\"BASIC * 0.05\\" = 10000.00.", "component_id": "3324ec1c-6276-4326-b290-c1954e02cce9", "display_order": 2, "calculation_type": "formula"}, {"code": "TAX", "type": "deduction", "label": "Income Tax", "amount": 44033.33, "calc_note": "Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per \\"FBR Salaried 2026-27 (E2E Verify)\\")", "component_id": null, "display_order": 9990, "calculation_type": "formula"}], "inputs": {"late_count": 0, "absent_days": 0, "late_minutes": 0, "present_days": 0, "working_days": 22, "overtime_hours": 0, "overtime_amount": 0, "paid_leave_days": 0, "unpaid_leave_days": 0}, "user_id": "5269a7da-0db6-49b8-97eb-c2d482cb611a", "currency": "PKR", "warnings": [], "period_id": "5cee7748-a6ee-4672-99bd-079ec4e5ca7b", "net_salary": 239967, "period_end": "2026-09-30", "period_name": "E2E Verify — Approval Flow #4", "basic_salary": 200000, "gross_salary": 294000, "period_start": "2026-09-01", "structure_id": "411df72c-7665-4a69-85e2-44eb546083a4", "employee_code": "TC-EMP-003", "employee_name": "Haseeb Iqbal", "structure_name": "Standard Staff (E2E Verify)", "total_earnings": 294000, "total_deductions": 54033.33, "reimbursement_ids": []}	\N	2026-08-11 18:10:25.834948+05	2026-08-11 19:46:26.50705+05
d74a96d4-6ee7-4d3b-8ad5-16df4ea55e38	e0b4ebd0-cc8c-44a8-9183-447c53eebce8	c64f66c9-639f-4913-8d6e-0304d51f1c20	411df72c-7665-4a69-85e2-44eb546083a4	200000.00	294000.00	294000.00	154033.33	139967.00	22	0.00	0.00	0.00	0.00	0	0.00	0.00	locked	{"lines": [{"code": "BASIC", "type": "earning", "label": "Basic Salary", "amount": 200000, "calc_note": "Base salary for the period = 200000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_HRA", "type": "earning", "label": "House Rent Allowance (E2E Verify)", "amount": 80000, "calc_note": "40% of BASIC (200000.00) = 80000.00.", "component_id": "311448ee-b38c-4503-a60b-b48ffbea70bf", "display_order": 1, "calculation_type": "percent_basic"}, {"code": "BONUS", "type": "earning", "label": "Monthly performance bonus (E2E Verify)", "amount": 14000, "calc_note": "Bonus 5% of gross (280000.00) = 14000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_PF", "type": "deduction", "label": "Provident Fund (E2E Verify)", "amount": 10000, "calc_note": "Formula \\"BASIC * 0.05\\" = 10000.00.", "component_id": "3324ec1c-6276-4326-b290-c1954e02cce9", "display_order": 2, "calculation_type": "formula"}, {"code": "TAX", "type": "deduction", "label": "Income Tax", "amount": 44033.33, "calc_note": "Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per \\"FBR Salaried 2026-27 (E2E Verify)\\")", "component_id": null, "display_order": 9990, "calculation_type": "formula"}, {"code": "LOAN", "type": "deduction", "label": "Loan Repayment", "amount": 100000, "calc_note": "Loan: 100000.00 (outstanding 500000.00 → 400000.00)", "component_id": null, "display_order": 9991, "calculation_type": "fixed"}], "inputs": {"late_count": 0, "absent_days": 0, "late_minutes": 0, "present_days": 0, "working_days": 22, "overtime_hours": 0, "overtime_amount": 0, "paid_leave_days": 0, "unpaid_leave_days": 0}, "user_id": "c64f66c9-639f-4913-8d6e-0304d51f1c20", "currency": "PKR", "warnings": [], "period_id": "e0b4ebd0-cc8c-44a8-9183-447c53eebce8", "net_salary": 139967, "period_end": "2026-09-30", "period_name": "E2E Verify — Approval Flow #6", "basic_salary": 200000, "gross_salary": 294000, "period_start": "2026-09-01", "structure_id": "411df72c-7665-4a69-85e2-44eb546083a4", "employee_code": "TC-EMP-005", "employee_name": "Ashan Mustafa", "structure_name": "Standard Staff (E2E Verify)", "total_earnings": 294000, "total_deductions": 154033.33, "reimbursement_ids": []}	\N	2026-08-11 18:19:49.567142+05	2026-08-11 18:19:49.784937+05
ef9aadd2-baad-441d-9c82-95c228aba4b6	8e1c7908-84aa-4b65-9aa4-d0e78e4dfaad	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	411df72c-7665-4a69-85e2-44eb546083a4	200000.00	294000.00	294000.00	54033.33	239967.00	22	0.00	0.00	0.00	0.00	0	0.00	0.00	locked	{"lines": [{"code": "BASIC", "type": "earning", "label": "Basic Salary", "amount": 200000, "calc_note": "Base salary for the period = 200000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_HRA", "type": "earning", "label": "House Rent Allowance (E2E Verify)", "amount": 80000, "calc_note": "40% of BASIC (200000.00) = 80000.00.", "component_id": "311448ee-b38c-4503-a60b-b48ffbea70bf", "display_order": 1, "calculation_type": "percent_basic"}, {"code": "BONUS", "type": "earning", "label": "Monthly performance bonus (E2E Verify)", "amount": 14000, "calc_note": "Bonus 5% of gross (280000.00) = 14000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_PF", "type": "deduction", "label": "Provident Fund (E2E Verify)", "amount": 10000, "calc_note": "Formula \\"BASIC * 0.05\\" = 10000.00.", "component_id": "3324ec1c-6276-4326-b290-c1954e02cce9", "display_order": 2, "calculation_type": "formula"}, {"code": "TAX", "type": "deduction", "label": "Income Tax", "amount": 44033.33, "calc_note": "Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per \\"FBR Salaried 2026-27 (E2E Verify)\\")", "component_id": null, "display_order": 9990, "calculation_type": "formula"}], "inputs": {"late_count": 0, "absent_days": 0, "late_minutes": 0, "present_days": 0, "working_days": 22, "overtime_hours": 0, "overtime_amount": 0, "paid_leave_days": 0, "unpaid_leave_days": 0}, "user_id": "8b4ba86e-6f24-4eed-83b0-d5f191eb7adf", "currency": "PKR", "warnings": [], "period_id": "8e1c7908-84aa-4b65-9aa4-d0e78e4dfaad", "net_salary": 239967, "period_end": "2026-10-31", "period_name": "E2E Verify — Phase 3 #1", "basic_salary": 200000, "gross_salary": 294000, "period_start": "2026-10-01", "structure_id": "411df72c-7665-4a69-85e2-44eb546083a4", "employee_code": "TC-EMP-004", "employee_name": "Muddasir Iqbal", "structure_name": "Standard Staff (E2E Verify)", "total_earnings": 294000, "total_deductions": 54033.33, "reimbursement_ids": []}	\N	2026-08-11 18:10:24.121155+05	2026-08-11 19:46:21.259122+05
f83830ee-70d5-49f3-a524-7043df125dce	8e1c7908-84aa-4b65-9aa4-d0e78e4dfaad	c64f66c9-639f-4913-8d6e-0304d51f1c20	411df72c-7665-4a69-85e2-44eb546083a4	200000.00	294000.00	297500.00	164033.33	133467.00	22	0.00	0.00	0.00	0.00	0	0.00	0.00	locked	{"lines": [{"code": "BASIC", "type": "earning", "label": "Basic Salary", "amount": 200000, "calc_note": "Base salary for the period = 200000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_HRA", "type": "earning", "label": "House Rent Allowance (E2E Verify)", "amount": 80000, "calc_note": "40% of BASIC (200000.00) = 80000.00.", "component_id": "311448ee-b38c-4503-a60b-b48ffbea70bf", "display_order": 1, "calculation_type": "percent_basic"}, {"code": "BONUS", "type": "earning", "label": "Monthly performance bonus (E2E Verify)", "amount": 14000, "calc_note": "Bonus 5% of gross (280000.00) = 14000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_PF", "type": "deduction", "label": "Provident Fund (E2E Verify)", "amount": 10000, "calc_note": "Formula \\"BASIC * 0.05\\" = 10000.00.", "component_id": "3324ec1c-6276-4326-b290-c1954e02cce9", "display_order": 2, "calculation_type": "formula"}, {"code": "TAX", "type": "deduction", "label": "Income Tax", "amount": 44033.33, "calc_note": "Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per \\"FBR Salaried 2026-27 (E2E Verify)\\")", "component_id": null, "display_order": 9990, "calculation_type": "formula"}, {"code": "LOAN", "type": "deduction", "label": "Loan Repayment", "amount": 110000, "calc_note": "Loan: 100000.00 (outstanding 1200000.00 → 1100000.00); Salary advance (E2E Verify): 10000.00 (outstanding 60000.00 → 50000.00)", "component_id": null, "display_order": 9991, "calculation_type": "fixed"}, {"code": "REIMBURSEMENT", "type": "earning", "label": "Reimbursement", "amount": 3500, "calc_note": "1 approved claim in this period — Travel 3500.00. Paid in full and not taxed (expense repayment, not income), so it is excluded from gross.", "component_id": null, "display_order": 9994, "calculation_type": "fixed"}], "inputs": {"late_count": 0, "absent_days": 0, "late_minutes": 0, "present_days": 0, "working_days": 22, "overtime_hours": 0, "overtime_amount": 0, "paid_leave_days": 0, "unpaid_leave_days": 0}, "user_id": "c64f66c9-639f-4913-8d6e-0304d51f1c20", "currency": "PKR", "warnings": [], "period_id": "8e1c7908-84aa-4b65-9aa4-d0e78e4dfaad", "net_salary": 133467, "period_end": "2026-10-31", "period_name": "E2E Verify — Phase 3 #1", "basic_salary": 200000, "gross_salary": 294000, "period_start": "2026-10-01", "structure_id": "411df72c-7665-4a69-85e2-44eb546083a4", "employee_code": "TC-EMP-005", "employee_name": "Ashan Mustafa", "structure_name": "Standard Staff (E2E Verify)", "total_earnings": 297500, "total_deductions": 164033.33, "reimbursement_ids": ["953758ba-8239-45b3-a26a-8840296758b6"]}	\N	2026-08-11 18:10:24.179169+05	2026-08-11 19:46:21.259122+05
7c09d758-7fcc-4e25-a52d-86f622347ff0	8e1c7908-84aa-4b65-9aa4-d0e78e4dfaad	5269a7da-0db6-49b8-97eb-c2d482cb611a	411df72c-7665-4a69-85e2-44eb546083a4	200000.00	294000.00	294000.00	54033.33	239967.00	22	0.00	0.00	0.00	0.00	0	0.00	0.00	locked	{"lines": [{"code": "BASIC", "type": "earning", "label": "Basic Salary", "amount": 200000, "calc_note": "Base salary for the period = 200000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_HRA", "type": "earning", "label": "House Rent Allowance (E2E Verify)", "amount": 80000, "calc_note": "40% of BASIC (200000.00) = 80000.00.", "component_id": "311448ee-b38c-4503-a60b-b48ffbea70bf", "display_order": 1, "calculation_type": "percent_basic"}, {"code": "BONUS", "type": "earning", "label": "Monthly performance bonus (E2E Verify)", "amount": 14000, "calc_note": "Bonus 5% of gross (280000.00) = 14000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_PF", "type": "deduction", "label": "Provident Fund (E2E Verify)", "amount": 10000, "calc_note": "Formula \\"BASIC * 0.05\\" = 10000.00.", "component_id": "3324ec1c-6276-4326-b290-c1954e02cce9", "display_order": 2, "calculation_type": "formula"}, {"code": "TAX", "type": "deduction", "label": "Income Tax", "amount": 44033.33, "calc_note": "Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per \\"FBR Salaried 2026-27 (E2E Verify)\\")", "component_id": null, "display_order": 9990, "calculation_type": "formula"}], "inputs": {"late_count": 0, "absent_days": 0, "late_minutes": 0, "present_days": 0, "working_days": 22, "overtime_hours": 0, "overtime_amount": 0, "paid_leave_days": 0, "unpaid_leave_days": 0}, "user_id": "5269a7da-0db6-49b8-97eb-c2d482cb611a", "currency": "PKR", "warnings": [], "period_id": "8e1c7908-84aa-4b65-9aa4-d0e78e4dfaad", "net_salary": 239967, "period_end": "2026-10-31", "period_name": "E2E Verify — Phase 3 #1", "basic_salary": 200000, "gross_salary": 294000, "period_start": "2026-10-01", "structure_id": "411df72c-7665-4a69-85e2-44eb546083a4", "employee_code": "TC-EMP-003", "employee_name": "Haseeb Iqbal", "structure_name": "Standard Staff (E2E Verify)", "total_earnings": 294000, "total_deductions": 54033.33, "reimbursement_ids": []}	\N	2026-08-11 18:10:24.239888+05	2026-08-11 19:46:21.259122+05
06fe26ed-f208-4466-a888-ab33118649a8	e58d7e45-e64f-4204-9518-a28be5cbb016	c64f66c9-639f-4913-8d6e-0304d51f1c20	411df72c-7665-4a69-85e2-44eb546083a4	200000.00	294000.00	297500.00	164033.33	133467.00	22	0.00	0.00	0.00	0.00	0	0.00	0.00	locked	{"lines": [{"code": "BASIC", "type": "earning", "label": "Basic Salary", "amount": 200000, "calc_note": "Base salary for the period = 200000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_HRA", "type": "earning", "label": "House Rent Allowance (E2E Verify)", "amount": 80000, "calc_note": "40% of BASIC (200000.00) = 80000.00.", "component_id": "311448ee-b38c-4503-a60b-b48ffbea70bf", "display_order": 1, "calculation_type": "percent_basic"}, {"code": "BONUS", "type": "earning", "label": "Monthly performance bonus (E2E Verify)", "amount": 14000, "calc_note": "Bonus 5% of gross (280000.00) = 14000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_PF", "type": "deduction", "label": "Provident Fund (E2E Verify)", "amount": 10000, "calc_note": "Formula \\"BASIC * 0.05\\" = 10000.00.", "component_id": "3324ec1c-6276-4326-b290-c1954e02cce9", "display_order": 2, "calculation_type": "formula"}, {"code": "TAX", "type": "deduction", "label": "Income Tax", "amount": 44033.33, "calc_note": "Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per \\"FBR Salaried 2026-27 (E2E Verify)\\")", "component_id": null, "display_order": 9990, "calculation_type": "formula"}, {"code": "LOAN", "type": "deduction", "label": "Loan Repayment", "amount": 110000, "calc_note": "Salary advance (E2E Verify): 10000.00 (outstanding 30000.00 → 20000.00); Loan: 100000.00 (outstanding 900000.00 → 800000.00)", "component_id": null, "display_order": 9991, "calculation_type": "fixed"}, {"code": "REIMBURSEMENT", "type": "earning", "label": "Reimbursement", "amount": 3500, "calc_note": "1 approved claim in this period — Travel 3500.00. Paid in full and not taxed (expense repayment, not income), so it is excluded from gross.", "component_id": null, "display_order": 9994, "calculation_type": "fixed"}], "inputs": {"late_count": 0, "absent_days": 0, "late_minutes": 0, "present_days": 0, "working_days": 22, "overtime_hours": 0, "overtime_amount": 0, "paid_leave_days": 0, "unpaid_leave_days": 0}, "user_id": "c64f66c9-639f-4913-8d6e-0304d51f1c20", "currency": "PKR", "warnings": [], "period_id": "e58d7e45-e64f-4204-9518-a28be5cbb016", "net_salary": 133467, "period_end": "2026-10-31", "period_name": "E2E Verify — Phase 3 #2", "basic_salary": 200000, "gross_salary": 294000, "period_start": "2026-10-01", "structure_id": "411df72c-7665-4a69-85e2-44eb546083a4", "employee_code": "TC-EMP-005", "employee_name": "Ashan Mustafa", "structure_name": "Standard Staff (E2E Verify)", "total_earnings": 297500, "total_deductions": 164033.33, "reimbursement_ids": ["b5a115cf-0b27-4dc8-b8c1-c96fbbb1f0b9"]}	\N	2026-08-11 18:19:28.789263+05	2026-08-11 19:46:22.855362+05
a50a8c8a-f1db-43d5-bf77-9cce47f7183e	e58d7e45-e64f-4204-9518-a28be5cbb016	5269a7da-0db6-49b8-97eb-c2d482cb611a	411df72c-7665-4a69-85e2-44eb546083a4	200000.00	294000.00	294000.00	54033.33	239967.00	22	0.00	0.00	0.00	0.00	0	0.00	0.00	locked	{"lines": [{"code": "BASIC", "type": "earning", "label": "Basic Salary", "amount": 200000, "calc_note": "Base salary for the period = 200000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_HRA", "type": "earning", "label": "House Rent Allowance (E2E Verify)", "amount": 80000, "calc_note": "40% of BASIC (200000.00) = 80000.00.", "component_id": "311448ee-b38c-4503-a60b-b48ffbea70bf", "display_order": 1, "calculation_type": "percent_basic"}, {"code": "BONUS", "type": "earning", "label": "Monthly performance bonus (E2E Verify)", "amount": 14000, "calc_note": "Bonus 5% of gross (280000.00) = 14000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_PF", "type": "deduction", "label": "Provident Fund (E2E Verify)", "amount": 10000, "calc_note": "Formula \\"BASIC * 0.05\\" = 10000.00.", "component_id": "3324ec1c-6276-4326-b290-c1954e02cce9", "display_order": 2, "calculation_type": "formula"}, {"code": "TAX", "type": "deduction", "label": "Income Tax", "amount": 44033.33, "calc_note": "Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per \\"FBR Salaried 2026-27 (E2E Verify)\\")", "component_id": null, "display_order": 9990, "calculation_type": "formula"}], "inputs": {"late_count": 0, "absent_days": 0, "late_minutes": 0, "present_days": 0, "working_days": 22, "overtime_hours": 0, "overtime_amount": 0, "paid_leave_days": 0, "unpaid_leave_days": 0}, "user_id": "5269a7da-0db6-49b8-97eb-c2d482cb611a", "currency": "PKR", "warnings": [], "period_id": "e58d7e45-e64f-4204-9518-a28be5cbb016", "net_salary": 239967, "period_end": "2026-10-31", "period_name": "E2E Verify — Phase 3 #2", "basic_salary": 200000, "gross_salary": 294000, "period_start": "2026-10-01", "structure_id": "411df72c-7665-4a69-85e2-44eb546083a4", "employee_code": "TC-EMP-003", "employee_name": "Haseeb Iqbal", "structure_name": "Standard Staff (E2E Verify)", "total_earnings": 294000, "total_deductions": 54033.33, "reimbursement_ids": []}	\N	2026-08-11 18:19:28.838778+05	2026-08-11 19:46:22.855362+05
210b8f6c-cadd-4e46-a38c-a22b83c6cb86	39aba0a9-4946-4284-8b47-85dbe87992ab	c64f66c9-639f-4913-8d6e-0304d51f1c20	411df72c-7665-4a69-85e2-44eb546083a4	200000.00	294000.00	297500.00	154033.33	143467.00	22	0.00	0.00	0.00	0.00	0	0.00	0.00	locked	{"lines": [{"code": "BASIC", "type": "earning", "label": "Basic Salary", "amount": 200000, "calc_note": "Base salary for the period = 200000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_HRA", "type": "earning", "label": "House Rent Allowance (E2E Verify)", "amount": 80000, "calc_note": "40% of BASIC (200000.00) = 80000.00.", "component_id": "311448ee-b38c-4503-a60b-b48ffbea70bf", "display_order": 1, "calculation_type": "percent_basic"}, {"code": "BONUS", "type": "earning", "label": "Monthly performance bonus (E2E Verify)", "amount": 14000, "calc_note": "Bonus 5% of gross (280000.00) = 14000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_PF", "type": "deduction", "label": "Provident Fund (E2E Verify)", "amount": 10000, "calc_note": "Formula \\"BASIC * 0.05\\" = 10000.00.", "component_id": "3324ec1c-6276-4326-b290-c1954e02cce9", "display_order": 2, "calculation_type": "formula"}, {"code": "TAX", "type": "deduction", "label": "Income Tax", "amount": 44033.33, "calc_note": "Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per \\"FBR Salaried 2026-27 (E2E Verify)\\")", "component_id": null, "display_order": 9990, "calculation_type": "formula"}, {"code": "LOAN", "type": "deduction", "label": "Loan Repayment", "amount": 100000, "calc_note": "Loan: 100000.00 (outstanding 600000.00 → 500000.00)", "component_id": null, "display_order": 9991, "calculation_type": "fixed"}, {"code": "REIMBURSEMENT", "type": "earning", "label": "Reimbursement", "amount": 3500, "calc_note": "1 approved claim in this period — Travel 3500.00. Paid in full and not taxed (expense repayment, not income), so it is excluded from gross.", "component_id": null, "display_order": 9994, "calculation_type": "fixed"}], "inputs": {"late_count": 0, "absent_days": 0, "late_minutes": 0, "present_days": 0, "working_days": 22, "overtime_hours": 0, "overtime_amount": 0, "paid_leave_days": 0, "unpaid_leave_days": 0}, "user_id": "c64f66c9-639f-4913-8d6e-0304d51f1c20", "currency": "PKR", "warnings": [], "period_id": "39aba0a9-4946-4284-8b47-85dbe87992ab", "net_salary": 143467, "period_end": "2026-10-31", "period_name": "E2E Verify — Phase 3 #3", "basic_salary": 200000, "gross_salary": 294000, "period_start": "2026-10-01", "structure_id": "411df72c-7665-4a69-85e2-44eb546083a4", "employee_code": "TC-EMP-005", "employee_name": "Ashan Mustafa", "structure_name": "Standard Staff (E2E Verify)", "total_earnings": 297500, "total_deductions": 154033.33, "reimbursement_ids": ["a2f77372-e846-49c2-9ded-a7040aa8da8c"]}	\N	2026-08-11 18:19:48.266527+05	2026-08-11 19:46:23.964259+05
46a57df8-6a97-4184-98fe-2f8a50d42bc8	39aba0a9-4946-4284-8b47-85dbe87992ab	5269a7da-0db6-49b8-97eb-c2d482cb611a	411df72c-7665-4a69-85e2-44eb546083a4	200000.00	294000.00	294000.00	54033.33	239967.00	22	0.00	0.00	0.00	0.00	0	0.00	0.00	locked	{"lines": [{"code": "BASIC", "type": "earning", "label": "Basic Salary", "amount": 200000, "calc_note": "Base salary for the period = 200000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_HRA", "type": "earning", "label": "House Rent Allowance (E2E Verify)", "amount": 80000, "calc_note": "40% of BASIC (200000.00) = 80000.00.", "component_id": "311448ee-b38c-4503-a60b-b48ffbea70bf", "display_order": 1, "calculation_type": "percent_basic"}, {"code": "BONUS", "type": "earning", "label": "Monthly performance bonus (E2E Verify)", "amount": 14000, "calc_note": "Bonus 5% of gross (280000.00) = 14000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_PF", "type": "deduction", "label": "Provident Fund (E2E Verify)", "amount": 10000, "calc_note": "Formula \\"BASIC * 0.05\\" = 10000.00.", "component_id": "3324ec1c-6276-4326-b290-c1954e02cce9", "display_order": 2, "calculation_type": "formula"}, {"code": "TAX", "type": "deduction", "label": "Income Tax", "amount": 44033.33, "calc_note": "Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per \\"FBR Salaried 2026-27 (E2E Verify)\\")", "component_id": null, "display_order": 9990, "calculation_type": "formula"}], "inputs": {"late_count": 0, "absent_days": 0, "late_minutes": 0, "present_days": 0, "working_days": 22, "overtime_hours": 0, "overtime_amount": 0, "paid_leave_days": 0, "unpaid_leave_days": 0}, "user_id": "5269a7da-0db6-49b8-97eb-c2d482cb611a", "currency": "PKR", "warnings": [], "period_id": "39aba0a9-4946-4284-8b47-85dbe87992ab", "net_salary": 239967, "period_end": "2026-10-31", "period_name": "E2E Verify — Phase 3 #3", "basic_salary": 200000, "gross_salary": 294000, "period_start": "2026-10-01", "structure_id": "411df72c-7665-4a69-85e2-44eb546083a4", "employee_code": "TC-EMP-003", "employee_name": "Haseeb Iqbal", "structure_name": "Standard Staff (E2E Verify)", "total_earnings": 294000, "total_deductions": 54033.33, "reimbursement_ids": []}	\N	2026-08-11 18:19:48.319323+05	2026-08-11 19:46:23.964259+05
1124b06e-784b-49f0-9994-1b8524f4f877	b691a08f-f870-4d60-949f-d22355f5c7f8	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	411df72c-7665-4a69-85e2-44eb546083a4	200000.00	294000.00	294000.00	73080.95	220919.00	21	0.00	2.00	0.00	0.00	0	0.00	0.00	locked	{"lines": [{"code": "BASIC", "type": "earning", "label": "Basic Salary", "amount": 200000, "calc_note": "Base salary for the period = 200000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_HRA", "type": "earning", "label": "House Rent Allowance (E2E Verify)", "amount": 80000, "calc_note": "40% of BASIC (200000.00) = 80000.00.", "component_id": "311448ee-b38c-4503-a60b-b48ffbea70bf", "display_order": 1, "calculation_type": "percent_basic"}, {"code": "BONUS", "type": "earning", "label": "Monthly performance bonus (E2E Verify)", "amount": 14000, "calc_note": "Bonus 5% of gross (280000.00) = 14000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_PF", "type": "deduction", "label": "Provident Fund (E2E Verify)", "amount": 10000, "calc_note": "Formula \\"BASIC * 0.05\\" = 10000.00.", "component_id": "3324ec1c-6276-4326-b290-c1954e02cce9", "display_order": 2, "calculation_type": "formula"}, {"code": "TAX", "type": "deduction", "label": "Income Tax", "amount": 44033.33, "calc_note": "Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per \\"FBR Salaried 2026-27 (E2E Verify)\\")", "component_id": null, "display_order": 9990, "calculation_type": "formula"}, {"code": "ABSENCE", "type": "deduction", "label": "Standard absence deduction", "amount": 19047.62, "calc_note": "2 unpaid day(s) × daily rate 9523.81 = 19047.62.", "component_id": null, "display_order": 9999, "calculation_type": "per_day"}], "inputs": {"late_count": 0, "absent_days": 2, "late_minutes": 0, "present_days": 0, "working_days": 21, "overtime_hours": 0, "overtime_amount": 0, "paid_leave_days": 0, "unpaid_leave_days": 0}, "user_id": "8b4ba86e-6f24-4eed-83b0-d5f191eb7adf", "currency": "PKR", "warnings": [], "period_id": "b691a08f-f870-4d60-949f-d22355f5c7f8", "net_salary": 220919, "period_end": "2026-08-31", "period_name": "E2E Verify — August 2026 #3", "basic_salary": 200000, "gross_salary": 294000, "period_start": "2026-08-01", "structure_id": "411df72c-7665-4a69-85e2-44eb546083a4", "employee_code": "TC-EMP-004", "employee_name": "Muddasir Iqbal", "structure_name": "Standard Staff (E2E Verify)", "total_earnings": 294000, "total_deductions": 73080.95, "reimbursement_ids": []}	\N	2026-08-11 18:19:46.547746+05	2026-08-11 21:43:52.486386+05
37b697fa-f5fc-41a0-bf42-b28631064884	b691a08f-f870-4d60-949f-d22355f5c7f8	c64f66c9-639f-4913-8d6e-0304d51f1c20	411df72c-7665-4a69-85e2-44eb546083a4	200000.00	294000.00	294000.00	164033.33	129967.00	21	1.00	0.00	0.00	0.00	0	0.00	0.00	locked	{"lines": [{"code": "BASIC", "type": "earning", "label": "Basic Salary", "amount": 200000, "calc_note": "Base salary for the period = 200000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_HRA", "type": "earning", "label": "House Rent Allowance (E2E Verify)", "amount": 80000, "calc_note": "40% of BASIC (200000.00) = 80000.00.", "component_id": "311448ee-b38c-4503-a60b-b48ffbea70bf", "display_order": 1, "calculation_type": "percent_basic"}, {"code": "BONUS", "type": "earning", "label": "Monthly performance bonus (E2E Verify)", "amount": 14000, "calc_note": "Bonus 5% of gross (280000.00) = 14000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_PF", "type": "deduction", "label": "Provident Fund (E2E Verify)", "amount": 10000, "calc_note": "Formula \\"BASIC * 0.05\\" = 10000.00.", "component_id": "3324ec1c-6276-4326-b290-c1954e02cce9", "display_order": 2, "calculation_type": "formula"}, {"code": "TAX", "type": "deduction", "label": "Income Tax", "amount": 44033.33, "calc_note": "Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per \\"FBR Salaried 2026-27 (E2E Verify)\\")", "component_id": null, "display_order": 9990, "calculation_type": "formula"}, {"code": "LOAN", "type": "deduction", "label": "Loan Repayment", "amount": 110000, "calc_note": "Loan: 100000.00 (outstanding 700000.00 → 600000.00); Salary advance (E2E Verify): 10000.00 (outstanding 10000.00 → 0.00)", "component_id": null, "display_order": 9991, "calculation_type": "fixed"}], "inputs": {"late_count": 0, "absent_days": 0, "late_minutes": 0, "present_days": 1, "working_days": 21, "overtime_hours": 0, "overtime_amount": 0, "paid_leave_days": 0, "unpaid_leave_days": 0}, "user_id": "c64f66c9-639f-4913-8d6e-0304d51f1c20", "currency": "PKR", "warnings": [], "period_id": "b691a08f-f870-4d60-949f-d22355f5c7f8", "net_salary": 129967, "period_end": "2026-08-31", "period_name": "E2E Verify — August 2026 #3", "basic_salary": 200000, "gross_salary": 294000, "period_start": "2026-08-01", "structure_id": "411df72c-7665-4a69-85e2-44eb546083a4", "employee_code": "TC-EMP-005", "employee_name": "Ashan Mustafa", "structure_name": "Standard Staff (E2E Verify)", "total_earnings": 294000, "total_deductions": 164033.33, "reimbursement_ids": []}	\N	2026-08-11 18:19:46.592576+05	2026-08-11 21:43:52.486386+05
34c9f0a4-92a6-4ea8-a004-156434f5747a	b691a08f-f870-4d60-949f-d22355f5c7f8	5269a7da-0db6-49b8-97eb-c2d482cb611a	411df72c-7665-4a69-85e2-44eb546083a4	200000.00	294000.00	294000.00	54033.33	239967.00	21	2.00	0.00	0.00	0.00	0	0.00	0.00	locked	{"lines": [{"code": "BASIC", "type": "earning", "label": "Basic Salary", "amount": 200000, "calc_note": "Base salary for the period = 200000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_HRA", "type": "earning", "label": "House Rent Allowance (E2E Verify)", "amount": 80000, "calc_note": "40% of BASIC (200000.00) = 80000.00.", "component_id": "311448ee-b38c-4503-a60b-b48ffbea70bf", "display_order": 1, "calculation_type": "percent_basic"}, {"code": "BONUS", "type": "earning", "label": "Monthly performance bonus (E2E Verify)", "amount": 14000, "calc_note": "Bonus 5% of gross (280000.00) = 14000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_PF", "type": "deduction", "label": "Provident Fund (E2E Verify)", "amount": 10000, "calc_note": "Formula \\"BASIC * 0.05\\" = 10000.00.", "component_id": "3324ec1c-6276-4326-b290-c1954e02cce9", "display_order": 2, "calculation_type": "formula"}, {"code": "TAX", "type": "deduction", "label": "Income Tax", "amount": 44033.33, "calc_note": "Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per \\"FBR Salaried 2026-27 (E2E Verify)\\")", "component_id": null, "display_order": 9990, "calculation_type": "formula"}], "inputs": {"late_count": 0, "absent_days": 0, "late_minutes": 0, "present_days": 2, "working_days": 21, "overtime_hours": 0, "overtime_amount": 0, "paid_leave_days": 0, "unpaid_leave_days": 0}, "user_id": "5269a7da-0db6-49b8-97eb-c2d482cb611a", "currency": "PKR", "warnings": [], "period_id": "b691a08f-f870-4d60-949f-d22355f5c7f8", "net_salary": 239967, "period_end": "2026-08-31", "period_name": "E2E Verify — August 2026 #3", "basic_salary": 200000, "gross_salary": 294000, "period_start": "2026-08-01", "structure_id": "411df72c-7665-4a69-85e2-44eb546083a4", "employee_code": "TC-EMP-003", "employee_name": "Haseeb Iqbal", "structure_name": "Standard Staff (E2E Verify)", "total_earnings": 294000, "total_deductions": 54033.33, "reimbursement_ids": []}	\N	2026-08-11 18:19:46.657559+05	2026-08-11 21:43:52.486386+05
1647bac1-f687-4a63-b455-d229796d42a1	7df2fd08-d84e-465b-93a4-1d4320388650	c64f66c9-639f-4913-8d6e-0304d51f1c20	411df72c-7665-4a69-85e2-44eb546083a4	200000.00	294000.00	314000.00	164033.33	149967.00	21	1.00	0.00	0.00	0.00	0	0.00	0.00	locked	{"lines": [{"code": "BASIC", "type": "earning", "label": "Basic Salary", "amount": 200000, "calc_note": "Base salary for the period = 200000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_HRA", "type": "earning", "label": "House Rent Allowance (E2E Verify)", "amount": 80000, "calc_note": "40% of BASIC (200000.00) = 80000.00.", "component_id": "311448ee-b38c-4503-a60b-b48ffbea70bf", "display_order": 1, "calculation_type": "percent_basic"}, {"code": "BONUS", "type": "earning", "label": "Monthly performance bonus (E2E Verify)", "amount": 14000, "calc_note": "Bonus 5% of gross (280000.00) = 14000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_PF", "type": "deduction", "label": "Provident Fund (E2E Verify)", "amount": 10000, "calc_note": "Formula \\"BASIC * 0.05\\" = 10000.00.", "component_id": "3324ec1c-6276-4326-b290-c1954e02cce9", "display_order": 2, "calculation_type": "formula"}, {"code": "TAX", "type": "deduction", "label": "Income Tax", "amount": 44033.33, "calc_note": "Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per \\"FBR Salaried 2026-27 (E2E Verify)\\")", "component_id": null, "display_order": 9990, "calculation_type": "formula"}, {"code": "LOAN", "type": "deduction", "label": "Loan Repayment", "amount": 110000, "calc_note": "Salary advance (E2E Verify): 10000.00 (outstanding 40000.00 → 30000.00); Loan: 100000.00 (outstanding 1000000.00 → 900000.00)", "component_id": null, "display_order": 9991, "calculation_type": "fixed"}, {"code": "REIMBURSEMENT", "type": "earning", "label": "Reimbursement", "amount": 20000, "calc_note": "1 approved claim in this period — Travel 20000.00. Paid in full and not taxed (expense repayment, not income), so it is excluded from gross.", "component_id": null, "display_order": 9994, "calculation_type": "fixed"}], "inputs": {"late_count": 0, "absent_days": 0, "late_minutes": 0, "present_days": 1, "working_days": 21, "overtime_hours": 0, "overtime_amount": 0, "paid_leave_days": 0, "unpaid_leave_days": 0}, "user_id": "c64f66c9-639f-4913-8d6e-0304d51f1c20", "currency": "PKR", "warnings": [], "period_id": "7df2fd08-d84e-465b-93a4-1d4320388650", "net_salary": 149967, "period_end": "2026-08-31", "period_name": "E2E Verify — August 2026 #2", "basic_salary": 200000, "gross_salary": 294000, "period_start": "2026-08-01", "structure_id": "411df72c-7665-4a69-85e2-44eb546083a4", "employee_code": "TC-EMP-005", "employee_name": "Ashan Mustafa", "structure_name": "Standard Staff (E2E Verify)", "total_earnings": 314000, "total_deductions": 164033.33, "reimbursement_ids": ["5794e838-015d-40d4-a028-adc166f2ea72"]}	\N	2026-08-11 18:19:27.017288+05	2026-08-11 21:43:55.815985+05
4d1eeacc-1ce6-49f2-baf6-bc89be74615b	7df2fd08-d84e-465b-93a4-1d4320388650	5269a7da-0db6-49b8-97eb-c2d482cb611a	411df72c-7665-4a69-85e2-44eb546083a4	200000.00	294000.00	294000.00	54033.33	239967.00	21	2.00	0.00	0.00	0.00	0	0.00	0.00	locked	{"lines": [{"code": "BASIC", "type": "earning", "label": "Basic Salary", "amount": 200000, "calc_note": "Base salary for the period = 200000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_HRA", "type": "earning", "label": "House Rent Allowance (E2E Verify)", "amount": 80000, "calc_note": "40% of BASIC (200000.00) = 80000.00.", "component_id": "311448ee-b38c-4503-a60b-b48ffbea70bf", "display_order": 1, "calculation_type": "percent_basic"}, {"code": "BONUS", "type": "earning", "label": "Monthly performance bonus (E2E Verify)", "amount": 14000, "calc_note": "Bonus 5% of gross (280000.00) = 14000.00.", "component_id": null, "display_order": -1, "calculation_type": "fixed"}, {"code": "E2E_PF", "type": "deduction", "label": "Provident Fund (E2E Verify)", "amount": 10000, "calc_note": "Formula \\"BASIC * 0.05\\" = 10000.00.", "component_id": "3324ec1c-6276-4326-b290-c1954e02cce9", "display_order": 2, "calculation_type": "formula"}, {"code": "TAX", "type": "deduction", "label": "Income Tax", "amount": 44033.33, "calc_note": "Taxable 294000.00 × 12 = 3528000.00/yr → annual tax 528400.00 ÷ 12 = 44033.33. Annual taxable 3528000.00 → base 430000.00 + 30% of 328000.00 above 3200000.00 = 528400.00 / year; ÷ 12 periods = 44033.33. (per \\"FBR Salaried 2026-27 (E2E Verify)\\")", "component_id": null, "display_order": 9990, "calculation_type": "formula"}], "inputs": {"late_count": 0, "absent_days": 0, "late_minutes": 0, "present_days": 2, "working_days": 21, "overtime_hours": 0, "overtime_amount": 0, "paid_leave_days": 0, "unpaid_leave_days": 0}, "user_id": "5269a7da-0db6-49b8-97eb-c2d482cb611a", "currency": "PKR", "warnings": [], "period_id": "7df2fd08-d84e-465b-93a4-1d4320388650", "net_salary": 239967, "period_end": "2026-08-31", "period_name": "E2E Verify — August 2026 #2", "basic_salary": 200000, "gross_salary": 294000, "period_start": "2026-08-01", "structure_id": "411df72c-7665-4a69-85e2-44eb546083a4", "employee_code": "TC-EMP-003", "employee_name": "Haseeb Iqbal", "structure_name": "Standard Staff (E2E Verify)", "total_earnings": 294000, "total_deductions": 54033.33, "reimbursement_ids": []}	\N	2026-08-11 18:19:27.09103+05	2026-08-11 21:43:55.815985+05
\.


--
-- Data for Name: performance_review_answers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.performance_review_answers (answer_id, answer_comment, answered_percentage, created_at, updated_at, review_id, selected_option_id, is_absent_auto_zero, form_question_id) FROM stdin;
12a82bae-7d9d-4f49-ac74-4756b222c63e	\N	10.00	2026-08-11 20:48:43.77159	2026-08-11 20:48:43.77159	e096814b-0d8a-4160-aa9c-31e534068f4d	\N	f	8f1c3bf3-80c7-4d59-ab14-9d948acdf48e
d798c033-657d-4dde-8e87-a69e624ef8bf	\N	10.00	2026-08-11 20:48:43.77159	2026-08-11 20:48:43.77159	e096814b-0d8a-4160-aa9c-31e534068f4d	\N	f	23508bc2-ee6d-4a9e-ab6d-fd89d15f3477
0e19dede-3793-402c-b9c0-53c6d4b6cd84	\N	10.00	2026-08-11 20:48:43.77159	2026-08-11 20:48:43.77159	e096814b-0d8a-4160-aa9c-31e534068f4d	\N	f	2ea5818f-e76c-4a2b-94c2-f7b61d251be0
\.


--
-- Data for Name: performance_reviews; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.performance_reviews (review_id, review_period, review_date, total_score_percentage, comments, created_at, updated_at, reviewer_id, reviewee_id, evaluation_type, status, form_id, attendance_id, recommendation, submitted_at, locked_at, approved_by_user_id, approved_at, is_auto_generated, form_version) FROM stdin;
e096814b-0d8a-4160-aa9c-31e534068f4d	2026-08-11	2026-08-11	10.00		2026-08-11 20:48:43.77159	2026-08-11 20:48:43.77159	c64f66c9-639f-4913-8d6e-0304d51f1c20	c64f66c9-639f-4913-8d6e-0304d51f1c20	Daily	Submitted	c36bdab2-6592-442f-b4b4-a02b59b4da0b	\N		2026-08-11 20:48:43.966	2026-08-11 20:48:43.966	\N	\N	f	1
2de8c578-b5d9-4fef-ab92-039b80bcba98	2026-08-11	2026-08-11	0.00	\N	2026-08-11 21:00:00.194206	2026-08-11 21:00:00.194206	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	Daily	Draft	c36bdab2-6592-442f-b4b4-a02b59b4da0b	\N	\N	\N	\N	\N	\N	t	\N
3d8df4b1-bcd6-4741-b628-060522105747	2026-08-11	2026-08-11	0.00	\N	2026-08-11 21:00:00.292159	2026-08-11 21:00:00.292159	c64f66c9-639f-4913-8d6e-0304d51f1c20	43af610e-e846-4f7c-88bd-c51fc43f0d12	Daily	Draft	c36bdab2-6592-442f-b4b4-a02b59b4da0b	\N	\N	\N	\N	\N	\N	t	\N
e019dc2f-1046-4ba7-8d01-ff216dde2e26	2026-08-12	2026-08-12	0.00	\N	2026-08-12 01:00:29.344194	2026-08-12 01:00:29.344194	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	Daily	Draft	c36bdab2-6592-442f-b4b4-a02b59b4da0b	\N	\N	\N	\N	\N	\N	t	\N
a71cb46a-07e5-4709-bb6f-e5817508ad4c	2026-08-12	2026-08-12	0.00	\N	2026-08-12 01:00:29.398069	2026-08-12 01:00:29.398069	c64f66c9-639f-4913-8d6e-0304d51f1c20	c64f66c9-639f-4913-8d6e-0304d51f1c20	Daily	Draft	c36bdab2-6592-442f-b4b4-a02b59b4da0b	\N	\N	\N	\N	\N	\N	t	\N
ef615309-ce88-4123-819f-664910acb882	2026-08-12	2026-08-12	0.00	\N	2026-08-12 01:00:29.420258	2026-08-12 01:00:29.420258	c64f66c9-639f-4913-8d6e-0304d51f1c20	43af610e-e846-4f7c-88bd-c51fc43f0d12	Daily	Draft	c36bdab2-6592-442f-b4b4-a02b59b4da0b	\N	\N	\N	\N	\N	\N	t	\N
\.


--
-- Data for Name: permissions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.permissions (permission_id, permission_name, description) FROM stdin;
efbb62bd-e51d-4f01-80ce-0363d440bd41	CREATE_USER	Can create users
cb2302c6-f2da-4333-9b98-24245f468b1e	EDIT_USER	Can edit users
41803582-c338-424e-9e97-1ba7abc139a1	DELETE_USER	Can delete users
48c1ed30-3310-4552-babb-74f18c779d16	VIEW_PAYROLL	Can view payroll data
1d032f5d-493c-4019-8668-7c055dbd1959	APPROVE_LEAVE	Can approve leave requests
67a36a67-1a37-4362-80e8-328dbd8ddbd5	MANAGE_SHIFTS	Can manage shift schedules
ee643269-d023-4b52-a9d3-caf40acfcdcd	VIEW_REPORTS	Can view HR reports
4f89a6f0-cf90-4115-8dab-a9cd19730230	MANAGE_ROLES	Can manage roles and permissions
ab76c75d-881e-4169-80e5-83db4c153d44	employees.create	Create employee records
1016de93-9e5e-4c89-a224-72a3904bbead	employees.view	View employee records
98693c79-9753-4047-8ee6-8d161a25a56f	employees.update	Update employee records
70fc3974-f889-4005-b522-87e17609214d	employees.delete	Delete employee records
99993d4f-ea72-4877-a5e4-e7126c6c53c4	roles.update	Update roles
73fcd5f4-a41d-4318-98f9-0ba19c50fec5	roles.delete	Delete roles
d9519e47-ae1d-4b6b-a758-16ce5f2f7a63	permissions.delete	Delete permissions
0f06f2a6-1eaf-4b32-8256-e052681914e6	designation.create	Create designations
9e7300a0-5203-4c58-99a7-86e61873cfb9	designation.view	View designations
e88b839b-cad4-48e0-830d-6e845162c9c4	designation.update	Update designations
4ccb1763-f2ab-452d-9ebb-db6f43fc8a3f	designation.delete	Delete designations
e7ded78c-bf45-4f0f-80b1-8a07762c8287	shifts.create	Create shifts
9f5734eb-0f25-423f-9d73-4f6064537472	shifts.view	View shifts
a271a740-a018-4bbd-8c16-2abaa48373c6	shifts.update	Update shifts
c511eeb2-9e7c-40c6-8ab1-b241e83b8a3e	shifts.delete	Delete shifts
4d019099-629a-4602-987c-0ff95d5784aa	attendance.create	Create attendance records
786b92b2-599a-41e9-a56c-5bd9fe8b01aa	attendance.view	View attendance records
babd7004-a6e5-4c0b-ba07-b63309109e22	attendance.delete	Delete attendance records
3bcdae8c-f4b6-4c76-b6c0-70bdc8ad1fe8	leave-request.create	Create leave requests
3b30c266-3221-464b-86e8-7db8d13da0fc	leave-request.view	View leave requests
f0e98ae7-e219-4488-a740-5c2101422f86	leave-request.update	Update leave requests
17c13aad-7963-4620-a11b-06e247b1b873	leave-request.delete	Delete leave requests
e2969729-4620-4910-8585-6a2f3d01ffe0	payroll.create	Create payroll records
0e7e6da7-16a3-4595-9818-ddd3715130b8	payroll.view	View payroll records
aef265cd-e15e-44e4-8742-27856117e73f	payroll.update	Update payroll records
7bcfcbe7-1113-4008-a07f-8ad1f50d8dd4	payroll.delete	Delete payroll records
58f77d7a-c0f1-4726-9eb8-a3fb4cca95e5	appraisal.create	Create appraisal questions
651b72d8-4888-4c22-bf27-e77f92a61c10	appraisal.view	View appraisal questions
adebee34-d381-40ab-91b0-d49c021290dd	appraisal.update	Update appraisal questions
7ce5e22d-a818-41a7-b0dd-ecb6c4e88874	appraisal.delete	Delete appraisal questions
9ae83958-dddd-4667-8b46-33f377b0e61c	attendance.update	Update attendance records — correctly spelled, seed for when the code typo is fixed
1a8873dd-eb12-4007-89ab-d84e2062e918	apprisal-question.create	Create appraisal question options
61510cc9-0325-4dc4-b996-b9cf3c93ca80	apprisal-question.view	View all appraisal question options
b3414ef7-b896-4c97-a8cb-6fc198e67047	apprisal-question.view.own	View a single appraisal question option by id
90be2ab6-38f8-4bde-9d80-199771e345c7	apprisal-question.update	Update appraisal question options
98429f77-55d3-4fe0-8306-b5d1ba8124b2	apprisal-question.delete	Delete appraisal question options
0d4b1b91-4f35-4935-8857-b088767292a6	appraisal-forms.create	Create appraisal forms
a12292d9-b3f3-4baf-bcac-68ae914a4d1d	appraisal-forms.view	View all appraisal forms
3ae0c0f3-8d25-4d71-8d87-19660efec229	appraisal-forms.view.own	View a single appraisal form by id
9b880363-65ee-4794-bd47-55da52fd349c	appraisal-forms.update	Update appraisal forms
a18c261f-732b-4862-b6a4-bcf95bfbd9c9	appraisal-forms.delete	Delete appraisal forms
3ba5bbcc-9236-4809-96b4-f23b19e208c1	appraisal-form-questions.create	Create appraisal form question links
ee70a5ab-f696-4222-98b8-8376a1d82051	appraisal-form-questions.view	View all appraisal form question links
44f510ec-a732-46df-960d-decd719f7ee3	appraisal-form-questions.view.own	View a single appraisal form question link
fbe398e5-ab76-4ed2-8796-bd540fbf709b	appraisal-form-questions.update	Update appraisal form question links
794e15ec-2200-44ab-989b-7da21862b17e	appraisal-form-questions.delete	Delete appraisal form question links
78f4e5b6-7029-4c92-a01a-058c87ce952b	appraisal-forms.assign	Assign forms to departments, designations, or employees
e8890ad2-079f-4ed4-85a1-bb5da3b65359	appraisal.viewAll	View every evaluation across the organisation
7cc03ac0-ea10-43c1-b1d1-b5d094352d6b	appraisal.viewOwn	View your own evaluations and review history
fae803a1-9ce1-436e-987b-70dc74e5b74a	roles.create	Create roles
4a251712-8742-4d68-a25b-9b44bcc4c548	permissions.create	Create permissions
4cadf91c-af1b-4549-85af-6412dd30b306	departments.create	Create departments
9e98d2a1-651d-48cc-a82c-14d5f73df681	departments.view	View departments
fe3cea93-eead-41a2-b214-7d78f838f9d3	departments.update	Edit departments
76b09149-bfa3-481c-8d0c-cd4aee833040	departments.delete	Delete departments
899e2f22-41d9-4263-b408-92ef83628411	job-categories.create	Create job categories
ddff7299-0615-40d3-aabe-57c839d20efb	job-categories.view	View job categories
930bd0d8-abc2-4b27-b308-f548f03f9793	job-categories.update	Edit job categories
0011b2ce-396e-4302-98b9-57b0ecf747d0	job-categories.delete	Delete job categories
526f8cc6-062b-42b2-bdbb-41485dffaee2	notifications.create	Create notifications
a90bc4ef-383c-4eb0-94c4-f5a4d144622e	notifications.view	View notifications
2aba093f-28b0-4c5e-8953-ded025431d9d	notifications.update	Edit notifications
d2c0760e-c337-4e99-abe1-837e0624c2d1	notifications.delete	Delete notifications
28909d84-a799-485a-ad25-31f0a124b8a7	company-settings.view	View company details and branding
6dd7e925-a032-4214-8b5d-bf2ff7d311be	company-settings.update	Edit company details and branding
db5c84df-d810-470b-b3d3-f26bbaa992d8	leave-types.view	View leave types
cf10080c-8632-4e39-b141-9b20b8c32023	leave-types.create	Create leave types
1a8ab615-bb7a-4b66-848b-9204fd386584	leave-types.update	Edit leave types
8f64dc3b-deab-4c18-88be-79c99318ad8b	leave-types.delete	Delete leave types
7e33c9c0-9de3-4d07-9c9c-7377136f0e0b	working-days.view	View working day configuration
afc5edf4-f0ec-47be-867c-20a37d5bc259	working-days.update	Configure working days globally and per scope
d31c4792-f791-4429-b5a2-6539dab0dddf	employees.team.view	View a Team Lead's team members
079d1341-b000-4230-96d8-0a9a045da8ff	employees.team.manage	Add and remove members from a team
53430f04-b5bf-4ef9-8b8c-d541987afa45	employees.teamlead.assign	Assign or change an employee's Team Lead
9fcc93c1-07cc-441f-b8ff-a88e82ae6937	employees.salary.view	View employee salary
d54e92ab-e16f-4364-b4d9-9952ecbf9308	employees.salary.edit	Change employee salary
7fdbff5b-ad29-4739-a3af-8db0518f3d88	employees.payroll.view	View employee bank and payroll details
8a5d04dd-4e49-4224-95b0-08ccd2807560	employees.payroll.edit	Change employee bank and payroll details
c065391d-3217-4160-8b7c-1c75cafd9d4a	employees.leave.assign	Assign leave types and balances to an employee
f0a99c9d-8269-463c-9914-288b8107c876	employees.role.assign	Assign a role to an employee
a3bc1bbd-130f-417a-ba16-af925aa6829e	employees.login.manage	Enable or disable account access and login channels
ae29963d-7c46-43c5-bdad-9d2d50c8f7e6	employees.password.reset	Reset another employee's password
a5306f7f-b657-47d5-ba62-479a88a60a22	employees.profile.email.edit	Allow an employee to change their own contact email
85064f41-1e65-4a61-af2c-7fdd007dacca	employees.emergency.view	View emergency contact details
04ce8e35-db2f-4e1b-809f-52bafb4cb89d	employees.emergency.edit	Change emergency contact details
d9c7c86f-584d-4427-964a-b9d5c6660aad	employees.documents.view	View employee documents
33b26f49-1a75-4aa4-b0a7-3c6c6ab2eb2d	employees.documents.upload	Upload employee documents
7e830c93-65d3-4c1a-b566-d432b84a2357	employees.documents.delete	Delete employee documents
e56e7b16-b64b-42c2-aa47-bd4a553b2f07	employees.card.view	View employee ID cards
78a9f184-d0d3-4245-9b54-02978a67da9a	employees.card.download	Download or print employee ID cards as PDF
701bda0c-99be-4b0b-98a3-432738946c36	employees.export	Export the employee list
b7c09571-9e37-451f-9855-3423b23808ef	employees.import	Bulk-import employees
94711495-b48e-4952-9c47-f489be7e4374	audit-logs.view	View the audit trail of record changes
fb86d2c0-db9a-465c-b319-185e0434b2de	email-settings.view	View SMTP configuration
e142e4f9-9ce3-4243-b168-caef6bb614d6	email-settings.update	Change SMTP configuration
e90b5dfa-993e-4efb-969b-651bcd1b3a4e	email-settings.test	Send a test email using the SMTP configuration
c7153377-2678-41e2-9304-80c715871f73	email-templates.view	View email templates
b8fe8c5f-bbba-4440-8ed4-63279f683c40	email-templates.update	Edit, enable, disable and restore email templates
4178e1c7-b30d-4b37-ac0d-f3c8a9ce3589	email-queue.view	View the outbound email queue and delivery status
2d36513d-1c3a-49ce-a2c0-9e05a51c8d60	email-queue.manage	Retry or cancel queued emails
e3df2f33-b000-4178-b6df-59f283d5c3ef	appraisal.submit	Submit an evaluation for an assigned employee
63ebb8a9-5873-4d7d-bc9a-61d5673174e1	appraisal.approve	Approve, reject or reopen a submitted evaluation
87d32681-31bb-44b9-b380-5b64147e4dd8	appraisal.stats	View appraisal statistics and dashboards
77f8f266-801f-4bf1-b410-ec5fa6956d69	appraisal.compare	Compare appraisal statistics across employees
3295842a-274d-47b5-acf2-5bbb25502a7c	appraisal.export	Export appraisal data to PDF or Excel
e96070bc-676b-4214-b679-c657ad6a6c0c	appraisal-forms.questions.manage	Create and edit reusable appraisal questions in the question bank
b790c33e-86cb-4184-8a08-781f5707c9b8	appraisal.teamlead.assign	Assign employees or a whole department to a Team Lead
1d9aa0e7-8f81-4ace-b3be-0f7f9c6c27eb	permissions.update	Rename a permission or edit its description
e47b2587-16fa-41cd-a588-2dea924b1f2d	leave-entitlement.view	View leave entitlements and balance previews
bc3543ab-62c2-44bf-b823-79a3eb8442a0	leave-entitlement.manage	Create, update, increase, and deduct leave entitlements (single, bulk, department, designation)
68635909-767b-49b9-b7fc-c71412adccfa	leave-history.view	View the leave history/audit ledger
991976d3-ff46-4bad-8093-0d439f08edb7	holiday.view	View the company holiday calendar
dc30ae54-59d2-4dd0-9274-c8f22e54d5a2	holiday.manage	Create, update, and delete holidays
d3e3f362-43a2-405b-bde6-7eca7ba73984	meeting.view	View all scheduled meetings across the organisation
bfcb391e-eb80-4ee6-91c8-5165e6709aa5	meeting.create	Schedule meetings and invite participants
9bcecb8b-2dc8-432b-9f6b-a99b42639ad5	meeting.manage	Update, cancel, and delete any meeting, including meetings organized by others
3ef9ab1d-b513-4a16-8e19-ae1a3087dcb4	payroll-settings.view	View payroll settings
f61eef95-ac2a-46fc-b6b2-09f172b9d4f2	payroll-settings.update	Edit payroll settings
89135485-7ece-41fe-870b-6bbdb6080d3e	salary-components.view	View salary components
44d46021-90f2-4d02-b5a2-7c2c66818916	salary-components.create	Create salary components
5c222b3d-c74e-4d04-b850-5bb0dfbb7d5c	salary-components.update	Edit salary components
8daea6cd-7697-4c03-83bf-f7c8ceb5f722	salary-components.delete	Delete salary components
9682c66f-84c0-4a24-9409-6208065bed43	salary-structures.view	View salary structures and assignments
2944b93b-4dc6-4bdd-9eb5-53cf5a180097	salary-structures.create	Create salary structures and assignments
af16e7fd-45db-4e9c-b535-1c38b616ea38	salary-structures.update	Edit salary structures and assignments
e797c7f8-a897-4b4a-a90c-6ac7c3424f00	salary-structures.delete	Delete salary structures and assignments
1293e4e2-7e70-4608-b47d-f0df6cd9d8f4	payroll-periods.view	View payroll periods
100c6399-f7b2-4c76-97a2-ddce7bc6eac5	payroll-periods.create	Create payroll periods
4ab89d49-a156-4993-b755-5c74c395044d	payroll-periods.update	Edit payroll periods
ec0bbac7-5182-4d41-bf4a-3496639c7758	payroll-periods.delete	Delete payroll periods
8d4e25cb-4472-4a6d-94a8-d5cc6afd089f	payroll.preview	Preview a payslip calculation without persisting
5af03367-5758-46c6-b759-46d1574381c0	payroll.process	Process a payroll period and generate payslips
f5786867-ff3f-4aba-910d-f9729a579f8d	payroll.approve	Approve a processed payroll run
1b568740-2110-4978-b831-19faa6e19e4f	payroll.lock	Lock an approved payroll run
4d761ece-c57f-4fca-8a83-8fb2b163ce86	payslips.view	View payslips across the organisation
a0c62ba8-09ea-44bc-9a74-a1dfe149d46d	payroll-rules.view	View payroll rules
130139ad-b2ac-4602-a826-9b7b8c860985	payroll-rules.create	Create payroll rules
58dcd876-e44c-4713-b427-697ccee248e3	payroll-rules.update	Edit payroll rules
0def6c47-97ca-436d-8676-ded6988fe774	payroll-rules.delete	Delete payroll rules
a48aa728-f635-41e8-a46e-487a1040f954	payroll-tax.view	View tax configurations
3ca9d235-f88b-4115-8fe1-9c6eccd7396e	payroll-tax.create	Create tax configurations
8e3242e2-719f-40ae-b09a-8c16e9d49eb3	payroll-tax.update	Edit tax configurations
4a0202ae-dba4-4571-bfed-2f74cfe711ad	payroll-tax.delete	Delete tax configurations
4897b3cc-a4ba-49ae-80bb-9ff61a04be12	payroll-loans.view	View employee loans
980951c7-c4d4-4bb9-aca3-d784a4166aec	payroll-loans.create	Create employee loans
23559a49-aff4-4a21-954c-c8d904a21370	payroll-loans.update	Edit employee loans
e138c064-4dfc-4927-9871-db941fe11e9a	payroll-loans.delete	Delete employee loans
e2413391-a4b4-4dfc-bdc1-3dcc98687eae	payroll-reports.view	View payroll reports and registers
31993133-5b9a-4dba-8505-401ab127f3bf	reimbursements.view	View all employee reimbursement claims
0b9f6ff2-e7ee-48fa-b557-73d07dead3db	reimbursements.create	File a reimbursement claim for an employee
ed380369-28f8-496e-b7ec-75cd981f2abc	reimbursements.update	Edit reimbursement claims
a68be313-8545-4bde-b74d-b296f4320218	reimbursements.delete	Delete reimbursement claims
2325f62d-8288-4daf-8b7f-169cb59294f9	reimbursements.approve	Approve or reject reimbursement claims
3acdeb75-3daf-431b-90fe-f5f640770a34	payroll-loans.approve	Approve or reject employee loan requests
60829655-227f-432b-a0ec-93663d6027ba	payroll.setup	Run the automatic payroll setup
\.


--
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.refresh_tokens (refresh_token_id, user_id, token_hash, expires_at, revoked_at, created_at) FROM stdin;
00887c81-3e3a-4fc1-abdd-ba0b15fe3c92	5269a7da-0db6-49b8-97eb-c2d482cb611a	1cd4913955ef354f510613ebb257184c553d27737e46883b26547896983cd962	2026-08-15 20:46:08.396+05	2026-08-08 21:01:09.794+05	2026-08-08 20:46:08.451463+05
f07cfdff-6aca-49c5-8f9b-c676837cdf01	5269a7da-0db6-49b8-97eb-c2d482cb611a	3b2cd4f1fe367e2f2e538a7395048a3d3354af3fcd422609a5a8aec09c5c89db	2026-08-15 21:01:09.835+05	2026-08-09 02:35:09.249+05	2026-08-08 21:01:09.841972+05
8033105b-735c-4672-bd54-44bdb65e538e	5269a7da-0db6-49b8-97eb-c2d482cb611a	4f9a91a663ebf9c19ab87fc2bca37a429488139ac08ae951cdb87305723a857d	2026-08-16 02:35:09.286+05	\N	2026-08-09 02:35:09.288695+05
14af4837-2cc8-4c42-826b-ccf4d8035bf7	5269a7da-0db6-49b8-97eb-c2d482cb611a	f036acad9fee9f37dceb731d092e2b551857a3873e163674717cc5b6b5c9e246	2026-08-16 02:36:01.861+05	2026-08-09 02:51:08.606+05	2026-08-09 02:36:01.866452+05
888e2327-5259-48ae-8a79-3ade29d5149d	5269a7da-0db6-49b8-97eb-c2d482cb611a	f7fdd697ba95fcb9d0ff132b86f937377d70e598c87286938eb3abd0b20953cd	2026-08-16 02:51:08.63+05	2026-08-09 03:06:08.303+05	2026-08-09 02:51:08.632353+05
2ae70b5e-fdcf-48cb-a5c3-7245666b4522	5269a7da-0db6-49b8-97eb-c2d482cb611a	ab9eb955494d436d31637edfa64ea9f0c9ac8f292d96052a3b54012d02fbc6ad	2026-08-16 03:06:08.312+05	2026-08-09 03:21:08.906+05	2026-08-09 03:06:08.316091+05
57ece146-5f17-48ce-b909-af0db760bbd4	5269a7da-0db6-49b8-97eb-c2d482cb611a	58a76d382f18216d82ec3b3ad5955e9c9511441a3615818c9ec3875d2b1473d8	2026-08-16 03:21:08.912+05	2026-08-09 03:36:08.297+05	2026-08-09 03:21:08.914255+05
468ef758-87db-478b-b1f0-e576318b8df6	5269a7da-0db6-49b8-97eb-c2d482cb611a	901923a4a5666387d691537f5bf58288291a30ad22ed7757082403b249397dfd	2026-08-16 03:36:08.305+05	2026-08-09 03:51:08.916+05	2026-08-09 03:36:08.309953+05
43035ab0-56dc-4e3c-84b3-55eb0b4ce2af	5269a7da-0db6-49b8-97eb-c2d482cb611a	c80be7c849d3b5d850ccda832205580aec6c35a50ca1c7dd28c8933d719011ef	2026-08-16 03:51:08.921+05	2026-08-09 04:06:08.371+05	2026-08-09 03:51:08.922895+05
6a4bd68a-4e4b-4353-9b07-a6fdd24efe32	5269a7da-0db6-49b8-97eb-c2d482cb611a	ba6b54c9394e785e4abf40da2d8a67a98754c089f311dc2eb25a44b864f219dc	2026-08-16 04:06:08.385+05	2026-08-09 04:21:08.929+05	2026-08-09 04:06:08.389448+05
e93041bd-9cac-48e2-8baa-2d70696101ef	5269a7da-0db6-49b8-97eb-c2d482cb611a	17784f7434cea863321834aaa938ee2b5f71207a15816778306a459b64d2d848	2026-08-16 04:21:08.94+05	2026-08-09 04:36:08.362+05	2026-08-09 04:21:08.942558+05
38d5075b-b2a0-4534-9aec-77e28d1010fa	5269a7da-0db6-49b8-97eb-c2d482cb611a	be76fea023e2e602a8633b730bfe69a52cf29caf3df217b203e3b8661c9ca462	2026-08-16 04:36:08.371+05	2026-08-09 04:51:08.957+05	2026-08-09 04:36:08.373983+05
a018729c-490c-4bec-88ef-8b48b0cac02e	5269a7da-0db6-49b8-97eb-c2d482cb611a	0827e1dcffec11090c2910c61d2ea6abab1a00ef1925213f421aa84bf30f01ea	2026-08-16 04:51:08.969+05	2026-08-09 05:06:08.348+05	2026-08-09 04:51:08.972148+05
38dd436a-4ba6-43ee-ae1f-1671f869f465	5269a7da-0db6-49b8-97eb-c2d482cb611a	597544408466eb5e2a0281812372d24efc0600d0869da184ae46a8f554a8c829	2026-08-16 05:06:08.359+05	2026-08-09 05:21:08.961+05	2026-08-09 05:06:08.365445+05
55a91660-e40b-45f8-96ab-63543e61412b	5269a7da-0db6-49b8-97eb-c2d482cb611a	2beec53f126600a380b76b960947d34ef17803c4ec8d02afd36b3b78ec083237	2026-08-16 05:21:08.972+05	2026-08-09 05:36:08.326+05	2026-08-09 05:21:08.974503+05
b8d2724b-8737-4d72-b3c0-353556e1acd3	5269a7da-0db6-49b8-97eb-c2d482cb611a	8dc1ea2b6a4b9c6fd149480c4cda2e2738527678893f4c2dc2cd19be8a82e201	2026-08-16 05:36:08.334+05	2026-08-09 05:51:08.968+05	2026-08-09 05:36:08.336057+05
40ae160f-0fa6-4291-a7a6-f069d4740f5f	5269a7da-0db6-49b8-97eb-c2d482cb611a	04eb9d2d99631d6f583d9ad0b518d9c112c539319d804f820cc760f75d9aa074	2026-08-16 05:51:08.977+05	2026-08-09 06:06:08.357+05	2026-08-09 05:51:08.979265+05
0b7c602e-def7-447f-ae28-03879f0df4ba	5269a7da-0db6-49b8-97eb-c2d482cb611a	6f6810e2b698fe89a33bfc1e39dfdac08835f7b0fe788cc420d4d94e0ecacd2f	2026-08-16 06:06:08.369+05	2026-08-09 06:21:08.956+05	2026-08-09 06:06:08.37286+05
f13dffb4-f9de-45ea-b413-bd495e6b9556	5269a7da-0db6-49b8-97eb-c2d482cb611a	c618f6b79214fdeafdd97a52846761bdca78002c77aefa9a662a510e41bbcb81	2026-08-16 06:21:08.966+05	2026-08-09 06:36:08.38+05	2026-08-09 06:21:08.968264+05
19be2ce3-a3ef-42cf-8d69-a5d6709c160c	5269a7da-0db6-49b8-97eb-c2d482cb611a	1b38aec68374139aeeb9d56b944ac13426cd3280f999b54b48484d76b6979403	2026-08-16 06:36:08.391+05	2026-08-09 06:51:08.962+05	2026-08-09 06:36:08.394942+05
54edfdae-90e4-49a8-b32a-e28969edf9d7	5269a7da-0db6-49b8-97eb-c2d482cb611a	53ce0460dda59f8136af2d5cdb81988f6b728130ec8d6cc4e72539a7fc03d05c	2026-08-16 06:51:08.973+05	2026-08-09 07:06:08.357+05	2026-08-09 06:51:08.975116+05
5a810f79-a42d-49a2-a522-de5c3251752b	5269a7da-0db6-49b8-97eb-c2d482cb611a	2a6a5dedcec13f6e9b530318140aab3ffe27d2ad3e3211acf9556c768f217eb6	2026-08-16 07:06:08.368+05	2026-08-09 07:21:08.945+05	2026-08-09 07:06:08.371286+05
f5baa5a7-7a90-4cea-9501-7bb2211cf92d	5269a7da-0db6-49b8-97eb-c2d482cb611a	f31e1fb8e0e9d0f27a55ffdc0aac86bcf91014840a54f867105b750fc19780e6	2026-08-16 07:21:08.956+05	2026-08-09 07:36:08.344+05	2026-08-09 07:21:08.961077+05
24d242b8-40e3-4db4-9f22-024d3f1269ac	5269a7da-0db6-49b8-97eb-c2d482cb611a	efe939dc0208e3495d0a0d2e43f908198fc51daaea9156c12f5c57dcef300eff	2026-08-16 07:36:08.354+05	2026-08-09 07:51:08.944+05	2026-08-09 07:36:08.357757+05
41564e45-9381-4c9a-ad79-2efefd3b76a8	5269a7da-0db6-49b8-97eb-c2d482cb611a	c612b6114a7474a2807ab89ad768f53aef44493407f80dfa2bffd7a7956097db	2026-08-16 07:51:08.953+05	2026-08-09 08:06:08.348+05	2026-08-09 07:51:08.955803+05
4c2aa8ff-37db-4c54-8e23-17b67906a51a	5269a7da-0db6-49b8-97eb-c2d482cb611a	2ee37f76572642ed4d124c2a50e573f6cd5dd553db0618dda779c32255703661	2026-08-16 08:06:08.359+05	2026-08-09 08:21:08.953+05	2026-08-09 08:06:08.362011+05
2aab2a5b-c2d4-4d5d-92e6-c84dd371b9bf	5269a7da-0db6-49b8-97eb-c2d482cb611a	b6bf8cfe46438d062918b13ba827c00d197e978af098201218d35dbe963e10bc	2026-08-16 08:21:08.961+05	2026-08-09 08:36:08.347+05	2026-08-09 08:21:08.963359+05
f01659bf-e935-495f-b1df-2303cc41a3a3	5269a7da-0db6-49b8-97eb-c2d482cb611a	3f051ff28b15f38f957871748423033e88765a7e0e8a50cc20858d4645a98dcd	2026-08-16 08:36:08.355+05	2026-08-09 08:51:08.953+05	2026-08-09 08:36:08.357815+05
aa6cb580-0ce6-4d3e-a404-13fbaebdeb29	5269a7da-0db6-49b8-97eb-c2d482cb611a	5600c04970c96df025bab0de9637ea0399457e65bb36187f450b671dccdbdf34	2026-08-16 08:51:08.962+05	2026-08-09 09:06:08.351+05	2026-08-09 08:51:08.964909+05
e2802c9f-190b-4ee9-a73c-5a67f902e758	5269a7da-0db6-49b8-97eb-c2d482cb611a	d178b9a7bf0ac5062734b32422bd04010c4ef574f44dd7c63ce644f5bc5dc894	2026-08-16 09:06:08.361+05	2026-08-09 09:21:08.955+05	2026-08-09 09:06:08.364407+05
ea3cddcc-4eca-4b6b-af15-669cfc1ca5bc	5269a7da-0db6-49b8-97eb-c2d482cb611a	40f7fb6c5d253786df084abc1cd837e390f2e5fd73b16ec6c04950f229b99532	2026-08-16 09:21:08.964+05	2026-08-09 21:26:13.42+05	2026-08-09 09:21:08.966857+05
6ea522d8-7b09-4736-8550-cd1f3202d946	5269a7da-0db6-49b8-97eb-c2d482cb611a	ee8cdc9feb17921be29db7b19b55d240c9d1237fbc09ee0fb23b42640d870d18	2026-08-16 21:26:13.453+05	\N	2026-08-09 21:26:13.455755+05
f9014713-d1fe-453e-ab85-b5c24ba96d06	5269a7da-0db6-49b8-97eb-c2d482cb611a	9b06eaa45f96b8684891d03a4342c27baed9c5b210fec582b0c2e08d59736a1e	2026-08-17 14:03:12.377+05	2026-08-10 14:18:21.481+05	2026-08-10 14:03:12.483511+05
eb79d7fb-7c23-4a9f-a75c-7fa11af7f575	5269a7da-0db6-49b8-97eb-c2d482cb611a	9827e0249d6182054f1a1d3cf44e6a2adc1789f7c665e8296333ae86db062d68	2026-08-17 14:18:21.486+05	2026-08-10 14:33:45.324+05	2026-08-10 14:18:21.491589+05
0964e405-7844-4089-886b-2687ecaf76f0	5269a7da-0db6-49b8-97eb-c2d482cb611a	8323e658dd49b8d0d92ce4aa1e13313150fc80a0d38faee9aa3af9904b9afb69	2026-08-17 14:33:45.374+05	2026-08-10 14:48:45.351+05	2026-08-10 14:33:45.375956+05
c8b441ea-09b9-4e36-8838-36fed969d163	5269a7da-0db6-49b8-97eb-c2d482cb611a	9e552dd2da14eeff771edff8ee85c41c6cabf25362932023488899ab903a099b	2026-08-17 14:48:45.405+05	2026-08-10 15:03:45.537+05	2026-08-10 14:48:45.409799+05
0d21c3e3-2221-4ad8-a803-2fcb37d05831	5269a7da-0db6-49b8-97eb-c2d482cb611a	45b1b7835cd8fa57609227a18002a22ad50d403ee2d634d1c3831f0e228ae08d	2026-08-17 15:03:45.711+05	2026-08-10 15:20:46.393+05	2026-08-10 15:03:45.718257+05
66580e3e-12ab-4be6-b9e9-29c79e3fc340	5269a7da-0db6-49b8-97eb-c2d482cb611a	b7463311d2fb47a536ab3d3a745a61ded80b5a4fec71556a0573be8a30769583	2026-08-17 15:20:46.458+05	2026-08-10 15:42:13.137+05	2026-08-10 15:20:46.465518+05
64511bfe-3e96-4b02-acf0-92857eef35b1	5269a7da-0db6-49b8-97eb-c2d482cb611a	529bccc32304ab4d857156f849b94dbb79a8f77dff414dd67c629b4830ca0c43	2026-08-17 15:42:13.301+05	2026-08-10 15:57:28.156+05	2026-08-10 15:42:13.314+05
8d6171fa-ba80-4039-a989-9310b02caf71	5269a7da-0db6-49b8-97eb-c2d482cb611a	ff41b9f2b8dea692e63b904efc479baf12821826d578a13074325381b55d4fa3	2026-08-17 15:57:28.197+05	2026-08-10 16:12:44.802+05	2026-08-10 15:57:28.200573+05
87e084f0-ddfa-4a10-a531-47a9984904f6	5269a7da-0db6-49b8-97eb-c2d482cb611a	f3708bed82d04afa2a868b79c18ad9531b5ffce188c8f610191646056ed4ca81	2026-08-17 16:12:44.849+05	2026-08-10 16:27:45.32+05	2026-08-10 16:12:44.855357+05
f3dcafa3-dbd7-4917-9cdc-a66fe6e49dbd	5269a7da-0db6-49b8-97eb-c2d482cb611a	6e78c8b02ac020dfa9bb866c81ec87b9f24b46fdda909054d0702a3aa4c2792f	2026-08-17 16:27:45.333+05	2026-08-10 16:43:22.743+05	2026-08-10 16:27:45.336563+05
48a5cc44-70b7-420d-87c4-7264217313fd	5269a7da-0db6-49b8-97eb-c2d482cb611a	423068fa1b4793901bbc089be248a0ca50a719409378fdae787e6a8c3cfb2e03	2026-08-17 16:43:22.802+05	2026-08-10 16:59:08.349+05	2026-08-10 16:43:22.806222+05
0071e6b2-c255-49d7-978f-c460e8ddb56c	5269a7da-0db6-49b8-97eb-c2d482cb611a	b66f36ca6bc0d1a9178b477e32dd25f83e87a9295f59b1a4b5e4dce53759ff1b	2026-08-17 16:59:08.383+05	2026-08-10 17:15:02.305+05	2026-08-10 16:59:08.386939+05
4e86f860-de1f-4178-b21f-a6cafa17b0d2	5269a7da-0db6-49b8-97eb-c2d482cb611a	b1fff7c037763925fed5a0faeaa3437379971629dff466bac3dfaf8aebeb0c43	2026-08-17 17:15:02.33+05	2026-08-10 17:32:42.64+05	2026-08-10 17:15:02.332412+05
5cb13301-f832-4e89-b901-727fe1d0f5a1	5269a7da-0db6-49b8-97eb-c2d482cb611a	2409c7b2118050af706047c83c55e9d759a7da5597b0aad1641a62bfef31750a	2026-08-17 17:32:42.745+05	2026-08-10 17:47:45.346+05	2026-08-10 17:32:42.748578+05
11357530-4bef-41e3-a3b7-2f4623c82a4a	5269a7da-0db6-49b8-97eb-c2d482cb611a	713fa6475090dc0f7c4e65cc2d777636b3e7c7e00d4410859351e2d0f9220ea8	2026-08-17 17:47:45.417+05	2026-08-10 18:03:15.068+05	2026-08-10 17:47:45.421608+05
8c748f35-3821-44f7-a15c-e98dafd7c463	5269a7da-0db6-49b8-97eb-c2d482cb611a	bc2b54039dda3752123a4cf09f5bd61079204d0d8c9f5c492a1880576c88c4f6	2026-08-17 18:03:15.102+05	2026-08-10 18:18:45.266+05	2026-08-10 18:03:15.104441+05
79821eaa-9942-4545-ad43-a667006f5e26	5269a7da-0db6-49b8-97eb-c2d482cb611a	45759cd6cdbd61353fee8ca13b1482d095bb694bda06defee6bbcc5b0828fdd9	2026-08-17 18:18:45.286+05	2026-08-10 18:34:45.271+05	2026-08-10 18:18:45.287804+05
6a259ab7-714f-469e-93e3-c56ce5c837fa	5269a7da-0db6-49b8-97eb-c2d482cb611a	1ac91943c227e920b3fdfbbd52238c2ad29a08374c7501ce00e5ce9046866b65	2026-08-17 18:34:45.291+05	2026-08-10 18:52:08.372+05	2026-08-10 18:34:45.293436+05
4b16a088-9edc-4863-8bf3-2812e69f6914	5269a7da-0db6-49b8-97eb-c2d482cb611a	c555054ac5bfffe13687a13e698ad1444f99c59de486de497f3171fa2aca6e3b	2026-08-17 18:52:08.452+05	2026-08-10 19:07:44.686+05	2026-08-10 18:52:08.457732+05
12f79029-92c1-4ce1-a6f9-f09f09b68182	5269a7da-0db6-49b8-97eb-c2d482cb611a	b02e3889f5ac747b45ed69d2b7a07d6cfd780433cde26cb92e37e1a9090adc06	2026-08-17 19:07:44.726+05	2026-08-10 19:24:17.137+05	2026-08-10 19:07:44.731374+05
c53ddd45-0ca1-4525-a110-f89ad94607d7	5269a7da-0db6-49b8-97eb-c2d482cb611a	24c3ed1d98037bb4610e3850dc3f74fd16a9dc3ea582274d0413ad3bb2d583b7	2026-08-17 19:24:17.207+05	2026-08-10 19:39:44.69+05	2026-08-10 19:24:17.211898+05
b5fb07eb-0e2d-4885-a196-aa185c930342	5269a7da-0db6-49b8-97eb-c2d482cb611a	cd8e3c36428c3c3072fee39571e9e9c9e8c840022b5ee8c02d82d05c439daf40	2026-08-17 19:39:44.733+05	2026-08-10 19:54:45.351+05	2026-08-10 19:39:44.738228+05
98af5e5e-a34f-434c-80ee-8b7223b6da8b	5269a7da-0db6-49b8-97eb-c2d482cb611a	13833aec578905e62cead7955b78bb35507e80f9306514d34cb902deae3ee10f	2026-08-17 19:54:45.39+05	\N	2026-08-10 19:54:45.393745+05
f6c95b57-49eb-416b-919a-67e66a05487b	5269a7da-0db6-49b8-97eb-c2d482cb611a	746e5f527c6ad5b67ae912ad474c2933040a195d4203b430a7245adfbc91872f	2026-08-17 20:13:50.597+05	2026-08-10 20:43:29.78+05	2026-08-10 20:13:50.629297+05
d7056924-600a-40a2-a175-93c51ac8185e	5269a7da-0db6-49b8-97eb-c2d482cb611a	b6f0568f1f8703d1a06391f1ea4e8502edc18e6a24df5921c6ede63e3eae5a4f	2026-08-17 20:43:29.805+05	\N	2026-08-10 20:43:29.810454+05
ce60121f-6fa9-44ed-9241-21129597b714	5269a7da-0db6-49b8-97eb-c2d482cb611a	e84bace0d546c4ee65eafca49c606f8e4c4b318b120f5c9fa3ff68c220d36a06	2026-08-17 20:43:31.648+05	\N	2026-08-10 20:43:31.656393+05
41294014-c256-4599-82e4-cf25eb1f86e0	5269a7da-0db6-49b8-97eb-c2d482cb611a	79e51e48997d16431d76b0e8bc12c98c8572ef5c27c86000832f9c4fe214d3b2	2026-08-18 07:00:27.493+05	2026-08-11 07:15:52.359+05	2026-08-11 07:00:27.511763+05
e3680c4e-8f1e-472e-92a3-e2a3905b47a2	5269a7da-0db6-49b8-97eb-c2d482cb611a	9059bd0b3c7c6ebdbc5c7415197de6038cebb35344df666c7b19b83364d760fc	2026-08-18 07:15:52.537+05	2026-08-11 07:30:52.38+05	2026-08-11 07:15:52.539595+05
f30c8101-1473-4d71-b4a6-1b47af633be3	5269a7da-0db6-49b8-97eb-c2d482cb611a	3aface800eda6e6662210be2a37e321bf8e29a98a6a9a7d821b7ecf4aa7818f7	2026-08-18 07:30:52.39+05	2026-08-11 07:45:52.959+05	2026-08-11 07:30:52.392994+05
c7a6f456-8b8c-4fc8-94b3-baf7564e2827	5269a7da-0db6-49b8-97eb-c2d482cb611a	c1e2b30271251477f4bdec63810b25c0d11b674e7fbbca7e5808fcbeadac55be	2026-08-18 07:45:52.971+05	2026-08-11 08:00:52.368+05	2026-08-11 07:45:52.972709+05
d3d27239-b57c-48b2-ab68-85c3a74ce078	5269a7da-0db6-49b8-97eb-c2d482cb611a	eb8d334f9d25dc3e9ced0ef93dfbcff942f5eb81a79236e34aaa03fb88b8e300	2026-08-18 08:00:52.375+05	2026-08-11 08:15:52.69+05	2026-08-11 08:00:52.378301+05
f160ef77-17fc-4e8b-ac81-663337b92f02	5269a7da-0db6-49b8-97eb-c2d482cb611a	84d52b17c10e04b9cc0573065aef2ec8e75c4cfc4d658cd37854163e0c934c87	2026-08-18 08:15:52.717+05	2026-08-11 08:30:52.386+05	2026-08-11 08:15:52.721374+05
e1dc3889-27e0-4c9c-9776-eeac78e57178	5269a7da-0db6-49b8-97eb-c2d482cb611a	8a9f6569c3d2f8c95ed225e17f30f941701c3f889876751a2a3736f4fa69c17c	2026-08-18 08:30:52.397+05	2026-08-11 08:45:52.982+05	2026-08-11 08:30:52.400278+05
0f4d093c-4633-4b23-9414-1ec1b888a9cd	5269a7da-0db6-49b8-97eb-c2d482cb611a	52945bb60c265cfafde48c0f2fae614615fd68eaa5ae8df00ae77558986cf647	2026-08-18 08:45:52.994+05	2026-08-11 08:49:43.837+05	2026-08-11 08:45:52.996836+05
d2a7f98e-f74d-4869-98d4-5f74eac25c12	5269a7da-0db6-49b8-97eb-c2d482cb611a	c37b512b086471a1d2c941ec4574b6a2fa3c7fef0216135b96369378b7e3407e	2026-08-18 08:50:45.849+05	2026-08-11 08:51:26.31+05	2026-08-11 08:50:45.860712+05
dc41faaa-84d9-4f1b-a844-f346190898b9	c64f66c9-639f-4913-8d6e-0304d51f1c20	fa88680003a8fc94ec1246844f9fe19d8499d9f0c98dd1bbf6674485c42276c8	2026-08-18 08:51:51.321+05	\N	2026-08-11 08:51:51.324829+05
c201946c-6485-422f-92b8-1885c4dc62e4	5269a7da-0db6-49b8-97eb-c2d482cb611a	1573080cd55bb1407f1f279f7fad3ceb488dc83425baed853e5120d165397cc1	2026-08-18 10:42:31.985+05	2026-08-11 10:44:18.161+05	2026-08-11 10:42:32.021759+05
2c97bf59-c3d9-4aa0-b0fe-e174b6ff9faa	c64f66c9-639f-4913-8d6e-0304d51f1c20	400160b0669f16de73fd1c008f05edd3e901ee35b979d5337866ad225941a5fc	2026-08-18 10:44:32.779+05	2026-08-11 10:59:52.442+05	2026-08-11 10:44:32.788481+05
ff737085-1c04-473a-b9f3-690d91290dbc	c64f66c9-639f-4913-8d6e-0304d51f1c20	df174f731c3ad4aae134d7fd69732179733c45a1c4e46b56dba31eb36c504d7c	2026-08-18 10:59:52.483+05	2026-08-11 12:04:14.606+05	2026-08-11 10:59:52.488713+05
74a4b51b-4dc6-44a9-b067-04fb6471ece7	c64f66c9-639f-4913-8d6e-0304d51f1c20	f13b112e4a68e30807168421902ea024c12d6c2fdb7a5bca6869209d12e0cb3b	2026-08-18 12:04:14.617+05	\N	2026-08-11 12:04:14.621388+05
c789eb4c-b591-4dcd-9c00-cdb2fcc341ae	5269a7da-0db6-49b8-97eb-c2d482cb611a	0ebf2e8ae5afcf675ba6286f5e5612f4b9a688a47fde56d3d399dda06049ae45	2026-08-18 12:12:52.418+05	2026-08-11 12:27:53.008+05	2026-08-11 12:12:52.431546+05
642ace5c-7772-4a44-9633-4a5f0b81280c	5269a7da-0db6-49b8-97eb-c2d482cb611a	914ffcad4922df195a0b9c0c06960794fa77098322f0427abe52b697287edfd6	2026-08-18 12:27:53.027+05	\N	2026-08-11 12:27:53.031862+05
332eb880-77b4-4ee3-a53e-18572c1769b1	5269a7da-0db6-49b8-97eb-c2d482cb611a	cf1cd870d2e1a4a1e293fe80e8a21c1ea0d9d902c7bf2329a1f56280c7dcf98e	2026-08-18 13:51:14.664+05	\N	2026-08-11 13:51:14.694968+05
2ad68d86-9b88-4fb7-b313-6a2760cb088e	c64f66c9-639f-4913-8d6e-0304d51f1c20	3a4ea62e0e8a5870c83198f4bf3fa851521cdc3ccc42a31fbd565bf1efd3a10d	2026-08-18 14:04:27.423+05	\N	2026-08-11 14:04:27.432299+05
28187d35-7b25-464d-8e88-c98523eb25d4	5269a7da-0db6-49b8-97eb-c2d482cb611a	9e096f321a3bb158fb7ef6bc596c7454aa338cf889b86c4642cb94981b7bab3e	2026-08-18 15:58:34.058+05	\N	2026-08-11 15:58:34.121097+05
20b8ac3d-80d8-46f2-829d-d52984e72945	5269a7da-0db6-49b8-97eb-c2d482cb611a	c0d0c1bc80b287cad36ad89f0b8b6ed1e4eccdb94b8ee8fcc12db3c5ac279f6e	2026-08-18 16:34:59.063+05	\N	2026-08-11 16:34:59.090271+05
1218c733-521a-4620-8e62-f84645e2d393	5269a7da-0db6-49b8-97eb-c2d482cb611a	f951d1a67f864787ae247e5f0ed5c989516c4b6b9792ad883826a7f5ce0070a0	2026-08-18 16:50:11.511+05	\N	2026-08-11 16:50:11.537848+05
f672d8fc-ec7f-4faf-ad01-cabf2a8047b8	c64f66c9-639f-4913-8d6e-0304d51f1c20	8f329a055389b48ef95f709a5a0a7f848d806fc41c2dfad5d03ebfc92292a96d	2026-08-18 16:50:29.436+05	\N	2026-08-11 16:50:29.447947+05
07ec88b3-29b1-45f4-9e5d-51998b6c7068	c64f66c9-639f-4913-8d6e-0304d51f1c20	9e41c57921ab388dc4eb495dc0458256da7d0f36b21de3c18eb78f3998c556f6	2026-08-18 17:02:47.744+05	\N	2026-08-11 17:02:47.752032+05
4fc6226a-f233-45a5-a25a-61a2b198b0c3	c64f66c9-639f-4913-8d6e-0304d51f1c20	bd79506872b48453179dd5c9c6e47d5a3a07eff6830f774b19e67d90cc12a937	2026-08-18 17:02:53.38+05	\N	2026-08-11 17:02:53.385726+05
24205dd5-6461-476f-925b-d5bd133d6cdd	5269a7da-0db6-49b8-97eb-c2d482cb611a	57b96f89bf05bf25ed011ff39fb53c3777208f5865c5eaa3991273a0966670e9	2026-08-18 17:22:31.853+05	\N	2026-08-11 17:22:31.867687+05
6cdda186-fa21-4482-b734-eed90fb1cb37	5269a7da-0db6-49b8-97eb-c2d482cb611a	30fbabdb1cd8d8a2d74a7dc340b9c83d1a04c4517f7828e06e88b84f05c87815	2026-08-18 17:36:01.507+05	\N	2026-08-11 17:36:01.515605+05
a53f2e58-9c54-4a7a-866d-18c289f148c6	c64f66c9-639f-4913-8d6e-0304d51f1c20	d37f07a1de6610669390751c2130fd64896bf9814e506307de196fd06d2b4fba	2026-08-18 17:37:10.266+05	\N	2026-08-11 17:37:10.274285+05
b956aa47-aeab-456b-b251-005cbd9c42a0	5269a7da-0db6-49b8-97eb-c2d482cb611a	5e3064d4a8647a64b7d6e56150c614a37ad3262cb23695baf5412a952ac0eddf	2026-08-18 17:53:00.757+05	\N	2026-08-11 17:53:00.768345+05
5300c91e-3595-47e5-bcbf-1234b5d10c6b	5269a7da-0db6-49b8-97eb-c2d482cb611a	ac3b0bb6e561ce0b642553ddb1f20eb0423af0992b70cb4de75c25a62c3479a3	2026-08-18 18:18:31.243+05	\N	2026-08-11 18:18:31.263372+05
71de0f29-9ef3-4f54-9db8-d4a82a4754ac	5269a7da-0db6-49b8-97eb-c2d482cb611a	4d39c10a0e84e0ec53c85bd289fb2655e445667969954f8b31603c09b3ba85dd	2026-08-18 18:29:12.839+05	\N	2026-08-11 18:29:12.854426+05
6c35905e-5a9c-4a80-967d-16ef603ddb79	5269a7da-0db6-49b8-97eb-c2d482cb611a	8b97ccff48166385525bdde06af14349050e1e6ff5c399c49d2d63bdda1cb926	2026-08-18 18:56:31.665+05	\N	2026-08-11 18:56:31.693895+05
0ca39b22-bbf5-4941-9733-e649dd84c16c	5269a7da-0db6-49b8-97eb-c2d482cb611a	fad6796591d3b9f09152add5fe6d3a93219f78e2158c084ec0a7bb7d11f2b730	2026-08-18 19:17:58.742+05	\N	2026-08-11 19:17:58.764156+05
049d5518-deb2-4e7a-b457-cd2db5a2930b	c64f66c9-639f-4913-8d6e-0304d51f1c20	cf8006e587ea70751d6c46c0a96552c77377252249e0955b19aeab321c8eb3c5	2026-08-18 19:20:47.802+05	\N	2026-08-11 19:20:47.811982+05
6171cb8c-d57e-4032-a4d5-aeb47e19206a	5269a7da-0db6-49b8-97eb-c2d482cb611a	1d7ed0e3ed03ef59145d9da456d80bf981eb72831d3496a23b3cf6c56213cad5	2026-08-18 19:22:29.832+05	\N	2026-08-11 19:22:29.84648+05
bac940e3-6b42-463c-8bdb-23ed4d7e63ab	5269a7da-0db6-49b8-97eb-c2d482cb611a	61ba82d0ce4e697a280f043e45a1e1c6414e4b1bc87243e8326ae3249d271c9b	2026-08-18 19:39:38.183+05	\N	2026-08-11 19:39:38.198024+05
99f07218-eb46-4a67-8d57-bd061eaaaf7d	5269a7da-0db6-49b8-97eb-c2d482cb611a	5aea954cb52db67169fe22b03ede6aff5ee8f9a9d48bdfbfdc8b95ab05b15389	2026-08-18 20:32:31.355+05	\N	2026-08-11 20:32:31.407156+05
11a8db8d-9751-48c7-8594-13d1c8d4b2e3	43af610e-e846-4f7c-88bd-c51fc43f0d12	890d4e28749153d2f32148f126492ebf1490ff9f50209186ed9eae4d24f6d644	2026-08-18 20:37:13.55+05	\N	2026-08-11 20:37:13.563209+05
27389654-9dc5-4e48-9cb4-2a08eeca1b7f	5269a7da-0db6-49b8-97eb-c2d482cb611a	bcee61d7f22b643f0b5f475b38a603a0d44060defc63aa667b3c95670d1d7c56	2026-08-18 20:38:30.526+05	\N	2026-08-11 20:38:30.542098+05
38614c59-56bf-4238-a289-2074bf5dd98a	43af610e-e846-4f7c-88bd-c51fc43f0d12	6f109c68ee82fa69562986b9871b2acc68dad0365c1d8aefd4659f9aa390d2b9	2026-08-18 20:40:30.592+05	\N	2026-08-11 20:40:30.604184+05
2722d0ee-0457-46f1-97e1-4f3fe74a08d0	5269a7da-0db6-49b8-97eb-c2d482cb611a	a80b31a112051778feea9e214db1a9e8823feabfb90fbbcecc073e557bbbb49f	2026-08-18 20:41:09.446+05	\N	2026-08-11 20:41:09.45919+05
0296ecd9-aba4-4569-8f3f-aeb85a5aa856	c64f66c9-639f-4913-8d6e-0304d51f1c20	ebadbe5bff25ea9f3feb06ae7dd519c96679405fcb591fbf028ba8d1b867b531	2026-08-18 20:47:25.673+05	\N	2026-08-11 20:47:25.683526+05
097ab5af-8799-4a5e-b293-b9d90350a9ac	5269a7da-0db6-49b8-97eb-c2d482cb611a	df0568f3d0c12f552d9ba8e3762e197c670fa8f79b99cd8991f21adead8dc51c	2026-08-18 20:58:58.541+05	\N	2026-08-11 20:58:58.555766+05
501707c8-99e4-4608-9cdd-af8e509304f3	43af610e-e846-4f7c-88bd-c51fc43f0d12	e57226f10484e5719d2a3c505a670a68ce8430e28c91adba52f38bba0ea9407b	2026-08-18 20:59:11.295+05	\N	2026-08-11 20:59:11.307755+05
0f90dafa-9962-4822-980f-e9bdffc895c8	43af610e-e846-4f7c-88bd-c51fc43f0d12	9677a64ef9324d3e05cce977aff2e060d2c669dba061927abc5754e3adaadca9	2026-08-18 21:00:47.652+05	\N	2026-08-11 21:00:47.669467+05
ba643c60-8c3d-45b2-9f93-391c35199a63	c64f66c9-639f-4913-8d6e-0304d51f1c20	735f8687495207d1508eb5b420d47326b143d871418f258ed40789c524da47bf	2026-08-18 21:03:12.212+05	\N	2026-08-11 21:03:12.223308+05
aa355439-436b-47dd-b024-2a2674f7def8	5269a7da-0db6-49b8-97eb-c2d482cb611a	d625f5fbbf96b8b74f42b7f28785151b075f2558a07b9e2f633c8b597e112770	2026-08-18 21:11:28.606+05	\N	2026-08-11 21:11:28.618881+05
11a23895-035d-4666-adda-6c1d2d1f965d	43af610e-e846-4f7c-88bd-c51fc43f0d12	4520324fd3114149526cfd40eb656a527611b176737403d1671c9513ec900d67	2026-08-18 21:21:36.361+05	\N	2026-08-11 21:21:36.371378+05
783fdf57-5aeb-479a-b46c-c69409a8eebe	c64f66c9-639f-4913-8d6e-0304d51f1c20	22698041d32d4c132572fbc21cbd230e3a3112151becf6acb996bc7789a773fa	2026-08-18 21:21:38.891+05	\N	2026-08-11 21:21:38.900202+05
3bb68f40-e6bc-4af7-b5be-b9e62822df63	43af610e-e846-4f7c-88bd-c51fc43f0d12	4d8ca5356de282385edfc9e30db97322b7a176feb46d3dbb4aa9dc32d1515141	2026-08-18 21:21:42.58+05	\N	2026-08-11 21:21:42.584422+05
f7cada30-4689-43b4-b184-417117ccf501	5269a7da-0db6-49b8-97eb-c2d482cb611a	8a971bb08920e07e2b471e2b21f09c3b1216ea411f5b539169f4e44c1c636b6e	2026-08-18 21:26:56.535+05	\N	2026-08-11 21:26:56.548199+05
a4c0c797-78cd-418f-b136-0b45bdcc52be	5269a7da-0db6-49b8-97eb-c2d482cb611a	6875f9fe0d4efdca7142d8093cf1c8195beaafc68e0cac14ca2a200632194ebd	2026-08-18 21:41:59.509+05	\N	2026-08-11 21:41:59.523501+05
c7765f70-ea0a-4450-9170-7a8a0b4e8764	43af610e-e846-4f7c-88bd-c51fc43f0d12	e2bb959ab3826ac16cbd99e0b135e7f8a199f94b38d61b5071ed73bc9df540dd	2026-08-18 21:44:49.997+05	\N	2026-08-11 21:44:50.008184+05
e188bbd1-f555-49cd-b773-b307e7ecba11	5269a7da-0db6-49b8-97eb-c2d482cb611a	5ed02e3f75e0ee8dcfa8753cac0b06f00d9cf16658abe50a31865ab451255883	2026-08-18 21:59:08.054+05	\N	2026-08-11 21:59:08.065282+05
a3d2c910-dfc3-4400-8a8e-6750f7e132a5	5269a7da-0db6-49b8-97eb-c2d482cb611a	4749b8d223efd30d19dd9aed0c093a9f5212932889f06df2036392fabf0e2d2a	2026-08-19 09:23:10.678+05	2026-08-12 09:38:30.212+05	2026-08-12 09:23:10.700783+05
df84fb18-5345-4e63-8502-b3d1280cc16b	5269a7da-0db6-49b8-97eb-c2d482cb611a	fb04e951273ea1a14e9a4f72aad444f9154e4ba35ff26ca1448cacb6ae7b725f	2026-08-19 09:38:30.221+05	2026-08-12 09:53:55.223+05	2026-08-12 09:38:30.221942+05
2a29416c-359e-4e67-81bd-865b4d0669a4	5269a7da-0db6-49b8-97eb-c2d482cb611a	f36ea3490ca83e7092e0ae6c7a422a027d816a9c6a2cb56a0eb54cb5dca28039	2026-08-19 09:53:55.23+05	\N	2026-08-12 09:53:55.231059+05
20b9ab65-8d7f-491f-aafc-fa230f97d48b	5269a7da-0db6-49b8-97eb-c2d482cb611a	1fda241c49b154b48f88665e3e61488c412fd4ace7d39d60aab718937d804d6b	2026-08-19 10:06:11.721+05	\N	2026-08-12 10:06:11.735656+05
98dfd28f-8a30-42f3-a91c-5444a7a246e8	5269a7da-0db6-49b8-97eb-c2d482cb611a	cfeca931e75ec3cda9a2f4e91696d0d0da2024b7f6baf22d9c30ae08e936b050	2026-08-19 10:13:35.618+05	2026-08-12 10:30:07.946+05	2026-08-12 10:13:35.630975+05
d7a0b8c1-7442-498b-abe2-8d99cd3824fd	5269a7da-0db6-49b8-97eb-c2d482cb611a	ccecf4ba5d16c910a992792d1113bf6c23ab7e1b2ff18bfe37d1f92f67076007	2026-08-19 10:30:07.98+05	2026-08-12 10:30:08.361+05	2026-08-12 10:30:07.984274+05
691739f2-3b4d-4b63-a0bf-f8024cd17972	5269a7da-0db6-49b8-97eb-c2d482cb611a	1406505b7b49c1462931951a073b03b6f79377d02798c5fb7fe4fd0fd516d9f9	2026-08-19 10:30:08.568+05	2026-08-12 10:33:30.149+05	2026-08-12 10:30:08.645504+05
ef97028c-a180-496b-9f02-4edd600aa332	5269a7da-0db6-49b8-97eb-c2d482cb611a	99d75c94dcd9c81e350fd33d9b747cae012ba5b555c8bcaaaa7b8b40e384f327	2026-08-19 10:33:32.193+05	2026-08-12 10:39:01.86+05	2026-08-12 10:33:32.198741+05
7cd19cfa-6c46-4c35-989e-44593ee4c0b9	5269a7da-0db6-49b8-97eb-c2d482cb611a	33450fbe75740e57cf46d62d4af7ae9d81068e43e84fd2fabe275e7e3bf816f8	2026-08-19 10:39:47.815+05	2026-08-12 10:55:30.909+05	2026-08-12 10:39:47.8188+05
66d665e2-3eb2-442b-8887-43bd36992379	5269a7da-0db6-49b8-97eb-c2d482cb611a	dd6f6e787edda35a9ebf72ca4bf371428a7ff80aadd31dfc2b006b7cfd6047d1	2026-08-19 10:58:20.309+05	\N	2026-08-12 10:58:20.323122+05
b36398fe-7752-4a29-9faf-c4ca717258ba	5269a7da-0db6-49b8-97eb-c2d482cb611a	6e65e44392b3bd5e86db1124042fe86ebfbc989f13a79586b46bde7206e198e9	2026-08-19 10:55:30.925+05	2026-08-12 11:01:49.247+05	2026-08-12 10:55:30.927819+05
d865c00b-04c6-4448-879d-bcc951cb7bb7	5269a7da-0db6-49b8-97eb-c2d482cb611a	80d29b8f81bf0d2b39360b65c8d05a489cdaeaf7fca6ae8737e874b2d18f5177	2026-08-19 11:01:52.768+05	2026-08-12 11:17:30.914+05	2026-08-12 11:01:52.772102+05
42ed5797-d769-4ea4-bc6d-c2be379856bb	5269a7da-0db6-49b8-97eb-c2d482cb611a	9ed6d3f0174a5dea6ee8754f62a020d64b53e3b776181f7043f8313f2ad8f77a	2026-08-19 11:17:30.927+05	2026-08-12 12:22:21.162+05	2026-08-12 11:17:30.9294+05
2296748f-5ea2-4a04-b3db-328c28fde246	5269a7da-0db6-49b8-97eb-c2d482cb611a	7d19a500ba68a58221b4e726053e71a134c70d9458a2fd4e39df5344005bf452	2026-08-19 12:22:21.172+05	2026-08-12 12:33:26.688+05	2026-08-12 12:22:21.175372+05
e924092a-0d6c-45b7-a3ea-0f7c9f08ebc4	5269a7da-0db6-49b8-97eb-c2d482cb611a	e6fdebda13cd684e0f33d680f2a2227a93fba4058f0b190f5dc8cc20b34e7ad0	2026-08-19 12:45:00.429+05	\N	2026-08-12 12:45:00.47292+05
1ba08e4b-d942-477f-a4ea-8ac47945be35	5269a7da-0db6-49b8-97eb-c2d482cb611a	dc26af58832957a4f4e53bf2b9b3f4250d57b33e0cc1ce18646a00476a0f16cc	2026-08-19 13:04:36.898+05	\N	2026-08-12 13:04:37.044858+05
45ce5e3e-ab56-4fa3-9288-e63d2d17931d	5269a7da-0db6-49b8-97eb-c2d482cb611a	e55337948f18891f1907a1056484c8ebc8e504986f3357a9b68fa0c85c2ed50d	2026-08-19 13:22:55.59+05	\N	2026-08-12 13:22:55.611284+05
3629c00a-e877-4f3d-9128-fc3d534af32a	5269a7da-0db6-49b8-97eb-c2d482cb611a	46fdf55a7fc2f8dcbbe3b3ea8a7b6684c0eb77d41126a816bf06bdf418793361	2026-08-19 13:40:35.924+05	\N	2026-08-12 13:40:35.937539+05
7380ed81-0e9f-49e5-b044-08d6cbafbdd3	5269a7da-0db6-49b8-97eb-c2d482cb611a	b9090c81cb087715a9817e1961bdbdf1d69c697e180a1c33047dcdd3bc83747a	2026-08-19 13:57:21.464+05	\N	2026-08-12 13:57:21.474396+05
d3c1ef32-59b7-4afd-a7f1-8ab80b2fcfae	5269a7da-0db6-49b8-97eb-c2d482cb611a	118cfe5b0155fef4c5ddd2946aff95e9fc1f7be856d92b04f29654e4e9380a7e	2026-08-19 14:14:43.789+05	\N	2026-08-12 14:14:43.823344+05
50a2d099-a00e-4a6b-b16f-3e0b8c5fd183	43af610e-e846-4f7c-88bd-c51fc43f0d12	3a133934b307de307153e2a80ae397691bdb9bfc50af1a7fe0a4080cede2278d	2026-08-19 14:26:57.376+05	\N	2026-08-12 14:26:57.381735+05
62e7d5aa-b9d5-4e2c-a068-56b8f7d4e699	5269a7da-0db6-49b8-97eb-c2d482cb611a	c6484d0118eb01c7a8a8c103e55b8824b59bb172110d8d60e25555a7d4e63e22	2026-08-19 14:34:59.87+05	\N	2026-08-12 14:34:59.880266+05
44b733a9-79b5-4955-8519-c5001e7522e3	5269a7da-0db6-49b8-97eb-c2d482cb611a	98bbdf448fbd107a316ba5d2e55c80e94a65623a752f2fe1e9f8920bbc9c6497	2026-08-19 16:18:14.248+05	\N	2026-08-12 16:18:14.278614+05
3e9d30dd-533d-4d34-91ef-b353df528967	5269a7da-0db6-49b8-97eb-c2d482cb611a	fc3c73b7e800ee3267f2e90912a1e57c2bda76c581f3e8b0dfcc3008aa9d3a0d	2026-08-19 16:37:56.556+05	\N	2026-08-12 16:37:56.585503+05
6576612e-e152-4e22-ac75-49af8cfe7003	5269a7da-0db6-49b8-97eb-c2d482cb611a	d4ec001f181fa288dc751c8633a4ba78b802077c3b14723f1775c94e7cf91034	2026-08-19 17:04:47.745+05	\N	2026-08-12 17:04:47.768056+05
c793b0bd-cb5f-4dbe-b157-592a4f752a55	5269a7da-0db6-49b8-97eb-c2d482cb611a	d269c440cb6b9d9cf697232cbbc9721393741b5ce7a9faea4d4557259dc7ac44	2026-08-19 17:28:33.174+05	\N	2026-08-12 17:28:33.200159+05
3eee3a89-28e9-4cd8-915b-71e0fb3b8af0	5269a7da-0db6-49b8-97eb-c2d482cb611a	128804d34486f87e062c389414cde0b206c2598e5488473fe4212ae0d5ecd3c5	2026-08-19 17:46:29.948+05	\N	2026-08-12 17:46:29.973965+05
294bc1b7-9fb2-4e92-91c3-03166b9e2fb0	5269a7da-0db6-49b8-97eb-c2d482cb611a	0d3366f2b9f672cf1f7a5a81e2858c11bfc68128e3e85859fb07a4fcd0ce4618	2026-08-19 18:26:42.944+05	\N	2026-08-12 18:26:42.981784+05
ab6d9f3d-dc3f-48f0-a2ba-ed2e3b8e9a35	5269a7da-0db6-49b8-97eb-c2d482cb611a	9ad3714fe5e57edc1991456dca5f1045e8de53f8bfaa3352dc2d2117ceda8dce	2026-08-19 18:44:27.687+05	\N	2026-08-12 18:44:27.697535+05
d4b5ffb2-7ab2-441f-a64e-6febf2b09978	5269a7da-0db6-49b8-97eb-c2d482cb611a	93cdb1ceaee950bc1c0e8b7ea7578774c1831227d18654da298a49695c9fdd9d	2026-08-19 19:31:10.031+05	\N	2026-08-12 19:31:10.100667+05
\.


--
-- Data for Name: reimbursements; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.reimbursements (reimbursement_id, user_id, title, category, amount, expense_date, description, receipt_url, status, decided_by, decided_at, decision_note, paid_period_id, paid_payslip_id, created_at, updated_at) FROM stdin;
953758ba-8239-45b3-a26a-8840296758b6	c64f66c9-639f-4913-8d6e-0304d51f1c20	Client visit taxi (E2E Verify)	Travel	3500.00	2026-10-05	Filed by verify-payroll-e2e.	\N	paid	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	2026-08-11 18:10:23.265+05	Receipt verified.	8e1c7908-84aa-4b65-9aa4-d0e78e4dfaad	f83830ee-70d5-49f3-a524-7043df125dce	2026-08-11 18:10:23.002985+05	2026-08-11 18:10:24.217318+05
5794e838-015d-40d4-a028-adc166f2ea72	c64f66c9-639f-4913-8d6e-0304d51f1c20	Client	Travel	20000.00	2026-08-11	\N	\N	paid	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-11 17:39:41.79+05	\N	7df2fd08-d84e-465b-93a4-1d4320388650	1647bac1-f687-4a63-b455-d229796d42a1	2026-08-11 17:39:24.743303+05	2026-08-11 18:19:27.071468+05
b5a115cf-0b27-4dc8-b8c1-c96fbbb1f0b9	c64f66c9-639f-4913-8d6e-0304d51f1c20	Client visit taxi (E2E Verify)	Travel	3500.00	2026-10-05	Filed by verify-payroll-e2e.	\N	paid	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	2026-08-11 18:19:28.074+05	Receipt verified.	e58d7e45-e64f-4204-9518-a28be5cbb016	06fe26ed-f208-4466-a888-ab33118649a8	2026-08-11 18:19:27.902981+05	2026-08-11 18:19:28.8153+05
a2f77372-e846-49c2-9ded-a7040aa8da8c	c64f66c9-639f-4913-8d6e-0304d51f1c20	Client visit taxi (E2E Verify)	Travel	3500.00	2026-10-05	Filed by verify-payroll-e2e.	\N	paid	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	2026-08-11 18:19:47.552+05	Receipt verified.	39aba0a9-4946-4284-8b47-85dbe87992ab	210b8f6c-cadd-4e46-a38c-a22b83c6cb86	2026-08-11 18:19:47.394129+05	2026-08-11 18:19:48.295588+05
6a8f6305-7733-483d-896c-97fe0ab1bbe9	c64f66c9-639f-4913-8d6e-0304d51f1c20	UI walkthrough — client dinner	Meals	2750.00	2026-08-07	Filed from the employee Claims tab during verification.	\N	approved	5269a7da-0db6-49b8-97eb-c2d482cb611a	2026-08-12 09:31:51.497+05	\N	\N	\N	2026-08-11 18:30:20.228049+05	2026-08-12 09:31:51.498706+05
\.


--
-- Data for Name: review_approvals; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.review_approvals (approval_id, review_id, action, actor_user_id, comment, created_at) FROM stdin;
fd21ccc7-c2ef-41fb-9205-853dca6d0569	e096814b-0d8a-4160-aa9c-31e534068f4d	SUBMIT	c64f66c9-639f-4913-8d6e-0304d51f1c20	\N	2026-08-11 20:48:43.77159
\.


--
-- Data for Name: role_permissions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.role_permissions (role_permission_id, role_id, permission_id, created_at) FROM stdin;
9269f4c2-7383-4ae1-b2b8-addfe4701685	53cd533c-13a9-400f-93f5-2fb207239874	67a36a67-1a37-4362-80e8-328dbd8ddbd5	2026-07-24 20:16:55.285413
6b8f2d34-11db-4a8c-b928-b30076793ff5	53cd533c-13a9-400f-93f5-2fb207239874	ee643269-d023-4b52-a9d3-caf40acfcdcd	2026-07-24 20:16:55.285413
8b49476f-36fb-4bd6-b7a0-52283bada2fa	53cd533c-13a9-400f-93f5-2fb207239874	1d032f5d-493c-4019-8668-7c055dbd1959	2026-07-24 20:16:55.285413
dca97441-0de9-4aac-9382-1c94d440a4d7	e2b8726d-107c-4504-b98d-835515772a26	67a36a67-1a37-4362-80e8-328dbd8ddbd5	2026-07-24 20:16:55.285413
88bfbbd2-3c12-4fb7-8ceb-7bcc5c5afc1e	e2b8726d-107c-4504-b98d-835515772a26	ee643269-d023-4b52-a9d3-caf40acfcdcd	2026-07-24 20:16:55.285413
828e0214-b3fa-4f36-9c75-304e2789e959	e2b8726d-107c-4504-b98d-835515772a26	1d032f5d-493c-4019-8668-7c055dbd1959	2026-07-24 20:16:55.285413
4c48917b-1868-41ef-a1d6-758359e46889	53cd533c-13a9-400f-93f5-2fb207239874	6dd7e925-a032-4214-8b5d-bf2ff7d311be	2026-08-01 16:07:51.898906
9238584d-b98a-4815-bdbe-412140551f98	53cd533c-13a9-400f-93f5-2fb207239874	cf10080c-8632-4e39-b141-9b20b8c32023	2026-08-01 16:07:51.898906
3a80975c-af25-4f55-87cb-efb2df12c0ea	53cd533c-13a9-400f-93f5-2fb207239874	db5c84df-d810-470b-b3d3-f26bbaa992d8	2026-08-01 16:07:51.898906
fe00ebac-63c3-4976-b9ae-77944a5638f3	53cd533c-13a9-400f-93f5-2fb207239874	28909d84-a799-485a-ad25-31f0a124b8a7	2026-08-01 16:07:51.898906
1c4ddbfe-d798-4964-adda-cda5761f7cb7	1974e6ed-0de8-40e9-b951-f3e76208abea	ee643269-d023-4b52-a9d3-caf40acfcdcd	2026-07-24 20:16:55.285413
6347a76c-8f09-43b8-bc85-c5fb098ccd95	1974e6ed-0de8-40e9-b951-f3e76208abea	1d032f5d-493c-4019-8668-7c055dbd1959	2026-07-24 20:16:55.285413
79564a52-98e0-4c4e-b91b-47e904de55bb	53cd533c-13a9-400f-93f5-2fb207239874	1a8ab615-bb7a-4b66-848b-9204fd386584	2026-08-01 16:07:51.898906
c5f74379-fd44-45d1-84f3-00be7caae942	53cd533c-13a9-400f-93f5-2fb207239874	8f64dc3b-deab-4c18-88be-79c99318ad8b	2026-08-01 16:07:51.898906
6b6eea4c-422c-4e23-870c-2d2484fcb5c2	e2b8726d-107c-4504-b98d-835515772a26	6dd7e925-a032-4214-8b5d-bf2ff7d311be	2026-08-01 16:07:51.898906
1c3cdf34-b81a-4dc6-8956-5a33585e78b6	53cd533c-13a9-400f-93f5-2fb207239874	99993d4f-ea72-4877-a5e4-e7126c6c53c4	2026-07-30 20:30:12.467026
c22876ff-e742-4736-bfb0-d880114c39b9	e2b8726d-107c-4504-b98d-835515772a26	cf10080c-8632-4e39-b141-9b20b8c32023	2026-08-01 16:07:51.898906
e8cf1e42-baa5-4b24-8078-9dd08481caf1	53cd533c-13a9-400f-93f5-2fb207239874	4ccb1763-f2ab-452d-9ebb-db6f43fc8a3f	2026-07-30 20:30:12.467026
5bd41346-bd6b-4991-9f95-15382f8bd09d	53cd533c-13a9-400f-93f5-2fb207239874	9e7300a0-5203-4c58-99a7-86e61873cfb9	2026-07-30 20:30:12.467026
63c14b11-ecc6-4ea5-ac50-e8d748f0eb4d	53cd533c-13a9-400f-93f5-2fb207239874	70fc3974-f889-4005-b522-87e17609214d	2026-07-30 20:30:12.467026
88e3fbb0-005f-4362-b940-e2524abc4813	53cd533c-13a9-400f-93f5-2fb207239874	0e7e6da7-16a3-4595-9818-ddd3715130b8	2026-07-30 20:30:12.467026
f49fd2f2-9b4b-4036-810b-58e96409568e	53cd533c-13a9-400f-93f5-2fb207239874	73fcd5f4-a41d-4318-98f9-0ba19c50fec5	2026-07-30 20:30:12.467026
8f97a862-8625-4b97-8352-2b0b551b941d	53cd533c-13a9-400f-93f5-2fb207239874	aef265cd-e15e-44e4-8742-27856117e73f	2026-07-30 20:30:12.467026
2b61521e-2e98-45b4-be46-d28024701a6a	53cd533c-13a9-400f-93f5-2fb207239874	7bcfcbe7-1113-4008-a07f-8ad1f50d8dd4	2026-07-30 20:30:12.467026
3cbc3589-0176-4ac1-a60c-3d46a444b84d	53cd533c-13a9-400f-93f5-2fb207239874	7ce5e22d-a818-41a7-b0dd-ecb6c4e88874	2026-07-30 20:30:12.467026
f2f0124c-a075-44fc-a1bb-5dea0c3f14f1	53cd533c-13a9-400f-93f5-2fb207239874	f0e98ae7-e219-4488-a740-5c2101422f86	2026-07-30 20:30:12.467026
80836ac6-2f22-4491-bd47-0ed2d6571ef2	53cd533c-13a9-400f-93f5-2fb207239874	e7ded78c-bf45-4f0f-80b1-8a07762c8287	2026-07-30 20:30:12.467026
5b200858-3220-48e6-a963-8045fdc027f6	53cd533c-13a9-400f-93f5-2fb207239874	3b30c266-3221-464b-86e8-7db8d13da0fc	2026-07-30 20:30:12.467026
6c3881a3-e736-4581-9e50-77353c3fa40e	53cd533c-13a9-400f-93f5-2fb207239874	651b72d8-4888-4c22-bf27-e77f92a61c10	2026-07-30 20:30:12.467026
8575509a-c7af-4618-bbe2-2f42d43905ae	53cd533c-13a9-400f-93f5-2fb207239874	98693c79-9753-4047-8ee6-8d161a25a56f	2026-07-30 20:30:12.467026
d5569089-843d-4a5b-a0e1-27099cefdb29	53cd533c-13a9-400f-93f5-2fb207239874	adebee34-d381-40ab-91b0-d49c021290dd	2026-07-30 20:30:12.467026
16c8d9de-77d9-46de-84c9-2f19e327cc14	53cd533c-13a9-400f-93f5-2fb207239874	c511eeb2-9e7c-40c6-8ab1-b241e83b8a3e	2026-07-30 20:30:12.467026
5ca9f4bc-e1ca-4eb3-842e-24542a863027	53cd533c-13a9-400f-93f5-2fb207239874	0f06f2a6-1eaf-4b32-8256-e052681914e6	2026-07-30 20:30:12.467026
0c09b785-80ca-4e5a-a35c-d5fe3e468591	53cd533c-13a9-400f-93f5-2fb207239874	17c13aad-7963-4620-a11b-06e247b1b873	2026-07-30 20:30:12.467026
af839b54-1d0d-4458-868a-bc17e02258a4	53cd533c-13a9-400f-93f5-2fb207239874	9f5734eb-0f25-423f-9d73-4f6064537472	2026-07-30 20:30:12.467026
ca9442ef-a890-4e42-a0d5-788e0549dfb7	53cd533c-13a9-400f-93f5-2fb207239874	e88b839b-cad4-48e0-830d-6e845162c9c4	2026-07-30 20:30:12.467026
ee3af620-d2dc-4f4f-87c5-02df1af691c1	53cd533c-13a9-400f-93f5-2fb207239874	58f77d7a-c0f1-4726-9eb8-a3fb4cca95e5	2026-07-30 20:30:12.467026
2d2ff8b9-f647-4160-bb56-38327e665774	53cd533c-13a9-400f-93f5-2fb207239874	3bcdae8c-f4b6-4c76-b6c0-70bdc8ad1fe8	2026-07-30 20:30:12.467026
90d7631e-71b5-47d2-b029-d2be9947e865	53cd533c-13a9-400f-93f5-2fb207239874	d9519e47-ae1d-4b6b-a758-16ce5f2f7a63	2026-07-30 20:30:12.467026
03d94d73-80bf-464b-bc78-3fffbce30750	53cd533c-13a9-400f-93f5-2fb207239874	babd7004-a6e5-4c0b-ba07-b63309109e22	2026-07-30 20:30:12.467026
984493cd-ee5e-4c74-bbfe-0c2cb2fb4fc8	53cd533c-13a9-400f-93f5-2fb207239874	e2969729-4620-4910-8585-6a2f3d01ffe0	2026-07-30 20:30:12.467026
f51b11f8-8ba6-4d77-9e58-ca5c9c0b3231	53cd533c-13a9-400f-93f5-2fb207239874	4d019099-629a-4602-987c-0ff95d5784aa	2026-07-30 20:30:12.467026
e94f8c17-597e-433b-b7af-f3780d61de9d	53cd533c-13a9-400f-93f5-2fb207239874	1016de93-9e5e-4c89-a224-72a3904bbead	2026-07-30 20:30:12.467026
b35f0afc-b6e2-4ba0-8a5e-31008aac2d57	53cd533c-13a9-400f-93f5-2fb207239874	786b92b2-599a-41e9-a56c-5bd9fe8b01aa	2026-07-30 20:30:12.467026
6e998ae2-30c6-4f04-869e-f9b43bf549a2	53cd533c-13a9-400f-93f5-2fb207239874	a271a740-a018-4bbd-8c16-2abaa48373c6	2026-07-30 20:30:12.467026
31844390-5664-43e8-93f1-5b7d812052d7	53cd533c-13a9-400f-93f5-2fb207239874	ab76c75d-881e-4169-80e5-83db4c153d44	2026-07-30 20:30:12.467026
0b8cf8ab-ba19-474d-8187-bc9ed2861e5f	53cd533c-13a9-400f-93f5-2fb207239874	cb2302c6-f2da-4333-9b98-24245f468b1e	2026-07-30 23:56:30.356349
edd11691-86b7-4dec-a500-493fd61f0cef	53cd533c-13a9-400f-93f5-2fb207239874	efbb62bd-e51d-4f01-80ce-0363d440bd41	2026-07-30 23:56:30.307165
3ac009f1-1178-4c82-895d-90a0db9ec2b3	53cd533c-13a9-400f-93f5-2fb207239874	41803582-c338-424e-9e97-1ba7abc139a1	2026-07-30 23:56:30.40468
78b68b3b-5775-4abd-a309-ac1f5ca24236	e2b8726d-107c-4504-b98d-835515772a26	db5c84df-d810-470b-b3d3-f26bbaa992d8	2026-08-01 16:07:51.898906
96f7166c-1ac9-433d-ab8e-f199b03c1920	e2b8726d-107c-4504-b98d-835515772a26	28909d84-a799-485a-ad25-31f0a124b8a7	2026-08-01 16:07:51.898906
8a9a30e4-2177-4f17-acfb-811074ae27c3	e2b8726d-107c-4504-b98d-835515772a26	8f64dc3b-deab-4c18-88be-79c99318ad8b	2026-08-01 16:07:51.898906
fc96da80-b4d3-44bc-86eb-75de231000b2	e2b8726d-107c-4504-b98d-835515772a26	1a8ab615-bb7a-4b66-848b-9204fd386584	2026-08-01 16:07:51.898906
800a62f5-1506-490c-b075-a14ec41379c2	53cd533c-13a9-400f-93f5-2fb207239874	48c1ed30-3310-4552-babb-74f18c779d16	2026-07-30 23:56:30.455022
4c19e0a4-adb9-4cdb-8ab2-07d436696e08	562a8e2c-35be-4ea6-9fa8-48db5dc36606	cf10080c-8632-4e39-b141-9b20b8c32023	2026-08-01 16:07:51.898906
0d4d352f-0a3e-41b8-a371-569980197446	562a8e2c-35be-4ea6-9fa8-48db5dc36606	6dd7e925-a032-4214-8b5d-bf2ff7d311be	2026-08-01 16:07:51.898906
3584caac-14f0-43d5-a958-50b8e9e1f2a7	562a8e2c-35be-4ea6-9fa8-48db5dc36606	8f64dc3b-deab-4c18-88be-79c99318ad8b	2026-08-01 16:07:51.898906
761b3032-2201-4c62-8e18-c55ab23a37cc	562a8e2c-35be-4ea6-9fa8-48db5dc36606	1a8ab615-bb7a-4b66-848b-9204fd386584	2026-08-01 16:07:51.898906
9a3f3bc8-9ce1-4cfd-ba3e-6a518bbab690	562a8e2c-35be-4ea6-9fa8-48db5dc36606	db5c84df-d810-470b-b3d3-f26bbaa992d8	2026-08-01 16:07:51.898906
f5e346e4-4a3b-4abc-a32b-640071a37456	562a8e2c-35be-4ea6-9fa8-48db5dc36606	28909d84-a799-485a-ad25-31f0a124b8a7	2026-08-01 16:07:51.898906
42b752e5-592f-47b3-82f6-3219ce5d5645	53cd533c-13a9-400f-93f5-2fb207239874	4f89a6f0-cf90-4115-8dab-a9cd19730230	2026-07-30 23:56:30.521608
c1d92f6b-2cc1-497e-8f69-da804194341d	1974e6ed-0de8-40e9-b951-f3e76208abea	db5c84df-d810-470b-b3d3-f26bbaa992d8	2026-08-01 16:07:51.898906
fcf22f0f-f058-4871-ae40-6193a9a4c8ca	53cd533c-13a9-400f-93f5-2fb207239874	efbb62bd-e51d-4f01-80ce-0363d440bd41	2026-08-01 21:17:53.053299
34e232dd-9408-4503-9e25-d63757ef5f95	53cd533c-13a9-400f-93f5-2fb207239874	cb2302c6-f2da-4333-9b98-24245f468b1e	2026-08-01 21:17:53.163006
d03a71a8-c6a9-41c5-bdf2-cdae8df9f0a5	53cd533c-13a9-400f-93f5-2fb207239874	48c1ed30-3310-4552-babb-74f18c779d16	2026-08-01 21:17:53.193473
962c0fb6-cafe-4ad5-ab2f-e6f18c1cc27d	53cd533c-13a9-400f-93f5-2fb207239874	ee643269-d023-4b52-a9d3-caf40acfcdcd	2026-08-01 21:17:53.234613
995fd62e-d2b8-4491-b0c3-a7f04ee2f66f	53cd533c-13a9-400f-93f5-2fb207239874	ab76c75d-881e-4169-80e5-83db4c153d44	2026-08-01 21:17:53.26403
d354ab9b-5449-4b7e-a237-c682b17d848a	53cd533c-13a9-400f-93f5-2fb207239874	1016de93-9e5e-4c89-a224-72a3904bbead	2026-08-01 21:17:53.291745
c8111689-8868-4733-b25a-880132876622	53cd533c-13a9-400f-93f5-2fb207239874	99993d4f-ea72-4877-a5e4-e7126c6c53c4	2026-08-01 21:17:53.332429
35632588-bbda-4dde-94f7-1a0c206ca572	53cd533c-13a9-400f-93f5-2fb207239874	d9519e47-ae1d-4b6b-a758-16ce5f2f7a63	2026-08-01 21:17:53.375612
8e807275-6147-47ca-afdc-440ecbf5001f	53cd533c-13a9-400f-93f5-2fb207239874	e7ded78c-bf45-4f0f-80b1-8a07762c8287	2026-08-01 21:17:53.418254
06329e2b-cf74-43cd-bae2-05f9b650dcab	53cd533c-13a9-400f-93f5-2fb207239874	c511eeb2-9e7c-40c6-8ab1-b241e83b8a3e	2026-08-01 21:17:53.478338
546c0a45-1f0a-4ab5-a561-528462ca709b	53cd533c-13a9-400f-93f5-2fb207239874	4d019099-629a-4602-987c-0ff95d5784aa	2026-08-01 21:17:53.503968
94e01896-64ac-47e9-8455-44c123f71893	53cd533c-13a9-400f-93f5-2fb207239874	babd7004-a6e5-4c0b-ba07-b63309109e22	2026-08-01 21:17:53.547189
a3b76ec1-1511-4a48-ab2d-a39d75a6954a	53cd533c-13a9-400f-93f5-2fb207239874	9ae83958-dddd-4667-8b46-33f377b0e61c	2026-07-30 23:56:30.595997
d67ca254-3efd-4fb6-9ddd-6800bfc1a363	53cd533c-13a9-400f-93f5-2fb207239874	9e7300a0-5203-4c58-99a7-86e61873cfb9	2026-08-01 21:17:53.551216
826115c7-a0ca-43a5-861a-4774b0e4e344	53cd533c-13a9-400f-93f5-2fb207239874	17c13aad-7963-4620-a11b-06e247b1b873	2026-08-01 21:17:53.591299
ff002b7b-8597-49ef-90c1-f4b60fa1f8e9	53cd533c-13a9-400f-93f5-2fb207239874	e2969729-4620-4910-8585-6a2f3d01ffe0	2026-08-01 21:17:53.593649
55b48058-5432-4e2b-a94f-9ca72c1e843b	53cd533c-13a9-400f-93f5-2fb207239874	0f06f2a6-1eaf-4b32-8256-e052681914e6	2026-08-01 21:17:53.613357
bbd9e5bb-fa0d-419e-b985-76870c660c38	53cd533c-13a9-400f-93f5-2fb207239874	0e7e6da7-16a3-4595-9818-ddd3715130b8	2026-08-01 21:17:53.630681
570f3a64-6734-4f64-a211-11ddfaffeeee	53cd533c-13a9-400f-93f5-2fb207239874	aef265cd-e15e-44e4-8742-27856117e73f	2026-08-01 21:17:53.631886
1de115f0-9459-4071-b8b4-d1f009380326	53cd533c-13a9-400f-93f5-2fb207239874	651b72d8-4888-4c22-bf27-e77f92a61c10	2026-08-01 21:17:53.66644
39fca274-79ca-49c6-bac1-70baaae525ce	53cd533c-13a9-400f-93f5-2fb207239874	9ae83958-dddd-4667-8b46-33f377b0e61c	2026-08-01 21:17:53.683109
1b71dfd7-f553-4765-bae0-79adb92bc455	53cd533c-13a9-400f-93f5-2fb207239874	1a8873dd-eb12-4007-89ab-d84e2062e918	2026-08-01 21:17:53.684034
2dc3575c-ac5c-420b-9ffe-9f2430a7d3ca	53cd533c-13a9-400f-93f5-2fb207239874	61510cc9-0325-4dc4-b996-b9cf3c93ca80	2026-08-01 21:17:53.757165
26fe34b9-e54d-4782-ace5-0d1520f10ea4	53cd533c-13a9-400f-93f5-2fb207239874	1a8873dd-eb12-4007-89ab-d84e2062e918	2026-07-30 23:56:30.649745
1a1e224b-279a-4d20-811b-a9cb40ea9a79	53cd533c-13a9-400f-93f5-2fb207239874	61510cc9-0325-4dc4-b996-b9cf3c93ca80	2026-07-30 23:56:30.666284
9a0ca12e-e98d-4063-90dd-129414391e84	53cd533c-13a9-400f-93f5-2fb207239874	90be2ab6-38f8-4bde-9d80-199771e345c7	2026-07-30 23:56:30.666899
397a4527-3887-4db3-a232-3f76b3ed67c5	53cd533c-13a9-400f-93f5-2fb207239874	a18c261f-732b-4862-b6a4-bcf95bfbd9c9	2026-07-30 23:56:30.68041
9f598788-1c37-479a-8350-a7c31833e23b	53cd533c-13a9-400f-93f5-2fb207239874	9b880363-65ee-4794-bd47-55da52fd349c	2026-07-30 23:56:30.681012
c1a53a2e-e96c-4577-a0f5-37e501a6ae90	53cd533c-13a9-400f-93f5-2fb207239874	a12292d9-b3f3-4baf-bcac-68ae914a4d1d	2026-07-30 23:56:30.69618
a9d3eb14-0bff-4f4d-8f6c-039d55974763	53cd533c-13a9-400f-93f5-2fb207239874	0d4b1b91-4f35-4935-8857-b088767292a6	2026-07-30 23:56:30.792011
f4201eb7-62a4-4d7b-84ba-97116ddb6ee4	53cd533c-13a9-400f-93f5-2fb207239874	b3414ef7-b896-4c97-a8cb-6fc198e67047	2026-07-30 23:56:30.764098
fdc7337f-36ec-4a10-ba1a-a2926dfca591	53cd533c-13a9-400f-93f5-2fb207239874	3ae0c0f3-8d25-4d71-8d87-19660efec229	2026-07-30 23:56:30.807782
352f6844-b149-4881-b98c-03ea0b62447a	53cd533c-13a9-400f-93f5-2fb207239874	afc5edf4-f0ec-47be-867c-20a37d5bc259	2026-08-01 17:03:28.997463
eedf40e1-1646-400f-97ef-1b891a0a4865	1974e6ed-0de8-40e9-b951-f3e76208abea	58f77d7a-c0f1-4726-9eb8-a3fb4cca95e5	2026-07-31 14:01:03.772529
1e0a41ce-5b69-4b1a-9632-3f5e8325b552	53cd533c-13a9-400f-93f5-2fb207239874	7e33c9c0-9de3-4d07-9c9c-7377136f0e0b	2026-08-01 17:03:28.997463
506852a0-e5e5-4ed3-aff7-1d3ae4d29515	e2b8726d-107c-4504-b98d-835515772a26	afc5edf4-f0ec-47be-867c-20a37d5bc259	2026-08-01 17:03:28.997463
d1902662-c23f-4c43-a1bf-347ea909e42b	e2b8726d-107c-4504-b98d-835515772a26	7e33c9c0-9de3-4d07-9c9c-7377136f0e0b	2026-08-01 17:03:28.997463
747536a4-192f-4c9b-a385-11abf64af8b1	e2b8726d-107c-4504-b98d-835515772a26	7cc03ac0-ea10-43c1-b1d1-b5d094352d6b	2026-08-01 00:27:17.491026
319dd358-23cc-42ec-b64c-56c7266b507e	53cd533c-13a9-400f-93f5-2fb207239874	7cc03ac0-ea10-43c1-b1d1-b5d094352d6b	2026-08-01 00:27:17.491026
baae294b-39b0-4e73-8e98-4f32c01a5e10	e2b8726d-107c-4504-b98d-835515772a26	e8890ad2-079f-4ed4-85a1-bb5da3b65359	2026-08-01 00:27:17.491026
9a05848e-afbd-408f-bdcf-d0a165355dd7	53cd533c-13a9-400f-93f5-2fb207239874	e8890ad2-079f-4ed4-85a1-bb5da3b65359	2026-08-01 00:27:17.491026
8d4cdf6f-f9c2-4bc5-926c-20a5bd3bf130	53cd533c-13a9-400f-93f5-2fb207239874	78f4e5b6-7029-4c92-a01a-058c87ce952b	2026-08-01 00:27:17.491026
fc81e421-7080-4c0c-8a92-d861fefaf273	e2b8726d-107c-4504-b98d-835515772a26	78f4e5b6-7029-4c92-a01a-058c87ce952b	2026-08-01 00:27:17.491026
49c47f74-8c85-4885-824e-1aec7160dab4	53cd533c-13a9-400f-93f5-2fb207239874	4cadf91c-af1b-4549-85af-6412dd30b306	2026-08-01 13:53:59.247677
0679ecc6-2d83-4be6-97c7-88be4b3c2f5e	e2b8726d-107c-4504-b98d-835515772a26	4cadf91c-af1b-4549-85af-6412dd30b306	2026-08-01 13:53:59.247677
3ee8b8ea-91ad-4ce0-ad4d-59d3fe622aae	53cd533c-13a9-400f-93f5-2fb207239874	9e98d2a1-651d-48cc-a82c-14d5f73df681	2026-08-01 13:53:59.247677
bd5b396b-5c5d-4f5a-8eb8-104b7cb086ea	e2b8726d-107c-4504-b98d-835515772a26	9e98d2a1-651d-48cc-a82c-14d5f73df681	2026-08-01 13:53:59.247677
a9ed710e-7d89-496a-8d4c-1cfe7deb5cdd	1974e6ed-0de8-40e9-b951-f3e76208abea	9e98d2a1-651d-48cc-a82c-14d5f73df681	2026-08-01 13:53:59.247677
3622a100-6591-4bd2-8165-4701eabd6d97	562a8e2c-35be-4ea6-9fa8-48db5dc36606	9e98d2a1-651d-48cc-a82c-14d5f73df681	2026-08-01 13:53:59.247677
e0737f07-fbee-45f4-80f3-bfa1cc109a2d	1667f328-bf5d-45e2-8de5-a0f7e9e3e5a3	9e98d2a1-651d-48cc-a82c-14d5f73df681	2026-08-01 13:53:59.247677
5c250822-9223-407d-9f14-6bf5c2dc4003	53cd533c-13a9-400f-93f5-2fb207239874	fe3cea93-eead-41a2-b214-7d78f838f9d3	2026-08-01 13:53:59.247677
286b6f4d-45eb-4c5d-9f2e-1a7efebcd462	e2b8726d-107c-4504-b98d-835515772a26	fe3cea93-eead-41a2-b214-7d78f838f9d3	2026-08-01 13:53:59.247677
aa2ce7b4-0798-4fe4-b1f6-ee1e54c11bc2	53cd533c-13a9-400f-93f5-2fb207239874	76b09149-bfa3-481c-8d0c-cd4aee833040	2026-08-01 13:53:59.247677
be74e46d-a2a3-4849-a4c8-f9bd5bf8a1fe	e2b8726d-107c-4504-b98d-835515772a26	76b09149-bfa3-481c-8d0c-cd4aee833040	2026-08-01 13:53:59.247677
95b6e74a-e963-4763-851e-684dbedbc965	53cd533c-13a9-400f-93f5-2fb207239874	899e2f22-41d9-4263-b408-92ef83628411	2026-08-01 13:53:59.247677
5ad466da-3769-4f6e-9e53-44b93de90bdf	e2b8726d-107c-4504-b98d-835515772a26	899e2f22-41d9-4263-b408-92ef83628411	2026-08-01 13:53:59.247677
16d9bd7e-ad41-4b6e-b590-b1edafb4089d	53cd533c-13a9-400f-93f5-2fb207239874	ddff7299-0615-40d3-aabe-57c839d20efb	2026-08-01 13:53:59.247677
4ad96515-b774-46a7-b16d-d59e32c6905d	53cd533c-13a9-400f-93f5-2fb207239874	98429f77-55d3-4fe0-8306-b5d1ba8124b2	2026-07-30 23:49:39.950759
b6b1af44-2bac-461e-b4ae-0289bbd3a25b	e2b8726d-107c-4504-b98d-835515772a26	4ccb1763-f2ab-452d-9ebb-db6f43fc8a3f	2026-07-30 23:49:39.950759
e9c5445b-5a45-455d-9cc2-7acc890b6b6d	e2b8726d-107c-4504-b98d-835515772a26	b3414ef7-b896-4c97-a8cb-6fc198e67047	2026-07-30 23:49:39.950759
e610a9a7-b077-470c-b763-b43a17e69d20	e2b8726d-107c-4504-b98d-835515772a26	0e7e6da7-16a3-4595-9818-ddd3715130b8	2026-07-30 23:49:39.950759
5903b0c8-29dd-4aa6-a030-ef1fe8675188	e2b8726d-107c-4504-b98d-835515772a26	70fc3974-f889-4005-b522-87e17609214d	2026-07-30 23:49:39.950759
abc323f9-47d1-4ceb-ae13-d412632e7bf2	e2b8726d-107c-4504-b98d-835515772a26	9e7300a0-5203-4c58-99a7-86e61873cfb9	2026-07-30 23:49:39.950759
f779a382-ecbf-4494-8b1e-0df3995455d6	e2b8726d-107c-4504-b98d-835515772a26	98429f77-55d3-4fe0-8306-b5d1ba8124b2	2026-07-30 23:49:39.950759
471b11ec-4e59-463a-bf72-1e5e52672b13	e2b8726d-107c-4504-b98d-835515772a26	0d4b1b91-4f35-4935-8857-b088767292a6	2026-07-30 23:49:39.950759
9ad161b9-8e45-460e-8f48-da969399a660	e2b8726d-107c-4504-b98d-835515772a26	aef265cd-e15e-44e4-8742-27856117e73f	2026-07-30 23:49:39.950759
81959fb3-d77c-4f1b-98cf-ad5d98c84e3e	e2b8726d-107c-4504-b98d-835515772a26	90be2ab6-38f8-4bde-9d80-199771e345c7	2026-07-30 23:49:39.950759
a7dd635b-c809-46b7-8c5a-148ca17d5acb	e2b8726d-107c-4504-b98d-835515772a26	7ce5e22d-a818-41a7-b0dd-ecb6c4e88874	2026-07-30 23:49:39.950759
d60e4b03-d16f-4c06-b234-61e91f77dbd4	e2b8726d-107c-4504-b98d-835515772a26	7bcfcbe7-1113-4008-a07f-8ad1f50d8dd4	2026-07-30 23:49:39.950759
a8e7e452-d3ed-44cb-98b6-c6428c629bd9	e2b8726d-107c-4504-b98d-835515772a26	44f510ec-a732-46df-960d-decd719f7ee3	2026-07-30 23:49:39.950759
19344538-977f-446c-ac63-6cfbdb8fb598	e2b8726d-107c-4504-b98d-835515772a26	f0e98ae7-e219-4488-a740-5c2101422f86	2026-07-30 23:49:39.950759
ec2e185a-d506-4be9-b006-5300488eae88	e2b8726d-107c-4504-b98d-835515772a26	fbe398e5-ab76-4ed2-8796-bd540fbf709b	2026-07-30 23:49:39.950759
b7cf8637-f270-45c4-9666-55aa9a1305ba	e2b8726d-107c-4504-b98d-835515772a26	e7ded78c-bf45-4f0f-80b1-8a07762c8287	2026-07-30 23:49:39.950759
40555efb-a866-4184-8bb5-011af1e92441	e2b8726d-107c-4504-b98d-835515772a26	ee70a5ab-f696-4222-98b8-8376a1d82051	2026-07-30 23:49:39.950759
ea451ff3-4091-47ad-b3d2-6472715d5d7d	e2b8726d-107c-4504-b98d-835515772a26	3b30c266-3221-464b-86e8-7db8d13da0fc	2026-07-30 23:49:39.950759
f89b6e99-1fc9-41ee-8c04-c6d250ecc078	e2b8726d-107c-4504-b98d-835515772a26	98693c79-9753-4047-8ee6-8d161a25a56f	2026-07-30 23:49:39.950759
78b38b4d-2f85-49b7-abcf-d5377825787f	e2b8726d-107c-4504-b98d-835515772a26	651b72d8-4888-4c22-bf27-e77f92a61c10	2026-07-30 23:49:39.950759
b8e7d722-9104-4acf-a6b0-d07261a427cb	e2b8726d-107c-4504-b98d-835515772a26	adebee34-d381-40ab-91b0-d49c021290dd	2026-07-30 23:49:39.950759
579b1621-1b27-4a87-be7f-08064a2b86fa	e2b8726d-107c-4504-b98d-835515772a26	3ae0c0f3-8d25-4d71-8d87-19660efec229	2026-07-30 23:49:39.950759
3a4b6247-e96e-47a8-88e5-14e6e66afc16	e2b8726d-107c-4504-b98d-835515772a26	a18c261f-732b-4862-b6a4-bcf95bfbd9c9	2026-07-30 23:49:39.950759
b22f7f44-6ea3-4de0-9452-3d98a8345eb0	e2b8726d-107c-4504-b98d-835515772a26	c511eeb2-9e7c-40c6-8ab1-b241e83b8a3e	2026-07-30 23:49:39.950759
900dc391-b177-49dd-a488-d4749a1e7cdc	e2b8726d-107c-4504-b98d-835515772a26	a12292d9-b3f3-4baf-bcac-68ae914a4d1d	2026-07-30 23:49:39.950759
1b54fb15-fe84-400c-aa22-fa5be6ed9b99	e2b8726d-107c-4504-b98d-835515772a26	0f06f2a6-1eaf-4b32-8256-e052681914e6	2026-07-30 23:49:39.950759
55ed635f-4e96-4c26-a2f4-5dec96c34832	e2b8726d-107c-4504-b98d-835515772a26	17c13aad-7963-4620-a11b-06e247b1b873	2026-07-30 23:49:39.950759
473d9d21-95f7-4dbc-b2b4-c96684624f13	e2b8726d-107c-4504-b98d-835515772a26	9f5734eb-0f25-423f-9d73-4f6064537472	2026-07-30 23:49:39.950759
509eded6-dc3b-404b-9c41-18d38fae58f1	e2b8726d-107c-4504-b98d-835515772a26	58f77d7a-c0f1-4726-9eb8-a3fb4cca95e5	2026-07-30 23:49:39.950759
f5220003-7271-462e-8715-4c90d39d7180	e2b8726d-107c-4504-b98d-835515772a26	e88b839b-cad4-48e0-830d-6e845162c9c4	2026-07-30 23:49:39.950759
bc0f3f6c-d211-4386-a5f3-4ea2284fb4b0	e2b8726d-107c-4504-b98d-835515772a26	3bcdae8c-f4b6-4c76-b6c0-70bdc8ad1fe8	2026-07-30 23:49:39.950759
9b4b7799-7a5f-413e-84c7-d5b021b18f0b	e2b8726d-107c-4504-b98d-835515772a26	9b880363-65ee-4794-bd47-55da52fd349c	2026-07-30 23:49:39.950759
bcc5eba7-9567-45a9-97e2-af0c40e8b966	e2b8726d-107c-4504-b98d-835515772a26	e2969729-4620-4910-8585-6a2f3d01ffe0	2026-07-30 23:49:39.950759
f6aa0ae8-4b4f-4199-be3d-9b6cd1b9df4a	e2b8726d-107c-4504-b98d-835515772a26	babd7004-a6e5-4c0b-ba07-b63309109e22	2026-07-30 23:49:39.950759
f9033fd2-3152-4705-88dd-8d543b4bd5e0	e2b8726d-107c-4504-b98d-835515772a26	786b92b2-599a-41e9-a56c-5bd9fe8b01aa	2026-07-30 23:49:39.950759
6d26aef7-c91f-454b-bd67-91c0ae3bd60d	e2b8726d-107c-4504-b98d-835515772a26	1a8873dd-eb12-4007-89ab-d84e2062e918	2026-07-30 23:49:39.950759
f0b083dd-189b-4219-9c61-7e0801fd1dd0	e2b8726d-107c-4504-b98d-835515772a26	1016de93-9e5e-4c89-a224-72a3904bbead	2026-07-30 23:49:39.950759
24ff36ab-2b62-460a-8b03-edbe943c7b11	e2b8726d-107c-4504-b98d-835515772a26	4d019099-629a-4602-987c-0ff95d5784aa	2026-07-30 23:49:39.950759
cd060945-310c-4dda-baa8-2c2225fe6ce0	e2b8726d-107c-4504-b98d-835515772a26	9ae83958-dddd-4667-8b46-33f377b0e61c	2026-07-30 23:49:39.950759
8919c4be-82c9-4972-a96d-73bcdd065ae7	e2b8726d-107c-4504-b98d-835515772a26	a271a740-a018-4bbd-8c16-2abaa48373c6	2026-07-30 23:49:39.950759
09bfc18c-1198-4c06-b52b-7bd9b7b6c47f	e2b8726d-107c-4504-b98d-835515772a26	3ba5bbcc-9236-4809-96b4-f23b19e208c1	2026-07-30 23:49:39.950759
862e2f0e-aa7e-4b69-9d6c-99f5f6e52c4f	e2b8726d-107c-4504-b98d-835515772a26	61510cc9-0325-4dc4-b996-b9cf3c93ca80	2026-07-30 23:49:39.950759
33b986e0-482d-4900-bf27-c4db7719bda0	e2b8726d-107c-4504-b98d-835515772a26	ab76c75d-881e-4169-80e5-83db4c153d44	2026-07-30 23:49:39.950759
a85f857a-b929-43c2-8030-bb361d46955d	e2b8726d-107c-4504-b98d-835515772a26	794e15ec-2200-44ab-989b-7da21862b17e	2026-07-30 23:49:39.950759
0f582ac2-1fee-423d-b759-0c5019ec82c5	1974e6ed-0de8-40e9-b951-f3e76208abea	1016de93-9e5e-4c89-a224-72a3904bbead	2026-07-30 23:49:39.950759
1fc6ec29-e048-4b09-bce7-1c7343a42c07	e2b8726d-107c-4504-b98d-835515772a26	ddff7299-0615-40d3-aabe-57c839d20efb	2026-08-01 13:53:59.247677
31a769b0-9230-47a3-8555-924d3a1b3ba7	1974e6ed-0de8-40e9-b951-f3e76208abea	ddff7299-0615-40d3-aabe-57c839d20efb	2026-08-01 13:53:59.247677
6dd0a11b-a32a-4db1-aed6-091126dc2e14	562a8e2c-35be-4ea6-9fa8-48db5dc36606	ddff7299-0615-40d3-aabe-57c839d20efb	2026-08-01 13:53:59.247677
231aabe0-896a-4996-abe8-778b3071b514	1667f328-bf5d-45e2-8de5-a0f7e9e3e5a3	ddff7299-0615-40d3-aabe-57c839d20efb	2026-08-01 13:53:59.247677
f7291498-33f8-49f8-8659-09eb9412de1a	53cd533c-13a9-400f-93f5-2fb207239874	930bd0d8-abc2-4b27-b308-f548f03f9793	2026-08-01 13:53:59.247677
857e3358-43c3-4fa6-95dc-cc39029c4a9c	e2b8726d-107c-4504-b98d-835515772a26	930bd0d8-abc2-4b27-b308-f548f03f9793	2026-08-01 13:53:59.247677
b02213cd-ccd9-423a-a18c-6e36a851a6c3	53cd533c-13a9-400f-93f5-2fb207239874	0011b2ce-396e-4302-98b9-57b0ecf747d0	2026-08-01 13:53:59.247677
90f33fa7-f36f-4b1f-9c6b-dbc37f1ee9b1	e2b8726d-107c-4504-b98d-835515772a26	0011b2ce-396e-4302-98b9-57b0ecf747d0	2026-08-01 13:53:59.247677
b499c229-7d99-4740-819c-dc5246f724e1	53cd533c-13a9-400f-93f5-2fb207239874	526f8cc6-062b-42b2-bdbb-41485dffaee2	2026-08-01 13:53:59.247677
0f570409-0c22-476d-96eb-6c16c597eef8	e2b8726d-107c-4504-b98d-835515772a26	526f8cc6-062b-42b2-bdbb-41485dffaee2	2026-08-01 13:53:59.247677
657107dc-2dff-45d6-a070-50c39008f614	53cd533c-13a9-400f-93f5-2fb207239874	a90bc4ef-383c-4eb0-94c4-f5a4d144622e	2026-08-01 13:53:59.247677
9fc5b9d5-33df-475c-b37e-ee79a0afe9a0	e2b8726d-107c-4504-b98d-835515772a26	a90bc4ef-383c-4eb0-94c4-f5a4d144622e	2026-08-01 13:53:59.247677
40026bb4-d7ef-4b76-b4af-518417558be6	1974e6ed-0de8-40e9-b951-f3e76208abea	a90bc4ef-383c-4eb0-94c4-f5a4d144622e	2026-08-01 13:53:59.247677
c0e129db-5672-4dd6-871c-fbd5e3922109	562a8e2c-35be-4ea6-9fa8-48db5dc36606	a90bc4ef-383c-4eb0-94c4-f5a4d144622e	2026-08-01 13:53:59.247677
7343ac4b-b245-4c4c-91b3-a5cd2b1d2293	1667f328-bf5d-45e2-8de5-a0f7e9e3e5a3	a90bc4ef-383c-4eb0-94c4-f5a4d144622e	2026-08-01 13:53:59.247677
36fe4291-35e2-4793-856e-d9ca6a72c8d1	53cd533c-13a9-400f-93f5-2fb207239874	2aba093f-28b0-4c5e-8953-ded025431d9d	2026-08-01 13:53:59.247677
ebf19bc1-2355-4e12-a6a8-846c637baba6	e2b8726d-107c-4504-b98d-835515772a26	2aba093f-28b0-4c5e-8953-ded025431d9d	2026-08-01 13:53:59.247677
e636ba9d-6e10-4851-a96a-8e5f9e333e9f	53cd533c-13a9-400f-93f5-2fb207239874	d2c0760e-c337-4e99-abe1-837e0624c2d1	2026-08-01 13:53:59.247677
96cb750d-a55b-441c-b290-8620c46c67e8	e2b8726d-107c-4504-b98d-835515772a26	d2c0760e-c337-4e99-abe1-837e0624c2d1	2026-08-01 13:53:59.247677
f8552f19-4819-4c60-ab04-6936af9ac509	562a8e2c-35be-4ea6-9fa8-48db5dc36606	3b30c266-3221-464b-86e8-7db8d13da0fc	2026-08-01 13:53:59.247677
27c07c17-2932-4223-85bf-dd9f55b33211	562a8e2c-35be-4ea6-9fa8-48db5dc36606	0e7e6da7-16a3-4595-9818-ddd3715130b8	2026-08-01 13:53:59.247677
d05c76ed-42ac-4264-bdd1-d1ddb393e2d7	562a8e2c-35be-4ea6-9fa8-48db5dc36606	9e7300a0-5203-4c58-99a7-86e61873cfb9	2026-08-01 13:53:59.247677
a9485b3e-dc8d-4230-96a1-24ece740a92e	562a8e2c-35be-4ea6-9fa8-48db5dc36606	786b92b2-599a-41e9-a56c-5bd9fe8b01aa	2026-08-01 13:53:59.247677
3880f07d-5e27-48eb-bdbe-1773ff134ee0	562a8e2c-35be-4ea6-9fa8-48db5dc36606	9f5734eb-0f25-423f-9d73-4f6064537472	2026-08-01 13:53:59.247677
578d49e4-a8e2-4bb0-8ba5-effda1bf144c	1974e6ed-0de8-40e9-b951-f3e76208abea	786b92b2-599a-41e9-a56c-5bd9fe8b01aa	2026-07-30 23:49:39.950759
cb7e888c-a7d3-4e68-ab67-859d2aeb1328	1974e6ed-0de8-40e9-b951-f3e76208abea	9ae83958-dddd-4667-8b46-33f377b0e61c	2026-07-30 23:49:39.950759
82cf5a80-6cfe-4f8a-b143-1d77dbdf8dd8	1974e6ed-0de8-40e9-b951-f3e76208abea	f0e98ae7-e219-4488-a740-5c2101422f86	2026-07-30 23:49:39.950759
a30270a7-1976-4c34-a22f-202ea493687b	562a8e2c-35be-4ea6-9fa8-48db5dc36606	afc5edf4-f0ec-47be-867c-20a37d5bc259	2026-08-01 17:03:28.997463
32ffe8bb-e532-42df-a084-d91632fe03b5	562a8e2c-35be-4ea6-9fa8-48db5dc36606	7e33c9c0-9de3-4d07-9c9c-7377136f0e0b	2026-08-01 17:03:28.997463
20f9d99a-03e3-4297-b438-f64cf554fe29	1974e6ed-0de8-40e9-b951-f3e76208abea	7e33c9c0-9de3-4d07-9c9c-7377136f0e0b	2026-08-01 17:03:28.997463
f5a5d52b-4970-44d1-a81f-fb8122baebe8	53cd533c-13a9-400f-93f5-2fb207239874	41803582-c338-424e-9e97-1ba7abc139a1	2026-08-01 21:17:53.172078
3b232a70-553f-4033-8329-ffb7874daa81	1974e6ed-0de8-40e9-b951-f3e76208abea	a12292d9-b3f3-4baf-bcac-68ae914a4d1d	2026-07-30 23:49:39.950759
c680ce55-c2a4-455c-babe-1a952325b5f4	53cd533c-13a9-400f-93f5-2fb207239874	1d032f5d-493c-4019-8668-7c055dbd1959	2026-08-01 21:17:53.204254
817c8479-c4ea-440c-8df0-3d8c070862f6	1974e6ed-0de8-40e9-b951-f3e76208abea	651b72d8-4888-4c22-bf27-e77f92a61c10	2026-07-30 23:49:39.950759
b426cae5-6580-4fdb-bf33-363a68443440	1974e6ed-0de8-40e9-b951-f3e76208abea	3b30c266-3221-464b-86e8-7db8d13da0fc	2026-07-30 23:49:39.950759
15ce3e96-f17b-455f-b938-1a83dbbf7f5f	b1370815-7b78-49bd-b3f6-ca765d129abe	3b30c266-3221-464b-86e8-7db8d13da0fc	2026-07-30 23:49:39.950759
5bb82db8-fcb1-4940-918a-69045f6e12cb	b1370815-7b78-49bd-b3f6-ca765d129abe	3bcdae8c-f4b6-4c76-b6c0-70bdc8ad1fe8	2026-07-30 23:49:39.950759
94ec1a14-ee2f-4a82-ab90-26c9fc8e8a02	b1370815-7b78-49bd-b3f6-ca765d129abe	786b92b2-599a-41e9-a56c-5bd9fe8b01aa	2026-07-30 23:49:39.950759
7f7731ff-0559-4f93-aa8a-4c7957ab5253	53cd533c-13a9-400f-93f5-2fb207239874	67a36a67-1a37-4362-80e8-328dbd8ddbd5	2026-08-01 21:17:53.225616
b1f2b860-76f7-4b40-bd28-ad9dab4f39e5	562a8e2c-35be-4ea6-9fa8-48db5dc36606	a18c261f-732b-4862-b6a4-bcf95bfbd9c9	2026-07-31 20:38:50.031656
f6124874-095b-455c-b4d1-85afffef9834	562a8e2c-35be-4ea6-9fa8-48db5dc36606	a12292d9-b3f3-4baf-bcac-68ae914a4d1d	2026-07-31 20:38:50.031656
64f36be5-6eff-47ef-bbc2-0976992675d0	562a8e2c-35be-4ea6-9fa8-48db5dc36606	651b72d8-4888-4c22-bf27-e77f92a61c10	2026-07-31 20:38:50.031656
c7161389-c537-47ff-b68d-955a75a3a6c5	562a8e2c-35be-4ea6-9fa8-48db5dc36606	73fcd5f4-a41d-4318-98f9-0ba19c50fec5	2026-07-31 20:38:50.031656
422bbfb0-561e-4d4d-baa4-8223c51aa815	562a8e2c-35be-4ea6-9fa8-48db5dc36606	7cc03ac0-ea10-43c1-b1d1-b5d094352d6b	2026-07-31 20:38:50.031656
7bbe4baf-a6c1-4260-8b2d-3e352c6578b9	562a8e2c-35be-4ea6-9fa8-48db5dc36606	99993d4f-ea72-4877-a5e4-e7126c6c53c4	2026-07-31 20:38:50.031656
f6620bd8-ad40-4b96-aa19-8fbed958046d	562a8e2c-35be-4ea6-9fa8-48db5dc36606	0d4b1b91-4f35-4935-8857-b088767292a6	2026-07-31 20:38:50.031656
564b2191-1c9c-4439-902c-a4881bad9100	562a8e2c-35be-4ea6-9fa8-48db5dc36606	e8890ad2-079f-4ed4-85a1-bb5da3b65359	2026-07-31 20:38:50.031656
798f10a5-1702-4e57-8863-7f59320809b1	562a8e2c-35be-4ea6-9fa8-48db5dc36606	4a251712-8742-4d68-a25b-9b44bcc4c548	2026-07-31 20:38:50.031656
a149069d-9118-4e0f-8999-4ead21da6d13	562a8e2c-35be-4ea6-9fa8-48db5dc36606	78f4e5b6-7029-4c92-a01a-058c87ce952b	2026-07-31 20:38:50.031656
3b7b8a4b-94fc-4908-8c85-a42bfbd830be	562a8e2c-35be-4ea6-9fa8-48db5dc36606	1016de93-9e5e-4c89-a224-72a3904bbead	2026-07-31 20:38:50.031656
2cc8527c-728a-4edc-90bf-d69f81dfb6f4	562a8e2c-35be-4ea6-9fa8-48db5dc36606	9b880363-65ee-4794-bd47-55da52fd349c	2026-07-31 20:38:50.031656
cba00583-35e6-454e-a478-7d5a8fd7f599	562a8e2c-35be-4ea6-9fa8-48db5dc36606	d9519e47-ae1d-4b6b-a758-16ce5f2f7a63	2026-07-31 20:38:50.031656
6d6272df-e3af-4254-90b8-31b7ebb59523	562a8e2c-35be-4ea6-9fa8-48db5dc36606	fae803a1-9ce1-436e-987b-70dc74e5b74a	2026-07-31 20:38:50.031656
87609a11-921c-482b-bf33-de101cce3fd1	1974e6ed-0de8-40e9-b951-f3e76208abea	7cc03ac0-ea10-43c1-b1d1-b5d094352d6b	2026-07-31 20:38:50.031656
b5a7829c-14f1-48fc-89de-0f11eadd081f	b1370815-7b78-49bd-b3f6-ca765d129abe	7cc03ac0-ea10-43c1-b1d1-b5d094352d6b	2026-07-31 20:38:50.031656
1ea2b109-cc90-442c-9e90-cbc7de5499a2	53cd533c-13a9-400f-93f5-2fb207239874	fae803a1-9ce1-436e-987b-70dc74e5b74a	2026-08-01 00:50:06.734588
08aacb2a-9582-48b7-a82e-3971588bb718	53cd533c-13a9-400f-93f5-2fb207239874	4a251712-8742-4d68-a25b-9b44bcc4c548	2026-08-01 00:50:06.734588
98fb8375-8be2-4eb5-bd7b-3490b71c1874	b1370815-7b78-49bd-b3f6-ca765d129abe	4d019099-629a-4602-987c-0ff95d5784aa	2026-08-01 00:50:06.734588
a8aace81-9084-492b-971c-a0c1fa4d73db	1667f328-bf5d-45e2-8de5-a0f7e9e3e5a3	e2969729-4620-4910-8585-6a2f3d01ffe0	2026-08-01 00:50:06.734588
7e47b69c-a33a-49e9-9479-2bf660e7638b	1667f328-bf5d-45e2-8de5-a0f7e9e3e5a3	1016de93-9e5e-4c89-a224-72a3904bbead	2026-08-01 00:50:06.734588
f86ef4f2-142d-45f3-a8dc-e323d328d8a1	1667f328-bf5d-45e2-8de5-a0f7e9e3e5a3	0e7e6da7-16a3-4595-9818-ddd3715130b8	2026-08-01 00:50:06.734588
345f9ccd-31a2-4daf-9c74-e902675f958f	1667f328-bf5d-45e2-8de5-a0f7e9e3e5a3	aef265cd-e15e-44e4-8742-27856117e73f	2026-08-01 00:50:06.734588
6d436545-c3ed-4aa5-b61e-f0fe634178a6	1667f328-bf5d-45e2-8de5-a0f7e9e3e5a3	7bcfcbe7-1113-4008-a07f-8ad1f50d8dd4	2026-08-01 00:50:06.734588
a0bde28f-9108-4d59-8bed-50ca7d137bb4	1667f328-bf5d-45e2-8de5-a0f7e9e3e5a3	48c1ed30-3310-4552-babb-74f18c779d16	2026-08-01 00:50:06.734588
58b6b7cb-fd06-457f-9780-285415691356	53cd533c-13a9-400f-93f5-2fb207239874	4f89a6f0-cf90-4115-8dab-a9cd19730230	2026-08-01 21:17:53.254927
f830c6ae-45b2-4f7b-bd6b-f9134ae48a22	53cd533c-13a9-400f-93f5-2fb207239874	98693c79-9753-4047-8ee6-8d161a25a56f	2026-08-01 21:17:53.292245
9d146d48-bd58-447b-a447-3ee7fa846958	53cd533c-13a9-400f-93f5-2fb207239874	70fc3974-f889-4005-b522-87e17609214d	2026-08-01 21:17:53.330703
de7616f0-4299-432b-b34b-a682d967bc43	53cd533c-13a9-400f-93f5-2fb207239874	73fcd5f4-a41d-4318-98f9-0ba19c50fec5	2026-08-01 21:17:53.375114
dc20fb11-9a74-4b39-9b1e-d9ebf588be3e	53cd533c-13a9-400f-93f5-2fb207239874	9f5734eb-0f25-423f-9d73-4f6064537472	2026-08-01 21:17:53.420936
841989b8-3599-4c9f-a665-185bf43227eb	53cd533c-13a9-400f-93f5-2fb207239874	a271a740-a018-4bbd-8c16-2abaa48373c6	2026-08-01 21:17:53.477922
c89d8f19-d1c8-4ab4-9c0a-434c7fa116e1	53cd533c-13a9-400f-93f5-2fb207239874	786b92b2-599a-41e9-a56c-5bd9fe8b01aa	2026-08-01 21:17:53.513479
6ad165f0-efee-401d-96df-dbf17924f71c	53cd533c-13a9-400f-93f5-2fb207239874	e88b839b-cad4-48e0-830d-6e845162c9c4	2026-08-01 21:17:53.551676
3121405e-25e4-4bfb-aa54-04d5ddddc4fd	53cd533c-13a9-400f-93f5-2fb207239874	3bcdae8c-f4b6-4c76-b6c0-70bdc8ad1fe8	2026-08-01 21:17:53.555982
ee6110bf-ede2-495f-9a87-be7a8a219501	53cd533c-13a9-400f-93f5-2fb207239874	3b30c266-3221-464b-86e8-7db8d13da0fc	2026-08-01 21:17:53.589634
cb1619c3-d852-44e9-a2e2-618caebbcc66	53cd533c-13a9-400f-93f5-2fb207239874	f0e98ae7-e219-4488-a740-5c2101422f86	2026-08-01 21:17:53.590906
a106333c-fb82-4050-9f32-c2ab2545b0a4	53cd533c-13a9-400f-93f5-2fb207239874	7bcfcbe7-1113-4008-a07f-8ad1f50d8dd4	2026-08-01 21:17:53.632354
471989d8-1274-4612-864d-deb8891c2738	53cd533c-13a9-400f-93f5-2fb207239874	58f77d7a-c0f1-4726-9eb8-a3fb4cca95e5	2026-08-01 21:17:53.632913
038e246c-8668-4e3e-b22e-6e874ebb202f	53cd533c-13a9-400f-93f5-2fb207239874	4ccb1763-f2ab-452d-9ebb-db6f43fc8a3f	2026-08-01 21:17:53.661219
545cc474-c84a-4305-b036-c9c218e1ea52	53cd533c-13a9-400f-93f5-2fb207239874	adebee34-d381-40ab-91b0-d49c021290dd	2026-08-01 21:17:53.681788
fef68e02-4562-427a-9c94-ddb0294e0679	53cd533c-13a9-400f-93f5-2fb207239874	7ce5e22d-a818-41a7-b0dd-ecb6c4e88874	2026-08-01 21:17:53.682117
a60a16cd-96ed-4b96-8a97-d2d7aff7b57d	53cd533c-13a9-400f-93f5-2fb207239874	b3414ef7-b896-4c97-a8cb-6fc198e67047	2026-08-01 21:17:53.759297
5b9e9c23-271a-4464-987f-345bafb0bb55	53cd533c-13a9-400f-93f5-2fb207239874	90be2ab6-38f8-4bde-9d80-199771e345c7	2026-08-01 21:17:53.764028
5420b22e-e4fd-45de-a93e-14d61ca95719	53cd533c-13a9-400f-93f5-2fb207239874	98429f77-55d3-4fe0-8306-b5d1ba8124b2	2026-08-01 21:17:53.764892
05cf52b9-8066-4d71-bbee-d7911e3f6bc1	53cd533c-13a9-400f-93f5-2fb207239874	0d4b1b91-4f35-4935-8857-b088767292a6	2026-08-01 21:17:53.765247
1b185588-df5f-48a5-99a0-fad0419c74af	53cd533c-13a9-400f-93f5-2fb207239874	a12292d9-b3f3-4baf-bcac-68ae914a4d1d	2026-08-01 21:17:53.766625
8fbba0f7-9860-4e8a-9431-9eec8c30640e	53cd533c-13a9-400f-93f5-2fb207239874	3ae0c0f3-8d25-4d71-8d87-19660efec229	2026-08-01 21:17:53.827215
5c5f34e1-ca8d-4f92-9d26-f7bca66ccaf0	53cd533c-13a9-400f-93f5-2fb207239874	9b880363-65ee-4794-bd47-55da52fd349c	2026-08-01 21:17:53.828151
3ebd941b-6e20-4b7f-868f-b2c4fd52e6d5	53cd533c-13a9-400f-93f5-2fb207239874	a18c261f-732b-4862-b6a4-bcf95bfbd9c9	2026-08-01 21:17:53.83057
295ad311-bd07-46b0-b782-373de7e26c5d	53cd533c-13a9-400f-93f5-2fb207239874	78f4e5b6-7029-4c92-a01a-058c87ce952b	2026-08-01 21:17:53.892354
ab26b957-4dd4-46a1-afe3-e2d91d4df969	53cd533c-13a9-400f-93f5-2fb207239874	e8890ad2-079f-4ed4-85a1-bb5da3b65359	2026-08-01 21:17:53.893793
647b816a-b108-40f5-984f-217eecf7494a	53cd533c-13a9-400f-93f5-2fb207239874	7cc03ac0-ea10-43c1-b1d1-b5d094352d6b	2026-08-01 21:17:53.894222
b3f33f4a-a74a-4cf8-8acf-33613c622281	53cd533c-13a9-400f-93f5-2fb207239874	fae803a1-9ce1-436e-987b-70dc74e5b74a	2026-08-01 21:17:53.89598
84a56216-2e4a-43a2-9c31-73f5c8a34397	53cd533c-13a9-400f-93f5-2fb207239874	4a251712-8742-4d68-a25b-9b44bcc4c548	2026-08-01 21:17:53.941616
33c8ff5e-4792-48c1-8dcb-ef3e2ccd966d	53cd533c-13a9-400f-93f5-2fb207239874	4cadf91c-af1b-4549-85af-6412dd30b306	2026-08-01 21:17:53.94236
0303a852-4a7c-4bcb-b1eb-29f642a53816	53cd533c-13a9-400f-93f5-2fb207239874	9e98d2a1-651d-48cc-a82c-14d5f73df681	2026-08-01 21:17:53.943064
e342e699-21f0-437c-9eab-1cc88f7c5de6	53cd533c-13a9-400f-93f5-2fb207239874	fe3cea93-eead-41a2-b214-7d78f838f9d3	2026-08-01 21:17:53.943569
0357ec73-d96f-4528-9d86-050c2a4c540e	53cd533c-13a9-400f-93f5-2fb207239874	76b09149-bfa3-481c-8d0c-cd4aee833040	2026-08-01 21:17:53.944637
98f6a123-9f34-481d-9d56-0cbda0243035	53cd533c-13a9-400f-93f5-2fb207239874	899e2f22-41d9-4263-b408-92ef83628411	2026-08-01 21:17:53.945368
a026356e-3731-41c3-842e-3614351cfa62	53cd533c-13a9-400f-93f5-2fb207239874	ddff7299-0615-40d3-aabe-57c839d20efb	2026-08-01 21:17:53.984851
4b18aa7c-6907-4175-94ca-e0497fa8c96e	53cd533c-13a9-400f-93f5-2fb207239874	930bd0d8-abc2-4b27-b308-f548f03f9793	2026-08-01 21:17:53.985678
e553727f-69c1-47f8-af61-fcdb95e80534	53cd533c-13a9-400f-93f5-2fb207239874	0011b2ce-396e-4302-98b9-57b0ecf747d0	2026-08-01 21:17:53.986585
b084a11f-597d-42bc-9022-36add0f68124	53cd533c-13a9-400f-93f5-2fb207239874	526f8cc6-062b-42b2-bdbb-41485dffaee2	2026-08-01 21:17:53.986953
834beda3-9b53-468f-8203-75b42a284423	53cd533c-13a9-400f-93f5-2fb207239874	a90bc4ef-383c-4eb0-94c4-f5a4d144622e	2026-08-01 21:17:53.987729
8c7458c3-978e-4a0b-9227-d5b214b7a00f	53cd533c-13a9-400f-93f5-2fb207239874	2aba093f-28b0-4c5e-8953-ded025431d9d	2026-08-01 21:17:53.988504
f1ba57c5-0704-40c8-b485-6d5b91dd2042	53cd533c-13a9-400f-93f5-2fb207239874	d2c0760e-c337-4e99-abe1-837e0624c2d1	2026-08-01 21:17:54.025974
935ef879-3194-4308-8931-639bde2625a4	53cd533c-13a9-400f-93f5-2fb207239874	28909d84-a799-485a-ad25-31f0a124b8a7	2026-08-01 21:17:54.027234
7d9d4e74-27ab-4398-96f9-3919e220a039	53cd533c-13a9-400f-93f5-2fb207239874	6dd7e925-a032-4214-8b5d-bf2ff7d311be	2026-08-01 21:17:54.028383
5b07d0d3-511b-46d7-9231-697348ef402e	53cd533c-13a9-400f-93f5-2fb207239874	db5c84df-d810-470b-b3d3-f26bbaa992d8	2026-08-01 21:17:54.02887
0fc259c2-f57d-4af0-9710-16743e347d10	53cd533c-13a9-400f-93f5-2fb207239874	cf10080c-8632-4e39-b141-9b20b8c32023	2026-08-01 21:17:54.029396
29d01993-c314-4361-93c2-e2cc58c82199	53cd533c-13a9-400f-93f5-2fb207239874	1a8ab615-bb7a-4b66-848b-9204fd386584	2026-08-01 21:17:54.030375
59230f6e-cbd6-47d4-a3ac-d9bda50e0125	53cd533c-13a9-400f-93f5-2fb207239874	8f64dc3b-deab-4c18-88be-79c99318ad8b	2026-08-01 21:17:54.054492
0e3e2dae-9e68-4075-83fa-c5d14dff0c9c	53cd533c-13a9-400f-93f5-2fb207239874	7e33c9c0-9de3-4d07-9c9c-7377136f0e0b	2026-08-01 21:17:54.05481
c2555acf-7d37-4560-8ab3-57568fccd712	53cd533c-13a9-400f-93f5-2fb207239874	afc5edf4-f0ec-47be-867c-20a37d5bc259	2026-08-01 21:17:54.055109
c6d0b73c-ce15-4acd-bbef-fc034822d77d	562a8e2c-35be-4ea6-9fa8-48db5dc36606	cb2302c6-f2da-4333-9b98-24245f468b1e	2026-08-01 21:18:15.151722
be56b027-c0ea-4c16-b1e3-f0e21faae868	562a8e2c-35be-4ea6-9fa8-48db5dc36606	efbb62bd-e51d-4f01-80ce-0363d440bd41	2026-08-01 21:18:15.160312
6314873c-16c9-44c1-975b-b996d99a4f27	562a8e2c-35be-4ea6-9fa8-48db5dc36606	41803582-c338-424e-9e97-1ba7abc139a1	2026-08-01 21:18:15.174086
af7cf5f0-4be9-49ec-94e3-9ec2f85ab71b	562a8e2c-35be-4ea6-9fa8-48db5dc36606	1d032f5d-493c-4019-8668-7c055dbd1959	2026-08-01 21:18:15.189142
d1003fc4-923d-4c8d-a45d-533047668945	562a8e2c-35be-4ea6-9fa8-48db5dc36606	4f89a6f0-cf90-4115-8dab-a9cd19730230	2026-08-01 21:18:15.226846
71fe1516-dd83-4ef2-bd16-b390636c61e0	562a8e2c-35be-4ea6-9fa8-48db5dc36606	98693c79-9753-4047-8ee6-8d161a25a56f	2026-08-01 21:18:15.261898
b5a84c72-f02d-48ca-bed7-f2d730f38479	562a8e2c-35be-4ea6-9fa8-48db5dc36606	73fcd5f4-a41d-4318-98f9-0ba19c50fec5	2026-08-01 21:18:15.302343
657960b6-b77c-47a0-8680-82ca2686865a	562a8e2c-35be-4ea6-9fa8-48db5dc36606	e88b839b-cad4-48e0-830d-6e845162c9c4	2026-08-01 21:18:15.359375
7fa1479e-45c1-4c69-b2f2-f8ce3c2b1fa7	562a8e2c-35be-4ea6-9fa8-48db5dc36606	9f5734eb-0f25-423f-9d73-4f6064537472	2026-08-01 21:18:15.408939
2bf1f79a-bc35-4730-be78-409adcd0169c	562a8e2c-35be-4ea6-9fa8-48db5dc36606	3b30c266-3221-464b-86e8-7db8d13da0fc	2026-08-01 21:18:15.475031
a57cbd67-dbda-430e-9e30-c5e9ba05a552	562a8e2c-35be-4ea6-9fa8-48db5dc36606	0e7e6da7-16a3-4595-9818-ddd3715130b8	2026-08-01 21:18:15.527543
f8016867-1fa8-41b5-aee9-8a3c7ffcb554	562a8e2c-35be-4ea6-9fa8-48db5dc36606	adebee34-d381-40ab-91b0-d49c021290dd	2026-08-01 21:18:15.585648
815787a2-1518-468d-8e69-c762e04b3ef5	562a8e2c-35be-4ea6-9fa8-48db5dc36606	1a8873dd-eb12-4007-89ab-d84e2062e918	2026-08-01 21:18:15.638702
0f5edbcb-ff73-48a2-b64a-6fc010b3643e	562a8e2c-35be-4ea6-9fa8-48db5dc36606	0d4b1b91-4f35-4935-8857-b088767292a6	2026-08-01 21:18:15.720954
a29e0878-edfe-4c57-b08f-68a7b9704525	562a8e2c-35be-4ea6-9fa8-48db5dc36606	3ba5bbcc-9236-4809-96b4-f23b19e208c1	2026-08-01 21:18:15.791062
d47e153e-3eee-46eb-a79b-4a8166712da1	562a8e2c-35be-4ea6-9fa8-48db5dc36606	4a251712-8742-4d68-a25b-9b44bcc4c548	2026-08-01 21:18:15.852479
6070fb1f-7a38-4687-9a42-a1e43af06748	562a8e2c-35be-4ea6-9fa8-48db5dc36606	fe3cea93-eead-41a2-b214-7d78f838f9d3	2026-08-01 21:18:15.943475
386276ed-d062-4e0e-9fb5-4f64d17afc98	562a8e2c-35be-4ea6-9fa8-48db5dc36606	d2c0760e-c337-4e99-abe1-837e0624c2d1	2026-08-01 21:18:15.996792
8df888ae-ac78-4187-bce6-86277aca6388	562a8e2c-35be-4ea6-9fa8-48db5dc36606	db5c84df-d810-470b-b3d3-f26bbaa992d8	2026-08-01 21:18:16.066125
81696e94-65b6-4295-9c88-e03225609621	562a8e2c-35be-4ea6-9fa8-48db5dc36606	67a36a67-1a37-4362-80e8-328dbd8ddbd5	2026-08-01 21:18:15.199424
be642901-aeaf-450f-a154-0fd8601089cb	562a8e2c-35be-4ea6-9fa8-48db5dc36606	1016de93-9e5e-4c89-a224-72a3904bbead	2026-08-01 21:18:15.250426
3f551af5-907e-4f9b-9b1f-ec1c574253e0	562a8e2c-35be-4ea6-9fa8-48db5dc36606	70fc3974-f889-4005-b522-87e17609214d	2026-08-01 21:18:15.275415
7bdf8435-4042-4eaf-bef7-74c0871b6bd2	562a8e2c-35be-4ea6-9fa8-48db5dc36606	0f06f2a6-1eaf-4b32-8256-e052681914e6	2026-08-01 21:18:15.326846
450f9a89-7197-44f0-806d-a59c075a501d	562a8e2c-35be-4ea6-9fa8-48db5dc36606	4ccb1763-f2ab-452d-9ebb-db6f43fc8a3f	2026-08-01 21:18:15.380452
82b032d2-8252-451a-9629-f0fe328e3c06	562a8e2c-35be-4ea6-9fa8-48db5dc36606	4d019099-629a-4602-987c-0ff95d5784aa	2026-08-01 21:18:15.421423
e58702b2-092b-495e-94f5-7de342502d22	562a8e2c-35be-4ea6-9fa8-48db5dc36606	786b92b2-599a-41e9-a56c-5bd9fe8b01aa	2026-08-01 21:18:15.462658
039a1ab4-1e3b-402a-95b7-c49d4c56bf3f	562a8e2c-35be-4ea6-9fa8-48db5dc36606	7bcfcbe7-1113-4008-a07f-8ad1f50d8dd4	2026-08-01 21:18:15.531957
4ec39644-145f-4c3a-a4bf-0662a1b33ae4	562a8e2c-35be-4ea6-9fa8-48db5dc36606	58f77d7a-c0f1-4726-9eb8-a3fb4cca95e5	2026-08-01 21:18:15.581248
a5ac71c3-161b-430f-a65a-72ee3475b751	562a8e2c-35be-4ea6-9fa8-48db5dc36606	b3414ef7-b896-4c97-a8cb-6fc198e67047	2026-08-01 21:18:15.645843
086019e2-c55b-41b5-b869-1cd40f27cb52	562a8e2c-35be-4ea6-9fa8-48db5dc36606	90be2ab6-38f8-4bde-9d80-199771e345c7	2026-08-01 21:18:15.708272
600c1e4b-7132-4998-8045-1f82be4898eb	562a8e2c-35be-4ea6-9fa8-48db5dc36606	794e15ec-2200-44ab-989b-7da21862b17e	2026-08-01 21:18:15.800894
e30137f9-38cd-43f3-80bc-2748ccfdce9a	562a8e2c-35be-4ea6-9fa8-48db5dc36606	e8890ad2-079f-4ed4-85a1-bb5da3b65359	2026-08-01 21:18:15.850315
24b0c2f0-eafc-4fcb-8083-76b24223774a	562a8e2c-35be-4ea6-9fa8-48db5dc36606	ddff7299-0615-40d3-aabe-57c839d20efb	2026-08-01 21:18:15.946063
54ad925b-d105-4331-8411-2d53e65c968c	562a8e2c-35be-4ea6-9fa8-48db5dc36606	526f8cc6-062b-42b2-bdbb-41485dffaee2	2026-08-01 21:18:15.995594
5094af8d-822c-436c-b30f-e7a2d8196717	562a8e2c-35be-4ea6-9fa8-48db5dc36606	8f64dc3b-deab-4c18-88be-79c99318ad8b	2026-08-01 21:18:16.067216
83cc1c40-1f3f-4e09-8feb-61230bb5dd06	562a8e2c-35be-4ea6-9fa8-48db5dc36606	ee643269-d023-4b52-a9d3-caf40acfcdcd	2026-08-01 21:18:15.212315
05413458-de0f-4074-a23a-180362bcb53e	562a8e2c-35be-4ea6-9fa8-48db5dc36606	ab76c75d-881e-4169-80e5-83db4c153d44	2026-08-01 21:18:15.240576
3143bd0c-7407-4970-a650-50df491a1260	562a8e2c-35be-4ea6-9fa8-48db5dc36606	99993d4f-ea72-4877-a5e4-e7126c6c53c4	2026-08-01 21:18:15.281722
227dd298-ffab-4be0-a67e-be69a6c63412	562a8e2c-35be-4ea6-9fa8-48db5dc36606	48c1ed30-3310-4552-babb-74f18c779d16	2026-08-01 21:18:15.302851
95213c7a-ecc9-4bf0-a905-fb11514bcc60	562a8e2c-35be-4ea6-9fa8-48db5dc36606	d9519e47-ae1d-4b6b-a758-16ce5f2f7a63	2026-08-01 21:18:15.323264
daf9b9ad-918a-4715-b72a-0f169d149f00	562a8e2c-35be-4ea6-9fa8-48db5dc36606	9e7300a0-5203-4c58-99a7-86e61873cfb9	2026-08-01 21:18:15.356659
784e1f9c-16f2-4d11-9382-7ab34d94e94b	562a8e2c-35be-4ea6-9fa8-48db5dc36606	e7ded78c-bf45-4f0f-80b1-8a07762c8287	2026-08-01 21:18:15.380798
75eadd55-6c86-45e1-8e1f-3e0c5da3212a	562a8e2c-35be-4ea6-9fa8-48db5dc36606	a271a740-a018-4bbd-8c16-2abaa48373c6	2026-08-01 21:18:15.410648
17de39de-4bf9-4160-9a8e-852821454835	562a8e2c-35be-4ea6-9fa8-48db5dc36606	c511eeb2-9e7c-40c6-8ab1-b241e83b8a3e	2026-08-01 21:18:15.420977
e9262199-b716-4aae-98d1-827b5b6eff2d	562a8e2c-35be-4ea6-9fa8-48db5dc36606	babd7004-a6e5-4c0b-ba07-b63309109e22	2026-08-01 21:18:15.463025
164b90d8-c90b-4682-85ea-8fc5ceb41978	562a8e2c-35be-4ea6-9fa8-48db5dc36606	3bcdae8c-f4b6-4c76-b6c0-70bdc8ad1fe8	2026-08-01 21:18:15.473844
a1fc1b2d-00f7-498f-b445-1e960cb7c05f	562a8e2c-35be-4ea6-9fa8-48db5dc36606	e2969729-4620-4910-8585-6a2f3d01ffe0	2026-08-01 21:18:15.519722
34fa91a6-229e-4d71-855a-c4ed3a10c27a	562a8e2c-35be-4ea6-9fa8-48db5dc36606	aef265cd-e15e-44e4-8742-27856117e73f	2026-08-01 21:18:15.529141
ea0559a5-f34c-4590-a445-5f3394a0e671	562a8e2c-35be-4ea6-9fa8-48db5dc36606	651b72d8-4888-4c22-bf27-e77f92a61c10	2026-08-01 21:18:15.585207
d9e5d272-b0c9-482b-a5b0-3c7a8a67f73a	562a8e2c-35be-4ea6-9fa8-48db5dc36606	7ce5e22d-a818-41a7-b0dd-ecb6c4e88874	2026-08-01 21:18:15.588431
4469ec2f-bf87-4077-829f-3b6b17d95590	562a8e2c-35be-4ea6-9fa8-48db5dc36606	9ae83958-dddd-4667-8b46-33f377b0e61c	2026-08-01 21:18:15.636962
8c126701-25f2-4ed2-8f1a-09d7c21d71dd	562a8e2c-35be-4ea6-9fa8-48db5dc36606	61510cc9-0325-4dc4-b996-b9cf3c93ca80	2026-08-01 21:18:15.639181
3904edfe-0c2e-43ad-b0c3-80351135e4eb	562a8e2c-35be-4ea6-9fa8-48db5dc36606	17c13aad-7963-4620-a11b-06e247b1b873	2026-08-01 21:18:15.661438
90f1f426-c737-4f45-bb3e-4054be946c62	562a8e2c-35be-4ea6-9fa8-48db5dc36606	f0e98ae7-e219-4488-a740-5c2101422f86	2026-08-01 21:18:15.663453
7c8e1b52-cb12-42e3-906e-c992e034cd95	562a8e2c-35be-4ea6-9fa8-48db5dc36606	98429f77-55d3-4fe0-8306-b5d1ba8124b2	2026-08-01 21:18:15.714691
2466053b-7235-44f5-9430-a1e51983c457	562a8e2c-35be-4ea6-9fa8-48db5dc36606	a12292d9-b3f3-4baf-bcac-68ae914a4d1d	2026-08-01 21:18:15.729644
51d96f90-2701-45c5-b7e2-c2b599bb15c0	562a8e2c-35be-4ea6-9fa8-48db5dc36606	3ae0c0f3-8d25-4d71-8d87-19660efec229	2026-08-01 21:18:15.736112
7ef258ff-945e-46fd-b591-b1874f2649e1	562a8e2c-35be-4ea6-9fa8-48db5dc36606	9b880363-65ee-4794-bd47-55da52fd349c	2026-08-01 21:18:15.73737
d73fe1b9-32dd-4eef-9467-ff041f8a0f42	562a8e2c-35be-4ea6-9fa8-48db5dc36606	a18c261f-732b-4862-b6a4-bcf95bfbd9c9	2026-08-01 21:18:15.790596
df694d19-09d3-4601-a21f-4a2b6b59772d	562a8e2c-35be-4ea6-9fa8-48db5dc36606	ee70a5ab-f696-4222-98b8-8376a1d82051	2026-08-01 21:18:15.795145
f838075e-e7a1-4459-a9d4-96b8a384eac6	562a8e2c-35be-4ea6-9fa8-48db5dc36606	44f510ec-a732-46df-960d-decd719f7ee3	2026-08-01 21:18:15.796013
27c7dea7-9a23-4f5d-95fc-a428aef8cfea	562a8e2c-35be-4ea6-9fa8-48db5dc36606	fbe398e5-ab76-4ed2-8796-bd540fbf709b	2026-08-01 21:18:15.7992
f546b678-7d28-4bc2-9f66-ef294ab6e4b1	562a8e2c-35be-4ea6-9fa8-48db5dc36606	78f4e5b6-7029-4c92-a01a-058c87ce952b	2026-08-01 21:18:15.845352
6f8c91ae-d46d-4941-9c14-367c49e88d96	562a8e2c-35be-4ea6-9fa8-48db5dc36606	7cc03ac0-ea10-43c1-b1d1-b5d094352d6b	2026-08-01 21:18:15.851591
23ccce5b-0f8c-445b-b224-2a77eb4d6ada	562a8e2c-35be-4ea6-9fa8-48db5dc36606	fae803a1-9ce1-436e-987b-70dc74e5b74a	2026-08-01 21:18:15.852054
28efc3d1-5214-4705-a067-88f92bdf709d	562a8e2c-35be-4ea6-9fa8-48db5dc36606	4cadf91c-af1b-4549-85af-6412dd30b306	2026-08-01 21:18:15.85351
3f561189-d4b4-4722-8dbb-77ee66314e55	562a8e2c-35be-4ea6-9fa8-48db5dc36606	9e98d2a1-651d-48cc-a82c-14d5f73df681	2026-08-01 21:18:15.941895
5d5d37a6-44d4-4d42-9d9b-c5aa6aca956b	562a8e2c-35be-4ea6-9fa8-48db5dc36606	76b09149-bfa3-481c-8d0c-cd4aee833040	2026-08-01 21:18:15.944419
6202a284-e368-4df6-b571-40dc51133ad3	562a8e2c-35be-4ea6-9fa8-48db5dc36606	899e2f22-41d9-4263-b408-92ef83628411	2026-08-01 21:18:15.945571
fead12cb-0770-46f3-88f6-9f4fc9ad8c5a	562a8e2c-35be-4ea6-9fa8-48db5dc36606	930bd0d8-abc2-4b27-b308-f548f03f9793	2026-08-01 21:18:15.946904
748c5362-04c2-4dda-b15f-2e46fb5da522	562a8e2c-35be-4ea6-9fa8-48db5dc36606	0011b2ce-396e-4302-98b9-57b0ecf747d0	2026-08-01 21:18:15.994711
bc623fba-1516-44ee-b148-a2d0f77ab33e	562a8e2c-35be-4ea6-9fa8-48db5dc36606	2aba093f-28b0-4c5e-8953-ded025431d9d	2026-08-01 21:18:15.996049
6d2b5e09-b353-4361-93bf-6288d84fad82	562a8e2c-35be-4ea6-9fa8-48db5dc36606	a90bc4ef-383c-4eb0-94c4-f5a4d144622e	2026-08-01 21:18:15.996464
5ec964a1-97eb-41aa-89fc-6551969a95ac	562a8e2c-35be-4ea6-9fa8-48db5dc36606	28909d84-a799-485a-ad25-31f0a124b8a7	2026-08-01 21:18:15.997553
f74cdfc5-9e78-42b7-b792-61ff4af81297	562a8e2c-35be-4ea6-9fa8-48db5dc36606	6dd7e925-a032-4214-8b5d-bf2ff7d311be	2026-08-01 21:18:16.06577
cdfdff48-bfd5-42da-ac86-48cf3b25c984	562a8e2c-35be-4ea6-9fa8-48db5dc36606	cf10080c-8632-4e39-b141-9b20b8c32023	2026-08-01 21:18:16.066452
3af24645-ac44-4549-af52-cbcb0a035e68	562a8e2c-35be-4ea6-9fa8-48db5dc36606	1a8ab615-bb7a-4b66-848b-9204fd386584	2026-08-01 21:18:16.066726
7824fb2d-2bc3-40da-811e-128bfeafbf28	562a8e2c-35be-4ea6-9fa8-48db5dc36606	7e33c9c0-9de3-4d07-9c9c-7377136f0e0b	2026-08-01 21:18:16.067692
a9be62ab-3d09-4155-8964-f0e2c9099fc8	562a8e2c-35be-4ea6-9fa8-48db5dc36606	afc5edf4-f0ec-47be-867c-20a37d5bc259	2026-08-01 21:18:16.092273
3e6290b7-e9c7-41d3-a3f5-6a9a8f0e6dca	53cd533c-13a9-400f-93f5-2fb207239874	94711495-b48e-4952-9c47-f489be7e4374	2026-08-01 23:53:44.822016
9d271b5b-20c0-4a48-8564-fd36a13c9186	53cd533c-13a9-400f-93f5-2fb207239874	7fdbff5b-ad29-4739-a3af-8db0518f3d88	2026-08-01 23:53:44.822016
d601f1b6-91ae-4ebf-b87c-40d51c30ca45	53cd533c-13a9-400f-93f5-2fb207239874	079d1341-b000-4230-96d8-0a9a045da8ff	2026-08-01 23:53:44.822016
e1b90e62-3529-4db4-8ded-af3eaf8b2af8	53cd533c-13a9-400f-93f5-2fb207239874	9fcc93c1-07cc-441f-b8ff-a88e82ae6937	2026-08-01 23:53:44.822016
959d307b-5f97-4327-bec8-b202a8cd0a6e	53cd533c-13a9-400f-93f5-2fb207239874	f0a99c9d-8269-463c-9914-288b8107c876	2026-08-01 23:53:44.822016
6baea7fc-7523-4001-9111-dec52b643e66	53cd533c-13a9-400f-93f5-2fb207239874	04ce8e35-db2f-4e1b-809f-52bafb4cb89d	2026-08-01 23:53:44.822016
47fdaefd-fdb6-419b-8f2e-03e4129d02ae	53cd533c-13a9-400f-93f5-2fb207239874	7e830c93-65d3-4c1a-b566-d432b84a2357	2026-08-01 23:53:44.822016
01a6e462-dea4-48a1-82c9-35fcc7e831d3	53cd533c-13a9-400f-93f5-2fb207239874	d54e92ab-e16f-4364-b4d9-9952ecbf9308	2026-08-01 23:53:44.822016
37437a78-1aa3-4706-9911-d1ee0990dc7a	53cd533c-13a9-400f-93f5-2fb207239874	b7c09571-9e37-451f-9855-3423b23808ef	2026-08-01 23:53:44.822016
3a468998-cb85-4ddc-8550-7c753c6463bd	53cd533c-13a9-400f-93f5-2fb207239874	8a5d04dd-4e49-4224-95b0-08ccd2807560	2026-08-01 23:53:44.822016
e1933ab2-742c-4c4e-8541-83b23e42f196	53cd533c-13a9-400f-93f5-2fb207239874	ae29963d-7c46-43c5-bdad-9d2d50c8f7e6	2026-08-01 23:53:44.822016
da5fa473-c76b-4bea-a33d-f5f956c79b87	53cd533c-13a9-400f-93f5-2fb207239874	85064f41-1e65-4a61-af2c-7fdd007dacca	2026-08-01 23:53:44.822016
c2472a89-bc74-412a-99c0-56efcd2e411f	53cd533c-13a9-400f-93f5-2fb207239874	d31c4792-f791-4429-b5a2-6539dab0dddf	2026-08-01 23:53:44.822016
eebbed22-949b-41eb-8265-5649d0438fc4	53cd533c-13a9-400f-93f5-2fb207239874	a3bc1bbd-130f-417a-ba16-af925aa6829e	2026-08-01 23:53:44.822016
335407ac-b165-40a8-bc5e-9942c5f1c2c1	53cd533c-13a9-400f-93f5-2fb207239874	78a9f184-d0d3-4245-9b54-02978a67da9a	2026-08-01 23:53:44.822016
b952c2d5-1915-40f5-aea0-e5e02cb114fc	53cd533c-13a9-400f-93f5-2fb207239874	53430f04-b5bf-4ef9-8b8c-d541987afa45	2026-08-01 23:53:44.822016
7579d76f-ec3f-4c77-935c-b903597164c7	53cd533c-13a9-400f-93f5-2fb207239874	d9c7c86f-584d-4427-964a-b9d5c6660aad	2026-08-01 23:53:44.822016
ddac5708-9d3e-4ea9-a540-d02b353dbc6c	53cd533c-13a9-400f-93f5-2fb207239874	33b26f49-1a75-4aa4-b0a7-3c6c6ab2eb2d	2026-08-01 23:53:44.822016
726a451b-022b-4156-9e90-919a03c7a7f8	53cd533c-13a9-400f-93f5-2fb207239874	c065391d-3217-4160-8b7c-1c75cafd9d4a	2026-08-01 23:53:44.822016
d641a416-f0a3-4585-8fa6-a9798253844b	53cd533c-13a9-400f-93f5-2fb207239874	701bda0c-99be-4b0b-98a3-432738946c36	2026-08-01 23:53:44.822016
4500d181-eff9-4c6f-97a4-63919284a8a0	53cd533c-13a9-400f-93f5-2fb207239874	e56e7b16-b64b-42c2-aa47-bd4a553b2f07	2026-08-01 23:53:44.822016
e471f94b-91af-4bdc-8557-b2edf2c24bf1	e2b8726d-107c-4504-b98d-835515772a26	94711495-b48e-4952-9c47-f489be7e4374	2026-08-01 23:53:44.822016
4ec9771d-707d-4705-a0b2-071ece28a72e	e2b8726d-107c-4504-b98d-835515772a26	7fdbff5b-ad29-4739-a3af-8db0518f3d88	2026-08-01 23:53:44.822016
830f8732-c69c-4e9b-aa53-59481d59cc6b	e2b8726d-107c-4504-b98d-835515772a26	079d1341-b000-4230-96d8-0a9a045da8ff	2026-08-01 23:53:44.822016
72851585-29fe-4b79-a3a4-d6b8fbbb868f	e2b8726d-107c-4504-b98d-835515772a26	9fcc93c1-07cc-441f-b8ff-a88e82ae6937	2026-08-01 23:53:44.822016
3038efd6-8894-4ec0-86fe-528d2fa6de7a	e2b8726d-107c-4504-b98d-835515772a26	f0a99c9d-8269-463c-9914-288b8107c876	2026-08-01 23:53:44.822016
b30fd19b-c70e-4025-b2d8-44cd5cd7ebf5	e2b8726d-107c-4504-b98d-835515772a26	04ce8e35-db2f-4e1b-809f-52bafb4cb89d	2026-08-01 23:53:44.822016
9ed08063-8d1c-4a6b-9878-aed11bfbb721	e2b8726d-107c-4504-b98d-835515772a26	7e830c93-65d3-4c1a-b566-d432b84a2357	2026-08-01 23:53:44.822016
5f696398-799f-453e-8ed3-1570d54679d5	e2b8726d-107c-4504-b98d-835515772a26	d54e92ab-e16f-4364-b4d9-9952ecbf9308	2026-08-01 23:53:44.822016
26c89b7a-2038-4da1-9388-6ae75ed99bcc	e2b8726d-107c-4504-b98d-835515772a26	b7c09571-9e37-451f-9855-3423b23808ef	2026-08-01 23:53:44.822016
84f197ff-55c4-4203-b5e0-5fd22cda5b0d	e2b8726d-107c-4504-b98d-835515772a26	8a5d04dd-4e49-4224-95b0-08ccd2807560	2026-08-01 23:53:44.822016
cdee3c74-59cb-4068-9755-1b513fafcc88	e2b8726d-107c-4504-b98d-835515772a26	ae29963d-7c46-43c5-bdad-9d2d50c8f7e6	2026-08-01 23:53:44.822016
f3850e19-55b7-469d-a006-0c7fda409fc2	e2b8726d-107c-4504-b98d-835515772a26	85064f41-1e65-4a61-af2c-7fdd007dacca	2026-08-01 23:53:44.822016
6057a61c-8c22-4984-b475-c44f71355a21	e2b8726d-107c-4504-b98d-835515772a26	d31c4792-f791-4429-b5a2-6539dab0dddf	2026-08-01 23:53:44.822016
43fe48e7-f018-4564-a374-f4c154325152	e2b8726d-107c-4504-b98d-835515772a26	a3bc1bbd-130f-417a-ba16-af925aa6829e	2026-08-01 23:53:44.822016
2eb14f49-fa95-4442-a68e-7cdd91c1bee0	e2b8726d-107c-4504-b98d-835515772a26	78a9f184-d0d3-4245-9b54-02978a67da9a	2026-08-01 23:53:44.822016
3a0c5540-1c7c-4065-bbce-19d47fa98c70	e2b8726d-107c-4504-b98d-835515772a26	d9c7c86f-584d-4427-964a-b9d5c6660aad	2026-08-01 23:53:44.822016
5fbea0b3-4747-4eaa-93c4-3765230fd9c8	e2b8726d-107c-4504-b98d-835515772a26	53430f04-b5bf-4ef9-8b8c-d541987afa45	2026-08-01 23:53:44.822016
87d04b35-3679-4896-8cbf-967bbdd2ba40	e2b8726d-107c-4504-b98d-835515772a26	c065391d-3217-4160-8b7c-1c75cafd9d4a	2026-08-01 23:53:44.822016
09dd45c7-a515-4cf4-89b8-8b2d81e5e2e0	e2b8726d-107c-4504-b98d-835515772a26	33b26f49-1a75-4aa4-b0a7-3c6c6ab2eb2d	2026-08-01 23:53:44.822016
fdddf7c6-718a-4d67-b162-873011228d68	e2b8726d-107c-4504-b98d-835515772a26	e56e7b16-b64b-42c2-aa47-bd4a553b2f07	2026-08-01 23:53:44.822016
7c0d6829-3940-4cc3-ab69-7d60c32ad818	e2b8726d-107c-4504-b98d-835515772a26	701bda0c-99be-4b0b-98a3-432738946c36	2026-08-01 23:53:44.822016
afda0969-ca30-45c9-8df9-3176385c760f	562a8e2c-35be-4ea6-9fa8-48db5dc36606	04ce8e35-db2f-4e1b-809f-52bafb4cb89d	2026-08-01 23:53:44.822016
9cf714fa-fe03-45a6-8b7c-576298b152d6	562a8e2c-35be-4ea6-9fa8-48db5dc36606	7e830c93-65d3-4c1a-b566-d432b84a2357	2026-08-01 23:53:44.822016
0db508e1-7e0a-4a11-88c2-ca363986c9a1	562a8e2c-35be-4ea6-9fa8-48db5dc36606	f0a99c9d-8269-463c-9914-288b8107c876	2026-08-01 23:53:44.822016
95f38042-fe15-4589-b04a-8a425a6d0d49	562a8e2c-35be-4ea6-9fa8-48db5dc36606	079d1341-b000-4230-96d8-0a9a045da8ff	2026-08-01 23:53:44.822016
6f3e996f-5b97-466e-9b29-a10c66dad3ab	562a8e2c-35be-4ea6-9fa8-48db5dc36606	7fdbff5b-ad29-4739-a3af-8db0518f3d88	2026-08-01 23:53:44.822016
9311c040-939c-46f4-bf43-c16455e4d860	562a8e2c-35be-4ea6-9fa8-48db5dc36606	9fcc93c1-07cc-441f-b8ff-a88e82ae6937	2026-08-01 23:53:44.822016
c021716c-9f97-4262-8da2-69d08ad89312	562a8e2c-35be-4ea6-9fa8-48db5dc36606	94711495-b48e-4952-9c47-f489be7e4374	2026-08-01 23:53:44.822016
00f5ba9f-55ce-43a8-9bbd-85da513450a7	562a8e2c-35be-4ea6-9fa8-48db5dc36606	c065391d-3217-4160-8b7c-1c75cafd9d4a	2026-08-01 23:53:44.822016
eb5b3731-10d5-4306-991b-e78b97b2d4ef	562a8e2c-35be-4ea6-9fa8-48db5dc36606	33b26f49-1a75-4aa4-b0a7-3c6c6ab2eb2d	2026-08-01 23:53:44.822016
49610c66-6e72-4082-bf52-1231210a00cb	562a8e2c-35be-4ea6-9fa8-48db5dc36606	e56e7b16-b64b-42c2-aa47-bd4a553b2f07	2026-08-01 23:53:44.822016
9c9d118f-1563-4da2-be10-914b3b6f4ac8	562a8e2c-35be-4ea6-9fa8-48db5dc36606	701bda0c-99be-4b0b-98a3-432738946c36	2026-08-01 23:53:44.822016
625d088e-8843-4b3c-9697-16855dd16aa2	562a8e2c-35be-4ea6-9fa8-48db5dc36606	78a9f184-d0d3-4245-9b54-02978a67da9a	2026-08-01 23:53:44.822016
25fb8ade-8b67-4223-b72c-3686509f2f92	562a8e2c-35be-4ea6-9fa8-48db5dc36606	a3bc1bbd-130f-417a-ba16-af925aa6829e	2026-08-01 23:53:44.822016
6988cc88-5f04-4b0c-ba83-cb22d4bf3b50	562a8e2c-35be-4ea6-9fa8-48db5dc36606	d9c7c86f-584d-4427-964a-b9d5c6660aad	2026-08-01 23:53:44.822016
7e25aba9-13cc-4b42-9653-cca12b9330f6	562a8e2c-35be-4ea6-9fa8-48db5dc36606	53430f04-b5bf-4ef9-8b8c-d541987afa45	2026-08-01 23:53:44.822016
42098e76-f40c-4499-a23f-6957e4af6e47	562a8e2c-35be-4ea6-9fa8-48db5dc36606	ae29963d-7c46-43c5-bdad-9d2d50c8f7e6	2026-08-01 23:53:44.822016
fe0cc2ef-8310-4a1b-8353-520113f52490	562a8e2c-35be-4ea6-9fa8-48db5dc36606	8a5d04dd-4e49-4224-95b0-08ccd2807560	2026-08-01 23:53:44.822016
0b3c6133-2fb0-4122-bbcf-e26325abc080	562a8e2c-35be-4ea6-9fa8-48db5dc36606	d31c4792-f791-4429-b5a2-6539dab0dddf	2026-08-01 23:53:44.822016
b98f1c49-1729-4162-9fee-a63480b55901	562a8e2c-35be-4ea6-9fa8-48db5dc36606	85064f41-1e65-4a61-af2c-7fdd007dacca	2026-08-01 23:53:44.822016
8f42340a-6f91-479d-a4cc-ad41b67cb298	562a8e2c-35be-4ea6-9fa8-48db5dc36606	d54e92ab-e16f-4364-b4d9-9952ecbf9308	2026-08-01 23:53:44.822016
a515f79a-4728-4df2-b5a8-01fd85eb1c43	562a8e2c-35be-4ea6-9fa8-48db5dc36606	b7c09571-9e37-451f-9855-3423b23808ef	2026-08-01 23:53:44.822016
3687f691-a237-4ef1-bbaf-04140fbe8f16	1974e6ed-0de8-40e9-b951-f3e76208abea	d31c4792-f791-4429-b5a2-6539dab0dddf	2026-08-01 23:53:44.822016
5252bc2c-dd57-48b4-bb12-942b52eee39d	1974e6ed-0de8-40e9-b951-f3e76208abea	85064f41-1e65-4a61-af2c-7fdd007dacca	2026-08-01 23:53:44.822016
b4ba92e0-61b2-4e30-af73-bd21209f9967	1974e6ed-0de8-40e9-b951-f3e76208abea	e56e7b16-b64b-42c2-aa47-bd4a553b2f07	2026-08-01 23:53:44.822016
efeed50a-4ef7-409e-ab74-23a5fc528d90	53cd533c-13a9-400f-93f5-2fb207239874	fb86d2c0-db9a-465c-b319-185e0434b2de	2026-08-02 16:30:42.007972
e264b643-d11b-4434-94ae-c5bdac5500b5	e2b8726d-107c-4504-b98d-835515772a26	fb86d2c0-db9a-465c-b319-185e0434b2de	2026-08-02 16:30:42.007972
7072fb5c-88bb-43f2-93df-ba93e92709e5	562a8e2c-35be-4ea6-9fa8-48db5dc36606	fb86d2c0-db9a-465c-b319-185e0434b2de	2026-08-02 16:30:42.007972
eac5a246-e8b0-4ccb-8cf9-fd8f498dd227	53cd533c-13a9-400f-93f5-2fb207239874	e142e4f9-9ce3-4243-b168-caef6bb614d6	2026-08-02 16:30:42.007972
0de3a007-4092-498e-ad7c-2d4fcfa776b3	e2b8726d-107c-4504-b98d-835515772a26	e142e4f9-9ce3-4243-b168-caef6bb614d6	2026-08-02 16:30:42.007972
81fe8fc6-f34f-4d68-971b-d4944e33e64c	562a8e2c-35be-4ea6-9fa8-48db5dc36606	e142e4f9-9ce3-4243-b168-caef6bb614d6	2026-08-02 16:30:42.007972
a30729e9-e2e1-4089-8bcb-b91331d47050	53cd533c-13a9-400f-93f5-2fb207239874	e90b5dfa-993e-4efb-969b-651bcd1b3a4e	2026-08-02 16:30:42.007972
b52aa188-3166-48cb-b78f-fafa4a81ddfc	e2b8726d-107c-4504-b98d-835515772a26	e90b5dfa-993e-4efb-969b-651bcd1b3a4e	2026-08-02 16:30:42.007972
410cbfbb-9961-43c1-bd6f-389e5f6da6ad	562a8e2c-35be-4ea6-9fa8-48db5dc36606	e90b5dfa-993e-4efb-969b-651bcd1b3a4e	2026-08-02 16:30:42.007972
29c4a966-d00c-4900-979b-a2b069d859d2	53cd533c-13a9-400f-93f5-2fb207239874	c7153377-2678-41e2-9304-80c715871f73	2026-08-02 16:30:42.007972
4c1137fb-3f94-4260-b41b-238f052c9fef	e2b8726d-107c-4504-b98d-835515772a26	c7153377-2678-41e2-9304-80c715871f73	2026-08-02 16:30:42.007972
155ba38f-7789-4f7b-ae78-4f4630b262a1	562a8e2c-35be-4ea6-9fa8-48db5dc36606	c7153377-2678-41e2-9304-80c715871f73	2026-08-02 16:30:42.007972
16b78d83-b919-45fc-b732-5300cf408f76	53cd533c-13a9-400f-93f5-2fb207239874	b8fe8c5f-bbba-4440-8ed4-63279f683c40	2026-08-02 16:30:42.007972
f03ce4ca-2396-4c4a-b349-5751113cb202	e2b8726d-107c-4504-b98d-835515772a26	b8fe8c5f-bbba-4440-8ed4-63279f683c40	2026-08-02 16:30:42.007972
cfe82db0-7010-4216-8c24-026a9c5af235	562a8e2c-35be-4ea6-9fa8-48db5dc36606	b8fe8c5f-bbba-4440-8ed4-63279f683c40	2026-08-02 16:30:42.007972
9241b159-b830-40e6-bbb5-47e6c8d4cb21	53cd533c-13a9-400f-93f5-2fb207239874	4178e1c7-b30d-4b37-ac0d-f3c8a9ce3589	2026-08-02 16:30:42.007972
82ceef7b-01c3-4844-afb4-de668693e41a	e2b8726d-107c-4504-b98d-835515772a26	4178e1c7-b30d-4b37-ac0d-f3c8a9ce3589	2026-08-02 16:30:42.007972
af000f3b-fdf6-463d-9763-a991d7cd0c1b	562a8e2c-35be-4ea6-9fa8-48db5dc36606	4178e1c7-b30d-4b37-ac0d-f3c8a9ce3589	2026-08-02 16:30:42.007972
896104de-629a-4eda-af11-61b96ce132bd	53cd533c-13a9-400f-93f5-2fb207239874	2d36513d-1c3a-49ce-a2c0-9e05a51c8d60	2026-08-02 16:30:42.007972
581e2115-49ae-4bf6-9c43-57696bc7378f	e2b8726d-107c-4504-b98d-835515772a26	2d36513d-1c3a-49ce-a2c0-9e05a51c8d60	2026-08-02 16:30:42.007972
49557496-66e1-45a6-86b3-681d8fe7ecda	562a8e2c-35be-4ea6-9fa8-48db5dc36606	2d36513d-1c3a-49ce-a2c0-9e05a51c8d60	2026-08-02 16:30:42.007972
527521a7-bc0d-41e7-8f19-3b365e25de8e	53cd533c-13a9-400f-93f5-2fb207239874	b790c33e-86cb-4184-8a08-781f5707c9b8	2026-08-03 19:54:07.268021
f216e7b3-d9e4-4ee1-a707-8d1d873420ad	53cd533c-13a9-400f-93f5-2fb207239874	e96070bc-676b-4214-b679-c657ad6a6c0c	2026-08-03 19:54:07.268021
376ca091-943f-4a36-b48e-cb93aab05225	53cd533c-13a9-400f-93f5-2fb207239874	e3df2f33-b000-4178-b6df-59f283d5c3ef	2026-08-03 19:54:07.268021
8067dd38-a53f-47b3-bf1f-d64960e9896c	53cd533c-13a9-400f-93f5-2fb207239874	77f8f266-801f-4bf1-b410-ec5fa6956d69	2026-08-03 19:54:07.268021
f68264e3-33f5-4725-83c5-60f8ae4a3ed0	53cd533c-13a9-400f-93f5-2fb207239874	63ebb8a9-5873-4d7d-bc9a-61d5673174e1	2026-08-03 19:54:07.268021
e418254d-3852-4b22-b7fe-e9ca57b19e8f	53cd533c-13a9-400f-93f5-2fb207239874	3295842a-274d-47b5-acf2-5bbb25502a7c	2026-08-03 19:54:07.268021
d6d34e05-dc56-44c4-b213-076ef3d6a107	53cd533c-13a9-400f-93f5-2fb207239874	87d32681-31bb-44b9-b380-5b64147e4dd8	2026-08-03 19:54:07.268021
0f50369b-6dc1-46d8-bc7c-3e61e39e62f8	e2b8726d-107c-4504-b98d-835515772a26	b790c33e-86cb-4184-8a08-781f5707c9b8	2026-08-03 19:54:07.268021
80a12cbe-61e5-45b2-91f0-43da2bcadafd	e2b8726d-107c-4504-b98d-835515772a26	e96070bc-676b-4214-b679-c657ad6a6c0c	2026-08-03 19:54:07.268021
67a062fb-fd66-4eb2-8e21-da1b720c41d2	e2b8726d-107c-4504-b98d-835515772a26	e3df2f33-b000-4178-b6df-59f283d5c3ef	2026-08-03 19:54:07.268021
e50cb907-b0bf-4d7b-9e38-7c4196bf4b9f	e2b8726d-107c-4504-b98d-835515772a26	77f8f266-801f-4bf1-b410-ec5fa6956d69	2026-08-03 19:54:07.268021
7767f24e-cf22-4e67-aa36-5b67d19a32e4	e2b8726d-107c-4504-b98d-835515772a26	63ebb8a9-5873-4d7d-bc9a-61d5673174e1	2026-08-03 19:54:07.268021
65d04e2a-579b-4145-9740-d775db2b52e2	e2b8726d-107c-4504-b98d-835515772a26	3295842a-274d-47b5-acf2-5bbb25502a7c	2026-08-03 19:54:07.268021
9c7dc5d2-9e60-402d-ba13-854c3f18ecd7	e2b8726d-107c-4504-b98d-835515772a26	87d32681-31bb-44b9-b380-5b64147e4dd8	2026-08-03 19:54:07.268021
73126a8e-af48-44fc-991e-366b4c1722f7	562a8e2c-35be-4ea6-9fa8-48db5dc36606	77f8f266-801f-4bf1-b410-ec5fa6956d69	2026-08-03 19:54:07.268021
7128ac67-5e4a-4f90-9b24-32cc8b2bbaa6	562a8e2c-35be-4ea6-9fa8-48db5dc36606	e96070bc-676b-4214-b679-c657ad6a6c0c	2026-08-03 19:54:07.268021
0295cd5f-a2ee-4b21-ab59-135e26e5853d	562a8e2c-35be-4ea6-9fa8-48db5dc36606	e3df2f33-b000-4178-b6df-59f283d5c3ef	2026-08-03 19:54:07.268021
5923033d-9760-44e6-8335-dfb13d30fed4	562a8e2c-35be-4ea6-9fa8-48db5dc36606	b790c33e-86cb-4184-8a08-781f5707c9b8	2026-08-03 19:54:07.268021
8481f447-63d9-43c5-8860-7c5b900d4bc7	562a8e2c-35be-4ea6-9fa8-48db5dc36606	87d32681-31bb-44b9-b380-5b64147e4dd8	2026-08-03 19:54:07.268021
acd66d86-ecb0-44f0-892c-081e5cdccf21	562a8e2c-35be-4ea6-9fa8-48db5dc36606	3295842a-274d-47b5-acf2-5bbb25502a7c	2026-08-03 19:54:07.268021
fdf37d02-a57d-47e9-8686-6c5281eef04d	562a8e2c-35be-4ea6-9fa8-48db5dc36606	63ebb8a9-5873-4d7d-bc9a-61d5673174e1	2026-08-03 19:54:07.268021
5210c85e-288c-4b50-8b28-088d031c00ee	1974e6ed-0de8-40e9-b951-f3e76208abea	3295842a-274d-47b5-acf2-5bbb25502a7c	2026-08-03 19:54:07.268021
5137ac83-7b66-4a86-a5c0-4144f28fe8ae	1974e6ed-0de8-40e9-b951-f3e76208abea	87d32681-31bb-44b9-b380-5b64147e4dd8	2026-08-03 19:54:07.268021
da86d02b-a869-4530-8f42-3add5deaf119	1974e6ed-0de8-40e9-b951-f3e76208abea	e3df2f33-b000-4178-b6df-59f283d5c3ef	2026-08-03 19:54:07.268021
87cfa60d-e4c0-4a7f-bad4-8f3b2c4f0c5f	53cd533c-13a9-400f-93f5-2fb207239874	cb2302c6-f2da-4333-9b98-24245f468b1e	2026-08-03 20:39:39.661038
edc88bbe-6ced-4da4-a3f6-6e19098aca53	53cd533c-13a9-400f-93f5-2fb207239874	efbb62bd-e51d-4f01-80ce-0363d440bd41	2026-08-03 20:39:39.691051
5fc9f1a4-7568-4509-92d9-35c87917b314	53cd533c-13a9-400f-93f5-2fb207239874	41803582-c338-424e-9e97-1ba7abc139a1	2026-08-03 20:39:39.759352
e82c412c-180a-4d49-9d19-e97a89bd605b	53cd533c-13a9-400f-93f5-2fb207239874	48c1ed30-3310-4552-babb-74f18c779d16	2026-08-03 20:39:39.763444
1e5102a3-c6cf-490c-a3d8-fbd2b0827a14	53cd533c-13a9-400f-93f5-2fb207239874	1d032f5d-493c-4019-8668-7c055dbd1959	2026-08-03 20:39:39.847932
999b8fc5-1b6c-4728-b1c7-edd85555d347	53cd533c-13a9-400f-93f5-2fb207239874	67a36a67-1a37-4362-80e8-328dbd8ddbd5	2026-08-03 20:39:39.8485
d7965cbd-a5c8-45da-b535-2a952e29a06e	53cd533c-13a9-400f-93f5-2fb207239874	ee643269-d023-4b52-a9d3-caf40acfcdcd	2026-08-03 20:39:39.904258
4852bb82-edbc-4f3b-8687-ed3e8f374899	53cd533c-13a9-400f-93f5-2fb207239874	4f89a6f0-cf90-4115-8dab-a9cd19730230	2026-08-03 20:39:39.905227
5f154096-8fa5-482b-b4cd-a565251d09bd	53cd533c-13a9-400f-93f5-2fb207239874	ab76c75d-881e-4169-80e5-83db4c153d44	2026-08-03 20:39:39.991671
4d40ecd3-e3c1-4dd8-adb8-8acc8ab92e12	53cd533c-13a9-400f-93f5-2fb207239874	1016de93-9e5e-4c89-a224-72a3904bbead	2026-08-03 20:39:39.993701
7b4594f8-5892-4fc1-96b6-763035945299	53cd533c-13a9-400f-93f5-2fb207239874	d9519e47-ae1d-4b6b-a758-16ce5f2f7a63	2026-08-03 20:39:40.083983
f5ead140-d0eb-4cc3-9d60-01f678e3092d	53cd533c-13a9-400f-93f5-2fb207239874	0f06f2a6-1eaf-4b32-8256-e052681914e6	2026-08-03 20:39:40.08708
dbd2ba89-ff4b-440e-a407-26d4beb0b067	53cd533c-13a9-400f-93f5-2fb207239874	9e7300a0-5203-4c58-99a7-86e61873cfb9	2026-08-03 20:39:40.165471
ad554b32-aed3-42d9-b085-ea003bcf7403	53cd533c-13a9-400f-93f5-2fb207239874	e88b839b-cad4-48e0-830d-6e845162c9c4	2026-08-03 20:39:40.18577
1a376ae2-9fde-4edc-8423-f3c8b8763a32	53cd533c-13a9-400f-93f5-2fb207239874	70fc3974-f889-4005-b522-87e17609214d	2026-08-03 20:39:40.225326
2fad3727-558d-4b62-943d-e6fe4195b41a	53cd533c-13a9-400f-93f5-2fb207239874	73fcd5f4-a41d-4318-98f9-0ba19c50fec5	2026-08-03 20:39:40.232809
137e32e3-9fe3-4605-a2f8-b18daac92be3	53cd533c-13a9-400f-93f5-2fb207239874	99993d4f-ea72-4877-a5e4-e7126c6c53c4	2026-08-03 20:39:40.233405
6e6a4aa4-a1f2-4b70-a256-6ac151232a37	53cd533c-13a9-400f-93f5-2fb207239874	e7ded78c-bf45-4f0f-80b1-8a07762c8287	2026-08-03 20:39:40.31119
7f2c0ad9-7759-4042-ae5d-a9cd35ae5706	53cd533c-13a9-400f-93f5-2fb207239874	9f5734eb-0f25-423f-9d73-4f6064537472	2026-08-03 20:39:40.367249
537a9c3e-001d-4a8e-b6dc-1395e8f2288c	53cd533c-13a9-400f-93f5-2fb207239874	4ccb1763-f2ab-452d-9ebb-db6f43fc8a3f	2026-08-03 20:39:40.368841
6699a1c7-dd85-4ca7-b770-18e2737502b9	53cd533c-13a9-400f-93f5-2fb207239874	98693c79-9753-4047-8ee6-8d161a25a56f	2026-08-03 20:39:40.369852
5132124d-e089-41b1-99f2-86883467cb3c	53cd533c-13a9-400f-93f5-2fb207239874	a271a740-a018-4bbd-8c16-2abaa48373c6	2026-08-03 20:39:40.371181
e65c5648-56bf-4f64-9ff2-c7e65312d1da	53cd533c-13a9-400f-93f5-2fb207239874	c511eeb2-9e7c-40c6-8ab1-b241e83b8a3e	2026-08-03 20:39:40.374955
41d9dca0-ae98-47d4-be1a-041fbba1e65d	53cd533c-13a9-400f-93f5-2fb207239874	4d019099-629a-4602-987c-0ff95d5784aa	2026-08-03 20:39:40.441371
4190fe52-934a-42fa-9946-d3e995cd5905	53cd533c-13a9-400f-93f5-2fb207239874	786b92b2-599a-41e9-a56c-5bd9fe8b01aa	2026-08-03 20:39:40.504501
1a09ec9a-cb28-4d10-bc08-5f5221861559	53cd533c-13a9-400f-93f5-2fb207239874	babd7004-a6e5-4c0b-ba07-b63309109e22	2026-08-03 20:39:40.508553
a908fbcf-cdaf-40f0-943c-e6e328ee6bce	53cd533c-13a9-400f-93f5-2fb207239874	3bcdae8c-f4b6-4c76-b6c0-70bdc8ad1fe8	2026-08-03 20:39:40.50902
e9555b5c-40b5-4387-b712-7cd0c468d30c	53cd533c-13a9-400f-93f5-2fb207239874	3b30c266-3221-464b-86e8-7db8d13da0fc	2026-08-03 20:39:40.511353
13e545b9-63fa-49dd-90dc-5731f844ae1b	53cd533c-13a9-400f-93f5-2fb207239874	f0e98ae7-e219-4488-a740-5c2101422f86	2026-08-03 20:39:40.512149
9efe6bfc-e5c0-4117-b060-0fbd7f8fa395	53cd533c-13a9-400f-93f5-2fb207239874	17c13aad-7963-4620-a11b-06e247b1b873	2026-08-03 20:39:40.597061
a6b86ee5-0b42-4bb7-a041-520da8d9713f	53cd533c-13a9-400f-93f5-2fb207239874	e2969729-4620-4910-8585-6a2f3d01ffe0	2026-08-03 20:39:40.643946
b81de926-4f98-4de4-b42d-e9d5b47c9f55	53cd533c-13a9-400f-93f5-2fb207239874	0e7e6da7-16a3-4595-9818-ddd3715130b8	2026-08-03 20:39:40.646156
a82dc738-6408-4a17-92d6-1b941b09c11b	53cd533c-13a9-400f-93f5-2fb207239874	aef265cd-e15e-44e4-8742-27856117e73f	2026-08-03 20:39:40.648525
44cb1aa6-3a19-411b-abfc-0eb1d8540bc6	53cd533c-13a9-400f-93f5-2fb207239874	7bcfcbe7-1113-4008-a07f-8ad1f50d8dd4	2026-08-03 20:39:40.649692
12b1a21f-5207-45a4-b30c-623c44cd90e9	53cd533c-13a9-400f-93f5-2fb207239874	58f77d7a-c0f1-4726-9eb8-a3fb4cca95e5	2026-08-03 20:39:40.650479
9d27ce0d-47c7-40e2-91e1-ff7797d7a97c	53cd533c-13a9-400f-93f5-2fb207239874	651b72d8-4888-4c22-bf27-e77f92a61c10	2026-08-03 20:39:40.776295
2825c5e7-ca81-45b5-96ed-d6689dc58a5f	53cd533c-13a9-400f-93f5-2fb207239874	3ae0c0f3-8d25-4d71-8d87-19660efec229	2026-08-03 20:39:40.935526
93a98d2a-7bbe-4e56-b044-0404a30fea94	53cd533c-13a9-400f-93f5-2fb207239874	9b880363-65ee-4794-bd47-55da52fd349c	2026-08-03 20:39:41.067367
6c718226-de7d-46ce-a06f-a4af21b16eb5	53cd533c-13a9-400f-93f5-2fb207239874	4a251712-8742-4d68-a25b-9b44bcc4c548	2026-08-03 20:39:41.208637
7cac4edd-b545-425d-946a-12696662765b	53cd533c-13a9-400f-93f5-2fb207239874	9e98d2a1-651d-48cc-a82c-14d5f73df681	2026-08-03 20:39:41.352462
d162afee-ea53-4681-9ff6-2cdd253828bc	53cd533c-13a9-400f-93f5-2fb207239874	2aba093f-28b0-4c5e-8953-ded025431d9d	2026-08-03 20:39:41.483631
4c686238-af13-4244-b7de-0ef54a609078	53cd533c-13a9-400f-93f5-2fb207239874	6dd7e925-a032-4214-8b5d-bf2ff7d311be	2026-08-03 20:39:41.626676
e089ab88-b03b-4df5-9602-4742fa985609	53cd533c-13a9-400f-93f5-2fb207239874	53430f04-b5bf-4ef9-8b8c-d541987afa45	2026-08-03 20:39:41.746392
6bb9429e-26fe-407a-9109-a6cf9ec4634e	53cd533c-13a9-400f-93f5-2fb207239874	8a5d04dd-4e49-4224-95b0-08ccd2807560	2026-08-03 20:39:41.850493
4d27aa82-ad61-45fc-8759-b14ef329064c	53cd533c-13a9-400f-93f5-2fb207239874	04ce8e35-db2f-4e1b-809f-52bafb4cb89d	2026-08-03 20:39:41.982686
4a15dafb-b528-48c9-b432-ece52d28a9d6	53cd533c-13a9-400f-93f5-2fb207239874	7e830c93-65d3-4c1a-b566-d432b84a2357	2026-08-03 20:39:42.108941
bdaa9c11-a256-4909-83d1-33ac921c6aa3	53cd533c-13a9-400f-93f5-2fb207239874	4178e1c7-b30d-4b37-ac0d-f3c8a9ce3589	2026-08-03 20:39:42.218663
c27f6835-055a-4e2c-b9a6-0709c7ef3eb9	53cd533c-13a9-400f-93f5-2fb207239874	2d36513d-1c3a-49ce-a2c0-9e05a51c8d60	2026-08-03 20:39:42.318443
679f8225-6e1a-44fa-b7a0-a6cf2f378519	53cd533c-13a9-400f-93f5-2fb207239874	7ce5e22d-a818-41a7-b0dd-ecb6c4e88874	2026-08-03 20:39:40.798646
c93c8c20-2a42-4097-bebb-b9ca9e36f1df	53cd533c-13a9-400f-93f5-2fb207239874	a12292d9-b3f3-4baf-bcac-68ae914a4d1d	2026-08-03 20:39:40.931648
396caebe-5ac2-482c-8c98-a7e6f81ff8d7	53cd533c-13a9-400f-93f5-2fb207239874	a18c261f-732b-4862-b6a4-bcf95bfbd9c9	2026-08-03 20:39:41.069152
2c57cdac-6f3d-4da5-a30a-373e74db701e	53cd533c-13a9-400f-93f5-2fb207239874	fae803a1-9ce1-436e-987b-70dc74e5b74a	2026-08-03 20:39:41.207611
aeeac232-f9d3-4f9c-a70d-4b3828ff9f72	53cd533c-13a9-400f-93f5-2fb207239874	4cadf91c-af1b-4549-85af-6412dd30b306	2026-08-03 20:39:41.350031
fdc3cdfa-ba83-4bca-8b6b-96a14ee82936	53cd533c-13a9-400f-93f5-2fb207239874	d2c0760e-c337-4e99-abe1-837e0624c2d1	2026-08-03 20:39:41.484129
ecc8f456-95d6-47e2-a7fe-056aa070a1f7	53cd533c-13a9-400f-93f5-2fb207239874	28909d84-a799-485a-ad25-31f0a124b8a7	2026-08-03 20:39:41.62575
190ee13a-c2f4-46bd-9765-778bc9cc3119	53cd533c-13a9-400f-93f5-2fb207239874	9fcc93c1-07cc-441f-b8ff-a88e82ae6937	2026-08-03 20:39:41.747085
8b7b75a2-f269-4917-afc8-ba868bbba2a5	53cd533c-13a9-400f-93f5-2fb207239874	d54e92ab-e16f-4364-b4d9-9952ecbf9308	2026-08-03 20:39:41.848728
4307b44e-144e-4af8-bdf2-ec33828d0b05	53cd533c-13a9-400f-93f5-2fb207239874	33b26f49-1a75-4aa4-b0a7-3c6c6ab2eb2d	2026-08-03 20:39:41.983474
900f3594-a2d6-4299-adcf-7a1ccaca5136	53cd533c-13a9-400f-93f5-2fb207239874	e56e7b16-b64b-42c2-aa47-bd4a553b2f07	2026-08-03 20:39:42.109846
4fac641b-6090-4387-94e4-ebb39e1ff2d6	53cd533c-13a9-400f-93f5-2fb207239874	b8fe8c5f-bbba-4440-8ed4-63279f683c40	2026-08-03 20:39:42.217918
9a0f754d-0b27-46b1-a161-dbf15392f97f	53cd533c-13a9-400f-93f5-2fb207239874	e3df2f33-b000-4178-b6df-59f283d5c3ef	2026-08-03 20:39:42.397085
b4c3b49d-5d9d-415a-a787-bb6189bbc76e	53cd533c-13a9-400f-93f5-2fb207239874	adebee34-d381-40ab-91b0-d49c021290dd	2026-08-03 20:39:40.795969
30855dc0-19f4-4fa4-84a8-bbb92a4240f9	53cd533c-13a9-400f-93f5-2fb207239874	0d4b1b91-4f35-4935-8857-b088767292a6	2026-08-03 20:39:40.930903
6568dc90-5e15-4c7b-8a68-2c83cbf24e48	53cd533c-13a9-400f-93f5-2fb207239874	7cc03ac0-ea10-43c1-b1d1-b5d094352d6b	2026-08-03 20:39:41.206111
dc0188b8-8541-4424-a4aa-f5e44116d73f	53cd533c-13a9-400f-93f5-2fb207239874	76b09149-bfa3-481c-8d0c-cd4aee833040	2026-08-03 20:39:41.35419
ababea2e-43ed-4501-b4e7-143fc3fe997f	53cd533c-13a9-400f-93f5-2fb207239874	526f8cc6-062b-42b2-bdbb-41485dffaee2	2026-08-03 20:39:41.48162
718710f1-8118-4937-8033-14489ed540a6	53cd533c-13a9-400f-93f5-2fb207239874	cf10080c-8632-4e39-b141-9b20b8c32023	2026-08-03 20:39:41.628955
c85c33ce-24b0-49cf-8563-e0c418c4ae72	53cd533c-13a9-400f-93f5-2fb207239874	d31c4792-f791-4429-b5a2-6539dab0dddf	2026-08-03 20:39:41.74521
1702a933-b0ef-437f-84b5-40883f47c481	53cd533c-13a9-400f-93f5-2fb207239874	c065391d-3217-4160-8b7c-1c75cafd9d4a	2026-08-03 20:39:41.850845
fdd8fe6a-8066-4ac8-9e96-1f45311be0ce	53cd533c-13a9-400f-93f5-2fb207239874	85064f41-1e65-4a61-af2c-7fdd007dacca	2026-08-03 20:39:41.982046
2350e361-5b4c-4e05-9e30-f40c8355ef78	53cd533c-13a9-400f-93f5-2fb207239874	701bda0c-99be-4b0b-98a3-432738946c36	2026-08-03 20:39:42.111129
948c0caf-0e2a-4ed1-974f-d3df12865ebc	53cd533c-13a9-400f-93f5-2fb207239874	e142e4f9-9ce3-4243-b168-caef6bb614d6	2026-08-03 20:39:42.2156
036ca062-e853-4d27-8822-7fcc1f7c439d	53cd533c-13a9-400f-93f5-2fb207239874	77f8f266-801f-4bf1-b410-ec5fa6956d69	2026-08-03 20:39:42.400706
a8d47d9b-a92e-4f27-9ab3-ea89b3e6f29d	53cd533c-13a9-400f-93f5-2fb207239874	9ae83958-dddd-4667-8b46-33f377b0e61c	2026-08-03 20:39:40.799571
7de70c62-681a-4e54-b089-20f72026c705	53cd533c-13a9-400f-93f5-2fb207239874	98429f77-55d3-4fe0-8306-b5d1ba8124b2	2026-08-03 20:39:40.930504
1400beb9-4a9d-480d-8503-475be56de5b1	53cd533c-13a9-400f-93f5-2fb207239874	e8890ad2-079f-4ed4-85a1-bb5da3b65359	2026-08-03 20:39:41.206615
ca98f077-cc55-4314-b15f-5ed1138ff081	53cd533c-13a9-400f-93f5-2fb207239874	fe3cea93-eead-41a2-b214-7d78f838f9d3	2026-08-03 20:39:41.353564
c0f5e415-ef38-4218-9b29-e37220057500	53cd533c-13a9-400f-93f5-2fb207239874	a90bc4ef-383c-4eb0-94c4-f5a4d144622e	2026-08-03 20:39:41.482328
bf81c9b6-b746-4570-83ed-e2e497d09b2b	53cd533c-13a9-400f-93f5-2fb207239874	db5c84df-d810-470b-b3d3-f26bbaa992d8	2026-08-03 20:39:41.628553
04976c49-c211-456c-9660-9932d79719d1	53cd533c-13a9-400f-93f5-2fb207239874	079d1341-b000-4230-96d8-0a9a045da8ff	2026-08-03 20:39:41.745589
0adab01a-04f4-41c0-ade7-d87922ac81af	53cd533c-13a9-400f-93f5-2fb207239874	7fdbff5b-ad29-4739-a3af-8db0518f3d88	2026-08-03 20:39:41.849578
b22bb3c1-6ffc-4031-9c54-bcc6518cd7c3	53cd533c-13a9-400f-93f5-2fb207239874	d9c7c86f-584d-4427-964a-b9d5c6660aad	2026-08-03 20:39:41.982392
f0b1435c-089a-4e14-8629-0f3537156d68	53cd533c-13a9-400f-93f5-2fb207239874	78a9f184-d0d3-4245-9b54-02978a67da9a	2026-08-03 20:39:42.110357
181f090a-77b0-43fd-82c9-399c6aa3d5a8	53cd533c-13a9-400f-93f5-2fb207239874	c7153377-2678-41e2-9304-80c715871f73	2026-08-03 20:39:42.216881
bd6bb1d7-2b01-4c10-9ec8-878ad225e791	53cd533c-13a9-400f-93f5-2fb207239874	63ebb8a9-5873-4d7d-bc9a-61d5673174e1	2026-08-03 20:39:42.399365
3052ffa6-77b2-4b20-a655-2ca93bf0d576	53cd533c-13a9-400f-93f5-2fb207239874	1a8873dd-eb12-4007-89ab-d84e2062e918	2026-08-03 20:39:40.801179
af9394c6-2448-401b-b163-d25cb5dc1b9d	53cd533c-13a9-400f-93f5-2fb207239874	b3414ef7-b896-4c97-a8cb-6fc198e67047	2026-08-03 20:39:40.928616
a1441772-a034-4068-82cf-c28849d160e3	53cd533c-13a9-400f-93f5-2fb207239874	78f4e5b6-7029-4c92-a01a-058c87ce952b	2026-08-03 20:39:41.20517
5962a33c-cae2-40cf-8236-d4ebadfa39e9	53cd533c-13a9-400f-93f5-2fb207239874	899e2f22-41d9-4263-b408-92ef83628411	2026-08-03 20:39:41.362182
939b69f5-5640-402f-b88a-cf6753012e94	53cd533c-13a9-400f-93f5-2fb207239874	0011b2ce-396e-4302-98b9-57b0ecf747d0	2026-08-03 20:39:41.481251
d4471144-887e-4afd-98a8-d20ea32c08d0	53cd533c-13a9-400f-93f5-2fb207239874	1a8ab615-bb7a-4b66-848b-9204fd386584	2026-08-03 20:39:41.629914
40eff813-692d-4a41-a2a5-96f856642624	53cd533c-13a9-400f-93f5-2fb207239874	afc5edf4-f0ec-47be-867c-20a37d5bc259	2026-08-03 20:39:41.744395
3d34085a-5992-4171-bff8-c2fec9e3b552	53cd533c-13a9-400f-93f5-2fb207239874	f0a99c9d-8269-463c-9914-288b8107c876	2026-08-03 20:39:41.851667
be3631c8-8f82-4936-830a-ae4c954b82f9	53cd533c-13a9-400f-93f5-2fb207239874	a5306f7f-b657-47d5-ba62-479a88a60a22	2026-08-03 20:39:41.981625
658e1b2d-aa26-4e7a-961a-c3642d32ea5a	53cd533c-13a9-400f-93f5-2fb207239874	b7c09571-9e37-451f-9855-3423b23808ef	2026-08-03 20:39:42.110819
ef17ad0b-8951-4fea-84a6-d9b1e38beb61	53cd533c-13a9-400f-93f5-2fb207239874	e90b5dfa-993e-4efb-969b-651bcd1b3a4e	2026-08-03 20:39:42.216416
3c382a41-5d74-4d74-bb31-1cad4369edf5	53cd533c-13a9-400f-93f5-2fb207239874	87d32681-31bb-44b9-b380-5b64147e4dd8	2026-08-03 20:39:42.400378
8d1f826c-83af-49c7-90f0-7a788e6028ac	53cd533c-13a9-400f-93f5-2fb207239874	e96070bc-676b-4214-b679-c657ad6a6c0c	2026-08-03 20:39:42.445253
1b8216e0-9505-4a88-9174-44a5986b1cc0	53cd533c-13a9-400f-93f5-2fb207239874	61510cc9-0325-4dc4-b996-b9cf3c93ca80	2026-08-03 20:39:40.803457
cf137de9-1d65-474a-8b42-beed14353417	53cd533c-13a9-400f-93f5-2fb207239874	90be2ab6-38f8-4bde-9d80-199771e345c7	2026-08-03 20:39:40.929025
e39dfe47-676e-495e-8d38-f6cefa54097a	53cd533c-13a9-400f-93f5-2fb207239874	ddff7299-0615-40d3-aabe-57c839d20efb	2026-08-03 20:39:41.364516
d35c4aa4-3527-43e5-8839-79698ceb6306	53cd533c-13a9-400f-93f5-2fb207239874	930bd0d8-abc2-4b27-b308-f548f03f9793	2026-08-03 20:39:41.478235
c190366d-4d12-4d72-bcbb-acd9dff87ec9	53cd533c-13a9-400f-93f5-2fb207239874	8f64dc3b-deab-4c18-88be-79c99318ad8b	2026-08-03 20:39:41.6308
2f6e1fe1-7f0a-4838-a360-3bc4461b76c6	53cd533c-13a9-400f-93f5-2fb207239874	7e33c9c0-9de3-4d07-9c9c-7377136f0e0b	2026-08-03 20:39:41.743597
c968344d-a49e-431e-9dfc-f2aae6d3b6ad	53cd533c-13a9-400f-93f5-2fb207239874	a3bc1bbd-130f-417a-ba16-af925aa6829e	2026-08-03 20:39:41.85244
3dcbf91c-0cf1-407e-ba0e-adfca8bd926c	53cd533c-13a9-400f-93f5-2fb207239874	ae29963d-7c46-43c5-bdad-9d2d50c8f7e6	2026-08-03 20:39:41.980685
d0fb384a-6397-4f57-89d5-39ef31560892	53cd533c-13a9-400f-93f5-2fb207239874	94711495-b48e-4952-9c47-f489be7e4374	2026-08-03 20:39:42.11218
1adbc4a1-6da0-4ba2-bc20-74f619188336	53cd533c-13a9-400f-93f5-2fb207239874	fb86d2c0-db9a-465c-b319-185e0434b2de	2026-08-03 20:39:42.214773
efffc828-5503-4fa0-9688-282b686cc874	53cd533c-13a9-400f-93f5-2fb207239874	3295842a-274d-47b5-acf2-5bbb25502a7c	2026-08-03 20:39:42.4011
6a852dbb-f38f-4249-88fa-c6022b5ed4b1	53cd533c-13a9-400f-93f5-2fb207239874	b790c33e-86cb-4184-8a08-781f5707c9b8	2026-08-03 20:39:42.445545
5834f21a-0e00-4e04-87b9-1112d95aacc4	53cd533c-13a9-400f-93f5-2fb207239874	cb2302c6-f2da-4333-9b98-24245f468b1e	2026-08-04 17:16:41.344545
5b00a164-e30d-44a7-a1b1-34ce001ef46e	53cd533c-13a9-400f-93f5-2fb207239874	efbb62bd-e51d-4f01-80ce-0363d440bd41	2026-08-04 17:16:41.347322
983a0372-82e6-4b6e-9d3a-f4401d162f87	53cd533c-13a9-400f-93f5-2fb207239874	41803582-c338-424e-9e97-1ba7abc139a1	2026-08-04 17:16:41.462097
fd900a25-c68c-40bd-9375-1719297cf8ae	53cd533c-13a9-400f-93f5-2fb207239874	48c1ed30-3310-4552-babb-74f18c779d16	2026-08-04 17:16:41.464067
b1bd9236-3662-4fc7-880f-749794ad4285	53cd533c-13a9-400f-93f5-2fb207239874	1d032f5d-493c-4019-8668-7c055dbd1959	2026-08-04 17:16:41.53951
75e6af7e-5929-4b83-8f27-71236eda7ebf	53cd533c-13a9-400f-93f5-2fb207239874	67a36a67-1a37-4362-80e8-328dbd8ddbd5	2026-08-04 17:16:41.541815
e4ab18a1-223c-4af8-8b45-75d7b0b13548	53cd533c-13a9-400f-93f5-2fb207239874	ee643269-d023-4b52-a9d3-caf40acfcdcd	2026-08-04 17:16:41.594803
92b2838b-ac63-4351-96a4-79a5da58a65c	53cd533c-13a9-400f-93f5-2fb207239874	4f89a6f0-cf90-4115-8dab-a9cd19730230	2026-08-04 17:16:41.5972
cc93f9ce-2f1f-4aab-9e61-a4a842166780	53cd533c-13a9-400f-93f5-2fb207239874	98693c79-9753-4047-8ee6-8d161a25a56f	2026-08-04 17:16:41.690914
22d76d1c-47b8-47d5-8cc4-d790c0df66c5	53cd533c-13a9-400f-93f5-2fb207239874	70fc3974-f889-4005-b522-87e17609214d	2026-08-04 17:16:41.714922
e99eedec-da6b-4c39-b8eb-d1b2d9787fe9	53cd533c-13a9-400f-93f5-2fb207239874	73fcd5f4-a41d-4318-98f9-0ba19c50fec5	2026-08-04 17:16:41.747632
0118eebb-697d-42ac-8048-a9da7a16bb21	53cd533c-13a9-400f-93f5-2fb207239874	99993d4f-ea72-4877-a5e4-e7126c6c53c4	2026-08-04 17:16:41.744836
9597175e-6f60-48b9-950a-883e16942367	53cd533c-13a9-400f-93f5-2fb207239874	d9519e47-ae1d-4b6b-a758-16ce5f2f7a63	2026-08-04 17:16:41.818174
91f43427-7b6f-422c-8382-159ec2e5ab33	53cd533c-13a9-400f-93f5-2fb207239874	0f06f2a6-1eaf-4b32-8256-e052681914e6	2026-08-04 17:16:41.900639
67ffc722-05dd-4251-ab0d-59b211727852	53cd533c-13a9-400f-93f5-2fb207239874	9e7300a0-5203-4c58-99a7-86e61873cfb9	2026-08-04 17:16:41.911632
d9c202ce-1cf0-429a-8a63-8abbaced9450	53cd533c-13a9-400f-93f5-2fb207239874	1016de93-9e5e-4c89-a224-72a3904bbead	2026-08-04 17:16:41.912073
36e09ccc-0e2e-4702-bb8a-c6363602c148	53cd533c-13a9-400f-93f5-2fb207239874	e88b839b-cad4-48e0-830d-6e845162c9c4	2026-08-04 17:16:41.915364
cd6563bc-0e8a-45cf-8cde-1c101554615e	53cd533c-13a9-400f-93f5-2fb207239874	ab76c75d-881e-4169-80e5-83db4c153d44	2026-08-04 17:16:41.938301
d9d2119e-9103-4939-aba6-be6f7a8765b6	53cd533c-13a9-400f-93f5-2fb207239874	4ccb1763-f2ab-452d-9ebb-db6f43fc8a3f	2026-08-04 17:16:42.000416
d2cbf73f-3ee9-4d45-98ee-21f302614aa8	53cd533c-13a9-400f-93f5-2fb207239874	e7ded78c-bf45-4f0f-80b1-8a07762c8287	2026-08-04 17:16:42.06079
d5de7d78-ff98-4940-a272-6a667cd3b499	53cd533c-13a9-400f-93f5-2fb207239874	9f5734eb-0f25-423f-9d73-4f6064537472	2026-08-04 17:16:42.063011
566d8fcf-0cd9-4a44-b33f-3d254993176a	53cd533c-13a9-400f-93f5-2fb207239874	a271a740-a018-4bbd-8c16-2abaa48373c6	2026-08-04 17:16:42.063491
3fc03154-1b21-418e-96f3-2896fc866ae6	53cd533c-13a9-400f-93f5-2fb207239874	c511eeb2-9e7c-40c6-8ab1-b241e83b8a3e	2026-08-04 17:16:42.064051
70543150-b7aa-4433-9856-8ded0715229e	53cd533c-13a9-400f-93f5-2fb207239874	4d019099-629a-4602-987c-0ff95d5784aa	2026-08-04 17:16:42.095295
c73e178b-5907-462a-94ea-56d981fef183	53cd533c-13a9-400f-93f5-2fb207239874	786b92b2-599a-41e9-a56c-5bd9fe8b01aa	2026-08-04 17:16:42.188052
d3903f38-744b-42d6-a189-95fedd7e0ece	53cd533c-13a9-400f-93f5-2fb207239874	babd7004-a6e5-4c0b-ba07-b63309109e22	2026-08-04 17:16:42.214818
28f215d2-be2b-4da9-9a58-d6e60d62be3c	53cd533c-13a9-400f-93f5-2fb207239874	3bcdae8c-f4b6-4c76-b6c0-70bdc8ad1fe8	2026-08-04 17:16:42.215404
3ef4ef08-6ce2-48c6-8877-15446b994c61	53cd533c-13a9-400f-93f5-2fb207239874	3b30c266-3221-464b-86e8-7db8d13da0fc	2026-08-04 17:16:42.217188
81467489-f4a1-4bbf-9789-54f8585841a3	53cd533c-13a9-400f-93f5-2fb207239874	f0e98ae7-e219-4488-a740-5c2101422f86	2026-08-04 17:16:42.240139
52f48fe7-c0c9-4e12-a446-e9b791287c85	53cd533c-13a9-400f-93f5-2fb207239874	17c13aad-7963-4620-a11b-06e247b1b873	2026-08-04 17:16:42.254275
06bd39d1-8cd8-48bc-b67f-85a9160b3de8	53cd533c-13a9-400f-93f5-2fb207239874	e2969729-4620-4910-8585-6a2f3d01ffe0	2026-08-04 17:16:42.376513
49f7b489-127b-4fe8-b5d7-46960d65f033	53cd533c-13a9-400f-93f5-2fb207239874	0e7e6da7-16a3-4595-9818-ddd3715130b8	2026-08-04 17:16:42.395537
72050781-7752-4db8-8ab0-cf701d04e1bc	53cd533c-13a9-400f-93f5-2fb207239874	aef265cd-e15e-44e4-8742-27856117e73f	2026-08-04 17:16:42.395948
f4247d3e-db11-4cb2-8220-0407884d38bc	53cd533c-13a9-400f-93f5-2fb207239874	7bcfcbe7-1113-4008-a07f-8ad1f50d8dd4	2026-08-04 17:16:42.396312
e2b52f04-64f5-48bf-b0cd-aac1a094296a	53cd533c-13a9-400f-93f5-2fb207239874	58f77d7a-c0f1-4726-9eb8-a3fb4cca95e5	2026-08-04 17:16:42.404539
c5c19f0e-08c1-40c3-a2ed-4ac8b2a60ca0	53cd533c-13a9-400f-93f5-2fb207239874	651b72d8-4888-4c22-bf27-e77f92a61c10	2026-08-04 17:16:42.409064
6367fdd2-61f5-48fb-a2db-47a54f33e8d9	53cd533c-13a9-400f-93f5-2fb207239874	adebee34-d381-40ab-91b0-d49c021290dd	2026-08-04 17:16:42.561191
b1fdb761-66a8-4ca9-8bc5-d184a25b2796	53cd533c-13a9-400f-93f5-2fb207239874	9ae83958-dddd-4667-8b46-33f377b0e61c	2026-08-04 17:16:42.573706
e31991b0-b5f5-49c9-8771-62a65abf24f2	53cd533c-13a9-400f-93f5-2fb207239874	7ce5e22d-a818-41a7-b0dd-ecb6c4e88874	2026-08-04 17:16:42.573228
44d5fe70-e650-4794-986e-7f95de06485a	53cd533c-13a9-400f-93f5-2fb207239874	1a8873dd-eb12-4007-89ab-d84e2062e918	2026-08-04 17:16:42.574545
c9b4bc5b-c113-41ef-b61c-29b6354ea815	53cd533c-13a9-400f-93f5-2fb207239874	61510cc9-0325-4dc4-b996-b9cf3c93ca80	2026-08-04 17:16:42.576527
dca2117c-11c4-44dd-8e32-1ba3d9dc1d96	53cd533c-13a9-400f-93f5-2fb207239874	b3414ef7-b896-4c97-a8cb-6fc198e67047	2026-08-04 17:16:42.578184
e384d1ad-1dde-4ee3-bd99-ee5cb0f8f904	53cd533c-13a9-400f-93f5-2fb207239874	90be2ab6-38f8-4bde-9d80-199771e345c7	2026-08-04 17:16:42.738171
b6fee586-fe4a-4401-801a-9f42f6cc1ace	53cd533c-13a9-400f-93f5-2fb207239874	98429f77-55d3-4fe0-8306-b5d1ba8124b2	2026-08-04 17:16:42.739229
223e08d7-b094-4402-9ae6-0ac5ebed8f48	53cd533c-13a9-400f-93f5-2fb207239874	0d4b1b91-4f35-4935-8857-b088767292a6	2026-08-04 17:16:42.74167
1b803cb7-da28-48ec-99c5-8580f9f8f6a2	53cd533c-13a9-400f-93f5-2fb207239874	a12292d9-b3f3-4baf-bcac-68ae914a4d1d	2026-08-04 17:16:42.74258
bdf4bcb9-0be2-45fd-8a3d-4302f7c83edb	53cd533c-13a9-400f-93f5-2fb207239874	3ae0c0f3-8d25-4d71-8d87-19660efec229	2026-08-04 17:16:42.74357
338722a6-69fd-4061-b1fd-9ade91651c2c	53cd533c-13a9-400f-93f5-2fb207239874	9b880363-65ee-4794-bd47-55da52fd349c	2026-08-04 17:16:42.743974
aa9ba8c6-88fd-4863-891a-9238fa04542d	53cd533c-13a9-400f-93f5-2fb207239874	a18c261f-732b-4862-b6a4-bcf95bfbd9c9	2026-08-04 17:16:42.882388
dd8cc157-62ad-4ed5-9637-74ad3e7a29e6	53cd533c-13a9-400f-93f5-2fb207239874	78f4e5b6-7029-4c92-a01a-058c87ce952b	2026-08-04 17:16:43.043926
aef45f96-9e42-4197-bf0b-561d6f1a4776	53cd533c-13a9-400f-93f5-2fb207239874	e8890ad2-079f-4ed4-85a1-bb5da3b65359	2026-08-04 17:16:43.050054
aa7e7038-20de-465e-bb3b-64787d843af4	53cd533c-13a9-400f-93f5-2fb207239874	7cc03ac0-ea10-43c1-b1d1-b5d094352d6b	2026-08-04 17:16:43.050642
0a4120fe-910d-44da-a33c-cd59bdebc0c1	53cd533c-13a9-400f-93f5-2fb207239874	fae803a1-9ce1-436e-987b-70dc74e5b74a	2026-08-04 17:16:43.052239
3f0111d5-4340-4f1f-a73c-70e83ca39bfb	53cd533c-13a9-400f-93f5-2fb207239874	4a251712-8742-4d68-a25b-9b44bcc4c548	2026-08-04 17:16:43.054597
311da44e-8a0c-48c6-a242-de141b466bf0	53cd533c-13a9-400f-93f5-2fb207239874	4cadf91c-af1b-4549-85af-6412dd30b306	2026-08-04 17:16:43.055165
2e1f6991-3109-42a7-98f4-04feb253094e	53cd533c-13a9-400f-93f5-2fb207239874	9e98d2a1-651d-48cc-a82c-14d5f73df681	2026-08-04 17:16:43.252762
0385a18b-c727-4a73-9d58-742e36c9b937	53cd533c-13a9-400f-93f5-2fb207239874	fe3cea93-eead-41a2-b214-7d78f838f9d3	2026-08-04 17:16:43.254578
166914bc-b5da-4674-afa7-51962bc260f4	53cd533c-13a9-400f-93f5-2fb207239874	76b09149-bfa3-481c-8d0c-cd4aee833040	2026-08-04 17:16:43.255096
1eb64897-308d-4aa5-8cb6-e8e4b822592a	53cd533c-13a9-400f-93f5-2fb207239874	899e2f22-41d9-4263-b408-92ef83628411	2026-08-04 17:16:43.255679
ef143668-5848-416b-a039-14c367c64fdf	53cd533c-13a9-400f-93f5-2fb207239874	ddff7299-0615-40d3-aabe-57c839d20efb	2026-08-04 17:16:43.258177
65beebcd-6eee-4b8d-86e3-8424dc295f38	53cd533c-13a9-400f-93f5-2fb207239874	930bd0d8-abc2-4b27-b308-f548f03f9793	2026-08-04 17:16:43.258651
4324d4e2-1fad-4ab6-977c-38ac17a79dba	53cd533c-13a9-400f-93f5-2fb207239874	0011b2ce-396e-4302-98b9-57b0ecf747d0	2026-08-04 17:16:43.415621
27960e16-7748-47b1-973d-0cf35028ac48	53cd533c-13a9-400f-93f5-2fb207239874	526f8cc6-062b-42b2-bdbb-41485dffaee2	2026-08-04 17:16:43.417511
f75d5a9d-6a95-493d-8705-67d928a240df	53cd533c-13a9-400f-93f5-2fb207239874	a90bc4ef-383c-4eb0-94c4-f5a4d144622e	2026-08-04 17:16:43.4189
858f7cf5-e79e-4662-aa55-518d6fea97b1	53cd533c-13a9-400f-93f5-2fb207239874	2aba093f-28b0-4c5e-8953-ded025431d9d	2026-08-04 17:16:43.42034
05b4f60c-e754-4c99-a533-32781ee87ee3	53cd533c-13a9-400f-93f5-2fb207239874	d2c0760e-c337-4e99-abe1-837e0624c2d1	2026-08-04 17:16:43.422212
044605dd-1ccb-4150-bb53-599e4c061fad	53cd533c-13a9-400f-93f5-2fb207239874	28909d84-a799-485a-ad25-31f0a124b8a7	2026-08-04 17:16:43.423204
cab02b56-019a-44a6-966a-a9da90f295dc	53cd533c-13a9-400f-93f5-2fb207239874	6dd7e925-a032-4214-8b5d-bf2ff7d311be	2026-08-04 17:16:43.570295
33ef2052-f604-496c-bab1-f5fd903d01fb	53cd533c-13a9-400f-93f5-2fb207239874	db5c84df-d810-470b-b3d3-f26bbaa992d8	2026-08-04 17:16:43.570642
bf7d0d1e-2598-4aab-9d1a-6f4469429699	53cd533c-13a9-400f-93f5-2fb207239874	cf10080c-8632-4e39-b141-9b20b8c32023	2026-08-04 17:16:43.5725
0c06451b-1c18-4624-abf5-44bd9924c0d7	53cd533c-13a9-400f-93f5-2fb207239874	1a8ab615-bb7a-4b66-848b-9204fd386584	2026-08-04 17:16:43.584719
82efba01-47ec-4a3e-ab94-e6579172f7e4	53cd533c-13a9-400f-93f5-2fb207239874	8f64dc3b-deab-4c18-88be-79c99318ad8b	2026-08-04 17:16:43.585975
2fa95b0e-1e64-4041-b33e-17afdf9e598f	53cd533c-13a9-400f-93f5-2fb207239874	7e33c9c0-9de3-4d07-9c9c-7377136f0e0b	2026-08-04 17:16:43.587638
f4bf1c22-52e2-4df3-9767-37a305c4a15e	53cd533c-13a9-400f-93f5-2fb207239874	afc5edf4-f0ec-47be-867c-20a37d5bc259	2026-08-04 17:16:43.706901
1fcc47ba-4728-4d57-b47f-18f25bd5023b	53cd533c-13a9-400f-93f5-2fb207239874	d31c4792-f791-4429-b5a2-6539dab0dddf	2026-08-04 17:16:43.724184
40898cdd-03ab-472e-b470-6264c1ccc384	53cd533c-13a9-400f-93f5-2fb207239874	079d1341-b000-4230-96d8-0a9a045da8ff	2026-08-04 17:16:43.724663
26cf2e45-542d-4ef6-bde3-604d198f83db	53cd533c-13a9-400f-93f5-2fb207239874	53430f04-b5bf-4ef9-8b8c-d541987afa45	2026-08-04 17:16:43.726287
f22831d9-4c1b-49e4-9c08-b1bee8834562	53cd533c-13a9-400f-93f5-2fb207239874	9fcc93c1-07cc-441f-b8ff-a88e82ae6937	2026-08-04 17:16:43.726855
70171b84-8dd5-4724-9817-8d6354e18336	53cd533c-13a9-400f-93f5-2fb207239874	d54e92ab-e16f-4364-b4d9-9952ecbf9308	2026-08-04 17:16:43.729763
c5b8842b-653c-41f8-9737-1e1bf10e25f1	53cd533c-13a9-400f-93f5-2fb207239874	7fdbff5b-ad29-4739-a3af-8db0518f3d88	2026-08-04 17:16:43.916734
a143104d-8bab-48ef-b52d-95ace80c215b	53cd533c-13a9-400f-93f5-2fb207239874	8a5d04dd-4e49-4224-95b0-08ccd2807560	2026-08-04 17:16:43.917522
622b7f1f-cce7-40b1-880a-e68066dbcff5	53cd533c-13a9-400f-93f5-2fb207239874	c065391d-3217-4160-8b7c-1c75cafd9d4a	2026-08-04 17:16:43.9183
0cc1b629-2c26-41e0-b0af-59fc2155a132	53cd533c-13a9-400f-93f5-2fb207239874	f0a99c9d-8269-463c-9914-288b8107c876	2026-08-04 17:16:43.918714
d035ba43-c2c0-4be1-8827-bb6244a26eec	53cd533c-13a9-400f-93f5-2fb207239874	a3bc1bbd-130f-417a-ba16-af925aa6829e	2026-08-04 17:16:43.919812
1ee835cd-7e8a-4adc-8fbf-ef23f26a021b	53cd533c-13a9-400f-93f5-2fb207239874	ae29963d-7c46-43c5-bdad-9d2d50c8f7e6	2026-08-04 17:16:43.920697
37b98b0b-61d6-4284-9144-8038d3f8df13	53cd533c-13a9-400f-93f5-2fb207239874	a5306f7f-b657-47d5-ba62-479a88a60a22	2026-08-04 17:16:44.070404
aa0ed53c-6177-4e59-9754-8a5fba89c12d	53cd533c-13a9-400f-93f5-2fb207239874	85064f41-1e65-4a61-af2c-7fdd007dacca	2026-08-04 17:16:44.071495
cf07d696-9580-43e0-bd0e-99ffe9845ce2	53cd533c-13a9-400f-93f5-2fb207239874	04ce8e35-db2f-4e1b-809f-52bafb4cb89d	2026-08-04 17:16:44.071832
4870824d-f667-4e96-bdcc-359409c56a89	53cd533c-13a9-400f-93f5-2fb207239874	d9c7c86f-584d-4427-964a-b9d5c6660aad	2026-08-04 17:16:44.072128
c65bea74-d002-4fa3-a67e-fb2e78151143	53cd533c-13a9-400f-93f5-2fb207239874	33b26f49-1a75-4aa4-b0a7-3c6c6ab2eb2d	2026-08-04 17:16:44.072853
a106fd4d-835a-497c-924e-8475d0e97883	53cd533c-13a9-400f-93f5-2fb207239874	7e830c93-65d3-4c1a-b566-d432b84a2357	2026-08-04 17:16:44.073171
a0bd8e61-2d7c-4491-a28c-c3da0c44a420	53cd533c-13a9-400f-93f5-2fb207239874	e56e7b16-b64b-42c2-aa47-bd4a553b2f07	2026-08-04 17:16:44.205037
32a789dc-2fe5-423d-a3da-a0fabedff25f	53cd533c-13a9-400f-93f5-2fb207239874	78a9f184-d0d3-4245-9b54-02978a67da9a	2026-08-04 17:16:44.20596
eb9e10a5-ba31-4ce8-9255-fdb8101aadb0	53cd533c-13a9-400f-93f5-2fb207239874	4178e1c7-b30d-4b37-ac0d-f3c8a9ce3589	2026-08-04 17:16:44.358402
5c75ebc5-2aa8-4f55-b9e4-dc1c6cc634e0	53cd533c-13a9-400f-93f5-2fb207239874	63ebb8a9-5873-4d7d-bc9a-61d5673174e1	2026-08-04 17:16:44.53242
14f6a073-5d1d-4bba-bc43-580a3f72c5b2	53cd533c-13a9-400f-93f5-2fb207239874	701bda0c-99be-4b0b-98a3-432738946c36	2026-08-04 17:16:44.206309
434ce5d8-971a-46ca-9750-3489718e9f6a	53cd533c-13a9-400f-93f5-2fb207239874	b8fe8c5f-bbba-4440-8ed4-63279f683c40	2026-08-04 17:16:44.357705
955d2734-edbe-4233-89a2-e2c2d99ed70d	53cd533c-13a9-400f-93f5-2fb207239874	87d32681-31bb-44b9-b380-5b64147e4dd8	2026-08-04 17:16:44.532818
23735da3-6fca-4eb3-a94e-812f6b3a015b	53cd533c-13a9-400f-93f5-2fb207239874	2d36513d-1c3a-49ce-a2c0-9e05a51c8d60	2026-08-04 17:16:44.358996
3795da1f-92d2-4ee0-a0cf-892f59b0c7e8	53cd533c-13a9-400f-93f5-2fb207239874	e3df2f33-b000-4178-b6df-59f283d5c3ef	2026-08-04 17:16:44.520532
659be6e1-172c-479c-9c5e-170184037d29	53cd533c-13a9-400f-93f5-2fb207239874	44f510ec-a732-46df-960d-decd719f7ee3	2026-08-11 19:42:17.374912
06a1c23c-be3e-4d3f-be35-5f8861e4cdd4	53cd533c-13a9-400f-93f5-2fb207239874	b7c09571-9e37-451f-9855-3423b23808ef	2026-08-04 17:16:44.206705
7672040f-1a0d-4ae0-9aae-ada67b660a12	53cd533c-13a9-400f-93f5-2fb207239874	c7153377-2678-41e2-9304-80c715871f73	2026-08-04 17:16:44.357381
b9b3c9c3-58fa-4749-94da-e829ccac6bf2	53cd533c-13a9-400f-93f5-2fb207239874	77f8f266-801f-4bf1-b410-ec5fa6956d69	2026-08-04 17:16:44.533248
cd375556-2777-497e-b163-f380b3a0da1b	53cd533c-13a9-400f-93f5-2fb207239874	0d4b1b91-4f35-4935-8857-b088767292a6	2026-08-04 18:34:13.635095
0dc76b0f-0966-4ac2-bd30-b22567674a1c	53cd533c-13a9-400f-93f5-2fb207239874	a12292d9-b3f3-4baf-bcac-68ae914a4d1d	2026-08-04 18:34:13.779296
d7c624a2-5e35-43c6-a467-b62ceb6caf21	53cd533c-13a9-400f-93f5-2fb207239874	58f77d7a-c0f1-4726-9eb8-a3fb4cca95e5	2026-08-04 18:34:13.84672
cc834e9e-6c5b-4cf0-bba6-0ce3baec1a25	53cd533c-13a9-400f-93f5-2fb207239874	e8890ad2-079f-4ed4-85a1-bb5da3b65359	2026-08-04 18:34:13.92846
f489ea89-80a5-4734-8352-4c63e806bf11	53cd533c-13a9-400f-93f5-2fb207239874	1a8873dd-eb12-4007-89ab-d84e2062e918	2026-08-04 18:34:13.998434
92a5153c-aab8-4072-b9ac-adaf97759165	53cd533c-13a9-400f-93f5-2fb207239874	9ae83958-dddd-4667-8b46-33f377b0e61c	2026-08-04 18:34:14.068287
20e52b52-c45b-44e7-a777-eb2c0a5c5be9	53cd533c-13a9-400f-93f5-2fb207239874	94711495-b48e-4952-9c47-f489be7e4374	2026-08-04 18:34:14.157881
0eb93051-d8a1-49b9-92b8-ade6aa73d660	53cd533c-13a9-400f-93f5-2fb207239874	fe3cea93-eead-41a2-b214-7d78f838f9d3	2026-08-04 18:34:14.259492
ea133f61-0c6f-4a27-952f-f635c357ce26	53cd533c-13a9-400f-93f5-2fb207239874	cb2302c6-f2da-4333-9b98-24245f468b1e	2026-08-04 18:34:14.35545
668386de-fdce-4acf-b685-9d9b80a42d97	53cd533c-13a9-400f-93f5-2fb207239874	b8fe8c5f-bbba-4440-8ed4-63279f683c40	2026-08-04 18:34:14.481875
2ac324b4-a4c4-4b1d-a077-790a4ee5c71d	53cd533c-13a9-400f-93f5-2fb207239874	70fc3974-f889-4005-b522-87e17609214d	2026-08-04 18:34:14.577631
65cb80f9-9b32-44b6-9fd2-5b99e9ad08e9	53cd533c-13a9-400f-93f5-2fb207239874	c065391d-3217-4160-8b7c-1c75cafd9d4a	2026-08-04 18:34:14.663797
31732bb6-ca80-4f8b-a2ae-8addab819989	53cd533c-13a9-400f-93f5-2fb207239874	8a5d04dd-4e49-4224-95b0-08ccd2807560	2026-08-04 18:34:14.761057
d00cd0ef-0398-4978-80b0-34c5d073fc3e	53cd533c-13a9-400f-93f5-2fb207239874	98693c79-9753-4047-8ee6-8d161a25a56f	2026-08-04 18:34:14.846213
04751c87-3bc7-4170-9d3f-2928a03676ad	53cd533c-13a9-400f-93f5-2fb207239874	899e2f22-41d9-4263-b408-92ef83628411	2026-08-04 18:34:14.934033
575c480f-1374-4f48-9420-d5beb878757f	53cd533c-13a9-400f-93f5-2fb207239874	db5c84df-d810-470b-b3d3-f26bbaa992d8	2026-08-04 18:34:15.02439
ccb3c0af-d65f-4f11-b972-3bc50954949b	53cd533c-13a9-400f-93f5-2fb207239874	4f89a6f0-cf90-4115-8dab-a9cd19730230	2026-08-04 18:34:15.11505
21e16057-d023-43a2-84ed-acc63c819ae8	53cd533c-13a9-400f-93f5-2fb207239874	d9519e47-ae1d-4b6b-a758-16ce5f2f7a63	2026-08-04 18:34:15.221103
2e490083-bc74-4499-8307-fd87abeeed28	53cd533c-13a9-400f-93f5-2fb207239874	fae803a1-9ce1-436e-987b-70dc74e5b74a	2026-08-04 18:34:15.324577
8eee9f56-2f5f-4d6a-a077-777b0314b8ff	e2b8726d-107c-4504-b98d-835515772a26	efbb62bd-e51d-4f01-80ce-0363d440bd41	2026-08-05 08:12:46.553497
2af6c9a1-2ccc-4d03-a864-d58ee55a1b1b	e2b8726d-107c-4504-b98d-835515772a26	41803582-c338-424e-9e97-1ba7abc139a1	2026-08-05 08:12:46.635187
a9274f91-d870-477f-b937-1e74fd71c709	e2b8726d-107c-4504-b98d-835515772a26	a5306f7f-b657-47d5-ba62-479a88a60a22	2026-08-05 08:12:46.693364
2726ff06-fad6-438b-a761-9cdb1437d7e5	e2b8726d-107c-4504-b98d-835515772a26	4f89a6f0-cf90-4115-8dab-a9cd19730230	2026-08-05 08:12:46.75012
18e6409b-efd0-417a-8fbf-161b82470d48	e2b8726d-107c-4504-b98d-835515772a26	4a251712-8742-4d68-a25b-9b44bcc4c548	2026-08-05 08:12:46.811511
ecc69bfc-7e27-4ff4-9fe8-0f928f535e0b	e2b8726d-107c-4504-b98d-835515772a26	99993d4f-ea72-4877-a5e4-e7126c6c53c4	2026-08-05 08:12:46.962151
d8153b2b-b3b1-4c93-837b-05e9352af322	53cd533c-13a9-400f-93f5-2fb207239874	bc3543ab-62c2-44bf-b823-79a3eb8442a0	2026-08-07 17:46:13.870067
a1efc12a-16b6-463f-9930-80534d6bf525	53cd533c-13a9-400f-93f5-2fb207239874	dc30ae54-59d2-4dd0-9274-c8f22e54d5a2	2026-08-07 17:46:13.870067
5333312a-91c3-43e4-98e9-6768c42926b8	53cd533c-13a9-400f-93f5-2fb207239874	68635909-767b-49b9-b7fc-c71412adccfa	2026-08-07 17:46:13.870067
746cc9d8-9be9-458d-9fd9-7fe8169207f7	53cd533c-13a9-400f-93f5-2fb207239874	e47b2587-16fa-41cd-a588-2dea924b1f2d	2026-08-07 17:46:13.870067
bcf40251-e90b-4b7a-b655-6bed341f0d72	53cd533c-13a9-400f-93f5-2fb207239874	991976d3-ff46-4bad-8093-0d439f08edb7	2026-08-07 17:46:13.870067
c318b7d1-91c5-4112-95ca-400ed700b576	e2b8726d-107c-4504-b98d-835515772a26	bc3543ab-62c2-44bf-b823-79a3eb8442a0	2026-08-07 17:46:13.870067
928458f6-1233-4664-acbc-46e57d728513	e2b8726d-107c-4504-b98d-835515772a26	68635909-767b-49b9-b7fc-c71412adccfa	2026-08-07 17:46:13.870067
f694443b-de46-4297-8cdd-6d26b21b0c17	e2b8726d-107c-4504-b98d-835515772a26	dc30ae54-59d2-4dd0-9274-c8f22e54d5a2	2026-08-07 17:46:13.870067
7f521819-1812-4659-89e1-b3813606282c	e2b8726d-107c-4504-b98d-835515772a26	e47b2587-16fa-41cd-a588-2dea924b1f2d	2026-08-07 17:46:13.870067
e0126e1c-3b80-4359-97f5-b690ab404448	e2b8726d-107c-4504-b98d-835515772a26	991976d3-ff46-4bad-8093-0d439f08edb7	2026-08-07 17:46:13.870067
396a8357-3f83-4bb2-b024-be2d9a0670cf	562a8e2c-35be-4ea6-9fa8-48db5dc36606	bc3543ab-62c2-44bf-b823-79a3eb8442a0	2026-08-07 17:46:13.870067
5201ae62-0af2-4223-8782-0b5319b497c7	562a8e2c-35be-4ea6-9fa8-48db5dc36606	991976d3-ff46-4bad-8093-0d439f08edb7	2026-08-07 17:46:13.870067
9e7b0a58-20fe-47c0-b40d-5d550b6789f0	562a8e2c-35be-4ea6-9fa8-48db5dc36606	e47b2587-16fa-41cd-a588-2dea924b1f2d	2026-08-07 17:46:13.870067
f5f4c16d-3638-41ec-a163-209938eb8f94	562a8e2c-35be-4ea6-9fa8-48db5dc36606	68635909-767b-49b9-b7fc-c71412adccfa	2026-08-07 17:46:13.870067
748ac197-57f9-4a45-937f-cfc8bf2231d1	562a8e2c-35be-4ea6-9fa8-48db5dc36606	dc30ae54-59d2-4dd0-9274-c8f22e54d5a2	2026-08-07 17:46:13.870067
b6c97b30-aa25-487d-be08-dd3da0838ac7	1974e6ed-0de8-40e9-b951-f3e76208abea	e47b2587-16fa-41cd-a588-2dea924b1f2d	2026-08-07 17:46:13.870067
9054517a-35c7-42f3-ae5d-912d6afd9427	1974e6ed-0de8-40e9-b951-f3e76208abea	68635909-767b-49b9-b7fc-c71412adccfa	2026-08-07 17:46:13.870067
b7250268-46f3-4e00-a175-3f0f8bc7db97	1974e6ed-0de8-40e9-b951-f3e76208abea	991976d3-ff46-4bad-8093-0d439f08edb7	2026-08-07 17:46:13.870067
523659a2-6b23-4c8d-bfa3-a09a3f45d84f	b1370815-7b78-49bd-b3f6-ca765d129abe	991976d3-ff46-4bad-8093-0d439f08edb7	2026-08-07 17:46:13.870067
d3329fc2-b63d-4070-aaa8-75450b09d8f2	53cd533c-13a9-400f-93f5-2fb207239874	d3e3f362-43a2-405b-bde6-7eca7ba73984	2026-08-08 09:33:37.830146
cca98bd1-bcbc-468d-a94e-29ab1e156acb	53cd533c-13a9-400f-93f5-2fb207239874	9bcecb8b-2dc8-432b-9f6b-a99b42639ad5	2026-08-08 09:33:37.830146
9546e72c-a25e-489d-a313-2447a14ec69c	53cd533c-13a9-400f-93f5-2fb207239874	bfcb391e-eb80-4ee6-91c8-5165e6709aa5	2026-08-08 09:33:37.830146
935f2700-eadb-465d-92f1-8b26d598f01a	e2b8726d-107c-4504-b98d-835515772a26	d3e3f362-43a2-405b-bde6-7eca7ba73984	2026-08-08 09:33:37.830146
6e04df0a-75e4-460e-b19b-7059c83615e5	e2b8726d-107c-4504-b98d-835515772a26	9bcecb8b-2dc8-432b-9f6b-a99b42639ad5	2026-08-08 09:33:37.830146
4f1676c9-2365-421f-afde-33adfb1909a7	e2b8726d-107c-4504-b98d-835515772a26	bfcb391e-eb80-4ee6-91c8-5165e6709aa5	2026-08-08 09:33:37.830146
0a1abccd-eb76-414d-8fd2-58e00b20e726	562a8e2c-35be-4ea6-9fa8-48db5dc36606	9bcecb8b-2dc8-432b-9f6b-a99b42639ad5	2026-08-08 09:33:37.830146
cae41e83-a9b8-4f89-b172-d133ee33fb22	562a8e2c-35be-4ea6-9fa8-48db5dc36606	d3e3f362-43a2-405b-bde6-7eca7ba73984	2026-08-08 09:33:37.830146
d091ed0f-fe85-4ace-97d9-7208ee38d705	562a8e2c-35be-4ea6-9fa8-48db5dc36606	bfcb391e-eb80-4ee6-91c8-5165e6709aa5	2026-08-08 09:33:37.830146
d7fb5940-25c1-4532-9a83-444022270f79	1974e6ed-0de8-40e9-b951-f3e76208abea	d3e3f362-43a2-405b-bde6-7eca7ba73984	2026-08-08 09:33:37.830146
5d8d6251-ec8b-4ea4-bd11-41fa03a5fb4e	1974e6ed-0de8-40e9-b951-f3e76208abea	bfcb391e-eb80-4ee6-91c8-5165e6709aa5	2026-08-08 09:33:37.830146
b84266e2-d5c4-4924-9fed-20df23036848	53cd533c-13a9-400f-93f5-2fb207239874	94711495-b48e-4952-9c47-f489be7e4374	2026-08-04 17:16:44.207262
0d5e6c6a-3a7f-4891-952a-a48d08241c27	53cd533c-13a9-400f-93f5-2fb207239874	e142e4f9-9ce3-4243-b168-caef6bb614d6	2026-08-04 17:16:44.35571
421e5b5e-da74-4d46-a262-ecf6160af958	53cd533c-13a9-400f-93f5-2fb207239874	e96070bc-676b-4214-b679-c657ad6a6c0c	2026-08-04 17:16:44.534772
b228dd0e-0007-4bd7-9b52-b0543382d098	53cd533c-13a9-400f-93f5-2fb207239874	b790c33e-86cb-4184-8a08-781f5707c9b8	2026-08-04 17:16:44.611519
2a41b3b3-5100-4b3a-80a5-3f4ac7f3b687	53cd533c-13a9-400f-93f5-2fb207239874	78f4e5b6-7029-4c92-a01a-058c87ce952b	2026-08-04 18:34:13.647789
53f37ada-3812-4ff1-b30a-546110b22a8d	53cd533c-13a9-400f-93f5-2fb207239874	9b880363-65ee-4794-bd47-55da52fd349c	2026-08-04 18:34:13.778792
53315978-6622-4f70-b370-1264b9e73d1e	53cd533c-13a9-400f-93f5-2fb207239874	7ce5e22d-a818-41a7-b0dd-ecb6c4e88874	2026-08-04 18:34:13.847643
6495c4cb-295f-448e-8bd4-91ae78fb6ca1	53cd533c-13a9-400f-93f5-2fb207239874	b790c33e-86cb-4184-8a08-781f5707c9b8	2026-08-04 18:34:13.927581
b1c6fd09-ad79-4838-9636-5ca019c77f9d	53cd533c-13a9-400f-93f5-2fb207239874	61510cc9-0325-4dc4-b996-b9cf3c93ca80	2026-08-04 18:34:13.999554
2757315d-e38d-4f87-91f4-8699effaa374	53cd533c-13a9-400f-93f5-2fb207239874	1d032f5d-493c-4019-8668-7c055dbd1959	2026-08-04 18:34:14.067325
25b0e998-c6fb-4bc3-944a-ce59eae279da	53cd533c-13a9-400f-93f5-2fb207239874	efbb62bd-e51d-4f01-80ce-0363d440bd41	2026-08-04 18:34:14.158807
ece41488-2e65-4f9b-9a31-0b6c80506b7f	53cd533c-13a9-400f-93f5-2fb207239874	4cadf91c-af1b-4549-85af-6412dd30b306	2026-08-04 18:34:14.258387
16b85637-18ba-47b0-8637-bc2a0091266a	53cd533c-13a9-400f-93f5-2fb207239874	e88b839b-cad4-48e0-830d-6e845162c9c4	2026-08-04 18:34:14.354808
0c1c816d-85a9-4c12-8676-6564a56e02f0	53cd533c-13a9-400f-93f5-2fb207239874	78a9f184-d0d3-4245-9b54-02978a67da9a	2026-08-04 18:34:14.482058
188aa744-df22-425e-bde5-36e8c3593a4e	53cd533c-13a9-400f-93f5-2fb207239874	ab76c75d-881e-4169-80e5-83db4c153d44	2026-08-04 18:34:14.577383
e2d2e2ec-3b16-4d65-a1a5-387dc5d1959c	53cd533c-13a9-400f-93f5-2fb207239874	b7c09571-9e37-451f-9855-3423b23808ef	2026-08-04 18:34:14.663549
cf85b7b9-64e4-45db-ae06-bc41f3f976fd	53cd533c-13a9-400f-93f5-2fb207239874	7fdbff5b-ad29-4739-a3af-8db0518f3d88	2026-08-04 18:34:14.761208
c87c57d4-da60-4b19-bbf0-8f180597afaa	53cd533c-13a9-400f-93f5-2fb207239874	53430f04-b5bf-4ef9-8b8c-d541987afa45	2026-08-04 18:34:14.845481
15bbf038-1f76-4aac-ab2c-e5c4f113e313	53cd533c-13a9-400f-93f5-2fb207239874	930bd0d8-abc2-4b27-b308-f548f03f9793	2026-08-04 18:34:14.93473
11ce3a2c-b8ab-406b-8361-8a4dff02f209	53cd533c-13a9-400f-93f5-2fb207239874	8f64dc3b-deab-4c18-88be-79c99318ad8b	2026-08-04 18:34:15.023629
cc9852cf-21bc-417b-af1d-f19732cf4375	53cd533c-13a9-400f-93f5-2fb207239874	526f8cc6-062b-42b2-bdbb-41485dffaee2	2026-08-04 18:34:15.116079
f7ecc2d8-2bd8-418c-842f-84a2d73c7a5a	53cd533c-13a9-400f-93f5-2fb207239874	0e7e6da7-16a3-4595-9818-ddd3715130b8	2026-08-04 18:34:15.220465
c3e92098-4ba2-4d74-bf50-121fd33a4ef1	53cd533c-13a9-400f-93f5-2fb207239874	99993d4f-ea72-4877-a5e4-e7126c6c53c4	2026-08-04 18:34:15.324972
9b3a0770-073a-45a4-96a6-105f7bb7151c	53cd533c-13a9-400f-93f5-2fb207239874	7e33c9c0-9de3-4d07-9c9c-7377136f0e0b	2026-08-04 18:34:15.395953
f4bab4c4-e28c-4bf6-b4aa-9cc706d33f97	e2b8726d-107c-4504-b98d-835515772a26	cb2302c6-f2da-4333-9b98-24245f468b1e	2026-08-05 08:12:46.855371
deaefa03-8f65-4e04-9733-11706b222118	e2b8726d-107c-4504-b98d-835515772a26	48c1ed30-3310-4552-babb-74f18c779d16	2026-08-05 08:12:47.018466
221d8f09-54e3-4427-a49a-a1156a699be1	b1370815-7b78-49bd-b3f6-ca765d129abe	db5c84df-d810-470b-b3d3-f26bbaa992d8	2026-08-07 19:16:18.060615
a45ad49d-230f-44d6-9944-25b4efc9a697	562a8e2c-35be-4ea6-9fa8-48db5dc36606	f61eef95-ac2a-46fc-b6b2-09f172b9d4f2	2026-08-11 06:49:51.857673
6b9586f2-8829-4607-8254-804821ac04e1	562a8e2c-35be-4ea6-9fa8-48db5dc36606	8daea6cd-7697-4c03-83bf-f7c8ceb5f722	2026-08-11 06:49:51.857673
740c7f08-1c2e-4a50-95df-4cf262fe46b7	562a8e2c-35be-4ea6-9fa8-48db5dc36606	4d761ece-c57f-4fca-8a83-8fb2b163ce86	2026-08-11 06:49:51.857673
a6248d81-3d78-4493-8e18-1ec06c3fb34d	562a8e2c-35be-4ea6-9fa8-48db5dc36606	89135485-7ece-41fe-870b-6bbdb6080d3e	2026-08-11 06:49:51.857673
4cf5b2bc-9846-4a46-8bcd-48c3c66200a6	562a8e2c-35be-4ea6-9fa8-48db5dc36606	ec0bbac7-5182-4d41-bf4a-3496639c7758	2026-08-11 06:49:51.857673
171d45cc-84ca-4074-88cc-4dda71f26d14	562a8e2c-35be-4ea6-9fa8-48db5dc36606	9682c66f-84c0-4a24-9409-6208065bed43	2026-08-11 06:49:51.857673
0a7e1248-29bf-4ccf-8972-24cd8ef8f609	562a8e2c-35be-4ea6-9fa8-48db5dc36606	5c222b3d-c74e-4d04-b850-5bb0dfbb7d5c	2026-08-11 06:49:51.857673
aaf04601-c112-47fb-b79c-ae6a87c7fd3d	562a8e2c-35be-4ea6-9fa8-48db5dc36606	2944b93b-4dc6-4bdd-9eb5-53cf5a180097	2026-08-11 06:49:51.857673
6081bc85-dfe0-47dd-8d34-5d1b49652ba3	562a8e2c-35be-4ea6-9fa8-48db5dc36606	5af03367-5758-46c6-b759-46d1574381c0	2026-08-11 06:49:51.857673
9e5c8904-4371-4dc7-ac15-af71f5db2d12	562a8e2c-35be-4ea6-9fa8-48db5dc36606	1b568740-2110-4978-b831-19faa6e19e4f	2026-08-11 06:49:51.857673
c25e7f7e-f25f-4764-90c4-9332600e1aba	562a8e2c-35be-4ea6-9fa8-48db5dc36606	8d4e25cb-4472-4a6d-94a8-d5cc6afd089f	2026-08-11 06:49:51.857673
c538ca7e-478d-4b9d-9055-b1094eaacb44	562a8e2c-35be-4ea6-9fa8-48db5dc36606	100c6399-f7b2-4c76-97a2-ddce7bc6eac5	2026-08-11 06:49:51.857673
a274b264-63a2-4e65-bb87-e9f157c6eb0d	562a8e2c-35be-4ea6-9fa8-48db5dc36606	e797c7f8-a897-4b4a-a90c-6ac7c3424f00	2026-08-11 06:49:51.857673
2b75463e-252d-4e5a-98b1-1da9d2a9182d	562a8e2c-35be-4ea6-9fa8-48db5dc36606	4ab89d49-a156-4993-b755-5c74c395044d	2026-08-11 06:49:51.857673
320f06b8-e7c3-4d3e-b7d9-f45e5ce5eb72	562a8e2c-35be-4ea6-9fa8-48db5dc36606	af16e7fd-45db-4e9c-b535-1c38b616ea38	2026-08-11 06:49:51.857673
60eb52ff-91eb-4156-a815-a9a5b51ef604	562a8e2c-35be-4ea6-9fa8-48db5dc36606	1293e4e2-7e70-4608-b47d-f0df6cd9d8f4	2026-08-11 06:49:51.857673
3ec6e240-b30f-46a5-a407-ada4b3b80467	562a8e2c-35be-4ea6-9fa8-48db5dc36606	3ef9ab1d-b513-4a16-8e19-ae1a3087dcb4	2026-08-11 06:49:51.857673
398b8153-c25a-4899-8369-86ca3626018c	562a8e2c-35be-4ea6-9fa8-48db5dc36606	44d46021-90f2-4d02-b5a2-7c2c66818916	2026-08-11 06:49:51.857673
18691ae2-6491-4bab-9d56-de1fc0d347ba	e2b8726d-107c-4504-b98d-835515772a26	5af03367-5758-46c6-b759-46d1574381c0	2026-08-11 06:49:51.857673
4be5bac9-7f35-46d0-8c51-61e74fb26c83	e2b8726d-107c-4504-b98d-835515772a26	1b568740-2110-4978-b831-19faa6e19e4f	2026-08-11 06:49:51.857673
9b5c6ad3-37f3-475e-bb49-70df26483389	e2b8726d-107c-4504-b98d-835515772a26	8d4e25cb-4472-4a6d-94a8-d5cc6afd089f	2026-08-11 06:49:51.857673
78cee00a-2464-415b-97af-9dc001887c7e	e2b8726d-107c-4504-b98d-835515772a26	2944b93b-4dc6-4bdd-9eb5-53cf5a180097	2026-08-11 06:49:51.857673
2e8cfd47-0892-4f2b-ae3c-8dd6d7e79180	e2b8726d-107c-4504-b98d-835515772a26	5c222b3d-c74e-4d04-b850-5bb0dfbb7d5c	2026-08-11 06:49:51.857673
91f28cb3-b1b0-4e08-82c5-ecd82c73969b	e2b8726d-107c-4504-b98d-835515772a26	ec0bbac7-5182-4d41-bf4a-3496639c7758	2026-08-11 06:49:51.857673
8f1ea3a6-c158-4720-9f31-7462b88f3ad4	e2b8726d-107c-4504-b98d-835515772a26	9682c66f-84c0-4a24-9409-6208065bed43	2026-08-11 06:49:51.857673
abb16978-ff3f-4e24-a542-2fa4fcfb4dff	e2b8726d-107c-4504-b98d-835515772a26	8daea6cd-7697-4c03-83bf-f7c8ceb5f722	2026-08-11 06:49:51.857673
5fc2fd45-41b5-48ac-ae38-1da36dbeb6e5	e2b8726d-107c-4504-b98d-835515772a26	4d761ece-c57f-4fca-8a83-8fb2b163ce86	2026-08-11 06:49:51.857673
e3f4dede-88e5-45c3-b222-06df51d76f4a	e2b8726d-107c-4504-b98d-835515772a26	f61eef95-ac2a-46fc-b6b2-09f172b9d4f2	2026-08-11 06:49:51.857673
da8ae4a3-6242-4162-88ab-3709661a823e	e2b8726d-107c-4504-b98d-835515772a26	89135485-7ece-41fe-870b-6bbdb6080d3e	2026-08-11 06:49:51.857673
cc1c9a65-a163-48f0-91ec-a25a850a6db8	e2b8726d-107c-4504-b98d-835515772a26	3ef9ab1d-b513-4a16-8e19-ae1a3087dcb4	2026-08-11 06:49:51.857673
a0f9dd53-22bf-449d-9c17-590c3d91a08e	e2b8726d-107c-4504-b98d-835515772a26	1293e4e2-7e70-4608-b47d-f0df6cd9d8f4	2026-08-11 06:49:51.857673
a34f898b-d3e4-44b0-a081-d851ef013f08	e2b8726d-107c-4504-b98d-835515772a26	44d46021-90f2-4d02-b5a2-7c2c66818916	2026-08-11 06:49:51.857673
48c3057c-95c9-4d9f-95ba-0b1d3ff5f848	e2b8726d-107c-4504-b98d-835515772a26	4ab89d49-a156-4993-b755-5c74c395044d	2026-08-11 06:49:51.857673
81e6560b-dfe6-449f-8066-20612b167259	e2b8726d-107c-4504-b98d-835515772a26	af16e7fd-45db-4e9c-b535-1c38b616ea38	2026-08-11 06:49:51.857673
6c4ceeaa-c0ba-4bfd-8a1c-a676cb4846de	e2b8726d-107c-4504-b98d-835515772a26	e797c7f8-a897-4b4a-a90c-6ac7c3424f00	2026-08-11 06:49:51.857673
6db0ba66-1f52-4f73-8ce2-a06c54894833	e2b8726d-107c-4504-b98d-835515772a26	100c6399-f7b2-4c76-97a2-ddce7bc6eac5	2026-08-11 06:49:51.857673
a372bac2-d7d2-4e15-ada1-1a359d6ff063	53cd533c-13a9-400f-93f5-2fb207239874	1b568740-2110-4978-b831-19faa6e19e4f	2026-08-11 06:49:51.857673
63e55c77-1066-4057-a9a3-ffb466b03c33	53cd533c-13a9-400f-93f5-2fb207239874	5af03367-5758-46c6-b759-46d1574381c0	2026-08-11 06:49:51.857673
62630edd-9138-4b35-a950-14f97edf469b	53cd533c-13a9-400f-93f5-2fb207239874	8d4e25cb-4472-4a6d-94a8-d5cc6afd089f	2026-08-11 06:49:51.857673
eaf80ee3-1f73-4fe8-a046-fd8a915ba11d	53cd533c-13a9-400f-93f5-2fb207239874	2944b93b-4dc6-4bdd-9eb5-53cf5a180097	2026-08-11 06:49:51.857673
ecdd9744-443e-4d64-828a-d0e26367a897	53cd533c-13a9-400f-93f5-2fb207239874	5c222b3d-c74e-4d04-b850-5bb0dfbb7d5c	2026-08-11 06:49:51.857673
9590c122-e6a8-44f4-b943-bad68708cd37	53cd533c-13a9-400f-93f5-2fb207239874	9682c66f-84c0-4a24-9409-6208065bed43	2026-08-11 06:49:51.857673
34324493-49d7-440e-b167-56250199ad7d	53cd533c-13a9-400f-93f5-2fb207239874	ec0bbac7-5182-4d41-bf4a-3496639c7758	2026-08-11 06:49:51.857673
b40425a5-cc1c-4d4e-9d8f-5232bb84cf4e	53cd533c-13a9-400f-93f5-2fb207239874	4d761ece-c57f-4fca-8a83-8fb2b163ce86	2026-08-11 06:49:51.857673
910fd8dd-9b4d-4f95-bf61-772139fea035	53cd533c-13a9-400f-93f5-2fb207239874	8daea6cd-7697-4c03-83bf-f7c8ceb5f722	2026-08-11 06:49:51.857673
1fbc7229-4d04-48a2-ac9b-7a3cd72f42ad	53cd533c-13a9-400f-93f5-2fb207239874	f61eef95-ac2a-46fc-b6b2-09f172b9d4f2	2026-08-11 06:49:51.857673
82d3ff77-191a-4c92-ac9d-9a40808011f0	53cd533c-13a9-400f-93f5-2fb207239874	89135485-7ece-41fe-870b-6bbdb6080d3e	2026-08-11 06:49:51.857673
828dc941-3ff8-479a-86d3-d60a226b9d33	53cd533c-13a9-400f-93f5-2fb207239874	3ef9ab1d-b513-4a16-8e19-ae1a3087dcb4	2026-08-11 06:49:51.857673
95c3150c-659d-402d-97e7-d3e5ca526e23	53cd533c-13a9-400f-93f5-2fb207239874	1293e4e2-7e70-4608-b47d-f0df6cd9d8f4	2026-08-11 06:49:51.857673
fb05e9de-dfbf-4d8f-af5d-37fbaefaf657	53cd533c-13a9-400f-93f5-2fb207239874	44d46021-90f2-4d02-b5a2-7c2c66818916	2026-08-11 06:49:51.857673
ec55cb49-c553-4e4c-9c3b-1cbb83eb94d8	53cd533c-13a9-400f-93f5-2fb207239874	4ab89d49-a156-4993-b755-5c74c395044d	2026-08-11 06:49:51.857673
ad09a5f8-4816-4f6a-b592-66560373075d	53cd533c-13a9-400f-93f5-2fb207239874	af16e7fd-45db-4e9c-b535-1c38b616ea38	2026-08-11 06:49:51.857673
0b106e1a-8008-4f0f-923b-9d41d1057f1e	53cd533c-13a9-400f-93f5-2fb207239874	f5786867-ff3f-4aba-910d-f9729a579f8d	2026-08-11 06:49:51.857673
c3992a66-76d6-4c6f-99c4-88212b01a075	53cd533c-13a9-400f-93f5-2fb207239874	e797c7f8-a897-4b4a-a90c-6ac7c3424f00	2026-08-11 06:49:51.857673
eec343e4-3d36-413b-b606-0ea3a7522cef	53cd533c-13a9-400f-93f5-2fb207239874	100c6399-f7b2-4c76-97a2-ddce7bc6eac5	2026-08-11 06:49:51.857673
2efc138c-d5dc-4c08-8118-da71520250aa	53cd533c-13a9-400f-93f5-2fb207239874	3ae0c0f3-8d25-4d71-8d87-19660efec229	2026-08-04 18:34:13.779851
c0ac5cfa-5213-45dd-90e1-412d7978d28c	53cd533c-13a9-400f-93f5-2fb207239874	77f8f266-801f-4bf1-b410-ec5fa6956d69	2026-08-04 18:34:13.847006
09330d56-7477-48fb-af14-ae9a6230d656	53cd533c-13a9-400f-93f5-2fb207239874	651b72d8-4888-4c22-bf27-e77f92a61c10	2026-08-04 18:34:13.928261
8787c2e2-592c-4f88-9e67-3bb535f79a92	53cd533c-13a9-400f-93f5-2fb207239874	98429f77-55d3-4fe0-8306-b5d1ba8124b2	2026-08-04 18:34:13.998654
09796df9-0879-4f69-847b-e70e08befeef	53cd533c-13a9-400f-93f5-2fb207239874	babd7004-a6e5-4c0b-ba07-b63309109e22	2026-08-04 18:34:14.068003
ba6ee134-39a4-4a22-8006-c9f40edc820e	53cd533c-13a9-400f-93f5-2fb207239874	6dd7e925-a032-4214-8b5d-bf2ff7d311be	2026-08-04 18:34:14.158269
4010778e-6440-4688-af7c-6b9c703e875f	53cd533c-13a9-400f-93f5-2fb207239874	76b09149-bfa3-481c-8d0c-cd4aee833040	2026-08-04 18:34:14.259207
8a4635d8-f720-4f56-a3c7-ae77026c94dc	53cd533c-13a9-400f-93f5-2fb207239874	9e7300a0-5203-4c58-99a7-86e61873cfb9	2026-08-04 18:34:14.355126
79dd69fa-6e33-4a15-b337-78081248a434	53cd533c-13a9-400f-93f5-2fb207239874	c7153377-2678-41e2-9304-80c715871f73	2026-08-04 18:34:14.483131
936c657e-8557-4e5f-9c57-c6363cd56019	53cd533c-13a9-400f-93f5-2fb207239874	e56e7b16-b64b-42c2-aa47-bd4a553b2f07	2026-08-04 18:34:14.577153
b9a19211-0bfb-4ae5-bfec-f11c00e7dbc6	53cd533c-13a9-400f-93f5-2fb207239874	a3bc1bbd-130f-417a-ba16-af925aa6829e	2026-08-04 18:34:14.665263
39c00c9f-6299-4e33-916e-7f8484aff6cf	53cd533c-13a9-400f-93f5-2fb207239874	ae29963d-7c46-43c5-bdad-9d2d50c8f7e6	2026-08-04 18:34:14.760826
d92cbfa1-2b6d-45e7-ac71-a7bb18c3302f	53cd533c-13a9-400f-93f5-2fb207239874	1016de93-9e5e-4c89-a224-72a3904bbead	2026-08-04 18:34:14.84602
3bcb9969-36fd-435a-82a1-6c76ddfb6cea	53cd533c-13a9-400f-93f5-2fb207239874	0011b2ce-396e-4302-98b9-57b0ecf747d0	2026-08-04 18:34:14.934511
6c3d371a-7fd1-4940-83a5-e0f0125da051	53cd533c-13a9-400f-93f5-2fb207239874	1a8ab615-bb7a-4b66-848b-9204fd386584	2026-08-04 18:34:15.024185
b3e92400-849c-423b-b891-679a84b95c28	53cd533c-13a9-400f-93f5-2fb207239874	67a36a67-1a37-4362-80e8-328dbd8ddbd5	2026-08-04 18:34:15.115737
946e1c2e-708c-4f6b-ab86-d812044122af	53cd533c-13a9-400f-93f5-2fb207239874	4a251712-8742-4d68-a25b-9b44bcc4c548	2026-08-04 18:34:15.220619
128a46e1-33e8-411f-9ff2-efce61cd1f80	53cd533c-13a9-400f-93f5-2fb207239874	73fcd5f4-a41d-4318-98f9-0ba19c50fec5	2026-08-04 18:34:15.324738
fe7798d3-a98d-43d7-a248-e832ada7aee3	53cd533c-13a9-400f-93f5-2fb207239874	afc5edf4-f0ec-47be-867c-20a37d5bc259	2026-08-04 18:34:15.395845
738b868d-a812-4214-b5ec-7ce512299831	e2b8726d-107c-4504-b98d-835515772a26	1d9aa0e7-8f81-4ace-b3be-0f7f9c6c27eb	2026-08-05 08:12:47.16101
4fb56715-6f1c-4643-a0c2-4f0fc0e0e429	562a8e2c-35be-4ea6-9fa8-48db5dc36606	8e3242e2-719f-40ae-b09a-8c16e9d49eb3	2026-08-11 09:49:16.546878
0ce1dc6e-ab65-4e59-b421-17803d127581	562a8e2c-35be-4ea6-9fa8-48db5dc36606	980951c7-c4d4-4bb9-aca3-d784a4166aec	2026-08-11 09:49:16.546878
739d99b4-14f3-4147-983e-f0c4995c6566	562a8e2c-35be-4ea6-9fa8-48db5dc36606	4a0202ae-dba4-4571-bfed-2f74cfe711ad	2026-08-11 09:49:16.546878
f38417ac-83f9-4aa2-ac5d-aca39c7b6baa	562a8e2c-35be-4ea6-9fa8-48db5dc36606	4897b3cc-a4ba-49ae-80bb-9ff61a04be12	2026-08-11 09:49:16.546878
f30cc81c-f817-4a8e-9dc7-e09381933862	562a8e2c-35be-4ea6-9fa8-48db5dc36606	130139ad-b2ac-4602-a826-9b7b8c860985	2026-08-11 09:49:16.546878
608a81fc-862b-42fa-b2eb-991de95af5c8	562a8e2c-35be-4ea6-9fa8-48db5dc36606	58dcd876-e44c-4713-b427-697ccee248e3	2026-08-11 09:49:16.546878
15cf6ac4-8b06-4aeb-95db-4fecc605c627	562a8e2c-35be-4ea6-9fa8-48db5dc36606	23559a49-aff4-4a21-954c-c8d904a21370	2026-08-11 09:49:16.546878
78adf29a-09f1-4ec2-a862-f7f77c2517a8	562a8e2c-35be-4ea6-9fa8-48db5dc36606	0def6c47-97ca-436d-8676-ded6988fe774	2026-08-11 09:49:16.546878
0ad7c1ea-a64c-4c82-bb02-afdba34c887f	562a8e2c-35be-4ea6-9fa8-48db5dc36606	e2413391-a4b4-4dfc-bdc1-3dcc98687eae	2026-08-11 09:49:16.546878
624ee70a-945e-4277-91d7-2a0a0d920956	562a8e2c-35be-4ea6-9fa8-48db5dc36606	e138c064-4dfc-4927-9871-db941fe11e9a	2026-08-11 09:49:16.546878
9b7af81d-7c9e-4b95-a432-282216d6ac2d	562a8e2c-35be-4ea6-9fa8-48db5dc36606	a0c62ba8-09ea-44bc-9a74-a1dfe149d46d	2026-08-11 09:49:16.546878
48008ffd-db31-4cd0-a1aa-0722ea09a7e1	562a8e2c-35be-4ea6-9fa8-48db5dc36606	a48aa728-f635-41e8-a46e-487a1040f954	2026-08-11 09:49:16.546878
841c8c7a-66c7-4685-9567-db73a148eca7	562a8e2c-35be-4ea6-9fa8-48db5dc36606	3ca9d235-f88b-4115-8fe1-9c6eccd7396e	2026-08-11 09:49:16.546878
533f1440-aeae-4ce6-ac51-6222d38e4d9c	e2b8726d-107c-4504-b98d-835515772a26	4a0202ae-dba4-4571-bfed-2f74cfe711ad	2026-08-11 09:49:16.546878
013719a5-efdc-4f1e-84ef-96a461290677	e2b8726d-107c-4504-b98d-835515772a26	8e3242e2-719f-40ae-b09a-8c16e9d49eb3	2026-08-11 09:49:16.546878
3c8988f6-de88-4156-ab77-1bfc74af663b	e2b8726d-107c-4504-b98d-835515772a26	980951c7-c4d4-4bb9-aca3-d784a4166aec	2026-08-11 09:49:16.546878
e989b36c-3b3f-463e-acb6-f1169a19b2ba	e2b8726d-107c-4504-b98d-835515772a26	a48aa728-f635-41e8-a46e-487a1040f954	2026-08-11 09:49:16.546878
2074e861-1b17-4ae6-979c-159b88863662	e2b8726d-107c-4504-b98d-835515772a26	3ca9d235-f88b-4115-8fe1-9c6eccd7396e	2026-08-11 09:49:16.546878
951108cf-a5e4-4b65-888f-841c858d4103	e2b8726d-107c-4504-b98d-835515772a26	a0c62ba8-09ea-44bc-9a74-a1dfe149d46d	2026-08-11 09:49:16.546878
ff6f45a7-dab7-479b-b0ae-be1041b6393d	e2b8726d-107c-4504-b98d-835515772a26	130139ad-b2ac-4602-a826-9b7b8c860985	2026-08-11 09:49:16.546878
a264caba-9090-4c64-a60d-0bb501a0434a	e2b8726d-107c-4504-b98d-835515772a26	58dcd876-e44c-4713-b427-697ccee248e3	2026-08-11 09:49:16.546878
e64565f2-bb29-44a0-9d64-f3dae21cad17	e2b8726d-107c-4504-b98d-835515772a26	4897b3cc-a4ba-49ae-80bb-9ff61a04be12	2026-08-11 09:49:16.546878
ec379fa1-211a-4b61-83ee-d74a02b937c5	e2b8726d-107c-4504-b98d-835515772a26	e2413391-a4b4-4dfc-bdc1-3dcc98687eae	2026-08-11 09:49:16.546878
bea284ca-ad0b-4f92-aa3d-656db9fb6afb	e2b8726d-107c-4504-b98d-835515772a26	e138c064-4dfc-4927-9871-db941fe11e9a	2026-08-11 09:49:16.546878
13865adf-ee5f-40ec-b032-c55253acfb34	e2b8726d-107c-4504-b98d-835515772a26	23559a49-aff4-4a21-954c-c8d904a21370	2026-08-11 09:49:16.546878
55ee3c40-d492-447a-93f9-84b308063f24	e2b8726d-107c-4504-b98d-835515772a26	0def6c47-97ca-436d-8676-ded6988fe774	2026-08-11 09:49:16.546878
2e695652-cfd7-45ae-b26b-18536ee16d4d	53cd533c-13a9-400f-93f5-2fb207239874	4a0202ae-dba4-4571-bfed-2f74cfe711ad	2026-08-11 09:49:16.546878
8c55c5f3-8e56-4540-a85c-fd988ae7801b	53cd533c-13a9-400f-93f5-2fb207239874	8e3242e2-719f-40ae-b09a-8c16e9d49eb3	2026-08-11 09:49:16.546878
79a1f6ae-bf10-4fe2-9848-97587f9768b4	53cd533c-13a9-400f-93f5-2fb207239874	980951c7-c4d4-4bb9-aca3-d784a4166aec	2026-08-11 09:49:16.546878
d17da615-f4c6-422a-901d-ef8a649ae37a	53cd533c-13a9-400f-93f5-2fb207239874	3ca9d235-f88b-4115-8fe1-9c6eccd7396e	2026-08-11 09:49:16.546878
c3672e84-217b-4e36-9422-5613c36fc36f	53cd533c-13a9-400f-93f5-2fb207239874	a48aa728-f635-41e8-a46e-487a1040f954	2026-08-11 09:49:16.546878
eb226ff1-8896-4d2e-9970-4f0d68b2c61f	53cd533c-13a9-400f-93f5-2fb207239874	a0c62ba8-09ea-44bc-9a74-a1dfe149d46d	2026-08-11 09:49:16.546878
66bbaef5-a3cd-42f4-9d83-d671073fba7f	53cd533c-13a9-400f-93f5-2fb207239874	58dcd876-e44c-4713-b427-697ccee248e3	2026-08-11 09:49:16.546878
56b0d867-7706-4a43-b235-e464771460b0	53cd533c-13a9-400f-93f5-2fb207239874	130139ad-b2ac-4602-a826-9b7b8c860985	2026-08-11 09:49:16.546878
32bc8c6f-aaf0-4e15-aef3-eb49aad31bbb	53cd533c-13a9-400f-93f5-2fb207239874	4897b3cc-a4ba-49ae-80bb-9ff61a04be12	2026-08-11 09:49:16.546878
55ce101f-284f-417a-b7e2-26990577d507	53cd533c-13a9-400f-93f5-2fb207239874	e138c064-4dfc-4927-9871-db941fe11e9a	2026-08-11 09:49:16.546878
54756447-2629-4797-bc31-2610aba21040	53cd533c-13a9-400f-93f5-2fb207239874	e2413391-a4b4-4dfc-bdc1-3dcc98687eae	2026-08-11 09:49:16.546878
15b3dd2e-c286-423b-afad-40107666a0b4	53cd533c-13a9-400f-93f5-2fb207239874	0def6c47-97ca-436d-8676-ded6988fe774	2026-08-11 09:49:16.546878
4d443acd-c7c3-401e-a0c8-60972b705cda	53cd533c-13a9-400f-93f5-2fb207239874	23559a49-aff4-4a21-954c-c8d904a21370	2026-08-11 09:49:16.546878
3fd43376-4748-482b-8c00-4f10562e3390	53cd533c-13a9-400f-93f5-2fb207239874	e96070bc-676b-4214-b679-c657ad6a6c0c	2026-08-04 18:34:13.778556
825b753d-2666-447c-ab1b-cdb964e02443	53cd533c-13a9-400f-93f5-2fb207239874	3295842a-274d-47b5-acf2-5bbb25502a7c	2026-08-04 18:34:13.848536
4b1f376a-9463-4b12-99fb-dd22a1203f35	53cd533c-13a9-400f-93f5-2fb207239874	adebee34-d381-40ab-91b0-d49c021290dd	2026-08-04 18:34:13.927751
04912bbc-3fe3-4bed-a95f-8fbebadd87ac	53cd533c-13a9-400f-93f5-2fb207239874	90be2ab6-38f8-4bde-9d80-199771e345c7	2026-08-04 18:34:13.999043
41b22c37-7e74-4a90-badd-9fc5c0269704	53cd533c-13a9-400f-93f5-2fb207239874	4d019099-629a-4602-987c-0ff95d5784aa	2026-08-04 18:34:14.067785
b25b97f6-27f3-4ffc-a07d-19206a7f55af	53cd533c-13a9-400f-93f5-2fb207239874	28909d84-a799-485a-ad25-31f0a124b8a7	2026-08-04 18:34:14.158636
fe9e0750-9b87-4015-893a-6a11066cb2a1	53cd533c-13a9-400f-93f5-2fb207239874	41803582-c338-424e-9e97-1ba7abc139a1	2026-08-04 18:34:14.251128
92a6ea26-d441-497a-bddd-5cf10b476905	53cd533c-13a9-400f-93f5-2fb207239874	4178e1c7-b30d-4b37-ac0d-f3c8a9ce3589	2026-08-04 18:34:14.35593
d659fd5a-248d-4ce9-bd71-2c61c042bca1	53cd533c-13a9-400f-93f5-2fb207239874	e142e4f9-9ce3-4243-b168-caef6bb614d6	2026-08-04 18:34:14.481514
e0ef805d-2985-4ccc-9a1a-f3e2671376a2	53cd533c-13a9-400f-93f5-2fb207239874	d9c7c86f-584d-4427-964a-b9d5c6660aad	2026-08-04 18:34:14.578184
7aceef1e-5b9c-47a6-9266-e680881c0ac2	53cd533c-13a9-400f-93f5-2fb207239874	04ce8e35-db2f-4e1b-809f-52bafb4cb89d	2026-08-04 18:34:14.662534
34d76107-c78a-47d7-84d7-3c4618bd4170	53cd533c-13a9-400f-93f5-2fb207239874	d54e92ab-e16f-4364-b4d9-9952ecbf9308	2026-08-04 18:34:14.762625
a21cac9f-2a5b-4b5e-9394-da74856c3ad1	53cd533c-13a9-400f-93f5-2fb207239874	9fcc93c1-07cc-441f-b8ff-a88e82ae6937	2026-08-04 18:34:14.843982
95f38dc5-b944-41ea-a242-f1974ea8a324	53cd533c-13a9-400f-93f5-2fb207239874	17c13aad-7963-4620-a11b-06e247b1b873	2026-08-04 18:34:14.935831
2a58d47b-fd8f-4b98-ab29-cfc2a59a66f0	53cd533c-13a9-400f-93f5-2fb207239874	f0e98ae7-e219-4488-a740-5c2101422f86	2026-08-04 18:34:15.022366
66b1605a-d76d-4afd-be9d-6b0c2de0b25b	53cd533c-13a9-400f-93f5-2fb207239874	a90bc4ef-383c-4eb0-94c4-f5a4d144622e	2026-08-04 18:34:15.117864
04eb367b-9071-4faf-bc48-d8372081a6f2	53cd533c-13a9-400f-93f5-2fb207239874	e2969729-4620-4910-8585-6a2f3d01ffe0	2026-08-04 18:34:15.219723
7c548938-27f9-4b0d-81f7-791a068fa017	53cd533c-13a9-400f-93f5-2fb207239874	a271a740-a018-4bbd-8c16-2abaa48373c6	2026-08-04 18:34:15.325371
96137ce0-2b78-4f0c-b794-0371b1fd74bc	53cd533c-13a9-400f-93f5-2fb207239874	9f5734eb-0f25-423f-9d73-4f6064537472	2026-08-04 18:34:15.395493
7651ea2a-1f4b-4206-a7b8-876332584356	e2b8726d-107c-4504-b98d-835515772a26	d9519e47-ae1d-4b6b-a758-16ce5f2f7a63	2026-08-05 08:12:47.159998
efe51c73-51df-4f25-b3d4-502572fbdbb6	562a8e2c-35be-4ea6-9fa8-48db5dc36606	ed380369-28f8-496e-b7ec-75cd981f2abc	2026-08-11 14:55:14.490821
a338252f-5c8b-4501-8e48-8696d28c4ae9	562a8e2c-35be-4ea6-9fa8-48db5dc36606	31993133-5b9a-4dba-8505-401ab127f3bf	2026-08-11 14:55:14.490821
da668fb0-86e0-4644-8897-b26921e28bae	562a8e2c-35be-4ea6-9fa8-48db5dc36606	0b9f6ff2-e7ee-48fa-b557-73d07dead3db	2026-08-11 14:55:14.490821
82751533-620b-45c0-a53a-c772fa5a6db0	562a8e2c-35be-4ea6-9fa8-48db5dc36606	3acdeb75-3daf-431b-90fe-f5f640770a34	2026-08-11 14:55:14.490821
8609768d-faae-4e51-8adc-f006ec88b65c	562a8e2c-35be-4ea6-9fa8-48db5dc36606	60829655-227f-432b-a0ec-93663d6027ba	2026-08-11 14:55:14.490821
106f64fc-d58e-409b-9ab8-781ad8223cc1	562a8e2c-35be-4ea6-9fa8-48db5dc36606	2325f62d-8288-4daf-8b7f-169cb59294f9	2026-08-11 14:55:14.490821
3e87c343-fea6-453e-a699-11a3cb1e61c1	562a8e2c-35be-4ea6-9fa8-48db5dc36606	a68be313-8545-4bde-b74d-b296f4320218	2026-08-11 14:55:14.490821
62eb2e83-ce05-4bca-978c-470758c78735	e2b8726d-107c-4504-b98d-835515772a26	3acdeb75-3daf-431b-90fe-f5f640770a34	2026-08-11 14:55:14.490821
16e116e1-6d33-4cf6-ade2-df95b5fd02e1	e2b8726d-107c-4504-b98d-835515772a26	ed380369-28f8-496e-b7ec-75cd981f2abc	2026-08-11 14:55:14.490821
c7ac7cab-93b5-4b8c-a2cd-fa1a291bb3d3	e2b8726d-107c-4504-b98d-835515772a26	0b9f6ff2-e7ee-48fa-b557-73d07dead3db	2026-08-11 14:55:14.490821
476c536c-366c-4003-b5f3-7020b3445336	e2b8726d-107c-4504-b98d-835515772a26	31993133-5b9a-4dba-8505-401ab127f3bf	2026-08-11 14:55:14.490821
c4754f9f-63ec-4e96-ac2f-e02ed08b43f8	e2b8726d-107c-4504-b98d-835515772a26	a68be313-8545-4bde-b74d-b296f4320218	2026-08-11 14:55:14.490821
075d173f-49ce-4664-90dd-dbcf67dbd0af	e2b8726d-107c-4504-b98d-835515772a26	60829655-227f-432b-a0ec-93663d6027ba	2026-08-11 14:55:14.490821
104d510a-621a-4686-a9fb-b0294e5857da	e2b8726d-107c-4504-b98d-835515772a26	2325f62d-8288-4daf-8b7f-169cb59294f9	2026-08-11 14:55:14.490821
00105343-c0ec-42ee-8c36-bd1bc627ef47	53cd533c-13a9-400f-93f5-2fb207239874	3acdeb75-3daf-431b-90fe-f5f640770a34	2026-08-11 14:55:14.490821
2304d2c3-f1fc-4cd2-b6b6-aa29477f028d	53cd533c-13a9-400f-93f5-2fb207239874	ed380369-28f8-496e-b7ec-75cd981f2abc	2026-08-11 14:55:14.490821
76961eaa-c31b-4dd1-a180-699b15c503be	53cd533c-13a9-400f-93f5-2fb207239874	0b9f6ff2-e7ee-48fa-b557-73d07dead3db	2026-08-11 14:55:14.490821
851431b5-4efd-4357-bffe-768974f42d97	53cd533c-13a9-400f-93f5-2fb207239874	31993133-5b9a-4dba-8505-401ab127f3bf	2026-08-11 14:55:14.490821
b22499fb-081c-4c71-b2fb-2113f87f374c	53cd533c-13a9-400f-93f5-2fb207239874	a68be313-8545-4bde-b74d-b296f4320218	2026-08-11 14:55:14.490821
933414c7-1fef-4021-ad1b-87f5dabf1c35	53cd533c-13a9-400f-93f5-2fb207239874	60829655-227f-432b-a0ec-93663d6027ba	2026-08-11 14:55:14.490821
ad775105-8dce-453f-9e0d-8db3024519aa	53cd533c-13a9-400f-93f5-2fb207239874	2325f62d-8288-4daf-8b7f-169cb59294f9	2026-08-11 14:55:14.490821
b3123401-25e4-4cb4-8e7d-9950321660f3	53cd533c-13a9-400f-93f5-2fb207239874	fb86d2c0-db9a-465c-b319-185e0434b2de	2026-08-04 17:16:44.208006
2071b173-b36e-493b-84ff-b613ab172a64	53cd533c-13a9-400f-93f5-2fb207239874	e90b5dfa-993e-4efb-969b-651bcd1b3a4e	2026-08-04 17:16:44.356563
e1b9ac57-a8f3-4275-a533-9e605459f353	53cd533c-13a9-400f-93f5-2fb207239874	3295842a-274d-47b5-acf2-5bbb25502a7c	2026-08-04 17:16:44.533617
c382118e-1eb3-4fd4-89e5-76e2a01c4152	53cd533c-13a9-400f-93f5-2fb207239874	a18c261f-732b-4862-b6a4-bcf95bfbd9c9	2026-08-04 18:34:13.713853
ec40bd1d-aeb6-4095-82a8-c6bff9b181e4	53cd533c-13a9-400f-93f5-2fb207239874	63ebb8a9-5873-4d7d-bc9a-61d5673174e1	2026-08-04 18:34:13.803806
ee633781-2a90-4a2d-aab9-f605f9a9d1a2	53cd533c-13a9-400f-93f5-2fb207239874	e3df2f33-b000-4178-b6df-59f283d5c3ef	2026-08-04 18:34:13.889856
e832b975-fd76-471d-b5a6-eddab769d2c2	53cd533c-13a9-400f-93f5-2fb207239874	7cc03ac0-ea10-43c1-b1d1-b5d094352d6b	2026-08-04 18:34:13.970381
46ef20c8-b3ef-4afc-928f-2a0599d78949	53cd533c-13a9-400f-93f5-2fb207239874	b3414ef7-b896-4c97-a8cb-6fc198e67047	2026-08-04 18:34:14.046776
aa603fbc-8f2b-4f0f-b26c-713edee138c0	53cd533c-13a9-400f-93f5-2fb207239874	786b92b2-599a-41e9-a56c-5bd9fe8b01aa	2026-08-04 18:34:14.138998
e250019d-5538-4043-8da4-364f53b48448	53cd533c-13a9-400f-93f5-2fb207239874	0f06f2a6-1eaf-4b32-8256-e052681914e6	2026-08-04 18:34:14.262013
386a70f3-9713-4d18-a9ca-d38b10b8a678	53cd533c-13a9-400f-93f5-2fb207239874	2d36513d-1c3a-49ce-a2c0-9e05a51c8d60	2026-08-04 18:34:14.355699
4b6da973-4f6a-418f-bacd-467cb21e71c0	53cd533c-13a9-400f-93f5-2fb207239874	fb86d2c0-db9a-465c-b319-185e0434b2de	2026-08-04 18:34:14.481693
bc4599f8-a847-40b0-8223-c942e2690f9e	53cd533c-13a9-400f-93f5-2fb207239874	7e830c93-65d3-4c1a-b566-d432b84a2357	2026-08-04 18:34:14.57783
321cdac2-f33d-4aa7-91c4-421f80ea74ea	53cd533c-13a9-400f-93f5-2fb207239874	701bda0c-99be-4b0b-98a3-432738946c36	2026-08-04 18:34:14.663335
8613e313-7c2d-4cde-affa-4d0acc05805c	53cd533c-13a9-400f-93f5-2fb207239874	a5306f7f-b657-47d5-ba62-479a88a60a22	2026-08-04 18:34:14.76136
35a84623-f9a7-4fb4-892a-8d90f9997230	53cd533c-13a9-400f-93f5-2fb207239874	d31c4792-f791-4429-b5a2-6539dab0dddf	2026-08-04 18:34:14.845258
e5301c6c-5736-4fa7-9397-f5d4eb477929	53cd533c-13a9-400f-93f5-2fb207239874	ddff7299-0615-40d3-aabe-57c839d20efb	2026-08-04 18:34:14.934928
b1042bdc-e11e-4d20-8d86-f20e3617ae15	53cd533c-13a9-400f-93f5-2fb207239874	cf10080c-8632-4e39-b141-9b20b8c32023	2026-08-04 18:34:15.023413
cba93cf8-66e7-4165-8e0e-ba7284f4fe8c	53cd533c-13a9-400f-93f5-2fb207239874	d2c0760e-c337-4e99-abe1-837e0624c2d1	2026-08-04 18:34:15.116358
7a2f5dc8-abdc-4ffe-8492-e4ed914efdc4	53cd533c-13a9-400f-93f5-2fb207239874	aef265cd-e15e-44e4-8742-27856117e73f	2026-08-04 18:34:15.220265
45068493-dad5-4d7d-b18a-5cddf1e754f1	53cd533c-13a9-400f-93f5-2fb207239874	e7ded78c-bf45-4f0f-80b1-8a07762c8287	2026-08-04 18:34:15.325108
3799a5ab-6a44-4275-9d21-07cfc3cf4096	53cd533c-13a9-400f-93f5-2fb207239874	ee643269-d023-4b52-a9d3-caf40acfcdcd	2026-08-04 18:34:15.395736
e7d9ef9f-03bb-4fda-a5b2-96ecd54e8036	e2b8726d-107c-4504-b98d-835515772a26	fae803a1-9ce1-436e-987b-70dc74e5b74a	2026-08-05 08:12:47.161811
6640e085-6074-40c8-8891-f491210c7793	53cd533c-13a9-400f-93f5-2fb207239874	3ba5bbcc-9236-4809-96b4-f23b19e208c1	2026-08-11 19:42:17.216011
9c528a82-f30f-4c00-9138-8d7fd3893aa8	53cd533c-13a9-400f-93f5-2fb207239874	fbe398e5-ab76-4ed2-8796-bd540fbf709b	2026-08-11 19:42:17.250047
13855b86-5ce6-4905-8cbb-b451ae3e6abf	53cd533c-13a9-400f-93f5-2fb207239874	87d32681-31bb-44b9-b380-5b64147e4dd8	2026-08-04 18:34:14.156564
dcd42dd8-5fe9-4102-ab22-cfe884d72c77	53cd533c-13a9-400f-93f5-2fb207239874	9e98d2a1-651d-48cc-a82c-14d5f73df681	2026-08-04 18:34:14.260231
1d5c3c4b-333b-4171-ba0d-c2fa37cf507a	53cd533c-13a9-400f-93f5-2fb207239874	4ccb1763-f2ab-452d-9ebb-db6f43fc8a3f	2026-08-04 18:34:14.356121
a1b1a6ab-5d95-4235-9581-99ced02cfaf3	53cd533c-13a9-400f-93f5-2fb207239874	e90b5dfa-993e-4efb-969b-651bcd1b3a4e	2026-08-04 18:34:14.48122
8c0d8b13-cbbc-431d-a0d7-b9300cbce1cd	53cd533c-13a9-400f-93f5-2fb207239874	33b26f49-1a75-4aa4-b0a7-3c6c6ab2eb2d	2026-08-04 18:34:14.578012
cb3720c7-f5a5-4916-8740-b1bcce6cf181	53cd533c-13a9-400f-93f5-2fb207239874	85064f41-1e65-4a61-af2c-7fdd007dacca	2026-08-04 18:34:14.663101
f7c407fa-0456-4047-bc8a-7ca60d72305c	53cd533c-13a9-400f-93f5-2fb207239874	f0a99c9d-8269-463c-9914-288b8107c876	2026-08-04 18:34:14.762424
2bc6c457-ce59-4a0c-869b-1de029255fce	53cd533c-13a9-400f-93f5-2fb207239874	079d1341-b000-4230-96d8-0a9a045da8ff	2026-08-04 18:34:14.845098
4587d928-39d9-4e8b-85f1-99d4e054792f	53cd533c-13a9-400f-93f5-2fb207239874	3bcdae8c-f4b6-4c76-b6c0-70bdc8ad1fe8	2026-08-04 18:34:14.935195
e80caf47-831a-4c06-9d0f-6cfbff913c0a	53cd533c-13a9-400f-93f5-2fb207239874	3b30c266-3221-464b-86e8-7db8d13da0fc	2026-08-04 18:34:15.023176
efb4881b-c0bb-41da-8ec1-8edbdc4bf3d5	53cd533c-13a9-400f-93f5-2fb207239874	2aba093f-28b0-4c5e-8953-ded025431d9d	2026-08-04 18:34:15.116575
e1b3d5ef-be2b-4208-9b6a-844dfe88633e	53cd533c-13a9-400f-93f5-2fb207239874	7bcfcbe7-1113-4008-a07f-8ad1f50d8dd4	2026-08-04 18:34:15.220085
7de78846-65d2-429a-a479-c26d0d40efcb	53cd533c-13a9-400f-93f5-2fb207239874	c511eeb2-9e7c-40c6-8ab1-b241e83b8a3e	2026-08-04 18:34:15.325252
e9c12ef2-53b0-4bf6-b281-abf40c88d454	53cd533c-13a9-400f-93f5-2fb207239874	48c1ed30-3310-4552-babb-74f18c779d16	2026-08-04 18:34:15.395622
a52c2065-07a9-46c5-b6f6-d26cc844370a	e2b8726d-107c-4504-b98d-835515772a26	73fcd5f4-a41d-4318-98f9-0ba19c50fec5	2026-08-05 08:12:47.162815
dfd1cd56-8bc2-4338-9cde-6a54948a2d6c	53cd533c-13a9-400f-93f5-2fb207239874	794e15ec-2200-44ab-989b-7da21862b17e	2026-08-11 19:42:17.247919
c6b0b39b-82aa-4a17-b9c8-972b8624428a	53cd533c-13a9-400f-93f5-2fb207239874	1d9aa0e7-8f81-4ace-b3be-0f7f9c6c27eb	2026-08-04 21:11:57.03674
65e9ee39-2ebc-4b1f-bb72-b589c07864f9	562a8e2c-35be-4ea6-9fa8-48db5dc36606	1d9aa0e7-8f81-4ace-b3be-0f7f9c6c27eb	2026-08-04 21:11:57.03674
600d0a90-0c04-4e9e-8c34-a917dca718be	53cd533c-13a9-400f-93f5-2fb207239874	ee70a5ab-f696-4222-98b8-8376a1d82051	2026-08-11 19:42:17.373656
\.


--
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.roles (role_id, role_name, description) FROM stdin;
e2b8726d-107c-4504-b98d-835515772a26	HR Manager	Manages HR operations
b1370815-7b78-49bd-b3f6-ca765d129abe	Employee	Standard employee access
1974e6ed-0de8-40e9-b951-f3e76208abea	Team Lead	Leads a team of employees
1667f328-bf5d-45e2-8de5-a0f7e9e3e5a3	Finance	Manages payroll and finance
562a8e2c-35be-4ea6-9fa8-48db5dc36606	HR Admin	Creates, publishes, and assigns evaluation forms; sees all evaluations and analytics.
53cd533c-13a9-400f-93f5-2fb207239874	Admin	
\.


--
-- Data for Name: salary_components; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.salary_components (component_id, name, code, type, calculation_type, amount, formula, is_recurring, is_taxable, include_in_gross, include_in_overtime, include_in_leave_deduction, include_in_bonus, display_order, is_active, effective_from, effective_to, created_at, updated_at) FROM stdin;
311448ee-b38c-4503-a60b-b48ffbea70bf	House Rent Allowance (E2E Verify)	E2E_HRA	earning	percent_basic	40.0000	\N	t	t	t	f	f	f	1	t	2026-01-01	\N	2026-08-11 12:35:56.689077+05	2026-08-11 12:35:56.689077+05
3324ec1c-6276-4326-b290-c1954e02cce9	Provident Fund (E2E Verify)	E2E_PF	deduction	formula	0.0000	BASIC * 0.05	t	f	f	f	f	f	2	t	2026-01-01	\N	2026-08-11 12:35:56.745026+05	2026-08-11 12:35:56.745026+05
8be10bd2-ff67-4ea4-9a8c-53e3843bce76	House Rent Allowance	HRA	earning	percent_basic	45.0000	\N	t	t	t	f	f	f	10	t	\N	\N	2026-08-11 15:50:27.592195+05	2026-08-11 15:50:27.592195+05
7d46ae77-4824-44e2-a0bf-062c98b7b442	Medical Allowance	MEDICAL	earning	percent_basic	10.0000	\N	t	f	t	f	f	f	20	t	\N	\N	2026-08-11 15:50:27.592195+05	2026-08-11 15:50:27.592195+05
f76a572d-7f09-4506-a0d3-5c16165a340b	Provident Fund	PF	deduction	percent_basic	5.0000	\N	t	f	f	f	f	f	30	t	\N	\N	2026-08-11 15:50:27.592195+05	2026-08-11 15:50:27.592195+05
\.


--
-- Data for Name: salary_structure_assignments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.salary_structure_assignments (assignment_id, structure_id, scope_type, scope_id, base_salary, effective_from, effective_to, is_active, created_at, updated_at) FROM stdin;
6a0080a4-b015-46a7-a25a-426fe0496940	411df72c-7665-4a69-85e2-44eb546083a4	company	\N	200000.00	2026-01-01	\N	t	2026-08-11 12:35:56.848752+05	2026-08-11 12:35:56.848752+05
d5100edf-0594-4ead-99e2-b47a8330d6fe	0c71da79-5ba7-4a0c-9890-75a4b660f09c	company	\N	\N	\N	\N	t	2026-08-11 17:57:55.586889+05	2026-08-11 17:57:55.586889+05
\.


--
-- Data for Name: salary_structure_components; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.salary_structure_components (structure_component_id, structure_id, component_id, override_calculation_type, override_amount, override_formula, display_order) FROM stdin;
fe51740f-2275-410b-9ab9-9a57b26133cb	411df72c-7665-4a69-85e2-44eb546083a4	311448ee-b38c-4503-a60b-b48ffbea70bf	\N	\N	\N	1
bb4b7385-e647-4740-a8c7-5ba238dd7ad8	411df72c-7665-4a69-85e2-44eb546083a4	3324ec1c-6276-4326-b290-c1954e02cce9	\N	\N	\N	2
0b4a50aa-c53a-4b01-abee-18d30a21bf06	0c71da79-5ba7-4a0c-9890-75a4b660f09c	8be10bd2-ff67-4ea4-9a8c-53e3843bce76	\N	\N	\N	10
3f261e3b-53cb-44ac-8964-25a2c570a1f1	0c71da79-5ba7-4a0c-9890-75a4b660f09c	7d46ae77-4824-44e2-a0bf-062c98b7b442	\N	\N	\N	20
7e785e6d-2076-4190-bbde-b581f4abbe64	0c71da79-5ba7-4a0c-9890-75a4b660f09c	f76a572d-7f09-4506-a0d3-5c16165a340b	\N	\N	\N	30
\.


--
-- Data for Name: salary_structures; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.salary_structures (structure_id, name, description, is_active, created_at, updated_at) FROM stdin;
411df72c-7665-4a69-85e2-44eb546083a4	Standard Staff (E2E Verify)	Created by verify-payroll-e2e.	t	2026-08-11 12:35:56.776574+05	2026-08-11 12:35:56.776574+05
0c71da79-5ba7-4a0c-9890-75a4b660f09c	Standard Staff	Created by Quick Setup. Basic comes from each employee record; allowances and deductions are the components below.	t	2026-08-11 15:50:27.592195+05	2026-08-11 15:50:27.592195+05
\.


--
-- Data for Name: shifts; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.shifts (shift_id, shift_name, start_time, end_time, grace_period_minutes, status, created_at, break_duration_minutes) FROM stdin;
dc4fa1fb-1b82-49fa-97be-9de7f89f8406	On Mood	00:00:00	12:00:00	15	Active	2026-08-10 14:08:08.576227	60
e23cbcc9-d906-4665-adce-2e3600583144	Morning Shift	09:00:00	18:00:00	15	Active	2026-08-11 19:41:08.191992	60
\.


--
-- Data for Name: smtp_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.smtp_settings (id, host, port, username, password_encrypted, encryption, from_name, from_email, reply_to, enabled, last_test_at, last_test_ok, last_test_error, created_at, updated_at) FROM stdin;
1	smtp.gmail.com	587	engmuhammadhaseebiqbal@gmail.com	gcm1:YuKhgLie2qRat4MI:Xjlj6Xh1GIFOjdiBinn4xQ==:1SuJ5PUMTpjJkC7ogDmkemPqTA==	tls	Technocues	engmuhammadhaseebiqbal@gmail.com	engmuhammadhaseebiqbal@gmail.com	t	2026-08-09 02:36:31.912+05	f	Invalid login: 535-5.7.8 Username and Password not accepted. For more information, go to\n535 5.7.8  https://support.google.com/mail/?p=BadCredentials ffacd0b85a97d-4800215078asm17003088f8f.12 - gsmtp	2026-08-02 16:30:42.007972+05	2026-08-09 02:36:31.914269+05
\.


--
-- Data for Name: tax_configs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tax_configs (tax_config_id, name, regime, currency, annualize, is_active, effective_from, effective_to, version, created_at, updated_at) FROM stdin;
a0cb065a-b640-4dfd-be44-ba36141830e4	FBR Salaried 2026-27 (E2E Verify)	FBR	PKR	t	t	2026-07-01	\N	1	2026-08-11 12:35:57.126929+05	2026-08-11 12:35:57.126929+05
\.


--
-- Data for Name: tax_slabs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tax_slabs (slab_id, tax_config_id, lower_bound, upper_bound, base_tax, rate_percent, display_order) FROM stdin;
55b9242a-94bb-41d9-b8a1-7e5c495d2eb6	a0cb065a-b640-4dfd-be44-ba36141830e4	0.00	600000.00	0.00	0.00	0
37e125d7-778c-4051-9695-b020be68dfd6	a0cb065a-b640-4dfd-be44-ba36141830e4	600000.00	1200000.00	0.00	5.00	1
28cab4f4-6cbf-4b78-944b-46139fb372d1	a0cb065a-b640-4dfd-be44-ba36141830e4	1200000.00	2200000.00	30000.00	15.00	2
c268bb17-d08b-4b1e-b386-f849cc14394e	a0cb065a-b640-4dfd-be44-ba36141830e4	2200000.00	3200000.00	180000.00	25.00	3
dc63d913-95b3-444a-ac97-869c6084a75b	a0cb065a-b640-4dfd-be44-ba36141830e4	3200000.00	4100000.00	430000.00	30.00	4
77f712c0-7028-42aa-a26b-607bf5a93fca	a0cb065a-b640-4dfd-be44-ba36141830e4	4100000.00	\N	700000.00	35.00	5
\.


--
-- Data for Name: team_lead_assignment_members; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.team_lead_assignment_members (assignment_id, user_id, created_at) FROM stdin;
\.


--
-- Data for Name: team_lead_assignments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.team_lead_assignments (assignment_id, team_lead_id, mode, department_id, created_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: user_leave_balances; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_leave_balances (user_leave_balance_id, user_id, leave_type_id, allocated_days, used_days, created_at, updated_at) FROM stdin;
49c44e4c-e4c7-4c23-a9f6-446f1bf26edf	c64f66c9-639f-4913-8d6e-0304d51f1c20	d13488b5-e96b-4e1c-8407-66086af68c00	14.00	0.00	2026-08-12 13:58:06.434047+05	2026-08-12 13:58:06.434047+05
5d978686-746d-47d9-8d5a-f02a57386c01	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	d13488b5-e96b-4e1c-8407-66086af68c00	29.00	0.00	2026-08-10 14:10:29.247165+05	2026-08-12 13:58:06.434047+05
9b2a5f0b-6605-400a-889e-9e0a65685184	43af610e-e846-4f7c-88bd-c51fc43f0d12	d13488b5-e96b-4e1c-8407-66086af68c00	42.00	0.00	2026-08-11 20:36:08.080072+05	2026-08-12 13:58:06.434047+05
d3785094-6ae7-4c42-b831-9339ec0cc0e2	c64f66c9-639f-4913-8d6e-0304d51f1c20	42d6822e-d8fa-4801-a9ec-70f25a39aab5	14.00	0.00	2026-08-12 13:58:06.662107+05	2026-08-12 13:58:06.662107+05
ee457e1a-f239-466f-a943-d445a7ca18ba	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	42d6822e-d8fa-4801-a9ec-70f25a39aab5	14.00	0.00	2026-08-12 13:58:06.662107+05	2026-08-12 13:58:06.662107+05
cfb4b821-0735-4205-aece-b371e03ae935	43af610e-e846-4f7c-88bd-c51fc43f0d12	42d6822e-d8fa-4801-a9ec-70f25a39aab5	28.00	0.00	2026-08-11 20:36:08.080072+05	2026-08-12 13:58:06.662107+05
dd853030-c529-42bc-b8e0-c84cd3b9e5ed	c64f66c9-639f-4913-8d6e-0304d51f1c20	f9142969-dfb1-4670-a3fe-43177f6941cf	14.00	0.00	2026-08-12 13:58:06.724575+05	2026-08-12 13:58:06.724575+05
b48450c9-c718-4751-a996-5f795b251162	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	f9142969-dfb1-4670-a3fe-43177f6941cf	14.00	0.00	2026-08-12 13:58:06.724575+05	2026-08-12 13:58:06.724575+05
ff916bae-78d4-4187-8230-a15a60d72c09	43af610e-e846-4f7c-88bd-c51fc43f0d12	f9142969-dfb1-4670-a3fe-43177f6941cf	38.00	0.00	2026-08-11 20:36:08.080072+05	2026-08-12 13:58:06.724575+05
ee28ff79-9b92-4ffa-969c-faa67ea6960e	c64f66c9-639f-4913-8d6e-0304d51f1c20	588ad7bd-2e0c-40bd-bd0b-d4618b340e5c	14.00	0.00	2026-08-12 13:58:06.785001+05	2026-08-12 13:58:06.785001+05
ad01a3d7-a0bc-4026-ba40-220a722afbdd	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	588ad7bd-2e0c-40bd-bd0b-d4618b340e5c	28.00	0.00	2026-08-12 13:18:05.753545+05	2026-08-12 13:58:06.785001+05
a1615f40-9246-4b6d-931f-d63679b5aab7	43af610e-e846-4f7c-88bd-c51fc43f0d12	588ad7bd-2e0c-40bd-bd0b-d4618b340e5c	38.00	0.00	2026-08-11 20:36:08.080072+05	2026-08-12 13:58:06.785001+05
1d88d201-b32c-4835-95b2-71581bb1df86	c64f66c9-639f-4913-8d6e-0304d51f1c20	a27de783-fc24-4e40-a56c-9d88bd2149d0	14.00	0.00	2026-08-12 13:58:06.845195+05	2026-08-12 13:58:06.845195+05
96c87b22-5d98-414a-8ac9-f12655d47408	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	a27de783-fc24-4e40-a56c-9d88bd2149d0	14.00	0.00	2026-08-12 13:58:06.845195+05	2026-08-12 13:58:06.845195+05
9ad2a541-fe9d-424d-b223-f4041594cc2e	43af610e-e846-4f7c-88bd-c51fc43f0d12	a27de783-fc24-4e40-a56c-9d88bd2149d0	33.00	0.00	2026-08-11 20:36:08.080072+05	2026-08-12 13:58:06.845195+05
5f1c7154-b75f-43a1-ab00-fabcb9f43a1e	c64f66c9-639f-4913-8d6e-0304d51f1c20	ea84a0d7-bc22-44c2-8c9f-701ea0dd087d	14.00	0.00	2026-08-12 13:58:06.919996+05	2026-08-12 13:58:06.919996+05
fa523ba2-57e3-427f-aa8e-162d18e18e25	8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	ea84a0d7-bc22-44c2-8c9f-701ea0dd087d	14.00	0.00	2026-08-12 13:58:06.919996+05	2026-08-12 13:58:06.919996+05
05ffc881-8807-4a7d-a686-2fd0fa93e81a	43af610e-e846-4f7c-88bd-c51fc43f0d12	ea84a0d7-bc22-44c2-8c9f-701ea0dd087d	42.00	0.00	2026-08-11 20:36:08.080072+05	2026-08-12 13:58:06.919996+05
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (user_id, employee_code, first_name, last_name, email, password, phone, profile_image, date_of_birth, gender, address, employee_type, designation_id, joining_date, salary, status, working_hours, overtime_hours, is_overtime, attendance_status, role_id, department_id, shift_id, job_category_id, created_at, updated_at, street_address, city, state_province, postal_code, country, emergency_contact_name, emergency_contact_relationship, emergency_contact_phone, bank_name, bank_account_number, bank_routing_code, blood_group, login_enabled, password_reset_allowed, web_login_allowed, mobile_login_allowed, api_access_allowed, multi_device_login_allowed, remote_attendance_allowed, biometric_attendance_allowed, team_lead_id, profile_image_thumb) FROM stdin;
c64f66c9-639f-4913-8d6e-0304d51f1c20	TC-EMP-005	Ashan	Mustafa	general@clickupmarket.com	$2b$12$u9cmqvu0eM7TzNcgnOF/OOxfBuTboj1/QdYMhzEIRA6GPgp3dfTZ6	+92 3014485957	\N	2000-01-01	Male	\N	Full-Time	ef95a6ad-7c2e-4861-ab66-afa005e4469e	2026-08-11	599999.91	t	\N	\N	f	Absent	1974e6ed-0de8-40e9-b951-f3e76208abea	f04f68cc-db96-4411-926a-ce34cfc41fa0	dc4fa1fb-1b82-49fa-97be-9de7f89f8406	ef1e26a6-6712-44dd-8cd1-5bce35ca5f62	2026-08-11 08:49:33.346518	2026-08-11 19:20:29.22265	Main Road Lahore	Manila Mertro	Punjab	44000	Pakistan	\N	\N	\N	\N	\N	\N	\N	t	t	t	t	f	t	f	f	\N	\N
8b4ba86e-6f24-4eed-83b0-d5f191eb7adf	TC-EMP-004	Muddasir	Iqbal	mudasseriqbal755@gmail.com	$2b$12$U.zFxdi9UeaFOTCzDz0JKeldHStgs8LUdVXKPJVZmmzS/f/DfYy4y	+92 3479008279	\N	2000-01-01	Male	\N	Full-Time	ef95a6ad-7c2e-4861-ab66-afa005e4469e	2026-08-10	10.00	t	\N	\N	f	Absent	53cd533c-13a9-400f-93f5-2fb207239874	f04f68cc-db96-4411-926a-ce34cfc41fa0	dc4fa1fb-1b82-49fa-97be-9de7f89f8406	ef1e26a6-6712-44dd-8cd1-5bce35ca5f62	2026-08-10 14:10:29.247165	2026-08-10 14:10:29.247165	House No 5 Ramzan Street Yasrab Town Shell Pump Bahawalpur	Bahawalpur	Punjab	63100	Pakistan	Muddasir Iqbal	Self	03479008279	\N	\N	\N	B-	t	t	t	t	f	t	f	f	\N	\N
43af610e-e846-4f7c-88bd-c51fc43f0d12	TC-EMP-006	Taha	Tayyab	taa@gmail.com	$2b$12$vNqFCSeOjDhiTyxvYjsa2.TC5LfLvzCUWh.GzlvxxuLGYDn4uXIuu	+92 123456789	\N	2000-01-01	Male	\N	Full-Time	3916c3d8-2428-4c10-9647-4a486094a428	2026-08-11	50000.00	t	\N	\N	f	Absent	b1370815-7b78-49bd-b3f6-ca765d129abe	f04f68cc-db96-4411-926a-ce34cfc41fa0	dc4fa1fb-1b82-49fa-97be-9de7f89f8406	ef1e26a6-6712-44dd-8cd1-5bce35ca5f62	2026-08-11 20:36:08.080072	2026-08-11 20:36:08.080072	Main Road Lahore	Lahore	Punjab	44000	Pakistan	\N	\N	\N	js	1234567890	\N	AB+	t	t	t	t	f	t	f	f	c64f66c9-639f-4913-8d6e-0304d51f1c20	\N
5269a7da-0db6-49b8-97eb-c2d482cb611a	TC-EMP-003	Haseeb	Iqbal	engmuhammadhaseebiqbal@gmail.com	$2b$12$..qOHYc3RVKh0PHuDBeTsOni1SUIb6gLSVoGpvpShNodt4NiuaOd.	+923011767127	/uploads/employee-photos/53df4307-3dff-4aa3-9fdc-bec984c99d56.png	2000-01-01	Male	\N	Part-Time	\N	2026-08-02	499999.00	t	\N	\N	t	Absent	53cd533c-13a9-400f-93f5-2fb207239874	\N	\N	\N	2026-08-02 15:22:22.916874	2026-08-03 12:15:37.243853	Haroonabad	Haroonabad	Punjab	62070	Pakistan	Haseeb Iqbal	Brother	03011767127	\N	\N	\N	B+	t	t	t	t	f	t	f	f	\N	\N
\.


--
-- Data for Name: working_day_schedules; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.working_day_schedules (schedule_id, department_id, designation_id, day_of_week, is_working, created_at, updated_at) FROM stdin;
57f04b59-8004-4671-a0db-0e824968a4ff	\N	\N	1	t	2026-08-11 19:41:41.731228+05	2026-08-11 19:41:41.731228+05
96acd343-6f43-4145-84e1-274337e4a136	\N	\N	2	t	2026-08-11 19:41:41.731228+05	2026-08-11 19:41:41.731228+05
37cd844b-b717-4669-8953-fa934f40d4f2	\N	\N	3	t	2026-08-11 19:41:41.731228+05	2026-08-11 19:41:41.731228+05
1d177fbf-ca88-482a-b07a-45428eefe11a	\N	\N	4	t	2026-08-11 19:41:41.731228+05	2026-08-11 19:41:41.731228+05
b7a4b584-bf1b-4c2d-bfb2-73af7dba9976	\N	\N	5	t	2026-08-11 19:41:41.731228+05	2026-08-11 19:41:41.731228+05
3162b044-2a93-49c7-a246-ca1fa9b20fe1	\N	\N	6	t	2026-08-11 19:41:41.731228+05	2026-08-11 19:41:41.731228+05
802ed2a9-aeb8-4637-9d8b-31354fcf9858	f04f68cc-db96-4411-926a-ce34cfc41fa0	\N	1	t	2026-08-11 19:41:47.933149+05	2026-08-11 19:41:47.933149+05
a65538a4-6cc0-46bf-92f3-ebe534da1380	f04f68cc-db96-4411-926a-ce34cfc41fa0	\N	2	t	2026-08-11 19:41:47.933149+05	2026-08-11 19:41:47.933149+05
7b00a1c2-3c5f-4914-a8a1-16bb888f9537	f04f68cc-db96-4411-926a-ce34cfc41fa0	\N	3	t	2026-08-11 19:41:47.933149+05	2026-08-11 19:41:47.933149+05
5fddb54b-065d-446c-8d90-d33f95fe465b	f04f68cc-db96-4411-926a-ce34cfc41fa0	\N	5	t	2026-08-11 19:41:47.933149+05	2026-08-11 19:41:47.933149+05
ed3bc46e-414e-4194-8710-36a9c1737bbe	f04f68cc-db96-4411-926a-ce34cfc41fa0	\N	6	t	2026-08-11 19:41:47.933149+05	2026-08-11 19:41:47.933149+05
\.


--
-- Name: migrations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.migrations_id_seq', 60, true);


--
-- Name: employee_documents PK_04033eeb8f6e7d57aece4ec4930; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employee_documents
    ADD CONSTRAINT "PK_04033eeb8f6e7d57aece4ec4930" PRIMARY KEY (document_id);


--
-- Name: migrations PK_8c82d7f526340ab734260ea46be; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.migrations
    ADD CONSTRAINT "PK_8c82d7f526340ab734260ea46be" PRIMARY KEY (id);


--
-- Name: appraisal_form_assignments PK_appraisal_form_assignments; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.appraisal_form_assignments
    ADD CONSTRAINT "PK_appraisal_form_assignments" PRIMARY KEY (assignment_id);


--
-- Name: appraisal_form_questions PK_appraisal_form_questions; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.appraisal_form_questions
    ADD CONSTRAINT "PK_appraisal_form_questions" PRIMARY KEY (form_question_id);


--
-- Name: appraisal_forms PK_appraisal_forms; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.appraisal_forms
    ADD CONSTRAINT "PK_appraisal_forms" PRIMARY KEY (form_id);


--
-- Name: appraisal_notifications PK_appraisal_notifications; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.appraisal_notifications
    ADD CONSTRAINT "PK_appraisal_notifications" PRIMARY KEY (notification_id);


--
-- Name: appraisal_question_options PK_appraisal_question_options; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.appraisal_question_options
    ADD CONSTRAINT "PK_appraisal_question_options" PRIMARY KEY (option_id);


--
-- Name: appraisal_questions PK_appraisal_questions; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.appraisal_questions
    ADD CONSTRAINT "PK_appraisal_questions" PRIMARY KEY (question_id);


--
-- Name: audit_logs PK_audit_logs; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT "PK_audit_logs" PRIMARY KEY (audit_log_id);


--
-- Name: company_settings PK_company_settings; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.company_settings
    ADD CONSTRAINT "PK_company_settings" PRIMARY KEY (id);


--
-- Name: email_queue PK_email_queue; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.email_queue
    ADD CONSTRAINT "PK_email_queue" PRIMARY KEY (email_queue_id);


--
-- Name: email_template_versions PK_email_template_versions; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.email_template_versions
    ADD CONSTRAINT "PK_email_template_versions" PRIMARY KEY (email_template_version_id);


--
-- Name: email_templates PK_email_templates; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT "PK_email_templates" PRIMARY KEY (email_template_id);


--
-- Name: holidays PK_holidays; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.holidays
    ADD CONSTRAINT "PK_holidays" PRIMARY KEY (holiday_id);


--
-- Name: leave_entitlements PK_leave_entitlements; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leave_entitlements
    ADD CONSTRAINT "PK_leave_entitlements" PRIMARY KEY (leave_entitlement_id);


--
-- Name: leave_history PK_leave_history; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leave_history
    ADD CONSTRAINT "PK_leave_history" PRIMARY KEY (leave_history_id);


--
-- Name: leave_types PK_leave_types; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leave_types
    ADD CONSTRAINT "PK_leave_types" PRIMARY KEY (leave_type_id);


--
-- Name: password_history PK_password_history; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.password_history
    ADD CONSTRAINT "PK_password_history" PRIMARY KEY (password_history_id);


--
-- Name: password_reset_tokens PK_password_reset_tokens; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT "PK_password_reset_tokens" PRIMARY KEY (password_reset_token_id);


--
-- Name: performance_review_answers PK_performance_review_answers; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.performance_review_answers
    ADD CONSTRAINT "PK_performance_review_answers" PRIMARY KEY (answer_id);


--
-- Name: performance_reviews PK_performance_reviews; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.performance_reviews
    ADD CONSTRAINT "PK_performance_reviews" PRIMARY KEY (review_id);


--
-- Name: refresh_tokens PK_refresh_tokens; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT "PK_refresh_tokens" PRIMARY KEY (refresh_token_id);


--
-- Name: review_approvals PK_review_approvals; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.review_approvals
    ADD CONSTRAINT "PK_review_approvals" PRIMARY KEY (approval_id);


--
-- Name: smtp_settings PK_smtp_settings; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.smtp_settings
    ADD CONSTRAINT "PK_smtp_settings" PRIMARY KEY (id);


--
-- Name: team_lead_assignment_members PK_team_lead_assignment_members; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_lead_assignment_members
    ADD CONSTRAINT "PK_team_lead_assignment_members" PRIMARY KEY (assignment_id, user_id);


--
-- Name: team_lead_assignments PK_team_lead_assignments; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_lead_assignments
    ADD CONSTRAINT "PK_team_lead_assignments" PRIMARY KEY (assignment_id);


--
-- Name: user_leave_balances PK_user_leave_balances; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_leave_balances
    ADD CONSTRAINT "PK_user_leave_balances" PRIMARY KEY (user_leave_balance_id);


--
-- Name: working_day_schedules PK_working_day_schedules; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.working_day_schedules
    ADD CONSTRAINT "PK_working_day_schedules" PRIMARY KEY (schedule_id);


--
-- Name: appraisal_forms UQ_appraisal_forms_name; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.appraisal_forms
    ADD CONSTRAINT "UQ_appraisal_forms_name" UNIQUE (form_name);


--
-- Name: email_template_versions UQ_email_template_versions_number; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.email_template_versions
    ADD CONSTRAINT "UQ_email_template_versions_number" UNIQUE (email_template_id, version);


--
-- Name: email_templates UQ_email_templates_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT "UQ_email_templates_key" UNIQUE (template_key);


--
-- Name: leave_entitlements UQ_leave_entitlements_user_type_year; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leave_entitlements
    ADD CONSTRAINT "UQ_leave_entitlements_user_type_year" UNIQUE (user_id, leave_type_id, year);


--
-- Name: leave_types UQ_leave_types_name; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leave_types
    ADD CONSTRAINT "UQ_leave_types_name" UNIQUE (name);


--
-- Name: password_reset_tokens UQ_password_reset_tokens_hash; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT "UQ_password_reset_tokens_hash" UNIQUE (token_hash);


--
-- Name: refresh_tokens UQ_refresh_tokens_token_hash; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT "UQ_refresh_tokens_token_hash" UNIQUE (token_hash);


--
-- Name: user_leave_balances UQ_user_leave_balances_user_type; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_leave_balances
    ADD CONSTRAINT "UQ_user_leave_balances_user_type" UNIQUE (user_id, leave_type_id);


--
-- Name: attendance attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_pkey PRIMARY KEY (attendance_id);


--
-- Name: departments departments_department_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_department_name_key UNIQUE (department_name);


--
-- Name: departments departments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (department_id);


--
-- Name: designations designations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.designations
    ADD CONSTRAINT designations_pkey PRIMARY KEY (designation_id);


--
-- Name: designations designations_title_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.designations
    ADD CONSTRAINT designations_title_key UNIQUE (title);


--
-- Name: job_categories job_categories_job_category_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.job_categories
    ADD CONSTRAINT job_categories_job_category_name_key UNIQUE (job_category_name);


--
-- Name: job_categories job_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.job_categories
    ADD CONSTRAINT job_categories_pkey PRIMARY KEY (job_category_id);


--
-- Name: leave_requests leave_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT leave_requests_pkey PRIMARY KEY (leave_id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (notification_id);


--
-- Name: payroll payroll_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payroll
    ADD CONSTRAINT payroll_pkey PRIMARY KEY (payroll_id);


--
-- Name: permissions permissions_permission_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_permission_name_key UNIQUE (permission_name);


--
-- Name: permissions permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (permission_id);


--
-- Name: employee_component_overrides pk_employee_component_overrides; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employee_component_overrides
    ADD CONSTRAINT pk_employee_component_overrides PRIMARY KEY (override_id);


--
-- Name: employee_loans pk_employee_loans; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employee_loans
    ADD CONSTRAINT pk_employee_loans PRIMARY KEY (loan_id);


--
-- Name: loan_installments pk_loan_installments; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.loan_installments
    ADD CONSTRAINT pk_loan_installments PRIMARY KEY (installment_id);


--
-- Name: meeting_participants pk_meeting_participants; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.meeting_participants
    ADD CONSTRAINT pk_meeting_participants PRIMARY KEY (meeting_participant_id);


--
-- Name: meetings pk_meetings; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.meetings
    ADD CONSTRAINT pk_meetings PRIMARY KEY (meeting_id);


--
-- Name: payroll_periods pk_payroll_periods; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payroll_periods
    ADD CONSTRAINT pk_payroll_periods PRIMARY KEY (period_id);


--
-- Name: payroll_rules pk_payroll_rules; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payroll_rules
    ADD CONSTRAINT pk_payroll_rules PRIMARY KEY (rule_id);


--
-- Name: payroll_settings pk_payroll_settings; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payroll_settings
    ADD CONSTRAINT pk_payroll_settings PRIMARY KEY (id);


--
-- Name: payslip_lines pk_payslip_lines; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payslip_lines
    ADD CONSTRAINT pk_payslip_lines PRIMARY KEY (line_id);


--
-- Name: payslips pk_payslips; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payslips
    ADD CONSTRAINT pk_payslips PRIMARY KEY (payslip_id);


--
-- Name: reimbursements pk_reimbursements; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reimbursements
    ADD CONSTRAINT pk_reimbursements PRIMARY KEY (reimbursement_id);


--
-- Name: salary_components pk_salary_components; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.salary_components
    ADD CONSTRAINT pk_salary_components PRIMARY KEY (component_id);


--
-- Name: salary_structure_assignments pk_salary_structure_assignments; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.salary_structure_assignments
    ADD CONSTRAINT pk_salary_structure_assignments PRIMARY KEY (assignment_id);


--
-- Name: salary_structure_components pk_salary_structure_components; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.salary_structure_components
    ADD CONSTRAINT pk_salary_structure_components PRIMARY KEY (structure_component_id);


--
-- Name: salary_structures pk_salary_structures; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.salary_structures
    ADD CONSTRAINT pk_salary_structures PRIMARY KEY (structure_id);


--
-- Name: tax_configs pk_tax_configs; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tax_configs
    ADD CONSTRAINT pk_tax_configs PRIMARY KEY (tax_config_id);


--
-- Name: tax_slabs pk_tax_slabs; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tax_slabs
    ADD CONSTRAINT pk_tax_slabs PRIMARY KEY (slab_id);


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (role_permission_id);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (role_id);


--
-- Name: roles roles_role_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_role_name_key UNIQUE (role_name);


--
-- Name: shifts shifts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_pkey PRIMARY KEY (shift_id);


--
-- Name: shifts shifts_shift_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_shift_name_key UNIQUE (shift_name);


--
-- Name: meeting_participants uq_meeting_participant; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.meeting_participants
    ADD CONSTRAINT uq_meeting_participant UNIQUE (meeting_id, user_id);


--
-- Name: payslips uq_payslip_period_user; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payslips
    ADD CONSTRAINT uq_payslip_period_user UNIQUE (period_id, user_id);


--
-- Name: salary_components uq_salary_components_code; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.salary_components
    ADD CONSTRAINT uq_salary_components_code UNIQUE (code);


--
-- Name: salary_structures uq_salary_structures_name; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.salary_structures
    ADD CONSTRAINT uq_salary_structures_name UNIQUE (name);


--
-- Name: salary_structure_components uq_structure_component; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.salary_structure_components
    ADD CONSTRAINT uq_structure_component UNIQUE (structure_id, component_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_employee_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_employee_code_key UNIQUE (employee_code);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (user_id);


--
-- Name: IDX_afa_department; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_afa_department" ON public.appraisal_form_assignments USING btree (department_id);


--
-- Name: IDX_afa_designation; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_afa_designation" ON public.appraisal_form_assignments USING btree (designation_id);


--
-- Name: IDX_afa_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_afa_user" ON public.appraisal_form_assignments USING btree (user_id);


--
-- Name: IDX_an_recipient_unread; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_an_recipient_unread" ON public.appraisal_notifications USING btree (recipient_user_id, is_read, created_at);


--
-- Name: IDX_aqo_question; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_aqo_question" ON public.appraisal_question_options USING btree (question_id);


--
-- Name: IDX_audit_logs_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_audit_logs_created_at" ON public.audit_logs USING btree (created_at DESC);


--
-- Name: IDX_audit_logs_entity; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_audit_logs_entity" ON public.audit_logs USING btree (entity_type, entity_id);


--
-- Name: IDX_email_queue_drain; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_email_queue_drain" ON public.email_queue USING btree (next_attempt_at) WHERE ((status)::text = 'pending'::text);


--
-- Name: IDX_email_queue_related_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_email_queue_related_user" ON public.email_queue USING btree (related_user_id);


--
-- Name: IDX_email_queue_status_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_email_queue_status_created" ON public.email_queue USING btree (status, created_at DESC);


--
-- Name: IDX_form_question_version; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_form_question_version" ON public.appraisal_form_questions USING btree (form_id, version);


--
-- Name: IDX_holidays_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_holidays_date" ON public.holidays USING btree (holiday_date);


--
-- Name: IDX_leave_entitlements_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_leave_entitlements_user" ON public.leave_entitlements USING btree (user_id);


--
-- Name: IDX_leave_history_user_type_year; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_leave_history_user_type_year" ON public.leave_history USING btree (user_id, leave_type_id, year);


--
-- Name: IDX_leave_types_is_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_leave_types_is_active" ON public.leave_types USING btree (is_active);


--
-- Name: IDX_notifications_batch; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_notifications_batch" ON public.notifications USING btree (batch_id) WHERE (batch_id IS NOT NULL);


--
-- Name: IDX_notifications_recipient_read; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_notifications_recipient_read" ON public.notifications USING btree (recipient_id, read_at);


--
-- Name: IDX_password_history_user_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_password_history_user_created" ON public.password_history USING btree (user_id, created_at DESC);


--
-- Name: IDX_password_reset_tokens_live; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_password_reset_tokens_live" ON public.password_reset_tokens USING btree (token_hash) WHERE ((used_at IS NULL) AND (invalidated_at IS NULL));


--
-- Name: IDX_password_reset_tokens_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_password_reset_tokens_user" ON public.password_reset_tokens USING btree (user_id);


--
-- Name: IDX_ra_review; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_ra_review" ON public.review_approvals USING btree (review_id, created_at);


--
-- Name: IDX_refresh_tokens_token_hash; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_refresh_tokens_token_hash" ON public.refresh_tokens USING btree (token_hash);


--
-- Name: IDX_refresh_tokens_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_refresh_tokens_user_id" ON public.refresh_tokens USING btree (user_id);


--
-- Name: IDX_review_form_version; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_review_form_version" ON public.performance_reviews USING btree (form_id, form_version);


--
-- Name: IDX_tla_team_lead; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_tla_team_lead" ON public.team_lead_assignments USING btree (team_lead_id);


--
-- Name: IDX_tlam_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_tlam_user" ON public.team_lead_assignment_members USING btree (user_id);


--
-- Name: IDX_user_leave_balances_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_user_leave_balances_user" ON public.user_leave_balances USING btree (user_id);


--
-- Name: IDX_users_department; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_users_department" ON public.users USING btree (department_id);


--
-- Name: IDX_users_team_lead; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_users_team_lead" ON public.users USING btree (team_lead_id);


--
-- Name: IDX_wds_lookup; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_wds_lookup" ON public.working_day_schedules USING btree (department_id, designation_id);


--
-- Name: UQ_afa_form_department; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "UQ_afa_form_department" ON public.appraisal_form_assignments USING btree (form_id, department_id) WHERE (department_id IS NOT NULL);


--
-- Name: UQ_afa_form_designation; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "UQ_afa_form_designation" ON public.appraisal_form_assignments USING btree (form_id, designation_id) WHERE (designation_id IS NOT NULL);


--
-- Name: UQ_afa_form_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "UQ_afa_form_user" ON public.appraisal_form_assignments USING btree (form_id, user_id) WHERE (user_id IS NOT NULL);


--
-- Name: UQ_an_dedupe_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "UQ_an_dedupe_key" ON public.appraisal_notifications USING btree (dedupe_key) WHERE (dedupe_key IS NOT NULL);


--
-- Name: UQ_pr_reviewee_form_period; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "UQ_pr_reviewee_form_period" ON public.performance_reviews USING btree (reviewee_id, form_id, review_period) WHERE (form_id IS NOT NULL);


--
-- Name: UQ_tla_lead_department_mode; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "UQ_tla_lead_department_mode" ON public.team_lead_assignments USING btree (team_lead_id) WHERE ((mode)::text = 'DEPARTMENT'::text);


--
-- Name: UQ_wds_department; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "UQ_wds_department" ON public.working_day_schedules USING btree (department_id, day_of_week) WHERE ((department_id IS NOT NULL) AND (designation_id IS NULL));


--
-- Name: UQ_wds_designation; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "UQ_wds_designation" ON public.working_day_schedules USING btree (department_id, designation_id, day_of_week) WHERE (designation_id IS NOT NULL);


--
-- Name: UQ_wds_global; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "UQ_wds_global" ON public.working_day_schedules USING btree (day_of_week) WHERE ((department_id IS NULL) AND (designation_id IS NULL));


--
-- Name: idx_attendance_shift_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_attendance_shift_id ON public.attendance USING btree (shift_id);


--
-- Name: idx_attendance_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_attendance_user_id ON public.attendance USING btree (user_id);


--
-- Name: idx_designations_department_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_designations_department_id ON public.designations USING btree (department_id);


--
-- Name: idx_eco_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_eco_user ON public.employee_component_overrides USING btree (user_id);


--
-- Name: idx_employee_documents_employee; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_employee_documents_employee ON public.employee_documents USING btree ("employeeId");


--
-- Name: idx_employee_loans_user_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_employee_loans_user_status ON public.employee_loans USING btree (user_id, status);


--
-- Name: idx_leave_requests_approved_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_leave_requests_approved_by ON public.leave_requests USING btree (approved_by);


--
-- Name: idx_leave_requests_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_leave_requests_user_id ON public.leave_requests USING btree (user_id);


--
-- Name: idx_loan_installments_loan; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_loan_installments_loan ON public.loan_installments USING btree (loan_id);


--
-- Name: idx_loan_installments_loan_period; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_loan_installments_loan_period ON public.loan_installments USING btree (loan_id, period_id);


--
-- Name: idx_meeting_participants_meeting; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_meeting_participants_meeting ON public.meeting_participants USING btree (meeting_id);


--
-- Name: idx_meeting_participants_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_meeting_participants_user ON public.meeting_participants USING btree (user_id);


--
-- Name: idx_meetings_organizer; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_meetings_organizer ON public.meetings USING btree (organizer_id);


--
-- Name: idx_meetings_scheduled_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_meetings_scheduled_at ON public.meetings USING btree (scheduled_at);


--
-- Name: idx_notifications_created_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notifications_created_by ON public.notifications USING btree (created_by);


--
-- Name: idx_payroll_rules_scope; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payroll_rules_scope ON public.payroll_rules USING btree (scope_type, scope_id);


--
-- Name: idx_payroll_rules_type_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payroll_rules_type_active ON public.payroll_rules USING btree (rule_type, is_active);


--
-- Name: idx_payroll_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payroll_user_id ON public.payroll USING btree (user_id);


--
-- Name: idx_payslip_lines_payslip; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payslip_lines_payslip ON public.payslip_lines USING btree (payslip_id);


--
-- Name: idx_payslips_period; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payslips_period ON public.payslips USING btree (period_id);


--
-- Name: idx_payslips_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payslips_user ON public.payslips USING btree (user_id);


--
-- Name: idx_reimbursements_paid_period; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_reimbursements_paid_period ON public.reimbursements USING btree (paid_period_id);


--
-- Name: idx_reimbursements_status_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_reimbursements_status_date ON public.reimbursements USING btree (status, expense_date);


--
-- Name: idx_reimbursements_user_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_reimbursements_user_status ON public.reimbursements USING btree (user_id, status);


--
-- Name: idx_role_permissions_permission_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_role_permissions_permission_id ON public.role_permissions USING btree (permission_id);


--
-- Name: idx_role_permissions_role_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_role_permissions_role_id ON public.role_permissions USING btree (role_id);


--
-- Name: idx_ssa_scope; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ssa_scope ON public.salary_structure_assignments USING btree (scope_type, scope_id);


--
-- Name: idx_tax_configs_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tax_configs_active ON public.tax_configs USING btree (is_active);


--
-- Name: idx_tax_slabs_config; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tax_slabs_config ON public.tax_slabs USING btree (tax_config_id);


--
-- Name: idx_users_department_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_department_id ON public.users USING btree (department_id);


--
-- Name: idx_users_designation_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_designation_id ON public.users USING btree (designation_id);


--
-- Name: idx_users_job_category_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_job_category_id ON public.users USING btree (job_category_id);


--
-- Name: idx_users_role_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_role_id ON public.users USING btree (role_id);


--
-- Name: idx_users_shift_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_shift_id ON public.users USING btree (shift_id);


--
-- Name: employee_documents FK_1e0b96137e88ec3ab8f14709f7c; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employee_documents
    ADD CONSTRAINT "FK_1e0b96137e88ec3ab8f14709f7c" FOREIGN KEY ("employeeId") REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- Name: appraisal_form_assignments FK_afa_department; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.appraisal_form_assignments
    ADD CONSTRAINT "FK_afa_department" FOREIGN KEY (department_id) REFERENCES public.departments(department_id) ON DELETE CASCADE;


--
-- Name: appraisal_form_assignments FK_afa_designation; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.appraisal_form_assignments
    ADD CONSTRAINT "FK_afa_designation" FOREIGN KEY (designation_id) REFERENCES public.designations(designation_id) ON DELETE CASCADE;


--
-- Name: appraisal_form_assignments FK_afa_form; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.appraisal_form_assignments
    ADD CONSTRAINT "FK_afa_form" FOREIGN KEY (form_id) REFERENCES public.appraisal_forms(form_id) ON DELETE CASCADE;


--
-- Name: appraisal_form_assignments FK_afa_user; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.appraisal_form_assignments
    ADD CONSTRAINT "FK_afa_user" FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- Name: appraisal_notifications FK_an_recipient; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.appraisal_notifications
    ADD CONSTRAINT "FK_an_recipient" FOREIGN KEY (recipient_user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- Name: appraisal_notifications FK_an_review; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.appraisal_notifications
    ADD CONSTRAINT "FK_an_review" FOREIGN KEY (related_review_id) REFERENCES public.performance_reviews(review_id) ON DELETE SET NULL;


--
-- Name: performance_review_answers FK_answers_form_question; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.performance_review_answers
    ADD CONSTRAINT "FK_answers_form_question" FOREIGN KEY (form_question_id) REFERENCES public.appraisal_form_questions(form_question_id) ON DELETE CASCADE;


--
-- Name: performance_review_answers FK_answers_review; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.performance_review_answers
    ADD CONSTRAINT "FK_answers_review" FOREIGN KEY (review_id) REFERENCES public.performance_reviews(review_id) ON DELETE CASCADE;


--
-- Name: performance_review_answers FK_answers_selected_option; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.performance_review_answers
    ADD CONSTRAINT "FK_answers_selected_option" FOREIGN KEY (selected_option_id) REFERENCES public.appraisal_question_options(option_id) ON DELETE SET NULL;


--
-- Name: appraisal_forms FK_appraisal_forms_creator; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.appraisal_forms
    ADD CONSTRAINT "FK_appraisal_forms_creator" FOREIGN KEY (created_by) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: appraisal_forms FK_appraisal_forms_department; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.appraisal_forms
    ADD CONSTRAINT "FK_appraisal_forms_department" FOREIGN KEY (department_id) REFERENCES public.departments(department_id) ON DELETE SET NULL;


--
-- Name: appraisal_forms FK_appraisal_forms_designation; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.appraisal_forms
    ADD CONSTRAINT "FK_appraisal_forms_designation" FOREIGN KEY (designation_id) REFERENCES public.designations(designation_id) ON DELETE SET NULL;


--
-- Name: audit_logs FK_audit_logs_actor; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT "FK_audit_logs_actor" FOREIGN KEY (actor_user_id) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: email_queue FK_email_queue_related_user; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.email_queue
    ADD CONSTRAINT "FK_email_queue_related_user" FOREIGN KEY (related_user_id) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: email_template_versions FK_email_template_versions_changed_by; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.email_template_versions
    ADD CONSTRAINT "FK_email_template_versions_changed_by" FOREIGN KEY (changed_by_user_id) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: email_template_versions FK_email_template_versions_template; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.email_template_versions
    ADD CONSTRAINT "FK_email_template_versions_template" FOREIGN KEY (email_template_id) REFERENCES public.email_templates(email_template_id) ON DELETE CASCADE;


--
-- Name: email_templates FK_email_templates_updated_by; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT "FK_email_templates_updated_by" FOREIGN KEY (updated_by_user_id) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: appraisal_form_questions FK_form_questions_form; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.appraisal_form_questions
    ADD CONSTRAINT "FK_form_questions_form" FOREIGN KEY (form_id) REFERENCES public.appraisal_forms(form_id) ON DELETE CASCADE;


--
-- Name: appraisal_form_questions FK_form_questions_question; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.appraisal_form_questions
    ADD CONSTRAINT "FK_form_questions_question" FOREIGN KEY (question_id) REFERENCES public.appraisal_questions(question_id) ON DELETE CASCADE;


--
-- Name: holidays FK_holidays_department; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.holidays
    ADD CONSTRAINT "FK_holidays_department" FOREIGN KEY (department_id) REFERENCES public.departments(department_id) ON DELETE CASCADE;


--
-- Name: leave_entitlements FK_leave_entitlements_created_by; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leave_entitlements
    ADD CONSTRAINT "FK_leave_entitlements_created_by" FOREIGN KEY (created_by) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: leave_entitlements FK_leave_entitlements_leave_type; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leave_entitlements
    ADD CONSTRAINT "FK_leave_entitlements_leave_type" FOREIGN KEY (leave_type_id) REFERENCES public.leave_types(leave_type_id) ON DELETE CASCADE;


--
-- Name: leave_entitlements FK_leave_entitlements_user; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leave_entitlements
    ADD CONSTRAINT "FK_leave_entitlements_user" FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- Name: leave_history FK_leave_history_leave_type; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leave_history
    ADD CONSTRAINT "FK_leave_history_leave_type" FOREIGN KEY (leave_type_id) REFERENCES public.leave_types(leave_type_id) ON DELETE CASCADE;


--
-- Name: leave_history FK_leave_history_performed_by; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leave_history
    ADD CONSTRAINT "FK_leave_history_performed_by" FOREIGN KEY (performed_by) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: leave_history FK_leave_history_user; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leave_history
    ADD CONSTRAINT "FK_leave_history_user" FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- Name: leave_requests FK_leave_requests_leave_type; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT "FK_leave_requests_leave_type" FOREIGN KEY (leave_type_id) REFERENCES public.leave_types(leave_type_id) ON DELETE SET NULL;


--
-- Name: notifications FK_notifications_audience_department; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT "FK_notifications_audience_department" FOREIGN KEY (audience_department_id) REFERENCES public.departments(department_id) ON DELETE SET NULL;


--
-- Name: notifications FK_notifications_recipient; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT "FK_notifications_recipient" FOREIGN KEY (recipient_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- Name: appraisal_question_options FK_options_question; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.appraisal_question_options
    ADD CONSTRAINT "FK_options_question" FOREIGN KEY (question_id) REFERENCES public.appraisal_questions(question_id) ON DELETE CASCADE;


--
-- Name: password_history FK_password_history_user; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.password_history
    ADD CONSTRAINT "FK_password_history_user" FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- Name: password_reset_tokens FK_password_reset_tokens_created_by; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT "FK_password_reset_tokens_created_by" FOREIGN KEY (created_by_user_id) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: password_reset_tokens FK_password_reset_tokens_user; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT "FK_password_reset_tokens_user" FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- Name: performance_reviews FK_performance_reviews_attendance; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.performance_reviews
    ADD CONSTRAINT "FK_performance_reviews_attendance" FOREIGN KEY (attendance_id) REFERENCES public.attendance(attendance_id) ON DELETE SET NULL;


--
-- Name: performance_reviews FK_pr_approved_by; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.performance_reviews
    ADD CONSTRAINT "FK_pr_approved_by" FOREIGN KEY (approved_by_user_id) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: review_approvals FK_ra_actor; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.review_approvals
    ADD CONSTRAINT "FK_ra_actor" FOREIGN KEY (actor_user_id) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: review_approvals FK_ra_review; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.review_approvals
    ADD CONSTRAINT "FK_ra_review" FOREIGN KEY (review_id) REFERENCES public.performance_reviews(review_id) ON DELETE CASCADE;


--
-- Name: refresh_tokens FK_refresh_tokens_user; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT "FK_refresh_tokens_user" FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- Name: performance_reviews FK_reviews_form; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.performance_reviews
    ADD CONSTRAINT "FK_reviews_form" FOREIGN KEY (form_id) REFERENCES public.appraisal_forms(form_id) ON DELETE CASCADE;


--
-- Name: performance_reviews FK_reviews_reviewee; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.performance_reviews
    ADD CONSTRAINT "FK_reviews_reviewee" FOREIGN KEY (reviewee_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- Name: performance_reviews FK_reviews_reviewer; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.performance_reviews
    ADD CONSTRAINT "FK_reviews_reviewer" FOREIGN KEY (reviewer_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- Name: team_lead_assignments FK_tla_created_by; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_lead_assignments
    ADD CONSTRAINT "FK_tla_created_by" FOREIGN KEY (created_by) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: team_lead_assignments FK_tla_department; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_lead_assignments
    ADD CONSTRAINT "FK_tla_department" FOREIGN KEY (department_id) REFERENCES public.departments(department_id) ON DELETE CASCADE;


--
-- Name: team_lead_assignments FK_tla_team_lead; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_lead_assignments
    ADD CONSTRAINT "FK_tla_team_lead" FOREIGN KEY (team_lead_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- Name: team_lead_assignment_members FK_tlam_assignment; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_lead_assignment_members
    ADD CONSTRAINT "FK_tlam_assignment" FOREIGN KEY (assignment_id) REFERENCES public.team_lead_assignments(assignment_id) ON DELETE CASCADE;


--
-- Name: team_lead_assignment_members FK_tlam_user; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_lead_assignment_members
    ADD CONSTRAINT "FK_tlam_user" FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- Name: user_leave_balances FK_user_leave_balances_leave_type; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_leave_balances
    ADD CONSTRAINT "FK_user_leave_balances_leave_type" FOREIGN KEY (leave_type_id) REFERENCES public.leave_types(leave_type_id) ON DELETE CASCADE;


--
-- Name: user_leave_balances FK_user_leave_balances_user; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_leave_balances
    ADD CONSTRAINT "FK_user_leave_balances_user" FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- Name: users FK_users_team_lead; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "FK_users_team_lead" FOREIGN KEY (team_lead_id) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: working_day_schedules FK_working_day_schedules_department; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.working_day_schedules
    ADD CONSTRAINT "FK_working_day_schedules_department" FOREIGN KEY (department_id) REFERENCES public.departments(department_id) ON DELETE CASCADE;


--
-- Name: working_day_schedules FK_working_day_schedules_designation; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.working_day_schedules
    ADD CONSTRAINT "FK_working_day_schedules_designation" FOREIGN KEY (designation_id) REFERENCES public.designations(designation_id) ON DELETE CASCADE;


--
-- Name: attendance fk_attendance_shift; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT fk_attendance_shift FOREIGN KEY (shift_id) REFERENCES public.shifts(shift_id);


--
-- Name: attendance fk_attendance_user; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT fk_attendance_user FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- Name: designations fk_designations_department; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.designations
    ADD CONSTRAINT fk_designations_department FOREIGN KEY (department_id) REFERENCES public.departments(department_id);


--
-- Name: employee_component_overrides fk_eco_component; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employee_component_overrides
    ADD CONSTRAINT fk_eco_component FOREIGN KEY (component_id) REFERENCES public.salary_components(component_id) ON DELETE CASCADE;


--
-- Name: employee_component_overrides fk_eco_user; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employee_component_overrides
    ADD CONSTRAINT fk_eco_user FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- Name: employee_loans fk_employee_loans_decided_by; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employee_loans
    ADD CONSTRAINT fk_employee_loans_decided_by FOREIGN KEY (decided_by) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: employee_loans fk_employee_loans_user; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employee_loans
    ADD CONSTRAINT fk_employee_loans_user FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- Name: leave_requests fk_leave_requests_approver; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT fk_leave_requests_approver FOREIGN KEY (approved_by) REFERENCES public.users(user_id);


--
-- Name: leave_requests fk_leave_requests_user; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT fk_leave_requests_user FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- Name: loan_installments fk_loan_installments_loan; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.loan_installments
    ADD CONSTRAINT fk_loan_installments_loan FOREIGN KEY (loan_id) REFERENCES public.employee_loans(loan_id) ON DELETE CASCADE;


--
-- Name: meeting_participants fk_meeting_participants_meeting; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.meeting_participants
    ADD CONSTRAINT fk_meeting_participants_meeting FOREIGN KEY (meeting_id) REFERENCES public.meetings(meeting_id) ON DELETE CASCADE;


--
-- Name: meeting_participants fk_meeting_participants_user; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.meeting_participants
    ADD CONSTRAINT fk_meeting_participants_user FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- Name: meetings fk_meetings_audience_department; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.meetings
    ADD CONSTRAINT fk_meetings_audience_department FOREIGN KEY (audience_department_id) REFERENCES public.departments(department_id) ON DELETE SET NULL;


--
-- Name: meetings fk_meetings_organizer; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.meetings
    ADD CONSTRAINT fk_meetings_organizer FOREIGN KEY (organizer_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- Name: notifications fk_notifications_user; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT fk_notifications_user FOREIGN KEY (created_by) REFERENCES public.users(user_id);


--
-- Name: payroll fk_payroll_user; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payroll
    ADD CONSTRAINT fk_payroll_user FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- Name: payslip_lines fk_payslip_lines_payslip; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payslip_lines
    ADD CONSTRAINT fk_payslip_lines_payslip FOREIGN KEY (payslip_id) REFERENCES public.payslips(payslip_id) ON DELETE CASCADE;


--
-- Name: payslips fk_payslips_period; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payslips
    ADD CONSTRAINT fk_payslips_period FOREIGN KEY (period_id) REFERENCES public.payroll_periods(period_id) ON DELETE CASCADE;


--
-- Name: payslips fk_payslips_user; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payslips
    ADD CONSTRAINT fk_payslips_user FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- Name: payroll_periods fk_periods_approved_by; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payroll_periods
    ADD CONSTRAINT fk_periods_approved_by FOREIGN KEY (approved_by) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: payroll_periods fk_periods_prepared_by; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payroll_periods
    ADD CONSTRAINT fk_periods_prepared_by FOREIGN KEY (prepared_by) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: reimbursements fk_reimbursements_decided_by; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reimbursements
    ADD CONSTRAINT fk_reimbursements_decided_by FOREIGN KEY (decided_by) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: reimbursements fk_reimbursements_payslip; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reimbursements
    ADD CONSTRAINT fk_reimbursements_payslip FOREIGN KEY (paid_payslip_id) REFERENCES public.payslips(payslip_id) ON DELETE SET NULL;


--
-- Name: reimbursements fk_reimbursements_period; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reimbursements
    ADD CONSTRAINT fk_reimbursements_period FOREIGN KEY (paid_period_id) REFERENCES public.payroll_periods(period_id) ON DELETE SET NULL;


--
-- Name: reimbursements fk_reimbursements_user; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reimbursements
    ADD CONSTRAINT fk_reimbursements_user FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- Name: role_permissions fk_role_permissions_permission; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT fk_role_permissions_permission FOREIGN KEY (permission_id) REFERENCES public.permissions(permission_id) ON DELETE CASCADE;


--
-- Name: role_permissions fk_role_permissions_role; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES public.roles(role_id) ON DELETE CASCADE;


--
-- Name: salary_structure_assignments fk_ssa_structure; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.salary_structure_assignments
    ADD CONSTRAINT fk_ssa_structure FOREIGN KEY (structure_id) REFERENCES public.salary_structures(structure_id) ON DELETE CASCADE;


--
-- Name: salary_structure_components fk_ssc_component; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.salary_structure_components
    ADD CONSTRAINT fk_ssc_component FOREIGN KEY (component_id) REFERENCES public.salary_components(component_id) ON DELETE CASCADE;


--
-- Name: salary_structure_components fk_ssc_structure; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.salary_structure_components
    ADD CONSTRAINT fk_ssc_structure FOREIGN KEY (structure_id) REFERENCES public.salary_structures(structure_id) ON DELETE CASCADE;


--
-- Name: tax_slabs fk_tax_slabs_config; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tax_slabs
    ADD CONSTRAINT fk_tax_slabs_config FOREIGN KEY (tax_config_id) REFERENCES public.tax_configs(tax_config_id) ON DELETE CASCADE;


--
-- Name: users fk_users_department; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT fk_users_department FOREIGN KEY (department_id) REFERENCES public.departments(department_id);


--
-- Name: users fk_users_designation; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT fk_users_designation FOREIGN KEY (designation_id) REFERENCES public.designations(designation_id);


--
-- Name: users fk_users_job_category; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT fk_users_job_category FOREIGN KEY (job_category_id) REFERENCES public.job_categories(job_category_id);


--
-- Name: users fk_users_role; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES public.roles(role_id);


--
-- Name: users fk_users_shift; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT fk_users_shift FOREIGN KEY (shift_id) REFERENCES public.shifts(shift_id);


--
-- PostgreSQL database dump complete
--

\unrestrict NnMS0Br64oADJaro4xGJqcv0RCwxyv8I9UIItEe6qaHivRrPYPh6G1cMbnDT67E

