import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';

import {
  AuthService,
  loginChannelFrom,
  type LoginResult,
} from './auth.service';
import { LoginDto } from './dto/login.dto';
import {
  ForgotPasswordDto,
  ResetPasswordWithTokenDto,
} from './dto/password-reset.dto';
import { PasswordResetService } from './password-reset.service';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import type { JwtUser } from './auth.constants';
import { REFRESH_TOKEN_COOKIE } from './auth.constants';
import { RateLimit } from '../common/rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../common/rate-limit/rate-limit.guard';
import { ChangeOwnPasswordDto } from '../users/dto/reset-password.dto';
import { UserService } from '../users/users.service';
import { actorFrom } from '../common/audit/actor.util';
import {
  RefreshTokenGuard,
  type RefreshTokenRequest,
} from './guards/refresh-token.guard';
import {
  clearRefreshTokenCookie,
  setRefreshTokenCookie,
} from './cookie.util';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordResetService: PasswordResetService,
    private readonly userService: UserService,
  ) {}

  /**
   * Moves the refresh token out of the response body and into an httpOnly
   * cookie. Returning it in JSON would put it within reach of client-side
   * JavaScript, which is exactly what the cookie is there to prevent.
   */
  private withRefreshCookie(
    res: Response,
    result: LoginResult,
  ): Omit<LoginResult, 'refreshToken'> {
    const { refreshToken, ...body } = result;
    setRefreshTokenCookie(res, refreshToken);
    return body;
  }

  @Public()
  @Post('login')
  @ApiOperation({
    summary:
      'Authenticate; returns a short-lived access token and sets the refresh cookie',
  })
  @ApiResponse({ status: 201, description: 'Login successful.' })
  @ApiResponse({ status: 401, description: 'Invalid credentials.' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Omit<LoginResult, 'refreshToken'>> {
    return this.withRefreshCookie(
      res,
      await this.authService.login(dto, loginChannelFrom(req)),
    );
  }

  /**
   * @Public() is required even though this route is guarded: the global
   * JwtAuthGuard would otherwise reject the request for having an expired
   * access token, which is the only reason to be here in the first place.
   * RefreshTokenGuard authenticates the cookie instead.
   */
  @Public()
  @UseGuards(RefreshTokenGuard)
  @Post('refresh')
  @HttpCode(200)
  @ApiCookieAuth(REFRESH_TOKEN_COOKIE)
  @ApiOperation({
    summary: 'Exchange the refresh cookie for a new access token (rotates it)',
  })
  @ApiResponse({ status: 200, description: 'New access token issued.' })
  @ApiResponse({
    status: 401,
    description: 'Refresh token missing, expired, revoked, or already used.',
  })
  async refresh(
    @Req() req: RefreshTokenRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Omit<LoginResult, 'refreshToken'>> {
    try {
      return this.withRefreshCookie(
        res,
        await this.authService.refresh(req.refreshToken),
      );
    } catch (error) {
      // A rejected refresh token is spent — drop the cookie so the browser
      // stops replaying it on every subsequent attempt.
      clearRefreshTokenCookie(res);
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  @ApiCookieAuth(REFRESH_TOKEN_COOKIE)
  @ApiOperation({ summary: 'Revoke the refresh token and clear its cookie' })
  @ApiResponse({ status: 204, description: 'Logged out.' })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    // Deliberately @Public() and never failing: logging out with an already
    // expired or missing token should still clear client state, not 401.
    const cookies = (req.cookies ?? {}) as Record<string, string>;
    await this.authService.logout(cookies[REFRESH_TOKEN_COOKIE]);
    clearRefreshTokenCookie(res);
  }

  @Get('me')
  @ApiOperation({
    summary: 'Return the authenticated user claims and their live permissions',
  })
  @ApiResponse({ status: 200, description: 'Claims retrieved.' })
  @ApiResponse({ status: 401, description: 'Missing or invalid token.' })
  me(@CurrentUser() user: JwtUser) {
    // Permissions are re-read from the DB rather than taken from the token, so
    // a grant revoked after the token was issued takes effect immediately.
    return this.authService.me(user);
  }

  /**
   * Step one of recovery.
   *
   * Returns the same 200 and the same sentence whether or not the address
   * belongs to an account. That is the point: a distinguishable response —
   * a 404, a different message, even a materially faster reply — makes this a
   * free tool for discovering who works here, which is a disclosure in its own
   * right and the first step of a targeted phishing campaign.
   *
   * Rate-limited per (email, IP). Keyed on both so that flooding one mailbox is
   * capped, while a shared office address does not exhaust everyone's quota.
   */
  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 5, windowMs: 60 * 60 * 1000, keyBy: 'email+ip' })
  @Post('forgot-password')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Request a password reset link',
    description:
      'Always returns 200 with a generic message, whether or not the address is registered, so the endpoint cannot be used to enumerate accounts.',
  })
  @ApiResponse({ status: 200, description: 'Request accepted.' })
  @ApiResponse({ status: 429, description: 'Too many requests.' })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @Req() req: Request,
  ): Promise<{ message: string }> {
    await this.passwordResetService.request(dto.email, req.ip);

    return {
      message:
        'If that email address matches an account, a password reset link is on its way.',
    };
  }

  /**
   * Reports whether a link is still redeemable, without consuming it.
   *
   * Lets the UI say "this link has expired" up front instead of after the user
   * has typed a new password twice. The token is a query param here — unlike on
   * the redeem route — because this is a side-effect-free read the UI performs
   * on page load, where a body is not available.
   */
  @Public()
  @Get('reset-password/validate')
  @ApiQuery({ name: 'token', required: true })
  @ApiOperation({ summary: 'Check whether a reset link is still valid' })
  @ApiResponse({
    status: 200,
    description: 'Validity reported as `{ valid, reason?, email? }`.',
  })
  validateResetToken(@Query('token') token?: string) {
    if (!token) {
      return { valid: false, reason: 'This reset link is not recognised.' };
    }

    return this.passwordResetService.validate(token);
  }

  /**
   * Step two: consume the link and set the new password.
   *
   * Keyed by IP alone — the token is the secret being guessed here, and there is
   * no email in the body to key on. The limit is the backstop behind 256 bits of
   * entropy rather than the primary defence.
   */
  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 10, windowMs: 60 * 60 * 1000, keyBy: 'ip' })
  @Post('reset-password')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Set a new password using a reset link',
    description:
      'Single-use. Redeeming revokes every live session for the account, so a stolen refresh cookie stops working immediately.',
  })
  @ApiResponse({ status: 200, description: 'Password reset.' })
  @ApiResponse({
    status: 400,
    description: 'Link invalid, expired, already used, or password rejected.',
  })
  @ApiResponse({ status: 429, description: 'Too many requests.' })
  resetPassword(
    @Body() dto: ResetPasswordWithTokenDto,
    @Req() req: Request,
  ): Promise<{ message: string }> {
    return this.passwordResetService.redeem(dto.token, dto.new_password, req.ip);
  }

  /**
   * Authenticated self-service password change.
   *
   * A thin alias over `UserService.changeOwnPassword`, which already owns the
   * current-password check, the `password_reset_allowed` gate, and the audit
   * write. It exists because the frontend has always called this URL; delegating
   * keeps one implementation rather than a second copy that can drift from the
   * one behind `POST /users/me/change-password`.
   */
  @Post('change-password')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Change your own password',
    description:
      'Requires the current password. Enforces the strength policy and rejects recently used passwords.',
  })
  @ApiResponse({ status: 200, description: 'Password changed.' })
  @ApiResponse({
    status: 400,
    description: 'Current password wrong, or the new one was rejected.',
  })
  @ApiResponse({ status: 403, description: 'Password changes disabled.' })
  changePassword(
    @Body() dto: ChangeOwnPasswordDto,
    @CurrentUser() user: JwtUser,
    @Req() req: Request,
  ): Promise<{ message: string }> {
    return this.userService.changeOwnPassword(
      user.user_id,
      dto,
      actorFrom(user, req),
    );
  }
}
