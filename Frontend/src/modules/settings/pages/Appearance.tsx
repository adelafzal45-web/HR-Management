// ============================================================================
// Appearance — the admin-facing editor for the whole design system.
//
// Everything here writes a single draft `ThemeConfig` (the same blob stored in
// company_settings.theme_config) and previews it live via the ThemeProvider:
// every edit calls `previewTheme(draft)`, which applies the CSS variables to
// <html> instantly with no round-trip and no rebuild. "Save" persists the blob
// through the existing branding PATCH; "Reset to default" restores DEFAULT_THEME.
//
// The page deliberately does NOT touch logo / company name / brand colour — those
// remain on the Branding page (identity), so the same DB columns are never edited
// from two places. This page owns the theme layer only: semantic + status colours
// (light AND dark), typography, layout, component radii/shadow, and mode/density.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Check, Contrast, Eye, Layers, LayoutDashboard, Monitor, Moon, Palette, RotateCcw, Sun, Type } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Input,
  Pagination,
} from "@/components/ui";
import { FormField } from "@/components/forms/FormField";
import SearchableSelect, { type SelectOption } from "@/components/common/SearchableSelect";
import StatusBadge from "@/components/common/StatusBadge";
import SettingsLayout from "@/modules/settings/pages/SettingsLayout";
import { useTheme } from "@/app/providers/ThemeContext";
import { useBranding } from "@/app/providers/BrandingContext";
import { useToast } from "@/app/providers/ToastContext";
import {
  DEFAULT_THEME,
  parseHexColor,
  resolveThemeMode,
  type ShadowLevel,
  type ThemeColorSet,
  type ThemeConfig,
  type ThemeDensity,
  type ThemeMode,
  type SidebarStyle,
} from "@/lib/theme";
import { cn } from "@/lib/cn";

// ---- small pure helpers ----------------------------------------------------

const cloneTheme = (t: ThemeConfig): ThemeConfig => JSON.parse(JSON.stringify(t));

/** Order-insensitive structural equality — the dirty check must not flip just
 *  because two equal themes were built with a different key order (e.g. after a
 *  "Reset to default" rebuilds the object from DEFAULT_THEME's key order). */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  const ka = Object.keys(a as Record<string, unknown>);
  const kb = Object.keys(b as Record<string, unknown>);
  if (ka.length !== kb.length) return false;
  return ka.every((k) =>
    deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
}

/** Normalises any parseable hex to `#RRGGBB` uppercase; passes junk through so
 *  the text field can show an in-progress value without snapping it back. */
function normHex(value: string): string {
  const rgb = parseHexColor(value);
  if (!rgb) return value;
  return `#${[rgb.r, rgb.g, rgb.b].map((c) => c.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

// ---- reusable field controls (local to this page) --------------------------

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  // Keep the local text in sync when the draft value changes from elsewhere
  // (scheme switch, reset) without losing mid-typing state during direct edits.
  useEffect(() => setText(value), [value]);

  const parsed = parseHexColor(text);
  const commit = (v: string) => {
    setText(v);
    if (parseHexColor(v)) onChange(normHex(v));
  };

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} colour`}
          value={parsed ? normHex(text) : "#000000"}
          onChange={(e) => commit(e.target.value)}
          className="h-10 w-12 shrink-0 cursor-pointer rounded-control border border-border bg-surface p-1"
        />
        <Input
          value={text}
          onChange={(e) => commit(e.target.value)}
          spellCheck={false}
          invalid={!parsed}
          aria-label={label}
          className="font-mono uppercase"
        />
      </div>
    </div>
  );
}

function RangeField({
  label,
  min,
  max,
  step = 1,
  value,
  onChange,
  format,
}: {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="rounded-pill bg-surface-muted px-2 py-0.5 font-mono text-xs text-muted">
          {format ? format(value) : value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="w-full cursor-pointer accent-brand"
      />
    </div>
  );
}

type SegOption<T extends string> = { value: T; label: string; icon?: ReactNode };

function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: SegOption<T>[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="inline-flex flex-wrap gap-1 rounded-control bg-surface-muted p-1">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-control px-3 py-1.5 text-sm font-medium transition",
              active ? "bg-surface text-foreground shadow-card" : "text-muted hover:text-foreground",
            )}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ---- static option data ----------------------------------------------------

const SURFACE_KEYS: { key: keyof ThemeColorSet; label: string }[] = [
  { key: "background", label: "Background" },
  { key: "surface", label: "Surface" },
  { key: "surfaceMuted", label: "Surface muted" },
  { key: "foreground", label: "Foreground / text" },
  { key: "muted", label: "Muted text" },
  { key: "mutedForeground", label: "Subtle text / icons" },
  { key: "border", label: "Border" },
  { key: "borderMuted", label: "Border muted" },
];

const STATUS_KEYS: { key: keyof ThemeColorSet; label: string }[] = [
  { key: "success", label: "Success" },
  { key: "warning", label: "Warning" },
  { key: "error", label: "Error" },
  { key: "info", label: "Info" },
];

const FONT_OPTIONS: SelectOption[] = [
  { value: '"Poppins", system-ui, sans-serif', label: "Poppins" },
  { value: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', label: "System default" },
  { value: '"Inter", system-ui, sans-serif', label: "Inter" },
  { value: '"Roboto", system-ui, sans-serif', label: "Roboto" },
  { value: '"Open Sans", system-ui, sans-serif', label: "Open Sans" },
  { value: '"Lato", system-ui, sans-serif', label: "Lato" },
  { value: '"Montserrat", system-ui, sans-serif', label: "Montserrat" },
  { value: '"Nunito", system-ui, sans-serif', label: "Nunito" },
  { value: 'Georgia, "Times New Roman", serif', label: "Georgia (serif)" },
  { value: 'ui-monospace, "SF Mono", "Cascadia Code", monospace', label: "Monospace" },
];

type SectionKey = "colors" | "theme" | "typography" | "layout" | "components";

const SECTIONS: { key: SectionKey; label: string; icon: ReactNode }[] = [
  { key: "colors", label: "Colours", icon: <Palette size={16} /> },
  { key: "theme", label: "Theme", icon: <Contrast size={16} /> },
  { key: "typography", label: "Typography", icon: <Type size={16} /> },
  { key: "layout", label: "Layout", icon: <LayoutDashboard size={16} /> },
  { key: "components", label: "Components", icon: <Layers size={16} /> },
];

// ---- live preview panel ----------------------------------------------------
// Colours / radii / shadow / font come from the CSS variables the ThemeProvider
// has already applied for the draft, so those samples restyle themselves. The
// type specimen reads the draft directly because app headings aren't wired to
// the scale variable — this makes the scale slider visibly do something.

function PreviewPanel({ theme }: { theme: ThemeConfig }) {
  const effectiveMode = resolveThemeMode(theme.mode);
  const modeLabel = theme.mode === "system" ? `System · ${effectiveMode}` : theme.mode;
  const { baseSize, scale } = theme.typography;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Eye size={16} className="text-muted" />
          <h2 className="text-sm font-semibold text-foreground">Live preview</h2>
        </div>
        <Badge tone="brand" variant="soft" className="capitalize">
          {modeLabel}
        </Badge>
      </CardHeader>
      <CardBody className="space-y-5">
        {/* Buttons */}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="primary">Primary</Button>
          <Button size="sm" variant="secondary">Secondary</Button>
          <Button size="sm" variant="outline">Outline</Button>
          <Button size="sm" variant="ghost">Ghost</Button>
          <Button size="sm" variant="danger">Danger</Button>
          <span className="inline-flex items-center rounded-control bg-accent px-3 py-1.5 text-sm font-semibold text-accent-contrast">
            Accent
          </span>
        </div>

        {/* Type specimen — sizes derived from the draft so the scale is visible. */}
        <div className="rounded-card bg-background p-4">
          <p className="font-semibold text-foreground" style={{ fontSize: `${Math.round(baseSize * scale * scale)}px` }}>
            Heading
          </p>
          <p className="text-muted" style={{ fontSize: `${Math.round(baseSize * scale)}px` }}>
            Subheading
          </p>
          <p className="mt-1 text-foreground" style={{ fontSize: `${baseSize}px` }}>
            Body text renders in the selected typeface at the base size.
          </p>
        </div>

        {/* Input */}
        <FormField label="Sample field" placeholder="Type here…" />

        {/* Badges + statuses */}
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="brand" variant="soft">Brand</Badge>
          <Badge tone="success" variant="soft">Success</Badge>
          <Badge tone="warning" variant="soft">Warning</Badge>
          <Badge tone="error" variant="soft">Error</Badge>
          <Badge tone="info" variant="soft">Info</Badge>
          <Badge tone="neutral" variant="soft">Neutral</Badge>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <StatusBadge status="Approved" />
          <StatusBadge status="Pending" />
          <StatusBadge status="Rejected" />
        </div>

        {/* Alerts */}
        <Alert tone="success" title="Saved">Your changes look great in this theme.</Alert>
        <Alert tone="error" title="Something went wrong">A sample error message.</Alert>

        {/* Pagination */}
        <Pagination page={2} totalPages={5} onPageChange={() => {}} />
      </CardBody>
    </Card>
  );
}

// ---- page ------------------------------------------------------------------

export default function Appearance() {
  const { savedTheme, previewTheme, resetPreview } = useTheme();
  const { branding, updateBranding } = useBranding();
  const toast = useToast();

  const [draft, setDraft] = useState<ThemeConfig>(() => cloneTheme(savedTheme));
  const [activeSection, setActiveSection] = useState<SectionKey>("colors");
  const [editScheme, setEditScheme] = useState<"light" | "dark">("light");
  const [saving, setSaving] = useState(false);

  // Track the latest draft without making it an effect dependency (which would
  // re-run the resync below on every keystroke). oxlint runs exhaustive-deps;
  // a ref is the sanctioned way to read current state from a scoped effect.
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  // Branding loads asynchronously, so `savedTheme` can arrive after mount. Adopt
  // the freshly-loaded theme only when the user hasn't started editing, so a slow
  // fetch never clobbers in-progress changes.
  const lastSavedRef = useRef(savedTheme);
  useEffect(() => {
    if (savedTheme === lastSavedRef.current) return;
    const hadEdits = !deepEqual(draftRef.current, lastSavedRef.current);
    lastSavedRef.current = savedTheme;
    if (!hadEdits) setDraft(cloneTheme(savedTheme));
  }, [savedTheme]);

  const dirty = useMemo(() => !deepEqual(draft, savedTheme), [draft, savedTheme]);

  // Live preview: while on the Colours tab, force the previewed mode to the
  // scheme being edited so dark values are visible as you tune them — without
  // changing the mode that actually gets saved.
  useEffect(() => {
    const effective = activeSection === "colors" ? { ...draft, mode: editScheme as ThemeMode } : draft;
    previewTheme(effective);
  }, [draft, activeSection, editScheme, previewTheme]);

  // Drop the preview when leaving the page so the saved theme is what remains.
  useEffect(() => () => resetPreview(), [resetPreview]);

  // Warn before a full-page unload (reload / close / external nav) with edits.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // ---- immutable draft setters ----
  const setColor = useCallback((scheme: "light" | "dark", key: keyof ThemeColorSet, value: string) => {
    setDraft((d) => ({ ...d, colors: { ...d.colors, [scheme]: { ...d.colors[scheme], [key]: value } } }));
  }, []);
  const setMode = useCallback((mode: ThemeMode) => setDraft((d) => ({ ...d, mode })), []);
  const setDensity = useCallback((density: ThemeDensity) => setDraft((d) => ({ ...d, density })), []);
  const setShadow = useCallback((shadow: ShadowLevel) => setDraft((d) => ({ ...d, shadow })), []);
  const setRadius = useCallback((key: keyof ThemeConfig["radius"], value: number) => {
    setDraft((d) => ({ ...d, radius: { ...d.radius, [key]: value } }));
  }, []);
  const setTypography = useCallback((key: keyof ThemeConfig["typography"], value: string | number) => {
    setDraft((d) => ({ ...d, typography: { ...d.typography, [key]: value } }));
  }, []);
  const setLayout = useCallback((key: keyof ThemeConfig["layout"], value: number | SidebarStyle) => {
    setDraft((d) => ({ ...d, layout: { ...d.layout, [key]: value } }));
  }, []);

  const handleReset = useCallback(() => setDraft(cloneTheme(DEFAULT_THEME)), []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await updateBranding({ ...branding, themeConfig: draft });
      resetPreview(); // hand control back to the (now up-to-date) saved theme
      toast.showSuccess("Appearance saved", "Your theme is now live for everyone.");
    } catch (err) {
      toast.showError("Couldn't save appearance", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  }, [branding, draft, updateBranding, resetPreview, toast]);

  // Ensure the stored font is selectable even if it's not one of the presets.
  const fontOptions = useMemo<SelectOption[]>(() => {
    const current = draft.typography.fontFamily;
    if (FONT_OPTIONS.some((o) => o.value === current)) return FONT_OPTIONS;
    return [{ value: current, label: "Current" }, ...FONT_OPTIONS];
  }, [draft.typography.fontFamily]);

  const scheme = draft.colors[editScheme];

  return (
    <SettingsLayout activeTab="/settings/appearance">
      <div className="space-y-6">
        {/* Header + actions */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Appearance</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              Control the entire look and feel — colours, typography, layout and component styling — across light and
              dark mode. Changes preview instantly and apply to everyone once saved. Logo and brand colour live on the{" "}
              <Link to="/settings/branding" className="font-medium text-brand-dark underline-offset-2 hover:underline">
                Branding
              </Link>{" "}
              page.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {dirty && (
              <Badge tone="warning" variant="soft">
                Unsaved changes
              </Badge>
            )}
            <Button variant="outline" leftIcon={<RotateCcw size={16} />} onClick={handleReset} disabled={saving}>
              Reset to default
            </Button>
            <Button
              variant="primary"
              leftIcon={<Check size={16} />}
              loading={saving}
              disabled={!dirty}
              onClick={handleSave}
            >
              Save changes
            </Button>
          </div>
        </div>

        {/* Section tabs */}
        <div className="flex flex-wrap gap-1.5 rounded-card bg-surface p-2 shadow-card ring-1 ring-border-muted">
          {SECTIONS.map((s) => {
            const active = s.key === activeSection;
            return (
              <button
                key={s.key}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => setActiveSection(s.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-control px-3 py-2 text-sm font-medium transition xs:px-4",
                  active ? "bg-brand-light text-brand-dark" : "text-muted hover:bg-surface-muted hover:text-foreground",
                )}
              >
                {s.icon}
                <span>{s.label}</span>
              </button>
            );
          })}
        </div>

        {/* Controls + preview */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 space-y-6">
            {activeSection === "colors" && (
              <Card>
                <CardHeader>
                  <h2 className="text-sm font-semibold text-foreground">Colours</h2>
                  <Segmented
                    ariaLabel="Palette to edit"
                    value={editScheme}
                    onChange={setEditScheme}
                    options={[
                      { value: "light", label: "Light", icon: <Sun size={15} /> },
                      { value: "dark", label: "Dark", icon: <Moon size={15} /> },
                    ]}
                  />
                </CardHeader>
                <CardBody className="space-y-6">
                  <Alert tone="info">
                    You’re editing and previewing the <strong className="capitalize">{editScheme}</strong> palette.
                  </Alert>

                  <div>
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Accent</h3>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <ColorField
                        label="Accent"
                        value={scheme.accent}
                        onChange={(v) => setColor(editScheme, "accent", v)}
                      />
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Surfaces &amp; text
                    </h3>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {SURFACE_KEYS.map(({ key, label }) => (
                        <ColorField
                          key={key}
                          label={label}
                          value={scheme[key]}
                          onChange={(v) => setColor(editScheme, key, v)}
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</h3>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {STATUS_KEYS.map(({ key, label }) => (
                        <ColorField
                          key={key}
                          label={label}
                          value={scheme[key]}
                          onChange={(v) => setColor(editScheme, key, v)}
                        />
                      ))}
                    </div>
                  </div>
                </CardBody>
              </Card>
            )}

            {activeSection === "theme" && (
              <Card>
                <CardHeader>
                  <h2 className="text-sm font-semibold text-foreground">Theme</h2>
                </CardHeader>
                <CardBody className="space-y-6">
                  <div>
                    <span className="mb-2 block text-sm font-medium text-foreground">Mode</span>
                    <Segmented
                      ariaLabel="Colour mode"
                      value={draft.mode}
                      onChange={setMode}
                      options={[
                        { value: "light", label: "Light", icon: <Sun size={15} /> },
                        { value: "dark", label: "Dark", icon: <Moon size={15} /> },
                        { value: "system", label: "System", icon: <Monitor size={15} /> },
                      ]}
                    />
                    <p className="mt-2 text-xs text-muted">
                      System follows each user’s operating-system preference automatically.
                    </p>
                  </div>
                  <div>
                    <span className="mb-2 block text-sm font-medium text-foreground">Density</span>
                    <Segmented
                      ariaLabel="Layout density"
                      value={draft.density}
                      onChange={setDensity}
                      options={[
                        { value: "comfortable", label: "Comfortable" },
                        { value: "compact", label: "Compact" },
                      ]}
                    />
                    <p className="mt-2 text-xs text-muted">Compact tightens row heights and padding for dense tables.</p>
                  </div>
                </CardBody>
              </Card>
            )}

            {activeSection === "typography" && (
              <Card>
                <CardHeader>
                  <h2 className="text-sm font-semibold text-foreground">Typography</h2>
                </CardHeader>
                <CardBody className="space-y-6">
                  <div>
                    <span className="mb-1.5 block text-sm font-medium text-foreground">Font family</span>
                    <SearchableSelect
                      options={fontOptions}
                      value={draft.typography.fontFamily}
                      onChange={(v) => setTypography("fontFamily", v)}
                      placeholder="Select a font…"
                      searchPlaceholder="Search fonts…"
                    />
                    <p className="mt-2 text-xs text-muted">
                      Custom fonts fall back to the system typeface if not installed on the viewer’s device.
                    </p>
                  </div>
                  <RangeField
                    label="Base font size"
                    min={13}
                    max={18}
                    value={draft.typography.baseSize}
                    onChange={(v) => setTypography("baseSize", v)}
                    format={(v) => `${v}px`}
                  />
                  <RangeField
                    label="Heading scale"
                    min={1.1}
                    max={1.4}
                    step={0.025}
                    value={draft.typography.scale}
                    onChange={(v) => setTypography("scale", v)}
                    format={(v) => v.toFixed(3)}
                  />
                </CardBody>
              </Card>
            )}

            {activeSection === "layout" && (
              <Card>
                <CardHeader>
                  <h2 className="text-sm font-semibold text-foreground">Layout</h2>
                </CardHeader>
                <CardBody className="space-y-6">
                  <RangeField
                    label="Sidebar width"
                    min={220}
                    max={360}
                    step={4}
                    value={draft.layout.sidebarWidth}
                    onChange={(v) => setLayout("sidebarWidth", v)}
                    format={(v) => `${v}px`}
                  />
                  <RangeField
                    label="Collapsed sidebar width"
                    min={64}
                    max={112}
                    step={4}
                    value={draft.layout.sidebarCollapsedWidth}
                    onChange={(v) => setLayout("sidebarCollapsedWidth", v)}
                    format={(v) => `${v}px`}
                  />
                  <RangeField
                    label="Content max width"
                    min={1120}
                    max={1920}
                    step={20}
                    value={draft.layout.contentMaxWidth}
                    onChange={(v) => setLayout("contentMaxWidth", v)}
                    format={(v) => `${v}px`}
                  />
                  <RangeField
                    label="Header height"
                    min={52}
                    max={96}
                    step={2}
                    value={draft.layout.headerHeight}
                    onChange={(v) => setLayout("headerHeight", v)}
                    format={(v) => `${v}px`}
                  />
                  <div>
                    <span className="mb-2 block text-sm font-medium text-foreground">Sidebar style</span>
                    <Segmented
                      ariaLabel="Sidebar style"
                      value={draft.layout.sidebarStyle}
                      onChange={(v) => setLayout("sidebarStyle", v)}
                      options={[
                        { value: "solid", label: "Solid" },
                        { value: "floating", label: "Floating" },
                      ]}
                    />
                  </div>
                </CardBody>
              </Card>
            )}

            {activeSection === "components" && (
              <Card>
                <CardHeader>
                  <h2 className="text-sm font-semibold text-foreground">Components</h2>
                </CardHeader>
                <CardBody className="space-y-6">
                  <RangeField
                    label="Control radius (buttons, inputs)"
                    min={0}
                    max={20}
                    value={draft.radius.control}
                    onChange={(v) => setRadius("control", v)}
                    format={(v) => `${v}px`}
                  />
                  <RangeField
                    label="Card radius"
                    min={0}
                    max={28}
                    value={draft.radius.card}
                    onChange={(v) => setRadius("card", v)}
                    format={(v) => `${v}px`}
                  />
                  <RangeField
                    label="Modal radius"
                    min={0}
                    max={28}
                    value={draft.radius.modal}
                    onChange={(v) => setRadius("modal", v)}
                    format={(v) => `${v}px`}
                  />
                  <div>
                    <span className="mb-2 block text-sm font-medium text-foreground">Shadow depth</span>
                    <Segmented
                      ariaLabel="Shadow depth"
                      value={draft.shadow}
                      onChange={setShadow}
                      options={[
                        { value: "none", label: "None" },
                        { value: "sm", label: "Small" },
                        { value: "md", label: "Medium" },
                        { value: "lg", label: "Large" },
                      ]}
                    />
                  </div>
                </CardBody>
              </Card>
            )}
          </div>

          {/* Sticky live preview */}
          <div className="xl:sticky xl:top-4 xl:self-start">
            <PreviewPanel theme={draft} />
            <Card className="mt-4">
              <CardFooter className="justify-between border-t-0 px-5 py-4">
                <span className="text-xs text-muted">
                  {dirty ? "Unsaved changes — previewing" : "All changes saved"}
                </span>
                <Button
                  size="sm"
                  variant="primary"
                  leftIcon={<Check size={15} />}
                  loading={saving}
                  disabled={!dirty}
                  onClick={handleSave}
                >
                  Save
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      </div>
    </SettingsLayout>
  );
}
