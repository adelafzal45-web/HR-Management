import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { User } from '../users/user.entity';

@Entity('designations')
export class Designation {
  @PrimaryGeneratedColumn('uuid')
  designation_id!: string;

  @Column({
    length: 100,
    unique: true,
  })
  title!: string;

  @OneToMany(() => User, (user) => user.designation)
  users!: User[];
}
