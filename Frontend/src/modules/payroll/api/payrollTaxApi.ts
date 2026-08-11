// Income tax (spec §10) — a named, effective-dated, versioned set of
// progressive slabs. The engine resolves the active config for the period and
// runs each employee's annual taxable income through its slabs (annualized FBR
// salaried style), then divides by pay periods per year for the monthly line.
//
// `preview` runs a sample annual income through a config without touching a
// payslip — the tax analogue of the salary-component "Test Rule". Real backend
// or throw; bodies are snake_case to match CreateTaxConfigDto.

import { api, ENDPOINTS } from "@/lib/apiClient";

/** One progressive bracket. `upper_bound` null = the open-ended top slab. */
export type TaxSlab = {
  slab_id: string;
  tax_config_id: string;
  lower_bound: number;
  upper_bound: number | null;
  base_tax: number;
  rate_percent: number;
  display_order: number;
};

/** Mirrors TaxConfig (Backend/src/payroll-tax/payroll-tax.entity.ts). */
export type TaxConfig = {
  tax_config_id: string;
  name: string;
  regime: string | null;
  currency: string;
  annualize: boolean;
  is_active: boolean;
  slabs: TaxSlab[];
  effective_from: string | null;
  effective_to: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

/** A slab as the create/update body carries it (no ids — the server assigns them). */
export type TaxSlabPayload = {
  lower_bound: number;
  upper_bound?: number | null;
  base_tax: number;
  rate_percent: number;
  display_order?: number;
};

export type TaxConfigPayload = {
  name: string;
  regime?: string | null;
  currency?: string;
  annualize?: boolean;
  is_active?: boolean;
  slabs: TaxSlabPayload[];
  effective_from?: string | null;
  effective_to?: string | null;
};

/** The bracket that applied, echoed for the "Why?" note. */
export type TaxComputationSlab = {
  lower_bound: number;
  upper_bound: number | null;
  base_tax: number;
  rate_percent: number;
};

/** Result of `preview` — the full breakdown for a sample annual income. */
export type TaxPreview = {
  annual_taxable: number;
  annual_tax: number;
  monthly_tax: number;
  slab: TaxComputationSlab | null;
  note: string;
  config_name: string;
};

export type PreviewTaxPayload = {
  annual_taxable: number;
  tax_config_id?: string;
};

const { tax } = ENDPOINTS.payrollEngine;

export const payrollTaxApi = {
  list: (): Promise<TaxConfig[]> => api.get<TaxConfig[]>(tax.base),

  getById: (id: string): Promise<TaxConfig> =>
    api.get<TaxConfig>(tax.byId(id)),

  create: (payload: TaxConfigPayload): Promise<TaxConfig> =>
    api.post<TaxConfig>(tax.base, payload),

  update: (
    id: string,
    payload: Partial<TaxConfigPayload>,
  ): Promise<TaxConfig> => api.patch<TaxConfig>(tax.byId(id), payload),

  remove: (id: string): Promise<{ message: string }> =>
    api.delete<{ message: string }>(tax.byId(id)),

  /** Run a sample annual income through a config's slabs (no payslip touched). */
  preview: (payload: PreviewTaxPayload): Promise<TaxPreview> =>
    api.post<TaxPreview>(tax.preview, payload),
};
