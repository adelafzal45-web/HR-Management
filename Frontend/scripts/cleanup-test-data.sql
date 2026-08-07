-- ============================================================================
-- Clean test and transactional data, keeping roles + permissions + config
-- ============================================================================

BEGIN;

-- Transactional/operational data (cascades will clean related rows)
DELETE FROM refresh_tokens;
DELETE FROM password_reset_tokens;
DELETE FROM password_history;
DELETE FROM email_queue;
DELETE FROM audit_logs;

-- Appraisal/performance data
DELETE FROM performance_review_answers;
DELETE FROM review_approvals;
DELETE FROM performance_reviews;
DELETE FROM appraisal_notifications;
DELETE FROM appraisal_form_assignments;
DELETE FROM team_lead_assignment_members;
DELETE FROM team_lead_assignments;

-- Forms and questions (test seeds)
DELETE FROM appraisal_form_questions;
DELETE FROM appraisal_forms;
DELETE FROM appraisal_question_options;
DELETE FROM appraisal_questions;

-- HR operational data
DELETE FROM payroll;
DELETE FROM user_leave_balances;
DELETE FROM leave_requests;
DELETE FROM attendance;
DELETE FROM notifications;
DELETE FROM employee_documents;

-- Users (includes the 3 test accounts from SeedTestAccounts)
DELETE FROM users;

-- Reference data that was hand-entered or test-seeded
DELETE FROM designations;
DELETE FROM departments;
DELETE FROM shifts;
DELETE FROM job_categories;

-- ============================================================================
-- What REMAINS after this script:
-- ============================================================================
-- ✓ roles (6)
-- ✓ permissions (116)
-- ✓ role_permissions (480)
-- ✓ company_settings (1)
-- ✓ leave_types (7)
-- ✓ working_day_schedules (5)
-- ✓ email_templates (13)
-- ✓ smtp_settings (1)
-- ✓ migrations (33)
-- ✓ email_template_versions (0, structure only)
--
-- You'll need to create at least one Admin user through the app or a seed
-- script before you can log in.
-- ============================================================================

COMMIT;
