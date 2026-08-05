import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { EmailTemplate } from './entities/email-template.entity';
import { EmailTemplateVersion } from './entities/email-template-version.entity';
import {
  TemplateRendererService,
  ALLOWED_PLACEHOLDERS,
  type RenderedEmail,
  type TemplateContext,
  type PlaceholderKey,
} from './template-renderer.service';
import { DEFAULT_TEMPLATE_BY_KEY } from './templates/default-templates';
import { AuditService, type AuditActor } from '../audit/audit.service';
import type {
  PreviewEmailTemplateDto,
  UpdateEmailTemplateDto,
} from './dto/update-email-template.dto';

/** Placeholder reference for the editor's insert-token menu. */
export interface PlaceholderDescriptor {
  key: PlaceholderKey;
  token: string;
  group: 'company' | 'employee' | 'event';
}

const PLACEHOLDER_GROUPS: Record<string, PlaceholderDescriptor['group']> = {
  company_name: 'company',
  company_address: 'company',
  company_website: 'company',
  company_phone: 'company',
  support_email: 'company',
  logo_url: 'company',
  primary_color: 'company',
  year: 'company',
  employee_name: 'employee',
  employee_first_name: 'employee',
  employee_id: 'employee',
  employee_email: 'employee',
  previous_email: 'employee',
  department: 'employee',
  designation: 'employee',
  joining_date: 'employee',
};

/**
 * Template CRUD, versioning, and preview.
 *
 * Version semantics: every version has exactly one row in
 * `email_template_versions`, and the newest row always matches the live
 * template. An edit writes a snapshot of the *current* state first (if one is
 * missing, which is the case for the migration-seeded v1), then writes the new
 * content as version N+1. That invariant is what makes "restore version 3" mean
 * something concrete rather than approximate.
 *
 * A restore is applied as a *new* version carrying the old content, not by
 * rewinding the counter. History is append-only: rolling back by deleting rows
 * would erase the record that a rollback happened, which is exactly the event an
 * audit reader most wants to see.
 */
@Injectable()
export class EmailTemplateService {
  private readonly logger = new Logger(EmailTemplateService.name);

  constructor(
    @InjectRepository(EmailTemplate)
    private readonly templates: Repository<EmailTemplate>,
    @InjectRepository(EmailTemplateVersion)
    private readonly versions: Repository<EmailTemplateVersion>,
    private readonly renderer: TemplateRendererService,
    private readonly audit: AuditService,
    private readonly dataSource: DataSource,
  ) {}

  // ---- Reads ----

  /**
   * All templates, ordered by key.
   *
   * Unpaginated on purpose: the set is fixed at eleven rows seeded by migration
   * and there is no endpoint to create more, so paging would add a envelope the
   * screen has to unwrap for no benefit.
   */
  async findAll(): Promise<EmailTemplate[]> {
    return this.templates.find({ order: { template_key: 'ASC' } });
  }

  async findByKey(templateKey: string): Promise<EmailTemplate> {
    const template = await this.templates.findOne({
      where: { template_key: templateKey },
    });

    if (!template) {
      throw new NotFoundException(`Email template "${templateKey}" not found`);
    }

    return template;
  }

  /** Null rather than throwing — the send path treats a missing template as "skip". */
  async findByKeyOrNull(templateKey: string): Promise<EmailTemplate | null> {
    return this.templates.findOne({ where: { template_key: templateKey } });
  }

  async listVersions(templateKey: string): Promise<EmailTemplateVersion[]> {
    const template = await this.findByKey(templateKey);

    return this.versions.find({
      where: { email_template_id: template.email_template_id },
      order: { version: 'DESC' },
    });
  }

  /** The placeholder vocabulary, for the editor's token picker. */
  placeholders(): PlaceholderDescriptor[] {
    return ALLOWED_PLACEHOLDERS.map((key) => ({
      key,
      token: `{{${key}}}`,
      group: PLACEHOLDER_GROUPS[key] ?? 'event',
    }));
  }

  // ---- Writes ----

  /**
   * Applies an edit and records a version.
   *
   * Both writes happen in one transaction. A snapshot without the edit, or an
   * edit without its snapshot, would leave the history claiming something the
   * template does not say.
   */
  async update(
    templateKey: string,
    dto: UpdateEmailTemplateDto,
    actor?: AuditActor,
  ): Promise<EmailTemplate> {
    const existing = await this.findByKey(templateKey);

    const contentChanged =
      (dto.subject !== undefined && dto.subject !== existing.subject) ||
      (dto.body_html !== undefined && dto.body_html !== existing.body_html);

    const updated = await this.dataSource.transaction(async (manager) => {
      const templates = manager.getRepository(EmailTemplate);
      const versions = manager.getRepository(EmailTemplateVersion);

      // Metadata-only edits (rename, enable/disable) do not create a version:
      // versioning exists to make content recoverable, and a rename is not
      // content. Bumping the number for a toggle would bury real edits.
      if (contentChanged) {
        await this.snapshotIfMissing(versions, existing, actor);
      }

      if (dto.subject !== undefined) existing.subject = dto.subject;
      if (dto.body_html !== undefined) existing.body_html = dto.body_html;
      if (dto.name !== undefined) existing.name = dto.name;
      if (dto.description !== undefined)
        existing.description = dto.description || null;
      if (dto.enabled !== undefined) existing.enabled = dto.enabled;

      if (contentChanged) {
        existing.version += 1;
      }

      existing.updated_by_user_id = actor?.user_id ?? null;

      const saved = await templates.save(existing);

      if (contentChanged) {
        await versions.save(
          versions.create({
            email_template_id: saved.email_template_id,
            version: saved.version,
            subject: saved.subject,
            body_html: saved.body_html,
            changed_by_user_id: actor?.user_id ?? null,
            changed_by_email: actor?.email ?? null,
          }),
        );
      }

      return saved;
    });

    await this.audit.record({
      actor: actor ?? {},
      action:
        dto.enabled !== undefined && !contentChanged
          ? 'email.template.toggle'
          : 'email.template.update',
      entityType: 'email_template',
      entityId: updated.email_template_id,
      // Only the fields that changed, and never the full body: a template body is
      // several kilobytes of HTML and storing two copies per edit in the audit
      // trail would swamp it. The version table already holds the content
      // verbatim, so the audit row records that an edit happened and points at
      // the version that captured it.
      before: { version: updated.version - (contentChanged ? 1 : 0) },
      after: {
        version: updated.version,
        enabled: updated.enabled,
        subject: updated.subject,
      },
    });

    return updated;
  }

  /**
   * Ensures a version row exists for the template's current state.
   *
   * The migration seeds templates at version 1 without a matching version row —
   * writing eleven snapshots of content that is already in the code would be
   * redundant. So the first edit backfills it here, which keeps the "every
   * version has a row" invariant true without the migration having to.
   */
  private async snapshotIfMissing(
    versions: Repository<EmailTemplateVersion>,
    template: EmailTemplate,
    actor?: AuditActor,
  ): Promise<void> {
    const already = await versions.findOne({
      where: {
        email_template_id: template.email_template_id,
        version: template.version,
      },
    });

    if (already) {
      return;
    }

    await versions.save(
      versions.create({
        email_template_id: template.email_template_id,
        version: template.version,
        subject: template.subject,
        body_html: template.body_html,
        changed_by_user_id: actor?.user_id ?? null,
        changed_by_email: actor?.email ?? null,
      }),
    );
  }

  /** Re-applies an earlier version's content as a new version. */
  async restoreVersion(
    templateKey: string,
    version: number,
    actor?: AuditActor,
  ): Promise<EmailTemplate> {
    const template = await this.findByKey(templateKey);

    const snapshot = await this.versions.findOne({
      where: { email_template_id: template.email_template_id, version },
    });

    if (!snapshot) {
      throw new NotFoundException(
        `Version ${version} of template "${templateKey}" not found`,
      );
    }

    const restored = await this.update(
      templateKey,
      { subject: snapshot.subject, body_html: snapshot.body_html },
      actor,
    );

    await this.audit.record({
      actor: actor ?? {},
      action: 'email.template.restore',
      entityType: 'email_template',
      entityId: template.email_template_id,
      after: { restored_from_version: version, new_version: restored.version },
    });

    return restored;
  }

  /**
   * Resets a template to the copy shipped in the codebase.
   *
   * Goes through `update`, so the customised content is snapshotted as a version
   * first and remains recoverable. An admin who breaks a template's markup badly
   * enough that it no longer renders needs a way back that does not involve a
   * migration re-run.
   */
  async resetToDefault(
    templateKey: string,
    actor?: AuditActor,
  ): Promise<EmailTemplate> {
    const shipped = DEFAULT_TEMPLATE_BY_KEY.get(templateKey);

    if (!shipped) {
      throw new NotFoundException(
        `No shipped default exists for template "${templateKey}"`,
      );
    }

    return this.update(
      templateKey,
      { subject: shipped.subject, body_html: shipped.bodyHtml },
      actor,
    );
  }

  // ---- Preview ----

  /**
   * Renders a template with sample data.
   *
   * Accepts unsaved `subject`/`body_html` so the editor can preview before
   * committing. Caller-supplied context is merged over the sample values but
   * still passes through the renderer's allow-list and escaping — the preview
   * uses the identical code path as a real send, which is the only way a preview
   * is worth trusting.
   */
  async preview(
    templateKey: string,
    dto: PreviewEmailTemplateDto = {},
  ): Promise<RenderedEmail> {
    const template = await this.findByKey(templateKey);

    const context: TemplateContext = {
      ...this.renderer.sampleContext(),
      ...(dto.context as TemplateContext | undefined),
    };

    return this.renderer.render(
      dto.subject ?? template.subject,
      dto.body_html ?? template.body_html,
      context,
    );
  }
}
