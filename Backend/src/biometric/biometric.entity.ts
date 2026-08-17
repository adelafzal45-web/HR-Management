import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne
} from 'typeorm';

import { User } from '../users/user.entity';

@Entity('biometric_users')
export class BiometricUser {
  @PrimaryGeneratedColumn('uuid')
  biometric_user_id!: string;

  /**
   * User ID assigned by the ZKTeco biometric machine.
   *
   * Example:
   * 25
   */
  @Column({
    unique: true,
    length: 50,
  })
  device_user_id!: string;

  /**
   * Employee in the HR portal.
   */
  @OneToOne(() => User, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'user_id',
  })
  user!: User;

  @Column({
    default: true,
  })
  active!: boolean;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}