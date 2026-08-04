import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { AuditLog } from './audit-log.entity';
import {
  PaginationQueryDto,
  paginatedResult,
  type PaginatedResult,
} from '../common/dto/pagination-query.dto';

/** Identity + request context of whoever performed the action. */
export interface AuditActor {
  user_id?: string | null;
  email?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export interface RecordAuditInput {
  actor: AuditActor;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  /**
   * Participate in the caller's transaction. Pass this from inside a
   * `dataSource.transaction(...)` so the audit row commits or rolls back with
   * the change it describes — otherwise a rolled-back update can leave behind
   * an audit entry for something that never happened.
   */
  manager?: EntityManager;
}

/**
 * Field names never written to the audit trail in any form.
 *
 * An audit log is widely readable by design, so a password hash landing in
 * `before_state` would quietly turn it into a credential store. Matching is on
 * the lowercased field name containing any of these fragments, so
 * `password`, `password_hash` and `refreshToken` are all caught.
 */
const REDACTED_FIELDS = ['password', 'token', 'secret', 'refresh'];

const REDACTED = '[REDACTED]';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepository: Repository<AuditLog>,
  ) {}

  /** Strips sensitive values before anything is persisted. */
  private redact(
    state?: Record<string, unknown> | null,
  ): Record<string, unknown> | null {
    if (!state) {
      return null;
    }

    const safe: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(state)) {
      const lowered = key.toLowerCase();
      safe[key] = REDACTED_FIELDS.some((fragment) => lowered.includes(fragment))
        ? REDACTED
        : value;
    }
    return safe;
  }

  /**
   * Reduces before/after to only the fields that actually changed.
   *
   * Without this, editing one field on an employee records a 40-key snapshot
   * where 39 keys are identical, and the trail becomes unreadable exactly when
   * someone needs to answer "what changed here".
   */
  diff(
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ): { before: Record<string, unknown>; after: Record<string, unknown> } {
    const changedBefore: Record<string, unknown> = {};
    const changedAfter: Record<string, unknown> = {};

    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of keys) {
      // JSON comparison so nested objects and Dates compare by value. Both
      // sides go through the same serialisation, so a Date and its ISO string
      // don't register as a spurious change.
      const a = JSON.stringify(before[key] ?? null);
      const b = JSON.stringify(after[key] ?? null);
      if (a !== b) {
        changedBefore[key] = before[key] ?? null;
        changedAfter[key] = after[key] ?? null;
      }
    }

    return { before: changedBefore, after: changedAfter };
  }

  /**
   * Writes one audit row.
   *
   * Deliberately never throws. A failure to write the trail must not roll back
   * the business operation the user actually asked for — but it is logged at
   * error level so it surfaces in monitoring rather than vanishing.
   */
  async record(input: RecordAuditInput): Promise<void> {
    try {
      const repository = input.manager
        ? input.manager.getRepository(AuditLog)
        : this.auditRepository;

      // Built as a concrete instance rather than passed as an object literal:
      // TypeORM's QueryDeepPartialEntity recurses into the `jsonb` columns and
      // rejects a plain `Record<string, unknown>`, which is exactly what a
      // field diff is.
      const entry = new AuditLog();
      entry.actor_user_id = input.actor.user_id ?? null;
      entry.actor_email = input.actor.email ?? null;
      entry.action = input.action;
      entry.entity_type = input.entityType;
      entry.entity_id = input.entityId ?? null;
      entry.before_state = this.redact(input.before);
      entry.after_state = this.redact(input.after);
      entry.ip_address = input.actor.ip ?? null;
      entry.user_agent = input.actor.userAgent ?? null;

      await repository.save(entry);
    } catch (error) {
      this.logger.error(
        `Failed to write audit log for ${input.action} on ${input.entityType}:${input.entityId ?? '-'}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /** Paginated trail, newest first. Optionally scoped to one entity. */
  async findAll(
    query: PaginationQueryDto,
    filters: { entityType?: string; entityId?: string; action?: string } = {},
  ): Promise<PaginatedResult<AuditLog>> {
    const qb = this.auditRepository
      .createQueryBuilder('audit')
      .leftJoinAndSelect('audit.actor', 'actor');

    if (filters.entityType) {
      qb.andWhere('audit.entity_type = :entityType', {
        entityType: filters.entityType,
      });
    }
    if (filters.entityId) {
      qb.andWhere('audit.entity_id = :entityId', {
        entityId: filters.entityId,
      });
    }
    if (filters.action) {
      qb.andWhere('audit.action = :action', { action: filters.action });
    }
    if (query.search) {
      qb.andWhere(
        '(audit.actor_email ILIKE :search OR audit.action ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    const [data, total] = await qb
      .orderBy('audit.created_at', 'DESC')
      .skip(query.skip)
      .take(query.limit)
      .getManyAndCount();

    return paginatedResult(data, total, query);
  }
}
