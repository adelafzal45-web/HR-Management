import { PartialType } from '@nestjs/mapped-types';

import { CreatePayrollRuleDto } from './create-payroll-rule.dto';

/**
 * Update a payroll rule. Every field is optional; the service re-validates the
 * merged `config` against the (possibly unchanged) `rule_type`, and — because
 * rules are versioned — an update to an active rule supersedes it with a new
 * version rather than mutating history in place.
 */
export class UpdatePayrollRuleDto extends PartialType(CreatePayrollRuleDto) {}
