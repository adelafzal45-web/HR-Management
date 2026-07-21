// Hardcoded/demo data used ONLY when the real backend can't be reached.
// This lets the whole auth flow (login, sign up, forgot/reset password) be
// clicked through end-to-end for demos, design reviews, or offline dev —
// instead of just showing a "backend unavailable" dead end.

export type DemoUser = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
};

export const DEMO_CREDENTIALS = {
  email: "demo@technocues.com",
  password: "Demo@1234",
};

// Seeded with one known-good account; sign-ups made while offline are added
// here too, so you can immediately log back in with them in the same tab.
const demoUsers: DemoUser[] = [
  {
    firstName: "Demo",
    lastName: "User",
    email: DEMO_CREDENTIALS.email,
    password: DEMO_CREDENTIALS.password,
  },
];

const delay = (ms = 500) => new Promise((resolve) => setTimeout(resolve, ms));

export const mockAuthApi = {
  async login(email: string, password: string) {
    await delay();
    const user = demoUsers.find(
      (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password,
    );
    if (!user) {
      throw new Error(
        `Invalid email or password. (Demo mode — try ${DEMO_CREDENTIALS.email} / ${DEMO_CREDENTIALS.password})`,
      );
    }
    return {
      token: "demo-token",
      user: { firstName: user.firstName, lastName: user.lastName, email: user.email },
      demo: true,
    };
  },

  async signUp(payload: { firstName: string; lastName: string; email: string; password: string }) {
    await delay();
    if (demoUsers.some((u) => u.email.toLowerCase() === payload.email.toLowerCase())) {
      throw new Error("An account with that email already exists. (Demo mode)");
    }
    demoUsers.push({ ...payload });
    return { message: "Account created in demo mode.", demo: true };
  },

  async forgetPassword(email: string) {
    await delay();
    return {
      message: `If an account exists for ${email}, a reset link has been sent. (Demo mode — no email is actually sent.)`,
      demo: true,
    };
  },

  async resetPassword(_token: string, _password: string, _confirmPassword: string) {
    await delay();
    return { message: "Password reset in demo mode.", demo: true };
  },
};
