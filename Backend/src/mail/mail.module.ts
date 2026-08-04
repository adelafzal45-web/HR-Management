import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SmtpSettings } from './entities/smtp-settings.entity';
import { EmailTemplate } from './entities/email-template.entity';
import { EmailTemplateVersion } from './entities/email-template-version.entity';
import { EmailQueue } from './entities/email-queue.entity';

import { SmtpSettingsService } from './smtp-settings.service';
import { EmailTemplateService } from './email-template.service';
import { TemplateRendererService } from './template-renderer.service';
import { MailTransportService } from './mail-transport.service';
import { MailService } from './mail.service';
import { MailQueueProcessor } from './mail-queue.processor';

import { SmtpSettingsController } from './smtp-settings.controller';
import { EmailTemplatesController } from './email-templates.controller';
import { EmailQueueController } from './email-queue.controller';

import { CompanySettingsModule } from '../company-settings/company-settings.module';
import { AuditModule } from '../audit/audit.module';
import { AuthorizationModule } from '../authorization/authorization.module';

/**
 * Transactional email: SMTP configuration, branded templates, and the outbox.
 *
 * Exports `MailService` only. The rest of the application enqueues mail and has
 * no business reaching the transport, the queue table, or the template rows
 * directly — keeping the surface to one method is what lets every trigger site be
 * a two-line call that cannot fail the operation around it.
 *
 * `CompanySettingsModule` is imported for branding (logo, colours, address,
 * footer contacts resolved at render time) and `AuditModule` for the delivery
 * trail. Neither is a circular dependency: neither module knows mail exists.
 *
 * Note ScheduleModule.forRoot() is registered once in AppModule rather than here.
 * Registering it in a feature module works but makes the cron registry a
 * side-effect of importing that module, which is surprising when a second module
 * later needs a schedule of its own.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      SmtpSettings,
      EmailTemplate,
      EmailTemplateVersion,
      EmailQueue,
    ]),
    CompanySettingsModule,
    AuditModule,
    // Supplies AuthorizationService, which PermissionGuard resolves grants
    // through on the three controllers below.
    AuthorizationModule,
  ],
  controllers: [
    SmtpSettingsController,
    EmailTemplatesController,
    EmailQueueController,
  ],
  providers: [
    SmtpSettingsService,
    EmailTemplateService,
    TemplateRendererService,
    MailTransportService,
    MailService,
    MailQueueProcessor,
  ],
  exports: [MailService],
})
export class MailModule {}
