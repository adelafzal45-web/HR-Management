// Rule Builder (spec §4–8, §16) — the full configuration surface for every
// engine rule kind. All behaviour lives in the shared RulesManager; this page
// is just the routed entry that mounts it against the /payroll/rules tab.

import RulesManager from "./RulesManager";

export default function PayrollRulesPage() {
  return <RulesManager activeTab="/payroll/rules" />;
}
