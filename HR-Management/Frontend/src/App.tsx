import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Login from "./pages/Login";
import SignUp from "./pages/SignUp";
import SignUpSuccess from "./pages/SignUpSuccess";
import ForgetPassword from "./pages/ForgetPassword";
import ResetPassword from "./pages/ResetPassword";
import ChangePassword from "./pages/ChangePassword";
import Dashboard from "./pages/Dashboard";
import ComingSoon from "./pages/ComingSoon";
import EditProfile from "./pages/EditProfile";
import Attendance from "./pages/Attendance";
import Leave from "./pages/Leave";
import Payroll from "./pages/Payroll";
import Appraisal from "./pages/Appraisal";
import Notifications from "./pages/Notifications";
import TeamMembers from "./pages/team/TeamMembers";
import TeamAttendance from "./pages/team/TeamAttendance";
import TeamLeaveRequests from "./pages/team/TeamLeaveRequests";
import AppraisalCriteria from "./pages/team/AppraisalCriteria";
import EvaluateEmployee from "./pages/team/EvaluateEmployee";
import TeamReports from "./pages/team/TeamReports";
import ProtectedRoute from "./components/ProtectedRoute";
import { AuthProvider } from "./lib/AuthContext";
import { NotificationsProvider } from "./lib/NotificationsContext";

export default function App() {
  return (
    <AuthProvider>
      <NotificationsProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<SignUp />} />
            <Route path="/signup-success" element={<SignUpSuccess />} />
            <Route path="/forget-password" element={<ForgetPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route
              path="/change-password"
              element={
                <ProtectedRoute>
                  <ChangePassword />
                </ProtectedRoute>
              }
            />
            <Route
              path="/edit-profile"
              element={
                <ProtectedRoute>
                  <EditProfile />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/attendance"
              element={
                <ProtectedRoute>
                  <Attendance />
                </ProtectedRoute>
              }
            />
            <Route
              path="/leave"
              element={
                <ProtectedRoute>
                  <Leave />
                </ProtectedRoute>
              }
            />
            <Route
              path="/payroll"
              element={
                <ProtectedRoute>
                  <Payroll />
                </ProtectedRoute>
              }
            />
            <Route
              path="/appraisal"
              element={
                <ProtectedRoute>
                  <Appraisal />
                </ProtectedRoute>
              }
            />
            <Route
              path="/notifications"
              element={
                <ProtectedRoute>
                  <Notifications />
                </ProtectedRoute>
              }
            />
            {/* Phase 2 — Team Lead workspace (UC-13..UC-18) */}
            <Route
              path="/team"
              element={
                <ProtectedRoute roles={["team_lead"]}>
                  <TeamMembers />
                </ProtectedRoute>
              }
            />
            <Route
              path="/team/attendance"
              element={
                <ProtectedRoute roles={["team_lead"]}>
                  <TeamAttendance />
                </ProtectedRoute>
              }
            />
            <Route
              path="/team/leaves"
              element={
                <ProtectedRoute roles={["team_lead"]}>
                  <TeamLeaveRequests />
                </ProtectedRoute>
              }
            />
            <Route
              path="/team/appraisal-criteria"
              element={
                <ProtectedRoute roles={["team_lead"]}>
                  <AppraisalCriteria />
                </ProtectedRoute>
              }
            />
            <Route
              path="/team/evaluate/:employeeId"
              element={
                <ProtectedRoute roles={["team_lead"]}>
                  <EvaluateEmployee />
                </ProtectedRoute>
              }
            />
            <Route
              path="/team/reports"
              element={
                <ProtectedRoute roles={["team_lead"]}>
                  <TeamReports />
                </ProtectedRoute>
              }
            />
            <Route
              path="/coming-soon"
              element={
                <ProtectedRoute>
                  <ComingSoon />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </NotificationsProvider>
    </AuthProvider>
  );
}
