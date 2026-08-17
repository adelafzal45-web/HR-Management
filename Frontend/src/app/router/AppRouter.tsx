import { lazy, Suspense } from "react";
import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "@/components/common/ProtectedRoute";
import ErrorBoundary from "@/components/common/ErrorBoundary";
import LoadingOverlay from "@/components/common/LoadingOverlay";
import { TEAM_LEAD_ROLES, HR_ADMIN_ROLES, EVALUATOR_ROLES } from "@/constants/roles";

// Permission-driven dashboard — driven by the live JWT session (AuthContext)
const RbacDashboard = lazy(() => import("@/modules/dashboard/pages/RbacDashboard"));

// Auth
const Login = lazy(() => import("@/modules/auth/pages/Login"));
const ForgetPassword = lazy(() => import("@/modules/auth/pages/ForgetPassword"));
const ResetPassword = lazy(() => import("@/modules/auth/pages/ResetPassword"));
const ChangePassword = lazy(() => import("@/modules/auth/pages/ChangePassword"));

// Self-service profile
const ProfilePage = lazy(() => import("@/modules/profile/pages/Profile"));
const ProfileEditPage = lazy(() => import("@/modules/profile/pages/ProfileEdit"));

// Dashboard / shared
const ComingSoon = lazy(() => import("@/modules/shared/pages/ComingSoon"));

// Attendance / Leave / Payroll / Appraisal / Notifications
const Attendance = lazy(() => import("@/modules/attendance/pages/Attendance"));
const AttendanceRecordsPage = lazy(() => import("@/modules/attendance/pages/AttendanceRecords"));
const Leave = lazy(() => import("@/modules/leave/pages/Leave"));
const LeaveRequestsPage = lazy(() => import("@/modules/leave/pages/LeaveRequests"));
const LeaveManagementPage = lazy(() => import("@/modules/leave/pages/LeaveManagement"));
const PublicHolidaysPage = lazy(() => import("@/modules/leave/pages/PublicHolidays"));
const LeaveEntitlementsPage = lazy(() => import("@/modules/leave/pages/LeaveEntitlements"));
const LeavePlannerPage = lazy(() => import("@/modules/leave/pages/LeavePlanner"));
const MeetingsPage = lazy(() => import("@/modules/meetings/pages/Meetings"));
const Payroll = lazy(() => import("@/modules/payroll/pages/Payroll"));
// The other two tabs of the employee's own payroll view (spec §2/§9, Phase 3):
// loan requests and expense claims. Ungated like `Payroll` — see their routes.
const MyLoans = lazy(() => import("@/modules/payroll/pages/MyLoans"));
const MyReimbursements = lazy(
 () => import("@/modules/payroll/pages/MyReimbursements"),
);
const ProcessPayrollPage = lazy(() => import("@/modules/payroll/pages/ProcessPayroll"));
// New payroll engine (spec §1–14) — the HR/Admin configuration + run workspace.
// The self-service `Payroll` above stays the employee view; these are gated to
// HR_ADMIN_ROLES. `RunPayroll` (below) is the guided period run screen; the
// legacy `/payroll/process` route above keeps the old fixed-formula screen
// reachable but read-only.
const PayrollDashboard = lazy(() => import("@/modules/payroll/pages/PayrollDashboard"));
const PayrollPeriods = lazy(() => import("@/modules/payroll/pages/PayrollPeriods"));
// Guided "Run Payroll" wizard — the simplified Setup → Period → Process →
// Approve → Share flow that now backs /payroll/run. Replaces the standalone
// ProcessPayrollV2 screen (still on disk, unused) as the single place HR
// starts a pay run instead of hunting across Periods/Process/Approvals.
const RunPayroll = lazy(() => import("@/modules/payroll/pages/RunPayroll"));
const SalaryComponents = lazy(() => import("@/modules/payroll/pages/SalaryComponents"));
const SalaryStructures = lazy(() => import("@/modules/payroll/pages/SalaryStructures"));
const PayrollSettings = lazy(() => import("@/modules/payroll/pages/PayrollSettings"));
const Payslips = lazy(() => import("@/modules/payroll/pages/Payslips"));
// Phase 2 — rule builders, statutory, loans, approvals, reports, setup gate.
const PayrollRules = lazy(() => import("@/modules/payroll/pages/PayrollRules"));
const PayrollTax = lazy(() => import("@/modules/payroll/pages/PayrollTax"));
const PayrollLoans = lazy(() => import("@/modules/payroll/pages/PayrollLoans"));
const PayrollBonuses = lazy(() => import("@/modules/payroll/pages/PayrollBonuses"));
const PayrollApprovals = lazy(() => import("@/modules/payroll/pages/PayrollApprovals"));
const PayrollReports = lazy(() => import("@/modules/payroll/pages/PayrollReports"));
const PayrollSetup = lazy(() => import("@/modules/payroll/pages/PayrollSetup"));
// HR-side expense claim queue (spec §2, Phase 3).
const PayrollReimbursements = lazy(
 () => import("@/modules/payroll/pages/PayrollReimbursements"),
);
const Appraisal = lazy(() => import("@/modules/appraisal/pages/Appraisal"));
const CompareStats = lazy(() => import("@/modules/appraisal/pages/CompareStats"));
const Notifications = lazy(() => import("@/modules/notifications/pages/Notifications"));

// Team Lead workspace
const TeamMembers = lazy(() => import("@/modules/team/pages/TeamMembers"));
const TeamAttendance = lazy(() => import("@/modules/team/pages/TeamAttendance"));
const TeamLeaveRequests = lazy(() => import("@/modules/team/pages/TeamLeaveRequests"));
const AppraisalCriteria = lazy(() => import("@/modules/team/pages/AppraisalCriteria"));
const EvaluateEmployee = lazy(() => import("@/modules/team/pages/EvaluateEmployee"));
const TeamReports = lazy(() => import("@/modules/team/pages/TeamReports"));

// Employees
const EmployeesPage = lazy(() => import("@/modules/employees/pages/Employees"));
const TeamLeadsPage = lazy(() => import("@/modules/employees/pages/TeamLeads"));
const EmployeeCardsPage = lazy(() => import("@/modules/employees/pages/EmployeeCards"));
const AddEmployeePage = lazy(() => import("@/modules/employees/pages/AddEmployee"));
const EditEmployeePage = lazy(() => import("@/modules/employees/pages/EditEmployee"));
const ViewEmployeePage = lazy(() => import("@/modules/employees/pages/ViewEmployee"));

// Settings
const CompanyDetailsPage = lazy(() => import("@/modules/settings/pages/CompanyDetails"));
const DepartmentsPage = lazy(() => import("@/modules/settings/pages/Departments"));
const DesignationsPage = lazy(() => import("@/modules/settings/pages/Designations"));
const JobCategoriesPage = lazy(() => import("@/modules/settings/pages/JobCategories"));
const ShiftsPage = lazy(() => import("@/modules/settings/pages/Shifts"));
const LeaveTypesPage = lazy(() => import("@/modules/settings/pages/LeaveTypes"));
const WorkingDaysPage = lazy(() => import("@/modules/settings/pages/WorkingDays"));
const EmployeeFieldsPage = lazy(() => import("@/modules/settings/pages/EmployeeFields"));
const RolesPage = lazy(() => import("@/modules/settings/pages/Roles"));
const RoleDetailPage = lazy(() => import("@/modules/settings/pages/RoleDetail"));
const PermissionsPage = lazy(() => import("@/modules/settings/pages/Permissions"));
const BrandingPage = lazy(() => import("@/modules/settings/pages/Branding"));
const CertificateSignaturesPage = lazy(
 () => import("@/modules/settings/pages/CertificateSignatures"),
);
const SmtpSettingsPage = lazy(() => import("@/modules/settings/pages/SmtpSettings"));
const EmailTemplatesPage = lazy(() => import("@/modules/settings/pages/EmailTemplates"));

// Administration: Performance Management
const AppraisalManagementPage = lazy(() => import("@/modules/performance/pages/AppraisalManagement"));

/** Wrap a lazily-loaded page with its own error boundary + suspense fallback. */
function withSuspense(node: ReactNode) {
 return (
 <ErrorBoundary>
 <Suspense fallback={<LoadingOverlay show label="Loading…" />}>{node}</Suspense>
 </ErrorBoundary>
 );
}

export function AppRouter() {
 return (
 <BrowserRouter>
 <Routes>
 <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={withSuspense(<Login />)} />
        <Route
          path="/dashboard"
          element={withSuspense(
            <ProtectedRoute>
              <RbacDashboard />
            </ProtectedRoute>,
          )}
        />
 <Route path="/forget-password" element={withSuspense(<ForgetPassword />)} />
 <Route path="/reset-password" element={withSuspense(<ResetPassword />)} />
 <Route
 path="/change-password"
 element={withSuspense(
 <ProtectedRoute>
 <ChangePassword />
 </ProtectedRoute>,
 )}
 />
 <Route
 path="/profile"
 element={withSuspense(
 <ProtectedRoute>
 <ProfilePage />
 </ProtectedRoute>,
 )}
 />
 <Route
 path="/profile/edit"
 element={withSuspense(
 <ProtectedRoute>
 <ProfileEditPage />
 </ProtectedRoute>,
 )}
 />
 {/* The old self-service page edited fields the backend does not accept
 (first/last name, job title) through a demo-fallback client. It is gone;
 existing links and bookmarks land on the real editor. */}
 <Route path="/edit-profile" element={<Navigate to="/profile/edit" replace />} />
 <Route
 path="/attendance"
 element={withSuspense(
 <ProtectedRoute>
 <Attendance />
 </ProtectedRoute>,
 )}
 />
 <Route
 path="/leave"
 element={withSuspense(
 <ProtectedRoute>
 <Leave />
 </ProtectedRoute>,
 )}
 />
 {/* Sits with the shared employee routes rather than the HR workspace
 further down: the planner scopes itself by role (own leave for an
 employee, org-wide for management), so every signed-in user gets a
 useful view and none of them sees more than their permissions
 already allow. */}
 <Route
 path="/leave/planner"
 element={withSuspense(
 <ProtectedRoute>
 <LeavePlannerPage />
 </ProtectedRoute>,
 )}
 />
 <Route
 path="/payroll"
 element={withSuspense(
 <ProtectedRoute>
 <Payroll />
 </ProtectedRoute>,
 )}
 />
 {/* The other two employee self-service payroll tabs (spec §9 loan requests,
 §2 expense claims). Deliberately NOT gated on HR_ADMIN_ROLES — like
 /payroll above, every request they make goes to a `/me` route that carries
 no permission server-side and resolves the employee from the JWT. HR/Admin
 can open them too; they just see their own records, same as anyone. */}
 <Route
 path="/payroll/my-loans"
 element={withSuspense(
 <ProtectedRoute>
 <MyLoans />
 </ProtectedRoute>,
 )}
 />
 <Route
 path="/payroll/my-reimbursements"
 element={withSuspense(
 <ProtectedRoute>
 <MyReimbursements />
 </ProtectedRoute>,
 )}
 />
 <Route
 path="/appraisal"
 element={withSuspense(
 <ProtectedRoute>
 <Appraisal />
 </ProtectedRoute>,
 )}
 />
 {/* The Compare tab `getAppraisalTabs` offers to management roles. Gated on
 EVALUATOR_ROLES, the same set that tab builder treats as management —
 without a route of its own the tab fell through the catch-all to /login. */}
 <Route
 path="/appraisal/compare"
 element={withSuspense(
 <ProtectedRoute roles={EVALUATOR_ROLES}>
 <CompareStats />
 </ProtectedRoute>,
 )}
 />
 <Route
 path="/notifications"
 element={withSuspense(
 <ProtectedRoute>
 <Notifications />
 </ProtectedRoute>,
 )}
 />
 {/* No role gate: employees need to see the meetings they were invited to.
 The page itself picks the org-wide list vs. the token-scoped /meetings/me
 from the role, and the backend re-checks meeting.view/.create/.manage. */}
 <Route
 path="/meetings"
 element={withSuspense(
 <ProtectedRoute>
 <MeetingsPage />
 </ProtectedRoute>,
 )}
 />

 {/* Team Lead workspace (UC-13..UC-18) */}
 <Route
 path="/team"
 element={withSuspense(
 <ProtectedRoute roles={EVALUATOR_ROLES}>
 <TeamMembers />
 </ProtectedRoute>,
 )}
 />
 <Route
 path="/team/attendance"
 element={withSuspense(
 <ProtectedRoute roles={TEAM_LEAD_ROLES}>
 <TeamAttendance />
 </ProtectedRoute>,
 )}
 />
 <Route
 path="/team/leaves"
 element={withSuspense(
 <ProtectedRoute roles={TEAM_LEAD_ROLES}>
 <TeamLeaveRequests />
 </ProtectedRoute>,
 )}
 />
 <Route
 path="/team/rubric"
 element={withSuspense(
 <ProtectedRoute roles={TEAM_LEAD_ROLES}>
 <AppraisalCriteria />
 </ProtectedRoute>,
 )}
 />
 <Route
 path="/team/evaluate/:employeeId"
 element={withSuspense(
 <ProtectedRoute roles={EVALUATOR_ROLES}>
 <EvaluateEmployee />
 </ProtectedRoute>,
 )}
 />
 <Route
 path="/team/reports"
 element={withSuspense(
 <ProtectedRoute roles={TEAM_LEAD_ROLES}>
 <TeamReports />
 </ProtectedRoute>,
 )}
 />
 <Route
 path="/coming-soon"
 element={withSuspense(
 <ProtectedRoute>
 <ComingSoon />
 </ProtectedRoute>,
 )}
 />

 {/* HR Manager / Administrator workspace: Employee Management */}
 <Route
 path="/employees"
 element={withSuspense(
 <ProtectedRoute roles={HR_ADMIN_ROLES}>
 <EmployeesPage />
 </ProtectedRoute>,
 )}
 />
 <Route
 path="/employees/new"
 element={withSuspense(
 <ProtectedRoute roles={HR_ADMIN_ROLES}>
 <AddEmployeePage />
 </ProtectedRoute>,
 )}
 />
 {/* Static /employees/* segments must precede the :employeeId route below,
 or "team-leads" and "cards" would be captured as an employee id. */}
 <Route
 path="/employees/team-leads"
 element={withSuspense(
 <ProtectedRoute roles={HR_ADMIN_ROLES}>
 <TeamLeadsPage />
 </ProtectedRoute>,
 )}
 />
 <Route
 path="/employees/cards"
 element={withSuspense(
 <ProtectedRoute roles={HR_ADMIN_ROLES}>
 <EmployeeCardsPage />
 </ProtectedRoute>,
 )}
 />
 <Route
 path="/employees/:employeeId/edit"
 element={withSuspense(
 <ProtectedRoute roles={HR_ADMIN_ROLES}>
 <EditEmployeePage />
 </ProtectedRoute>,
 )}
 />
 <Route
 path="/employees/:employeeId"
 element={withSuspense(
 <ProtectedRoute roles={HR_ADMIN_ROLES}>
 <ViewEmployeePage />
 </ProtectedRoute>,
 )}
 />
 <Route
 path="/payroll/process"
 element={withSuspense(
 <ProtectedRoute roles={HR_ADMIN_ROLES}>
 <ProcessPayrollPage />
 </ProtectedRoute>,
 )}
 />

 {/* New payroll engine workspace (spec §1–14), HR/Admin only. These are all
 static /payroll/* segments, so order among them is immaterial, but they must
 precede the catch-all `*` far below. The self-service /payroll route (employee
 payslips) is declared higher up and is unaffected. */}
 <Route
 path="/payroll/dashboard"
 element={withSuspense(
 <ProtectedRoute roles={HR_ADMIN_ROLES}>
 <PayrollDashboard />
 </ProtectedRoute>,
 )}
 />
 <Route
 path="/payroll/periods"
 element={withSuspense(
 <ProtectedRoute roles={HR_ADMIN_ROLES}>
 <PayrollPeriods />
 </ProtectedRoute>,
 )}
 />
 <Route
 path="/payroll/run"
 element={withSuspense(
 <ProtectedRoute roles={HR_ADMIN_ROLES}>
 <RunPayroll />
 </ProtectedRoute>,
 )}
 />
 <Route
 path="/payroll/components"
 element={withSuspense(
 <ProtectedRoute roles={HR_ADMIN_ROLES}>
 <SalaryComponents />
 </ProtectedRoute>,
 )}
 />
 <Route
 path="/payroll/structures"
 element={withSuspense(
 <ProtectedRoute roles={HR_ADMIN_ROLES}>
 <SalaryStructures />
 </ProtectedRoute>,
 )}
 />
 <Route
 path="/payroll/payslips"
 element={withSuspense(
 <ProtectedRoute roles={HR_ADMIN_ROLES}>
 <Payslips />
 </ProtectedRoute>,
 )}
 />
 {/* The HR side of expense claims (spec §2). The employee side lives at
 /payroll/my-reimbursements above and is deliberately ungated; this one
 reads and decides the whole organisation's claims, so it is gated. */}
 <Route
 path="/payroll/reimbursements"
 element={withSuspense(
 <ProtectedRoute roles={HR_ADMIN_ROLES}>
 <PayrollReimbursements />
 </ProtectedRoute>,
 )}
 />
 <Route
 path="/payroll/settings"
 element={withSuspense(
 <ProtectedRoute roles={HR_ADMIN_ROLES}>
 <PayrollSettings />
 </ProtectedRoute>,
 )}
 />
 {/* Phase 2 — configuration + workflow screens, all HR/Admin-gated. */}
 <Route
 path="/payroll/setup"
 element={withSuspense(
 <ProtectedRoute roles={HR_ADMIN_ROLES}>
 <PayrollSetup />
 </ProtectedRoute>,
 )}
 />
 <Route
 path="/payroll/rules"
 element={withSuspense(
 <ProtectedRoute roles={HR_ADMIN_ROLES}>
 <PayrollRules />
 </ProtectedRoute>,
 )}
 />
 <Route
 path="/payroll/tax"
 element={withSuspense(
 <ProtectedRoute roles={HR_ADMIN_ROLES}>
 <PayrollTax />
 </ProtectedRoute>,
 )}
 />
 <Route
 path="/payroll/loans"
 element={withSuspense(
 <ProtectedRoute roles={HR_ADMIN_ROLES}>
 <PayrollLoans />
 </ProtectedRoute>,
 )}
 />
 <Route
 path="/payroll/bonuses"
 element={withSuspense(
 <ProtectedRoute roles={HR_ADMIN_ROLES}>
 <PayrollBonuses />
 </ProtectedRoute>,
 )}
 />
 <Route
 path="/payroll/approvals"
 element={withSuspense(
 <ProtectedRoute roles={HR_ADMIN_ROLES}>
 <PayrollApprovals />
 </ProtectedRoute>,
 )}
 />
 <Route
 path="/payroll/reports"
 element={withSuspense(
 <ProtectedRoute roles={HR_ADMIN_ROLES}>
 <PayrollReports />
 </ProtectedRoute>,
 )}
 />

 {/* HR Manager / Administrator workspace: org-wide Attendance & Leave */}
 <Route
 path="/attendance-records"
 element={withSuspense(
 <ProtectedRoute roles={HR_ADMIN_ROLES}>
 <AttendanceRecordsPage />
 </ProtectedRoute>,
 )}
 />
 <Route
 path="/leave-requests"
 element={withSuspense(
 <ProtectedRoute roles={HR_ADMIN_ROLES}>
 <LeaveRequestsPage />
 </ProtectedRoute>,
 )}
 />
 <Route
 path="/leave-management"
 element={withSuspense(
 <ProtectedRoute roles={HR_ADMIN_ROLES}>
 <LeaveManagementPage />
 </ProtectedRoute>,
 )}
 />

 {/* Not built yet — guarded ComingSoon placeholders, same role gates as their sections */}
 <Route
 path="/attendance/logs"
 element={withSuspense(
 <ProtectedRoute roles={[...HR_ADMIN_ROLES, ...TEAM_LEAD_ROLES]}>
 <ComingSoon />
 </ProtectedRoute>,
 )}
 />
 <Route
 path="/leave/employees"
 element={withSuspense(
 <ProtectedRoute roles={[...HR_ADMIN_ROLES, ...TEAM_LEAD_ROLES]}>
 <ComingSoon />
 </ProtectedRoute>,
 )}
 />
 <Route
 path="/leave/entitlements"
 element={withSuspense(
 <ProtectedRoute roles={HR_ADMIN_ROLES}>
 <LeaveEntitlementsPage />
 </ProtectedRoute>,
 )}
 />
 <Route
 path="/leave/public-holidays"
 element={withSuspense(
 <ProtectedRoute roles={HR_ADMIN_ROLES}>
 <PublicHolidaysPage />
 </ProtectedRoute>,
 )}
 />
 <Route
 path="/leave/reports"
 element={withSuspense(
 <ProtectedRoute roles={[...HR_ADMIN_ROLES, ...TEAM_LEAD_ROLES]}>
 <ComingSoon />
 </ProtectedRoute>,
 )}
 />

 {/* HR Manager / Administrator workspace: Settings */}
 <Route path="/settings" element={<Navigate to="/settings/company" replace />} />
 <Route
 path="/settings/company"
 element={withSuspense(
 <ProtectedRoute roles={HR_ADMIN_ROLES}>
 <CompanyDetailsPage />
 </ProtectedRoute>,
 )}
 />
 <Route
 path="/settings/departments"
 element={withSuspense(
 <ProtectedRoute roles={HR_ADMIN_ROLES}>
 <DepartmentsPage />
 </ProtectedRoute>,
 )}
 />
 <Route
 path="/settings/designations"
 element={withSuspense(
 <ProtectedRoute roles={HR_ADMIN_ROLES}>
 <DesignationsPage />
 </ProtectedRoute>,
 )}
 />
 <Route
 path="/settings/job-categories"
 element={withSuspense(
 <ProtectedRoute roles={HR_ADMIN_ROLES}>
 <JobCategoriesPage />
 </ProtectedRoute>,
 )}
 />
 <Route
 path="/settings/shifts"
 element={withSuspense(
 <ProtectedRoute roles={HR_ADMIN_ROLES}>
 <ShiftsPage />
 </ProtectedRoute>,
 )}
 />
 <Route
 path="/settings/leave-types"
 element={withSuspense(
 <ProtectedRoute roles={HR_ADMIN_ROLES}>
 <LeaveTypesPage />
 </ProtectedRoute>,
 )}
 />
 <Route
 path="/settings/working-days"
 element={withSuspense(
 <ProtectedRoute roles={HR_ADMIN_ROLES}>
 <WorkingDaysPage />
 </ProtectedRoute>,
 )}
 />
 <Route
 path="/settings/employee-fields"
 element={withSuspense(
 <ProtectedRoute roles={HR_ADMIN_ROLES}>
 <EmployeeFieldsPage />
 </ProtectedRoute>,
 )}
 />
 <Route
 path="/settings/roles"
 element={withSuspense(
 <ProtectedRoute roles={HR_ADMIN_ROLES}>
 <RolesPage />
 </ProtectedRoute>,
 )}
 />
 {/* Create / edit / view a role. `new` is declared before `:roleId` so the
 literal wins the match — otherwise "new" would be read as a role id and
 the create page would try to fetch a role that does not exist. */}
 <Route
 path="/settings/roles/new"
 element={withSuspense(
 <ProtectedRoute roles={HR_ADMIN_ROLES}>
 <RoleDetailPage mode="create" />
 </ProtectedRoute>,
 )}
 />
 <Route
 path="/settings/roles/:roleId/edit"
 element={withSuspense(
 <ProtectedRoute roles={HR_ADMIN_ROLES}>
 <RoleDetailPage mode="edit" />
 </ProtectedRoute>,
 )}
 />
 <Route
 path="/settings/roles/:roleId"
 element={withSuspense(
 <ProtectedRoute roles={HR_ADMIN_ROLES}>
 <RoleDetailPage mode="view" />
 </ProtectedRoute>,
 )}
 />
 <Route
 path="/settings/permissions"
 element={withSuspense(
 <ProtectedRoute roles={HR_ADMIN_ROLES}>
 <PermissionsPage />
 </ProtectedRoute>,
 )}
 />
 <Route
 path="/settings/branding"
 element={withSuspense(
 <ProtectedRoute roles={HR_ADMIN_ROLES}>
 <BrandingPage />
 </ProtectedRoute>,
 )}
 />
 <Route
 path="/settings/certificate-signatures"
 element={withSuspense(
 <ProtectedRoute roles={HR_ADMIN_ROLES}>
 <CertificateSignaturesPage />
 </ProtectedRoute>,
 )}
 />
 {/* Mail configuration. The role gate is the coarse filter; inside each page
 every control is additionally gated on its own permission key
 (email-settings.*, email-templates.*, email-queue.view/.manage), because an
 HR Manager may hold the role without holding the mail permissions. */}
 <Route
 path="/settings/smtp"
 element={withSuspense(
 <ProtectedRoute roles={HR_ADMIN_ROLES}>
 <SmtpSettingsPage />
 </ProtectedRoute>,
 )}
 />
 <Route
 path="/settings/email-templates"
 element={withSuspense(
 <ProtectedRoute roles={HR_ADMIN_ROLES}>
 <EmailTemplatesPage />
 </ProtectedRoute>,
 )}
 />

 {/* HR/Admin workspace: Appraisal. One screen, HR/Admin only.
 AppraisalManagement owns Forms / Form Builder / Assignments / Question Bank /
 Team Lead Access / Statistics / Results / Compare / Analytics as internal
 tabs, so the old per-tab routes (/performance/evaluation, /stats, /compare,
 /daily-report, /cumulative, /appraisal, /questions, and the
 /performance/forms/* editor stubs) are gone. Anything still linking to them
 lands on /performance/forms via the catch-all below — which is also why the
 new tabs did not get routes of their own. Each tab is additionally gated on
 its own permission inside the page, since this role gate admits HR Admin,
 HR Manager and Administrator alike and they do not hold the same keys.
 Evaluations are written from /team, not from here — by Team Leads over
 their roster and by admins over the whole organisation. */}
 <Route
 path="/performance/forms"
 element={withSuspense(
 <ProtectedRoute roles={HR_ADMIN_ROLES}>
 <AppraisalManagementPage />
 </ProtectedRoute>
 )}
 />
 <Route path="/performance/*" element={<Navigate to="/performance/forms" replace />} />

 <Route path="*" element={<Navigate to="/login" replace />} />
 </Routes>
 </BrowserRouter>
 );
}

export default AppRouter;
