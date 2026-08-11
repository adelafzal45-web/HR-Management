import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { DashboardService } from './dashboard.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/auth.constants';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { PermissionGuard } from '../authorization/guards/permission.guard';

/**
 * One aggregate per dashboard role, so each dashboard is a single round trip
 * instead of five list calls stitched together in the browser.
 *
 * The gates are deliberately different for each route, and that difference is
 * the security model:
 *
 *  - `admin` needs `employees.view` — it reports org-wide headcount and
 *    attendance.
 *  - `team` needs `appraisal.view`, and the service narrows it further to the
 *    caller's assigned roster. The permission alone does not decide who is
 *    visible.
 *  - `me` carries **no** `@RequirePermission` on purpose. Its subject is the
 *    verified JWT's own `user_id` and nothing else, the same contract as
 *    `/attendance/me` and `/payslips/me`. Gating it on `attendance.view` or
 *    `working-days.view` would lock every Employee out of their own numbers.
 */
@ApiTags('Dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('me')
  @ApiOperation({
    summary: 'Own dashboard figures',
    description:
      'Month-to-date attendance against the real working calendar, appraisal scores, latest net pay and the last 7 working days — all scoped to the authenticated user.',
  })
  @ApiResponse({ status: 200, description: 'The caller’s own dashboard.' })
  getMine(@CurrentUser() user: JwtUser) {
    return this.dashboardService.getSelfDashboard(user.user_id);
  }

  @Get('team')
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal.view')
  @ApiOperation({
    summary: 'Team dashboard figures',
    description:
      'This month’s attendance and appraisal figures for every member of the caller’s assigned roster. A lead with no assignment gets an empty team, never the whole org.',
  })
  @ApiResponse({ status: 200, description: 'Roster-scoped team figures.' })
  @ApiResponse({ status: 403, description: 'Missing appraisal.view permission.' })
  getTeam(@CurrentUser() user: JwtUser) {
    return this.dashboardService.getTeamDashboard(user.user_id);
  }

  @Get('admin')
  @UseGuards(PermissionGuard)
  @RequirePermission('employees.view')
  @ApiOperation({
    summary: 'Organisation-wide dashboard counters',
    description:
      'Headcount, today’s present/absent/on-leave counts, pending leave requests and pending appraisals.',
  })
  @ApiResponse({ status: 200, description: 'Org-wide counters.' })
  @ApiResponse({ status: 403, description: 'Missing employees.view permission.' })
  getAdmin() {
    return this.dashboardService.getAdminDashboard();
  }
}
