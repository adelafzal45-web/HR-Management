/**
 * Token-driven UI kit. Every primitive here consumes design tokens (semantic
 * colours, radii, shadows, typography from tailwind.config.js → CSS vars), so a
 * saved theme restyles the whole app with no code change. Prefer these over
 * hand-rolled markup; compose them rather than duplicating their class strings.
 */
export { Button } from "./Button";
export type { ButtonProps, ButtonVariant, ButtonSize } from "./Button";

export { Input } from "./Input";
export type { InputProps } from "./Input";

export { Select } from "./Select";
export type { SelectProps } from "./Select";

export { Card, CardHeader, CardBody, CardFooter } from "./Card";
export type { CardProps } from "./Card";

export { Badge } from "./Badge";
export type { BadgeProps, BadgeTone, BadgeVariant } from "./Badge";

export { Alert } from "./Alert";
export type { AlertProps, AlertTone } from "./Alert";

export { Menu, MenuItem, MenuLabel, MenuSeparator } from "./Menu";
export type { MenuProps, MenuItemProps } from "./Menu";

export { Pagination, buildPageWindow } from "./Pagination";
export type { PaginationProps } from "./Pagination";
