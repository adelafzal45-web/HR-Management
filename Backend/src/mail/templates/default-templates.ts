/**
 * The shared HTML shell every template body is wrapped in at render time.
 *
 * Email HTML is not web HTML. The constraints driving the markup below:
 *
 *   - Tables for layout, not flex or grid. Outlook on Windows renders through
 *     Word's HTML engine, which supports neither.
 *   - Inline styles only. Gmail strips <style> blocks in some contexts, and
 *     there is no reliable way to know which.
 *   - A 600px max width, the widest that reliably fits a desktop preview pane.
 *   - Dark text on a light background, never the reverse: a recipient in dark
 *     mode gets colours inverted unpredictably, and light-on-dark becomes
 *     unreadable more often than the other way round.
 *
 * `{{...}}` placeholders here are substituted by TemplateRendererService using
 * the same allow-list and escaping as the template bodies, so branding values
 * pulled from Company Settings cannot inject markup either.
 */

/** Wraps a rendered body in the branded header/footer. */
export const EMAIL_SHELL_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>{{email_subject}}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:24px 12px;">
<tr>
<td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

<tr>
<td style="background-color:{{primary_color}};padding:24px 32px;text-align:center;">
{{logo_block}}
<div style="font-size:19px;font-weight:700;color:#1a1a1a;letter-spacing:-0.2px;">{{company_name}}</div>
</td>
</tr>

<tr>
<td style="padding:32px;color:#3a3a3a;font-size:15px;line-height:1.65;">
{{email_body}}
</td>
</tr>

<tr>
<td style="background-color:#fafafa;border-top:1px solid #ededed;padding:24px 32px;color:#8a8a8a;font-size:12px;line-height:1.6;text-align:center;">
<div style="margin-bottom:8px;font-weight:600;color:#5a5a5a;">{{company_name}}</div>
{{footer_contact_block}}
<div style="margin-top:12px;color:#a0a0a0;">
This is an automated message from the {{company_name}} HR system. Please do not reply directly to this email.
</div>
<div style="margin-top:6px;color:#b0b0b0;">&copy; {{year}} {{company_name}}. All rights reserved.</div>
</td>
</tr>

</table>
</td>
</tr>
</table>
</body>
</html>`;

/** A call-to-action button. Table-wrapped so Outlook renders the fill. */
function button(label: string, hrefPlaceholder: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
<tr>
<td align="center" style="background-color:{{primary_color}};border-radius:8px;">
<a href="${hrefPlaceholder}" style="display:inline-block;padding:13px 30px;font-size:15px;font-weight:600;color:#1a1a1a;text-decoration:none;">${label}</a>
</td>
</tr>
</table>`;
}

/** A label/value detail block, used to echo employee record fields back. */
function detailRows(rows: Array<[string, string]>): string {
  const cells = rows
    .map(
      ([label, value]) =>
        `<tr>
<td style="padding:7px 0;color:#8a8a8a;font-size:13px;width:40%;">${label}</td>
<td style="padding:7px 0;color:#1a1a1a;font-size:14px;font-weight:600;">${value}</td>
</tr>`,
    )
    .join('\n');

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background-color:#fafafa;border-radius:8px;padding:8px 16px;">
${cells}
</table>`;
}

const SECURITY_NOTE = `<p style="margin:20px 0 0;padding:14px 16px;background-color:#fff8e6;border-left:3px solid {{primary_color}};color:#5a5a5a;font-size:13px;line-height:1.6;">
If you did not expect this email, please contact <a href="mailto:{{support_email}}" style="color:#9a6a17;">{{support_email}}</a> straight away.
</p>`;

export interface DefaultEmailTemplate {
  key: string;
  name: string;
  description: string;
  subject: string;
  bodyHtml: string;
}

/**
 * The shipped templates.
 *
 * `key` is the stable identifier code references (`MailService.enqueue`), so it
 * must never change once released — the display `name` is what admins see and is
 * free to be reworded.
 */
export const DEFAULT_EMAIL_TEMPLATES: DefaultEmailTemplate[] = [
  {
    key: 'welcome_employee',
    name: 'Welcome Employee',
    description:
      'Sent after an employee account is created, introducing them to the HR portal.',
    subject: 'Welcome to {{company_name}}, {{employee_name}}!',
    bodyHtml: `<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a1a1a;">Welcome aboard, {{employee_name}}!</h1>
<p style="margin:0 0 14px;">We are delighted to have you join <strong>{{company_name}}</strong> as {{designation}} in the {{department}} team.</p>
<p style="margin:0 0 14px;">Your employee record has been set up. You can sign in to the HR portal to view your profile, submit leave requests, check your attendance and see your payslips.</p>
${detailRows([
  ['Employee ID', '{{employee_id}}'],
  ['Department', '{{department}}'],
  ['Designation', '{{designation}}'],
  ['Work email', '{{employee_email}}'],
])}
${button('Sign in to the portal', '{{login_url}}')}
<p style="margin:0;color:#8a8a8a;font-size:13px;">Questions about your account? Reach us at <a href="mailto:{{support_email}}" style="color:#9a6a17;">{{support_email}}</a>.</p>`,
  },
  {
    key: 'account_created',
    name: 'Account Created',
    description:
      'Notifies an employee that their login account exists and how to set a password.',
    subject: 'Your {{company_name}} account is ready',
    bodyHtml: `<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a1a1a;">Your account has been created</h1>
<p style="margin:0 0 14px;">Hello {{employee_name}}, an account has been created for you on the {{company_name}} HR portal.</p>
${detailRows([
  ['Employee ID', '{{employee_id}}'],
  ['Sign-in email', '{{employee_email}}'],
  ['Department', '{{department}}'],
])}
<p style="margin:0 0 14px;">Use the button below to set your password and activate your access. This link expires in {{expiry_minutes}} minutes.</p>
${button('Set your password', '{{reset_link}}')}
${SECURITY_NOTE}`,
  },
  {
    key: 'account_activated',
    name: 'Account Activated',
    description: 'Confirms that an account is now active and able to sign in.',
    subject: 'Your {{company_name}} account is now active',
    bodyHtml: `<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a1a1a;">Your account is active</h1>
<p style="margin:0 0 14px;">Good news, {{employee_name}} — your {{company_name}} account has been activated and you can now sign in.</p>
${button('Sign in', '{{login_url}}')}
<p style="margin:0;color:#8a8a8a;font-size:13px;">If you have trouble signing in, contact <a href="mailto:{{support_email}}" style="color:#9a6a17;">{{support_email}}</a>.</p>`,
  },
  {
    key: 'password_reset',
    name: 'Password Reset',
    description:
      'Carries the one-time reset link produced by the forgot-password flow.',
    subject: 'Reset your {{company_name}} password',
    bodyHtml: `<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a1a1a;">Reset your password</h1>
<p style="margin:0 0 14px;">Hello {{employee_name}}, we received a request to reset the password for your {{company_name}} account.</p>
<p style="margin:0 0 14px;">Click the button below to choose a new password. <strong>This link can be used once and expires in {{expiry_minutes}} minutes.</strong></p>
${button('Choose a new password', '{{reset_link}}')}
<p style="margin:0 0 14px;color:#8a8a8a;font-size:13px;">If the button does not work, copy and paste this address into your browser:<br />
<span style="color:#9a6a17;word-break:break-all;">{{reset_link}}</span></p>
<p style="margin:20px 0 0;padding:14px 16px;background-color:#fff8e6;border-left:3px solid {{primary_color}};color:#5a5a5a;font-size:13px;line-height:1.6;">
<strong>Didn't request this?</strong> You can safely ignore this email — your password will not change unless you use the link above. If you are concerned, contact <a href="mailto:{{support_email}}" style="color:#9a6a17;">{{support_email}}</a>.
</p>`,
  },
  {
    key: 'password_changed',
    name: 'Password Changed',
    description:
      'Security notice sent whenever a password changes, however it changed.',
    subject: 'Your {{company_name}} password was changed',
    bodyHtml: `<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a1a1a;">Your password was changed</h1>
<p style="margin:0 0 14px;">Hello {{employee_name}}, the password for your {{company_name}} account was changed on {{event_time}}.</p>
<p style="margin:0 0 14px;">All other active sessions have been signed out, so you will need to sign in again on your other devices.</p>
${button('Sign in', '{{login_url}}')}
<p style="margin:20px 0 0;padding:14px 16px;background-color:#fdecea;border-left:3px solid #d93025;color:#5a5a5a;font-size:13px;line-height:1.6;">
<strong>Was this not you?</strong> Your account may be compromised. Contact <a href="mailto:{{support_email}}" style="color:#9a6a17;">{{support_email}}</a> immediately.
</p>`,
  },
  {
    key: 'admin_reset_notification',
    name: 'Admin Reset Notification',
    description:
      'Tells an employee that an administrator reset their password on their behalf.',
    subject:
      'Your {{company_name}} password has been reset by an administrator',
    bodyHtml: `<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a1a1a;">Your password was reset</h1>
<p style="margin:0 0 14px;">Hello {{employee_name}}, an administrator at {{company_name}} reset the password on your account on {{event_time}}.</p>
${detailRows([
  ['Employee ID', '{{employee_id}}'],
  ['Reset by', '{{actor_name}}'],
  ['When', '{{event_time}}'],
])}
<p style="margin:0 0 14px;">Use the link below to set a password only you know. It can be used once and expires in {{expiry_minutes}} minutes.</p>
${button('Set a new password', '{{reset_link}}')}
${SECURITY_NOTE}`,
  },
  {
    key: 'profile_updated',
    name: 'Profile Updated',
    description: 'Confirms a change to an employee profile.',
    subject: 'Your {{company_name}} profile was updated',
    bodyHtml: `<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a1a1a;">Your profile was updated</h1>
<p style="margin:0 0 14px;">Hello {{employee_name}}, changes were saved to your {{company_name}} profile on {{event_time}}.</p>
<p style="margin:0 0 14px;">The following fields changed:</p>
<p style="margin:0 0 20px;padding:14px 16px;background-color:#fafafa;border-radius:8px;color:#1a1a1a;font-size:14px;">{{changed_fields}}</p>
${button('View your profile', '{{profile_url}}')}
${SECURITY_NOTE}`,
  },
  {
    key: 'email_changed',
    name: 'Email Changed',
    description: 'Sent to the new address after the account email is changed.',
    subject: 'Your {{company_name}} sign-in email was changed',
    bodyHtml: `<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a1a1a;">Your email address was changed</h1>
<p style="margin:0 0 14px;">Hello {{employee_name}}, the email address on your {{company_name}} account was changed on {{event_time}}.</p>
${detailRows([
  ['Previous email', '{{previous_email}}'],
  ['New email', '{{employee_email}}'],
])}
<p style="margin:0 0 14px;">From now on, use <strong>{{employee_email}}</strong> to sign in.</p>
${button('Sign in', '{{login_url}}')}
<p style="margin:20px 0 0;padding:14px 16px;background-color:#fdecea;border-left:3px solid #d93025;color:#5a5a5a;font-size:13px;line-height:1.6;">
<strong>Did you not make this change?</strong> Contact <a href="mailto:{{support_email}}" style="color:#9a6a17;">{{support_email}}</a> immediately.
</p>`,
  },
  {
    key: 'account_deactivated',
    name: 'Account Deactivated',
    description:
      'Informs an employee that their portal access was switched off.',
    subject: 'Your {{company_name}} account has been deactivated',
    bodyHtml: `<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a1a1a;">Your account has been deactivated</h1>
<p style="margin:0 0 14px;">Hello {{employee_name}}, access to your {{company_name}} HR portal account was deactivated on {{event_time}}.</p>
<p style="margin:0 0 14px;">You will not be able to sign in until the account is reactivated. Your employee record and history are retained.</p>
<p style="margin:0;color:#8a8a8a;font-size:13px;">If you believe this is a mistake, please contact <a href="mailto:{{support_email}}" style="color:#9a6a17;">{{support_email}}</a>.</p>`,
  },
  {
    key: 'account_reactivated',
    name: 'Account Reactivated',
    description: 'Informs an employee that their portal access was restored.',
    subject: 'Your {{company_name}} account has been reactivated',
    bodyHtml: `<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a1a1a;">Welcome back, {{employee_name}}</h1>
<p style="margin:0 0 14px;">Your {{company_name}} HR portal account was reactivated on {{event_time}} and you can sign in again.</p>
${button('Sign in', '{{login_url}}')}
<p style="margin:0;color:#8a8a8a;font-size:13px;">If you have forgotten your password, use the "Forgot password" link on the sign-in page.</p>`,
  },
  {
    key: 'employee_invitation',
    name: 'Employee Invitation',
    description:
      'Invites a new joiner to activate their account before their start date.',
    subject: "You're invited to join {{company_name}}",
    bodyHtml: `<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a1a1a;">You're invited to join {{company_name}}</h1>
<p style="margin:0 0 14px;">Hello {{employee_name}}, you have been invited to set up your account on the {{company_name}} HR portal.</p>
${detailRows([
  ['Employee ID', '{{employee_id}}'],
  ['Department', '{{department}}'],
  ['Designation', '{{designation}}'],
  ['Joining date', '{{joining_date}}'],
])}
<p style="margin:0 0 14px;">Accept your invitation and set a password using the link below. It expires in {{expiry_minutes}} minutes.</p>
${button('Accept invitation', '{{reset_link}}')}
<p style="margin:0;color:#8a8a8a;font-size:13px;">Need help getting started? Email <a href="mailto:{{support_email}}" style="color:#9a6a17;">{{support_email}}</a>.</p>`,
  },
  {
    key: 'appraisal_pending_reminder',
    name: 'Appraisal Pending Reminder',
    description:
      'Sent to a Team Lead about an hour before their shift ends while appraisal forms are still outstanding.',
    subject: 'You have {{pending_count}} appraisal form(s) pending',
    bodyHtml: `<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a1a1a;">Appraisals still pending</h1>
<p style="margin:0 0 14px;">Hello {{team_lead_name}}, your shift ends at {{shift_end_time}} and {{pending_count}} appraisal form(s) are still waiting on you.</p>
${detailRows([
  ['Date', '{{evaluation_date}}'],
  ['Pending forms', '{{pending_count}}'],
  ['Shift ends', '{{shift_end_time}}'],
])}
<p style="margin:0 0 14px;">Employees awaiting evaluation: {{pending_employees}}</p>
${button('Open my team', '{{dashboard_url}}')}
<p style="margin:0;color:#8a8a8a;font-size:13px;">Forms not submitted by shift end stay pending and appear in the next daily digest.</p>`,
  },
  {
    key: 'appraisal_status_changed',
    name: 'Appraisal Status Changed',
    description:
      'Notifies the reviewer when HR approves, rejects, or reopens a review they submitted.',
    subject: 'Appraisal for {{employee_name}} was {{review_status}}',
    bodyHtml: `<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a1a1a;">Appraisal {{review_status}}</h1>
<p style="margin:0 0 14px;">Hello {{reviewer_name}}, the appraisal you submitted for {{employee_name}} has been {{review_status}} by HR.</p>
${detailRows([
  ['Employee', '{{employee_name}}'],
  ['Form', '{{form_name}}'],
  ['Period', '{{review_period}}'],
  ['New status', '{{review_status}}'],
])}
<p style="margin:0 0 14px;">Note from HR: {{review_comment}}</p>
${button('View appraisal', '{{dashboard_url}}')}
<p style="margin:0;color:#8a8a8a;font-size:13px;">A reopened appraisal is editable again and needs resubmitting.</p>`,
  },
  {
    key: 'leave_entitlement_granted',
    name: 'Leave Entitlement Updated',
    description:
      'Sent to an employee when HR grants, increases, or adjusts a yearly leave entitlement.',
    subject: 'Your {{leave_type}} entitlement for {{year}} was {{action}}',
    bodyHtml: `<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a1a1a;">Your leave entitlement was updated</h1>
<p style="margin:0 0 14px;">Hello {{employee_name}}, your <strong>{{leave_type}}</strong> entitlement for {{year}} was {{action}}.</p>
${detailRows([
  ['Leave type', '{{leave_type}}'],
  ['Year', '{{year}}'],
  ['New total entitlement', '{{total_days}} day(s)'],
])}
<p style="margin:0;color:#8a8a8a;font-size:13px;">You can see your full balance and history from the Leave section of the portal.</p>`,
  },
  {
    key: 'leave_request_approved',
    name: 'Leave Request Approved',
    description: 'Confirms an approved leave request and the days deducted.',
    subject: 'Your {{leave_type}} request was approved',
    bodyHtml: `<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a1a1a;">Your leave request was approved</h1>
<p style="margin:0 0 14px;">Hello {{employee_name}}, your {{leave_type}} request has been approved.</p>
${detailRows([
  ['Leave type', '{{leave_type}}'],
  ['Start date', '{{start_date}}'],
  ['End date', '{{end_date}}'],
  ['Days deducted', '{{days_count}}'],
])}
<p style="margin:0;color:#8a8a8a;font-size:13px;">Your balance has been updated accordingly.</p>`,
  },
  {
    key: 'leave_request_rejected',
    name: 'Leave Request Rejected',
    description: 'Informs an employee that their leave request was rejected.',
    subject: 'Your {{leave_type}} request was rejected',
    bodyHtml: `<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a1a1a;">Your leave request was rejected</h1>
<p style="margin:0 0 14px;">Hello {{employee_name}}, your {{leave_type}} request for {{start_date}} to {{end_date}} was not approved.</p>
<p style="margin:0;color:#8a8a8a;font-size:13px;">No days were deducted from your balance. Speak with your manager for details.</p>`,
  },
  {
    key: 'leave_request_cancelled',
    name: 'Leave Request Cancelled',
    description:
      'Confirms a leave request was cancelled and, if applicable, that the balance was restored.',
    subject: 'Your {{leave_type}} request was cancelled',
    bodyHtml: `<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a1a1a;">Your leave request was cancelled</h1>
<p style="margin:0 0 14px;">Hello {{employee_name}}, your {{leave_type}} request for {{start_date}} to {{end_date}} was cancelled.</p>
<p style="margin:0;color:#8a8a8a;font-size:13px;">If days had already been deducted, they have been returned to your balance.</p>`,
  },
];

/** Fast lookup by key, and the set of keys code may enqueue. */
export const DEFAULT_TEMPLATE_BY_KEY = new Map(
  DEFAULT_EMAIL_TEMPLATES.map((template) => [template.key, template]),
);

export type EmailTemplateKey = (typeof DEFAULT_EMAIL_TEMPLATES)[number]['key'];