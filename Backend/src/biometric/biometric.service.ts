import {
  ConflictException,
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { BiometricUser } from './biometric.entity';
import { User } from '../users/user.entity';

import { CreateBiometricUserDto } from './dto/create.dto';
import { UpdateBiometricUserDto } from './dto/update.dto';

import { AttendanceService } from '../attendance/attendance.service';

const ZKLib = require('node-zklib');

@Injectable()
export class BiometricService implements OnModuleInit {
  private readonly logger = new Logger(BiometricService.name);

  // =====================================================
  // ZKTECO DEVICE CONFIGURATION
  // =====================================================

  private readonly DEVICE_IP = '192.168.100.73';
  private readonly DEVICE_PORT = 4370;
  private readonly DEVICE_TIMEOUT = 10000;

  // Prevent duplicate events
  private lastPunchKey: string | null = null;

  constructor(
    @InjectRepository(BiometricUser)
    private readonly biometricUserRepository: Repository<BiometricUser>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    private readonly attendanceService: AttendanceService,
  ) {}

  // =====================================================
  // AUTOMATICALLY START LISTENER WHEN NESTJS STARTS
  // =====================================================

  async onModuleInit() {
    this.logger.log(
      '🚀 Starting biometric listener automatically...',
    );

    try {
      await this.startPunchListener();

      this.logger.log(
        '✅ Biometric listener is running.',
      );
    } catch (error) {
      this.logger.error(
        '❌ Failed to start biometric listener automatically.',
        error instanceof Error
          ? error.stack
          : String(error),
      );
    }
  }

  // =====================================================
  // CREATE BIOMETRIC USER MAPPING
  // =====================================================

  async create(createDto: CreateBiometricUserDto) {
    const existingBiometricUser =
      await this.biometricUserRepository.findOne({
        where: {
          device_user_id: createDto.device_user_id,
        },
      });

    if (existingBiometricUser) {
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
      throw new NotFoundException(
        'Employee/user not found.',
      );
    }

    const biometricUser =
      this.biometricUserRepository.create({
        device_user_id: createDto.device_user_id,
        user,
        active: true,
      });

    return await this.biometricUserRepository.save(
      biometricUser,
    );
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
    const biometricUser =
      await this.biometricUserRepository.findOne({
        where: {
          biometric_user_id: id,
        },
        relations: {
          user: true,
        },
      });

    if (!biometricUser) {
      throw new NotFoundException(
        'Biometric user mapping not found.',
      );
    }

    return biometricUser;
  }

  // =====================================================
  // FIND EMPLOYEE BY DEVICE USER ID
  // =====================================================

  async findByDeviceUserId(deviceUserId: string) {
    const biometricUser =
      await this.biometricUserRepository.findOne({
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
  // UPDATE BIOMETRIC MAPPING
  // =====================================================

  async update(
    id: string,
    updateDto: UpdateBiometricUserDto,
  ) {
    const biometricUser = await this.findOne(id);

    if (
      updateDto.device_user_id &&
      updateDto.device_user_id !==
        biometricUser.device_user_id
    ) {
      const existing =
        await this.biometricUserRepository.findOne({
          where: {
            device_user_id:
              updateDto.device_user_id,
          },
        });

      if (existing) {
        throw new ConflictException(
          'This biometric device user ID is already mapped.',
        );
      }

      biometricUser.device_user_id =
        updateDto.device_user_id;
    }

    if (updateDto.user_id) {
      const user = await this.userRepository.findOne({
        where: {
          user_id: updateDto.user_id,
        },
      });

      if (!user) {
        throw new NotFoundException(
          'Employee/user not found.',
        );
      }

      biometricUser.user = user;
    }

    return await this.biometricUserRepository.save(
      biometricUser,
    );
  }

  // =====================================================
  // DEACTIVATE BIOMETRIC MAPPING
  // =====================================================

  async deactivate(id: string) {
    const biometricUser = await this.findOne(id);

    biometricUser.active = false;

    await this.biometricUserRepository.save(
      biometricUser,
    );

    return {
      message:
        'Biometric mapping deactivated successfully.',
    };
  }

  // =====================================================
  // DELETE BIOMETRIC MAPPING
  // =====================================================

  async remove(id: string) {
    const biometricUser = await this.findOne(id);

    await this.biometricUserRepository.remove(
      biometricUser,
    );

    return {
      message:
        'Biometric attendance mapping deleted successfully.',
    };
  }

  // =====================================================
  // CONNECT TO ZKTECO MACHINE
  // =====================================================

  private async connectToDevice() {
    const zkInstance = new ZKLib(
      this.DEVICE_IP,
      this.DEVICE_PORT,
      this.DEVICE_TIMEOUT,
      4000,
    );

    try {
      await zkInstance.createSocket();

      this.logger.log(
        `✅ Connected to ZKTeco device at ${this.DEVICE_IP}:${this.DEVICE_PORT}`,
      );

      return zkInstance;
    } catch (error) {
      this.logger.error(
        `❌ Could not connect to ZKTeco device ${this.DEVICE_IP}:${this.DEVICE_PORT}`,
        error,
      );

      throw new InternalServerErrorException(
        'Unable to connect to biometric machine.',
      );
    }
  }

  // =====================================================
  // TEST DEVICE CONNECTION
  // =====================================================

  async testDeviceConnection() {
    const zkInstance = await this.connectToDevice();

    try {
      const info = await zkInstance.getInfo();

      return {
        connected: true,
        device_ip: this.DEVICE_IP,
        device_port: this.DEVICE_PORT,
        info,
      };
    } catch (error) {
      this.logger.error(
        'Connected to device but failed to retrieve device information.',
        error,
      );

      throw new InternalServerErrorException(
        'Connected to biometric machine but could not retrieve device information.',
      );
    } finally {
      await zkInstance.disconnect();
    }
  }

  // =====================================================
  // PROCESS BIOMETRIC PUNCH
  // =====================================================

  private async processBiometricPunch(data: any) {
    try {
      this.logger.log(
        `🔥 Processing biometric punch: ${JSON.stringify(data)}`,
      );

      // -------------------------------------------------
      // 1. GET DEVICE USER ID
      // -------------------------------------------------

      const deviceUserId = data?.userId;
      const attTime = data?.attTime;

      if (!deviceUserId) {
        this.logger.warn(
          `❌ Punch received without userId: ${JSON.stringify(data)}`,
        );

        return;
      }

      // -------------------------------------------------
      // 2. PREVENT DUPLICATE EVENTS
      // -------------------------------------------------

      const punchKey = `${deviceUserId}_${attTime}`;

      if (this.lastPunchKey === punchKey) {
        this.logger.warn(
          `⚠️ Duplicate punch ignored: ${punchKey}`,
        );

        return;
      }

      this.lastPunchKey = punchKey;

      this.logger.log(
        `✅ New punch accepted`,
      );

      this.logger.log(
        `📌 Device User ID: ${deviceUserId}`,
      );

      this.logger.log(
        `🕐 Device Punch Time: ${attTime}`,
      );

      // -------------------------------------------------
      // 3. FIND BIOMETRIC MAPPING
      // -------------------------------------------------

      const biometricUser =
        await this.biometricUserRepository.findOne({
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
          `❌ No employee mapped to biometric device user ID: ${deviceUserId}`,
        );

        return;
      }

      // -------------------------------------------------
      // 4. GET HR USER
      // -------------------------------------------------

      const user = biometricUser.user;

      if (!user) {
        this.logger.warn(
          `❌ Biometric mapping exists but no HR user is linked.`,
        );

        return;
      }

      this.logger.log(
        `👤 Punch belongs to employee: ${user.first_name} ${user.last_name}`,
      );

      this.logger.log(
        `🆔 HR User UUID: ${user.user_id}`,
      );

      // -------------------------------------------------
      // 5. PROCESS CHECK-IN / CHECK-OUT
      // -------------------------------------------------

      const attendance =
        await this.attendanceService.processBiometricPunch(
          user.user_id,
        );

      // -------------------------------------------------
      // 6. SUCCESS LOG
      // -------------------------------------------------

      this.logger.log(
        `✅ BIOMETRIC ATTENDANCE PROCESSED`,
      );

      this.logger.log(
        `👤 Employee: ${user.first_name} ${user.last_name}`,
      );

      this.logger.log(
        `🆔 Device User ID: ${deviceUserId}`,
      );

      this.logger.log(
        `🕐 Check-in: ${attendance.check_in ?? 'N/A'}`,
      );

      this.logger.log(
        `🕐 Check-out: ${attendance.check_out ?? 'N/A'}`,
      );

    } catch (error) {
      this.logger.error(
        '❌ Error while processing biometric punch.',
        error instanceof Error
          ? error.stack
          : String(error),
      );
    }
  }

  // =====================================================
  // AUTOMATIC REAL-TIME BIOMETRIC LISTENER
  // =====================================================

  private async startPunchListener() {
    const zkInstance = new ZKLib(
      this.DEVICE_IP,
      this.DEVICE_PORT,
      this.DEVICE_TIMEOUT,
      4000,
    );

    try {
      this.logger.log(
        `🔌 Connecting to ZKTeco ${this.DEVICE_IP}:${this.DEVICE_PORT}`,
      );

      await zkInstance.createSocket();

      this.logger.log(
        `✅ Connected to ZKTeco device`,
      );

      try {
        await zkInstance.enableDevice();

        this.logger.log(
          `🔓 ZKTeco device enabled`,
        );
      } catch {
        this.logger.warn(
          `⚠️ Could not explicitly enable device.`,
        );
      }

      this.logger.log(
        `🟢 REAL-TIME BIOMETRIC LISTENER STARTED`,
      );

      this.logger.log(
        `👉 Waiting for biometric punches...`,
      );
this.logger.log("STARTING getRealTimeLogs()");
      await zkInstance.getRealTimeLogs(
        async (data: any) => {
          this.logger.log(
            `🚨 BIOMETRIC PUNCH RECEIVED`,
          );

          this.logger.log(
            `RAW DEVICE DATA: ${JSON.stringify(data)}`,
          );

          await this.processBiometricPunch(data);
        },
      );
this.logger.error("getRealTimeLogs() RETURNED");

    } catch (error) {
      this.logger.error(
        '❌ Biometric listener failed.',
        error instanceof Error
          ? error.stack
          : String(error),
      );

      try {
        await zkInstance.disconnect();
      } catch {}

      throw error;
    }
  }
}