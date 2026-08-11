// Bonuses (spec §8) — a thin wrapper over the Rule Builder narrowed to the
// `bonus` rule type. Same versioned engine, same safe-formula palette; HR just
// gets a focused screen for incentives without the other rule kinds in the way.

import RulesManager from "./RulesManager";

export default function PayrollBonusesPage() {
  return <RulesManager activeTab="/payroll/bonuses" lockedRuleType="bonus" />;
}
