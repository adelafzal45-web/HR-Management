import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Department } from '../department/department.entity';
import { AppraisalForms } from '../appraisal-forms/appraisal-forms.entity';
@Entity('designations')
export class Designation {
  @PrimaryGeneratedColumn('uuid')
  designation_id!: string;

  @Column({
    length: 100,
    unique: true,
  })
  title!: string;

  @ManyToOne(() => Department, (department) => department.designations, {
    nullable: false,
  })
  @JoinColumn({
    name: 'department_id',
  })
  department!: Department;

  @OneToMany(() => User, (user) => user.designation)
  users!: User[];
  @OneToMany(() => AppraisalForms, (appraisalForm) => appraisalForm.designation)
  appraisalForms!: AppraisalForms[];
}
