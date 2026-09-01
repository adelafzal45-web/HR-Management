import {
  ConflictException,
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { BiometricUser } from './biometric.entity';
import { User } from '../users/user.entity';

import { CreateBiometricUserDto } from './dto/create.dto';
import { UpdateBiometricUserDto } from './dto/update.dto';

import { AttendanceService } from '../attendance/attendance.service';
import { CompanySettingsService } from '../company-settings/company-settings.service';
import type { BiometricDeviceConfig } from '../company-settings/biometric-device.type';

const ZKLib = require('node-zklib');

/** Device connection actually dialed, after settings + defaults are resolved. */
type ResolvedDeviceConfig = { ip: string; port: number; timeout: number };

@Injectable()
export class BiometricService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BiometricService.name);

  // =====================================================
  // ZKTECO DEVICE CONFIGURATION
  // =====================================================
  //
  // These are only fallbacks. The live connection comes from
  // `company_settings.biometric_device`, which HR edits on the Biometric
  // settings screen; these apply when it has not been configured yet.

  private readonly DEFAULT_DEVICE_IP = '192.168.100.73';
  private readonly DEFAULT_DEVICE_PORT = 4370;
  private readonly DEFAULT_DEVICE_TIMEOUT = 100000000;

  /**
   * How long to wait before retrying after the listener drops or fails.
   * Was 1000000000ms (~11.6 days) — almost certainly a typo (missing
   * decimal point / extra zeros) that meant a real device drop would go
   * unrecovered for over a week. 10s balances a fast recovery against
   * hammering an unreachable device with reconnect attempts.
   */
  private readonly RECONNECT_DELAY_MS = 10000;

  // Duplicate-punch guard, per device user. The device can emit the same punch
  // twice in quick succession; keying by user (not one global key) means a
  // second person punching does not clear the guard for the first.
  private readonly lastPunchByUser = new Map<string, string>();

  // Listener lifecycle. `activeZk` is the socket the real-time listener is
  // holding (so a config change can drop it); `listenerActive` prevents two
  // supervised runs overlapping; `reconnectTimer` is the pending retry;
  // `stopped` short-circuits everything once the module is torn down.
  private activeZk: any = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private listenerActive = false;
  private stopped = false;

  constructor(
    @InjectRepository(BiometricUser)
    private readonly biometricUserRepository: Repository<BiometricUser>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    private readonly attendanceService: AttendanceService,

    private readonly companySettingsService: CompanySettingsService,
  ) {}

  // =====================================================
  // LISTENER LIFECYCLE
  // =====================================================

  onModuleInit(): void {
    // Supervise in the background: a device that is down or absent must never
    // block Nest boot, and the listener has to recover on its own rather than
    // dying until the next restart.
    void this.superviseListener();
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.activeZk) {
      const zk = this.activeZk;
      this.activeZk = null;
      void (async () => {
        try {
          await zk.disconnect();
        } catch {
          /* shutting down — nothing useful to do with a disconnect error */
        }
      })();
    }
  }

  /**
   * Runs the listener and keeps it running.
   *
   * `startPunchListener` resolves when the real-time stream ends and rejects
   * when the connection fails; either way we log it and schedule a retry, so a
   * dropped socket or an unreachable device recovers instead of going silent.
   */
  private async superviseListener(): Promise<void> {
    if (this.stopped || this.listenerActive) return;

    this.listenerActive = true;
    this.logger.log('Starting biometric listener...');

    try {
      await this.startPunchListener();
      this.logger.warn(
        'Biometric listener stream ended — scheduling reconnect.',
      );
    } catch (error) {
      this.logger.error(
        'Biometric listener error — scheduling reconnect.',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.listenerActive = false;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;

    this.logger.log(
      `Reconnecting to biometric device in ${this.RECONNECT_DELAY_MS / 1000}s.`,
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.superviseListener();
    }, this.RECONNECT_DELAY_MS);
  }

  /**
   * Re-reads device config and reconnects the listener now, cancelling any
   * pending backoff. Called after HR changes the device connection in settings
   * so the new IP/port takes effect without a server restart.
   */
  async restartListener(): Promise<{ message: string }> {
    if (this.stopped) {
      return { message: 'Biometric listener is stopped.' };
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Drop the current socket so the running getRealTimeLogs unwinds; its
    // finally clears activeZk and the supervisor reconnects on the new config.
    if (this.activeZk) {
      const zk = this.activeZk;
      this.activeZk = null;
      try {
        await zk.disconnect();
      } catch {
        /* best effort — we are replacing the connection anyway */
      }
    }

    // Reconnect promptly. The short delay lets any in-flight teardown settle;
    // the timer guard makes the teardown's own reconnect request a no-op.
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.superviseListener();
    }, 1000);

    return {
      message: 'Biometric listener restarting with the latest device configuration.',
    };
  }

  // =====================================================
  // CREATE BIOMETRIC USER MAPPING
  // =====================================================

  async create(createDto: CreateBiometricUserDto) {
    const existingDevice = await this.biometricUserRepository.findOne({
      where: {
        device_user_id: createDto.device_user_id,
      },
    });

    if (existingDevice) {
      throw new ConflictException(
        'This biometric device user ID is already mapped.',
      );
    }

    const user = await this.userRepository.findOne({
      where: {
        user_id: createDto.user_id,
      },
    });

    if (!user) {
      throw new NotFoundException('Employee/user not found.');
    }

    // One mapping per employee — the table enforces UNIQUE(user_id). Catch it
    // here so a repeat mapping is a clear 409 rather than a raw constraint 500.
    const existingForUser = await this.biometricUserRepository.findOne({
      where: {
        user: { user_id: createDto.user_id },
      },
    });

    if (existingForUser) {
      throw new ConflictException(
        'This employee is already mapped to a biometric device ID.',
      );
    }

    const biometricUser = this.biometricUserRepository.create({
      device_user_id: createDto.device_user_id,
      user,
      active: true,
    });

    return await this.biometricUserRepository.save(biometricUser);
  }

  // =====================================================
  // GET ALL BIOMETRIC MAPPINGS
  // =====================================================

  async findAll() {
    return await this.biometricUserRepository.find({
      relations: {
        user: true,
      },
      order: {
        created_at: 'DESC',
      },
    });
  }

  // =====================================================
  // GET ONE BIOMETRIC MAPPING
  // =====================================================

  async findOne(id: string) {
    const biometricUser = await this.biometricUserRepository.findOne({
      where: {
        biometric_user_id: id,
      },
      relations: {
        user: true,
      },
    });

    if (!biometricUser) {
      throw new NotFoundException('Biometric user mapping not found.');
    }

    return biometricUser;
  }

  // =====================================================
  // FIND EMPLOYEE BY DEVICE USER ID
  // =====================================================

  async findByDeviceUserId(deviceUserId: string) {
    const biometricUser = await this.biometricUserRepository.findOne({
      where: {
        device_user_id: deviceUserId,
        active: true,
      },
      relations: {
        user: true,
      },
    });

    if (!biometricUser) {
      throw new NotFoundException(
        'No employee is mapped to this biometric user ID.',
      );
    }

    return biometricUser;
  }

  // =====================================================
  // FIND MAPPING BY HR USER ID
  // =====================================================

  /**
   * The mapping for one employee, or null when unmapped.
   *
   * At most one row per user (UNIQUE(user_id)), so this returns the single row
   * regardless of its active flag — the employee form uses it to prefill the
   * current device ID, and null to show the field empty.
   */
  async findByUserId(userId: string): Promise<BiometricUser | null> {
    return this.biometricUserRepository.findOne({
      where: {
        user: { user_id: userId },
      },
      relations: {
        user: true,
      },
    });
  }

  // =====================================================
  // UPDATE BIOMETRIC MAPPING
  // =====================================================

  async update(id: string, updateDto: UpdateBiometricUserDto) {
    const biometricUser = await this.findOne(id);

    if (
      updateDto.device_user_id &&
      updateDto.device_user_id !== biometricUser.device_user_id
    ) {
      const existing = await this.biometricUserRepository.findOne({
        where: {
          device_user_id: updateDto.device_user_id,
        },
      });

      if (existing) {
        throw new ConflictException(
          'This biometric device user ID is already mapped.',
        );
      }

      biometricUser.device_user_id = updateDto.device_user_id;
    }

    if (updateDto.user_id) {
      const user = await this.userRepository.findOne({
        where: {
          user_id: updateDto.user_id,
        },
      });

      if (!user) {
        throw new NotFoundException('Employee/user not found.');
      }

      biometricUser.user = user;
    }

    return await this.biometricUserRepository.save(biometricUser);
  }

  // =====================================================
  // DEACTIVATE BIOMETRIC MAPPING
  // =====================================================

  async deactivate(id: string) {
    const biometricUser = await this.findOne(id);

    biometricUser.active = false;

    await this.biometricUserRepository.save(biometricUser);

    return {
      message: 'Biometric mapping deactivated successfully.',
    };
  }

  // =====================================================
  // DELETE BIOMETRIC MAPPING
  // =====================================================

  async remove(id: string) {
    const biometricUser = await this.findOne(id);

    await this.biometricUserRepository.remove(biometricUser);

    return {
      message: 'Biometric attendance mapping deleted successfully.',
    };
  }

  // =====================================================
  // DEVICE CONNECTION
  // =====================================================

  /**
   * The connection to dial: the configured device from settings, with the
   * built-in defaults filling any gap (or the whole thing, when unconfigured).
   */
  private async resolveDeviceConfig(): Promise<ResolvedDeviceConfig> {
    const { device } = await this.companySettingsService.getBiometricConfig();

    return {
      ip: device?.ip || this.DEFAULT_DEVICE_IP,
      port: device?.port || this.DEFAULT_DEVICE_PORT,
      timeout: device?.timeout || this.DEFAULT_DEVICE_TIMEOUT,
    };
  }

  private async connectToDevice(config: ResolvedDeviceConfig) {
    const zkInstance = new ZKLib(config.ip, config.port, config.timeout, 4000);

    try {
      await zkInstance.createSocket();

      this.logger.log(
        `Connected to ZKTeco device at ${config.ip}:${config.port}`,
      );

      return zkInstance;
    } catch (error) {
      this.logger.error(
        `Could not connect to ZKTeco device ${config.ip}:${config.port}`,
        error instanceof Error ? error.stack : String(error),
      );

      throw new InternalServerErrorException(
        'Unable to connect to biometric machine.',
      );
    }
  }

  // =====================================================
  // TEST DEVICE CONNECTION
  // =====================================================

  /**
   * Opens a connection and reads device info, so HR can confirm the machine is
   * reachable. An optional `override` lets the settings screen validate an IP /
   * port before saving it; without one, the currently configured device is used.
   */
  async testDeviceConnection(override?: BiometricDeviceConfig | null) {
    const config: ResolvedDeviceConfig = override
      ? {
          ip: override.ip,
          port: override.port,
          timeout: override.timeout || this.DEFAULT_DEVICE_TIMEOUT,
        }
      : await this.resolveDeviceConfig();

    const zkInstance = await this.connectToDevice(config);

    try {
      const info = await zkInstance.getInfo();

      return {
        connected: true,
        device_ip: config.ip,
        device_port: config.port,
        info,
      };
    } catch (error) {
      this.logger.error(
        'Connected to device but failed to retrieve device information.',
        error instanceof Error ? error.stack : String(error),
      );

      throw new InternalServerErrorException(
        'Connected to biometric machine but could not retrieve device information.',
      );
    } finally {
      try {
        await zkInstance.disconnect();
      } catch {
        /* best effort */
      }
    }
  }

  // =====================================================
  // PROCESS BIOMETRIC PUNCH
  // =====================================================

  private async processBiometricPunch(data: any): Promise<void> {
    try {
      // Company-wide switch: in Manual mode the device is ignored entirely, so
      // a stray punch never creates a Device-sourced row behind HR's back.
      const { mode } = await this.companySettingsService.getBiometricConfig();
      if (mode !== 'Device') {
        this.logger.warn(
          'Punch received while attendance mode is Manual — ignoring device punch.',
        );
        return;
      }

      // -------------------------------------------------
      // 1. GET DEVICE USER ID
      // -------------------------------------------------

      const deviceUserId = data?.userId;
      const attTime = data?.attTime;

      if (!deviceUserId) {
        this.logger.warn(
          `Punch received without userId: ${JSON.stringify(data)}`,
        );
        return;
      }

      // -------------------------------------------------
      // 2. PREVENT DUPLICATE EVENTS (per user)
      // -------------------------------------------------

      const punchKey = `${deviceUserId}_${attTime}`;

      if (this.lastPunchByUser.get(String(deviceUserId)) === punchKey) {
        this.logger.warn(`Duplicate punch ignored: ${punchKey}`);
        return;
      }

      this.lastPunchByUser.set(String(deviceUserId), punchKey);

      // -------------------------------------------------
      // 3. FIND BIOMETRIC MAPPING
      // -------------------------------------------------

      const biometricUser = await this.biometricUserRepository.findOne({
        where: {
          device_user_id: String(deviceUserId),
          active: true,
        },
        relations: {
          user: true,
        },
      });

      if (!biometricUser) {
        this.logger.warn(
          `No active employee mapped to biometric device user ID: ${deviceUserId}`,
        );
        return;
      }

      // -------------------------------------------------
      // 4. GET HR USER
      // -------------------------------------------------

      const user = biometricUser.user;

      if (!user) {
        this.logger.warn(
          'Biometric mapping exists but no HR user is linked.',
        );
        return;
      }

      // -------------------------------------------------
      // 5. PROCESS CHECK-IN / CHECK-OUT (tagged Device)
      // -------------------------------------------------

      const attendance = await this.attendanceService.processBiometricPunch(
        user.user_id,
        'Device',
      );

      this.logger.log(
        `Biometric attendance processed for ${user.first_name} ${user.last_name} ` +
          `(check-in: ${attendance.check_in ?? 'N/A'}, check-out: ${attendance.check_out ?? 'N/A'}).`,
      );
    } catch (error) {
      // Postgres 42P01/42703 = relation/column does not exist. That specific
      // pair means the schema this code expects (biometric_users,
      // company_settings.attendance_mode/biometric_device) isn't there yet —
      // almost always a missed `npm run migration:run`, not a runtime fluke.
      // Flagged distinctly so it doesn't blend into routine
      // device-unreachable/duplicate-punch warnings in the logs.
      const pgCode = (error as { code?: string })?.code;
      const isMissingSchema = pgCode === '42P01' || pgCode === '42703';

      this.logger.error(
        isMissingSchema
          ? 'Biometric punch dropped: the database schema is missing a table/column ' +
              'this code expects. Pending migrations are almost certainly the cause — ' +
              'run `npm run migration:run`. Punch was NOT recorded.'
          : 'Error while processing biometric punch.',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  // =====================================================
  // AUTOMATIC REAL-TIME BIOMETRIC LISTENER
  // =====================================================

  /**
   * Connects and streams real-time punches. Resolves when the connection
   * actually ends and throws when it cannot connect; the supervisor turns
   * either into a reconnect.
   *
   * IMPORTANT: `zkInstance.getRealTimeLogs(cb)` does NOT block until the
   * stream ends — checked against node-zklib's own source (zklibtcp.js):
   * it registers a `data` listener on the socket and resolves immediately
   * after writing the registration command. Previously this method did
   * `await zkInstance.getRealTimeLogs(cb)` and then disconnected in
   * `finally`, which tore the socket down in the same tick it had just been
   * opened — every run logged "listener started" immediately followed by
   * "stream ended", and no punch was ever actually received, migrations or
   * not.
   *
   * The real end-of-connection signal is the underlying TCP socket's
   * `close`/`error` event. `createSocket(cbError, cbClose)` accepts
   * callbacks for exactly that, so we wait on those instead of on
   * `getRealTimeLogs`'s promise.
   */
  private async startPunchListener(): Promise<void> {
    const config = await this.resolveDeviceConfig();
    const zkInstance = new ZKLib(config.ip, config.port, config.timeout, 4000);
    this.activeZk = zkInstance;

    try {
      await new Promise<void>((resolve, reject) => {
        let settled = false;

        // Fires when the socket actually closes — device power-cycled,
        // network drop, or our own disconnect() during teardown/reconnect.
        const onClose = () => {
          if (settled) return;
          settled = true;
          resolve();
        };

        // Fires on a socket-level error after we were connected.
        const onError = (err: unknown) => {
          if (settled) return;
          settled = true;
          reject(err instanceof Error ? err : new Error(String(err)));
        };

        void (async () => {
          try {
            this.logger.log(
              `Connecting to ZKTeco ${config.ip}:${config.port}`,
            );

            await zkInstance.createSocket(onError, onClose);

            this.logger.log('Connected to ZKTeco device');

            try {
              await zkInstance.enableDevice();
              this.logger.log('ZKTeco device enabled');
            } catch {
              this.logger.warn('Could not explicitly enable device.');
            }

            await zkInstance.getRealTimeLogs(async (data: any) => {
              await this.processBiometricPunch(data);
            });

            this.logger.log(
              'Real-time biometric listener started; waiting for punches...',
            );
            // Deliberately not resolving here — the promise stays pending,
            // holding the connection open, until onClose/onError fires.
          } catch (error) {
            if (!settled) {
              settled = true;
              reject(error);
            }
          }
        })();
      });

      this.logger.warn('Biometric device connection closed.');
    } finally {
      try {
        await zkInstance.disconnect();
      } catch {
        /* best effort — socket may already be closed */
      }
      if (this.activeZk === zkInstance) {
        this.activeZk = null;
      }
    }
  }
}