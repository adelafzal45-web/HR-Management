import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';

import { User } from '../users/user.entity';
import { AuthorizationService } from '../authorization/authorization.service';
import { JWT_EXPIRES_IN, JWT_SECRET, type JwtUser } from './auth.constants';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenService } from './refresh-token.service';

/** Must match the cost factor UserService hashes with. */
const BCRYPT_ROUNDS = 12;

/**
 * Which client a sign-in came from, checked against the account's
 * web/mobile/api login flags.
 */
export type LoginChannel = 'web' | 'mobile' | 'api';

/** Header a non-browser client sets to declare which channel it is. */
export const LOGIN_CHANNEL_HEADER = 'x-client-type';

/**
 * Derives the login channel from the request headers.
 *
 * Defaults to 'web' because that is the only client that cannot set a custom
 * header on its own behalf without being written to. An unrecognised value is
 * treated as 'web' rather than rejected: the channel flags are an
 * administrative policy over legitimate clients, so an unknown client string
 * should fall back to the most restricted-by-default channel, not bypass the
 * check by matching nothing.
 */
export function loginChannelFrom(req: {
  headers: Record<string, string | string[] | undefined>;
}): LoginChannel {
  const raw = req.headers[LOGIN_CHANNEL_HEADER];
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim().toLowerCase();

  switch (value) {
    case 'mobile':
      return 'mobile';
    case 'api':
      return 'api';
    default:
      return 'web';
  }
}

/** Maps a backend role name to the enum the frontend routes/nav key off. */
export type FrontendRole =
  | 'administrator'
  | 'hr_manager'
  | 'team_lead'
  | 'employee';

function toFrontendRole(roleName?: string | null): FrontendRole {
  switch ((roleName ?? '').toLowerCase()) {
    case 'admin':
    case 'administrator':
    case 'super admin':
      return 'administrator';
    // 'HR Admin' is the role seeded by SeedThreeRoleRbac; the others are
    // pre-existing names kept so older data still maps to the right screens.
    case 'hr admin':
    case 'hr manager':
    case 'hr':
      return 'hr_manager';
    case 'team lead':
    case 'department head':
    case 'manager':
      return 'team_lead';
    default:
      return 'employee';
  }
}

export interface LoginResult {
  token: string;
  /**
   * The refresh token. The controller moves this into an httpOnly cookie and
   * strips it from the response body — it must never reach client JavaScript,
   * or the cookie's XSS protection is pointless.
   */
  refreshToken: string;
  user: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    jobTitle?: string;
    avatarUrl?: string;
    /** 128px derivative, for the navbar and other small renderings. */
    avatarThumbUrl?: string;
    employeeId: string;
    role: FrontendRole;
    /** Backend `role_name` exactly as stored, e.g. 'HR Admin'. */
    roleName: string | null;
    roleId: string | null;
  };
  /**
   * The caller's live permission set, so the frontend can gate its UI without
   * reading the RBAC config endpoints (which are HR-only). This is a mirror of
   * what the server enforces, not a substitute for it.
   */
  permissions: string[];
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly authorizationService: AuthorizationService,
    private readonly refreshTokenService: RefreshTokenService,
  ) {}

  /**
   * Verifies credentials. Hash-tolerant: existing seed users have plaintext
   * passwords, while any password we hash going forward starts with `$2`.
   *
   * A plaintext password that verifies is re-hashed in place. Without this the
   * legacy rows would stay in plaintext indefinitely, since nothing else
   * rewrites a password the user never changes.
   */
  async validateUser(
    email: string,
    password: string,
    channel: LoginChannel = 'web',
  ): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { email },
      relations: {
        role: true,
        designation: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const stored = user.password ?? '';
    const looksHashed = stored.startsWith('$2');
    const ok = looksHashed
      ? await bcrypt.compare(password, stored)
      : stored === password;

    if (!ok) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!looksHashed) {
      user.password = await bcrypt.hash(password, BCRYPT_ROUNDS);
      await this.userRepository.save(user);
    }

    // Account-state checks run only after the password is verified. Doing them
    // first would let an unauthenticated caller distinguish "disabled account"
    // from "wrong password" and so enumerate valid addresses.
    this.assertAccountMayLogIn(user, channel);

    return user;
  }

  /**
   * Enforces the account-state flags an administrator controls.
   *
   * The channel check is policy for legitimate clients, not a security
   * boundary: `channel` is derived from a client-supplied header, so a caller
   * holding valid credentials could claim a permitted channel. `login_enabled`
   * and `status` are the checks that genuinely hold, since they refuse the
   * session outright.
   */
  private assertAccountMayLogIn(user: User, channel: LoginChannel): void {
    if (!user.login_enabled) {
      throw new UnauthorizedException(
        'This account has been disabled. Please contact your administrator.',
      );
    }

    if (!user.status) {
      throw new UnauthorizedException(
        'This employee record is inactive. Please contact your administrator.',
      );
    }

    if (channel === 'web' && !user.web_login_allowed) {
      throw new UnauthorizedException(
        'Web sign-in is not permitted for this account.',
      );
    }

    if (channel === 'mobile' && !user.mobile_login_allowed) {
      throw new UnauthorizedException(
        'Mobile sign-in is not permitted for this account.',
      );
    }

    if (channel === 'api' && !user.api_access_allowed) {
      throw new UnauthorizedException(
        'API access is not permitted for this account.',
      );
    }
  }

  /** Projects a User row into the shape the frontend consumes. */
  private toUserPayload(user: User): LoginResult['user'] {
    const roleName = user.role?.role_name ?? null;
    return {
      firstName: user.first_name,
      lastName: user.last_name,
      email: user.email,
      phone: user.phone,
      jobTitle: user.designation?.title,
      avatarUrl: user.profile_image,
      avatarThumbUrl: user.profile_image_thumb,
      employeeId: user.user_id,
      role: toFrontendRole(roleName),
      roleName,
      roleId: user.role?.role_id ?? null,
    };
  }

  /** Signs a short-lived access token for a user. */
  private signAccessToken(user: User): Promise<string> {
    return this.jwtService.signAsync(
      {
        sub: user.user_id,
        email: user.email,
        role: user.role?.role_name ?? null,
      },
      { secret: JWT_SECRET, expiresIn: JWT_EXPIRES_IN },
    );
  }

  async login(
    dto: LoginDto,
    channel: LoginChannel = 'web',
  ): Promise<LoginResult> {
    const user = await this.validateUser(dto.email, dto.password, channel);

    const token = await this.signAccessToken(user);
    const refreshToken = await this.refreshTokenService.issue(user);

    const permissions = await this.authorizationService.getPermissionsForUser(
      user.user_id,
    );

    return {
      token,
      refreshToken,
      user: this.toUserPayload(user),
      permissions,
    };
  }

  /**
   * Exchanges a valid refresh token for a new access token.
   *
   * The refresh token is rotated (old one revoked) by RefreshTokenService, so
   * the caller must also replace the stored cookie with the returned one.
   * Permissions are re-read here rather than carried over, so a grant changed
   * mid-session takes effect at the next refresh instead of persisting for the
   * life of the session.
   */
  async refresh(rawRefreshToken: string): Promise<LoginResult> {
    const { token: refreshToken, user } =
      await this.refreshTokenService.rotate(rawRefreshToken);

    // Re-checked on every refresh, not just at login. An access token lives 15
    // minutes but a refresh token lives 7 days, so without this an account
    // disabled by HR would keep minting valid sessions for a week.
    this.assertAccountMayLogIn(user, 'web');

    const token = await this.signAccessToken(user);
    const permissions = await this.authorizationService.getPermissionsForUser(
      user.user_id,
    );

    return {
      token,
      refreshToken,
      user: this.toUserPayload(user),
      permissions,
    };
  }

  /** Revokes a refresh token server-side, so logout survives the cookie. */
  async logout(rawRefreshToken: string | undefined): Promise<void> {
    if (rawRefreshToken) {
      await this.refreshTokenService.revoke(rawRefreshToken);
    }
  }

  /**
   * Re-resolves the caller from their token claims. Used on app boot so a
   * stored session is re-validated against current server state instead of
   * being trusted from localStorage.
   */
  async me(
    claims: JwtUser,
  ): Promise<Omit<LoginResult, 'token' | 'refreshToken'>> {
    const user = await this.userRepository.findOne({
      where: { user_id: claims.user_id },
      relations: { role: true, designation: true },
    });

    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    const permissions = await this.authorizationService.getPermissionsForUser(
      user.user_id,
    );

    return {
      user: this.toUserPayload(user),
      permissions,
    };
  }
}
