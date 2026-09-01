import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

import type {
  ShadowLevel,
  SidebarStyle,
  ThemeDensity,
  ThemeMode,
} from '../theme-config.type';

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
const HEX_MESSAGE = 'must be a valid 6-digit hex colour (e.g. #F1B344)';

/**
 * One full semantic colour set (used for both the light and dark schemes).
 *
 * Every field is optional so a partial theme still validates, but any value
 * present must be a `#rrggbb` hex — the frontend converts these to RGB channels
 * and an unchecked value would break `rgb(var(--x) / <alpha>)`.
 */
export class ThemeColorSetDto {
  @IsOptional() @Matches(HEX_COLOR, { message: `accent ${HEX_MESSAGE}` })
  accent?: string;

  @IsOptional() @Matches(HEX_COLOR, { message: `background ${HEX_MESSAGE}` })
  background?: string;

  @IsOptional() @Matches(HEX_COLOR, { message: `surface ${HEX_MESSAGE}` })
  surface?: string;

  @IsOptional() @Matches(HEX_COLOR, { message: `surfaceMuted ${HEX_MESSAGE}` })
  surfaceMuted?: string;

  @IsOptional() @Matches(HEX_COLOR, { message: `foreground ${HEX_MESSAGE}` })
  foreground?: string;

  @IsOptional() @Matches(HEX_COLOR, { message: `muted ${HEX_MESSAGE}` })
  muted?: string;

  @IsOptional() @Matches(HEX_COLOR, { message: `mutedForeground ${HEX_MESSAGE}` })
  mutedForeground?: string;

  @IsOptional() @Matches(HEX_COLOR, { message: `border ${HEX_MESSAGE}` })
  border?: string;

  @IsOptional() @Matches(HEX_COLOR, { message: `borderMuted ${HEX_MESSAGE}` })
  borderMuted?: string;

  @IsOptional() @Matches(HEX_COLOR, { message: `success ${HEX_MESSAGE}` })
  success?: string;

  @IsOptional() @Matches(HEX_COLOR, { message: `warning ${HEX_MESSAGE}` })
  warning?: string;

  @IsOptional() @Matches(HEX_COLOR, { message: `error ${HEX_MESSAGE}` })
  error?: string;

  @IsOptional() @Matches(HEX_COLOR, { message: `info ${HEX_MESSAGE}` })
  info?: string;
}

class ThemeColorsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ThemeColorSetDto)
  light?: ThemeColorSetDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ThemeColorSetDto)
  dark?: ThemeColorSetDto;
}

class ThemeRadiusDto {
  @IsOptional() @IsInt() @Min(0) @Max(40) control?: number;
  @IsOptional() @IsInt() @Min(0) @Max(40) card?: number;
  @IsOptional() @IsInt() @Min(0) @Max(40) modal?: number;
}

class ThemeTypographyDto {
  @IsOptional() @IsString() @MaxLength(200) fontFamily?: string;
  @IsOptional() @IsNumber() @Min(12) @Max(22) baseSize?: number;
  @IsOptional() @IsNumber() @Min(1) @Max(1.6) scale?: number;
}

class ThemeLayoutDto {
  @IsOptional() @IsInt() @Min(200) @Max(400) sidebarWidth?: number;
  @IsOptional() @IsInt() @Min(56) @Max(120) sidebarCollapsedWidth?: number;
  @IsOptional() @IsInt() @Min(960) @Max(2400) contentMaxWidth?: number;
  @IsOptional() @IsInt() @Min(48) @Max(96) headerHeight?: number;

  @IsOptional()
  @IsIn(['solid', 'floating'] satisfies SidebarStyle[])
  sidebarStyle?: SidebarStyle;
}

/**
 * The admin-configurable design theme, validated for the company-settings PATCH.
 *
 * The whole object is stored as one jsonb blob and replaced wholesale — the
 * frontend always sends the complete theme (DEFAULT_THEME merged with edits), so
 * fields are optional here only to tolerate forward/backward-compatible shapes,
 * not to support field-level PATCH.
 */
export class ThemeConfigDto {
  @ApiPropertyOptional({ enum: ['light', 'dark', 'system'] })
  @IsOptional()
  @IsIn(['light', 'dark', 'system'] satisfies ThemeMode[])
  mode?: ThemeMode;

  @ApiPropertyOptional({ enum: ['comfortable', 'compact'] })
  @IsOptional()
  @IsIn(['comfortable', 'compact'] satisfies ThemeDensity[])
  density?: ThemeDensity;

  @ApiPropertyOptional({ enum: ['none', 'sm', 'md', 'lg'] })
  @IsOptional()
  @IsIn(['none', 'sm', 'md', 'lg'] satisfies ShadowLevel[])
  shadow?: ShadowLevel;

  @IsOptional()
  @ValidateNested()
  @Type(() => ThemeColorsDto)
  colors?: ThemeColorsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ThemeRadiusDto)
  radius?: ThemeRadiusDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ThemeTypographyDto)
  typography?: ThemeTypographyDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ThemeLayoutDto)
  layout?: ThemeLayoutDto;
}
