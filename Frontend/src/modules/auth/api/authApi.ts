// ============================================================================
// Auth API — login, session verification, and logout.
//
// The backend issues a short-lived JWT access token from `POST /auth/login`
// and includes the caller's live permission set in the response. The refresh
// token is set as an httpOnly cookie and is intentionally invisible to this
// code — only the access token is held client-side. apiClient handles renewing
// it transparently on 401.
// ============================================================================

import { api, ENDPOINTS, clearToken, setToken } from "@/lib/apiClient";

export type LoginResult = {
  token: string;
  user: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    jobTitle?: string;
    avatarUrl?: string;
    /** 128px derivative of `avatarUrl`, used for the navbar avatar. */
    avatarThumbUrl?: string;
    employeeId: string;
    role: "employee" | "team_lead" | "hr_manager" | "administrator";
    roleName: string | null;
    roleId: string | null;
  };
  permissions: string[];
};

export type MeResult = Omit<LoginResult, "token">;

export const authApi = {
  /**
   * Authenticate and receive an access token plus the user's live permission
   * set. The access token goes to localStorage and is attached to every
   * subsequent request as `Authorization: Bearer <token>`; the refresh token
   * arrives as an httpOnly cookie the browser stores itself.
   */
  login: async (email: string, password: string): Promise<LoginResult> => {
    const result = await api.post<LoginResult>(ENDPOINTS.auth.login, {
      email,
      password,
    }, { skipAuth: true });
    setToken(result.token);
    return result;
  },

  /**
   * Re-verify the stored token against the backend and get the user's current
   * role + permissions. Used on app boot to validate a persisted session.
   * Returns 401 if the token is invalid or expired.
   */
  me: async (): Promise<MeResult> => {
    return api.get<MeResult>(ENDPOINTS.auth.me);
  },

  /**
   * Revokes the refresh token server-side, then drops the local access token.
   *
   * Clearing localStorage alone would leave the refresh cookie live for its
   * full 7 days, so anyone holding it could mint new access tokens after the
   * user believed they had logged out. The network call is best-effort: if it
   * fails the local session is still cleared, because a user who clicked
   * "log out" must end up logged out of this browser regardless.
   */
  logout: async (): Promise<void> => {
    try {
      await api.post(ENDPOINTS.auth.logout, undefined, {
        skipAuth: true,
        skipRefresh: true,
      });
    } catch {
      // Ignored deliberately — see above.
    } finally {
      clearToken();
    }
  },
};
