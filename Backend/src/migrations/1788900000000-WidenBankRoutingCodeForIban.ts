import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Widens `users.bank_routing_code` from 20 to 34 characters.
 *
 * The column was sized for IFSC / SWIFT codes (8-20 chars). The employee form
 * now collects an IBAN in this field, and an IBAN runs up to 34 characters —
 * Pakistan's is 24 (`PK` + 2 check digits + 4 bank code + 16 account), so the
 * old width rejected the very value the field is now labelled for.
 *
 * 34 is the ISO 13616 maximum, and it matches `bank_account_number`, which was
 * already sized for IBAN-length input.
 *
 * The `down()` truncates rather than failing: rolling back a widened column with
 * longer values already stored has no lossless answer, and a hard error would
 * leave the schema stuck. Anything over 20 characters is cut, which is
 * recoverable from the audit trail if it ever matters.
 */
export class WidenBankRoutingCodeForIban1788900000000
  implements MigrationInterface
{
  name = 'WidenBankRoutingCodeForIban1788900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ALTER COLUMN "bank_routing_code" TYPE character varying(34)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "users"
      SET "bank_routing_code" = LEFT("bank_routing_code", 20)
      WHERE LENGTH("bank_routing_code") > 20
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ALTER COLUMN "bank_routing_code" TYPE character varying(20)
    `);
  }
}
