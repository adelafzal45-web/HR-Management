import { useState } from "react";
import { Users, DollarSign } from "lucide-react";
import GlobalFilterPanel, {
  type FilterPage,
  type FilterSelection,
} from "../../../components/filters/GlobalFilterPanel";

// ============================================================================
// Realistic filter definitions for two HR pages.
// ============================================================================

const FILTER_PAGES: FilterPage[] = [
  {
    key: "employees",
    label: "Employees",
    categories: [
      {
        key: "department",
        label: "Department",
        required: true,
        options: [
          { value: "eng", label: "Engineering", count: 42 },
          { value: "product", label: "Product", count: 18 },
          { value: "design", label: "Design", count: 12 },
          { value: "sales", label: "Sales", count: 28 },
          { value: "marketing", label: "Marketing", count: 15 },
          { value: "hr", label: "Human Resources", count: 8 },
          { value: "finance", label: "Finance", count: 11 },
        ],
      },
      {
        key: "designation",
        label: "Designation",
        options: [
          {
            value: "leadership",
            label: "Leadership",
            count: 12,
            children: [
              { value: "cxo", label: "C-Level", count: 5 },
              { value: "vp", label: "Vice President", count: 7 },
            ],
          },
          {
            value: "management",
            label: "Management",
            count: 23,
            children: [
              { value: "director", label: "Director", count: 9 },
              { value: "manager", label: "Manager", count: 14 },
            ],
          },
          {
            value: "ic",
            label: "Individual Contributor",
            count: 99,
            children: [
              { value: "senior", label: "Senior", count: 34 },
              { value: "mid", label: "Mid-level", count: 41 },
              { value: "junior", label: "Junior", count: 24 },
            ],
          },
        ],
      },
      {
        key: "status",
        label: "Employment Status",
        options: [
          { value: "active", label: "Active", count: 128 },
          { value: "probation", label: "On Probation", count: 6 },
          { value: "leave", label: "On Leave", count: 4 },
          { value: "notice", label: "Notice Period", count: 2 },
        ],
      },
      {
        key: "location",
        label: "Location",
        options: [
          { value: "hq", label: "Headquarters (SF)", count: 87 },
          { value: "austin", label: "Austin Office", count: 31 },
          { value: "remote-us", label: "Remote (US)", count: 16 },
          { value: "remote-intl", label: "Remote (International)", count: 6 },
        ],
      },
    ],
  },
  {
    key: "payroll",
    label: "Payroll",
    categories: [
      {
        key: "period",
        label: "Pay Period",
        required: true,
        searchPlaceholder: "Search periods…",
        options: [
          { value: "2026-08", label: "August 2026", count: 134 },
          { value: "2026-07", label: "July 2026", count: 134 },
          { value: "2026-06", label: "June 2026", count: 131 },
          { value: "2026-05", label: "May 2026", count: 128 },
          { value: "2026-04", label: "April 2026", count: 125 },
          { value: "2026-03", label: "March 2026", count: 122 },
        ],
      },
      {
        key: "department",
        label: "Department",
        options: [
          { value: "eng", label: "Engineering", count: 42 },
          { value: "product", label: "Product", count: 18 },
          { value: "design", label: "Design", count: 12 },
          { value: "sales", label: "Sales", count: 28 },
          { value: "marketing", label: "Marketing", count: 15 },
          { value: "hr", label: "Human Resources", count: 8 },
          { value: "finance", label: "Finance", count: 11 },
        ],
      },
      {
        key: "payType",
        label: "Pay Type",
        options: [
          { value: "salary", label: "Salary", count: 118 },
          { value: "hourly", label: "Hourly", count: 12 },
          { value: "contract", label: "Contract", count: 4 },
        ],
      },
    ],
  },
];

// ============================================================================
// Mock employee data that the filters actually narrow.
// ============================================================================

type Employee = {
  id: string;
  name: string;
  department: string;
  designation: string;
  status: string;
  location: string;
};

const MOCK_EMPLOYEES: Employee[] = [
  { id: "1", name: "Sarah Chen", department: "eng", designation: "senior", status: "active", location: "hq" },
  { id: "2", name: "Marcus Rodriguez", department: "eng", designation: "mid", status: "active", location: "austin" },
  { id: "3", name: "Priya Sharma", department: "product", designation: "director", status: "active", location: "hq" },
  { id: "4", name: "James Wilson", department: "sales", designation: "manager", status: "active", location: "remote-us" },
  { id: "5", name: "Emily Taylor", department: "design", designation: "senior", status: "active", location: "hq" },
  { id: "6", name: "Ahmed Hassan", department: "eng", designation: "cxo", status: "active", location: "hq" },
  { id: "7", name: "Olivia Martinez", department: "marketing", designation: "mid", status: "probation", location: "austin" },
  { id: "8", name: "David Park", department: "finance", designation: "vp", status: "active", location: "hq" },
  { id: "9", name: "Rachel Kim", department: "hr", designation: "manager", status: "active", location: "hq" },
  { id: "10", name: "Tom Anderson", department: "eng", designation: "junior", status: "active", location: "remote-intl" },
  { id: "11", name: "Sofia Patel", department: "sales", designation: "senior", status: "notice", location: "austin" },
  { id: "12", name: "Michael Brown", department: "product", designation: "mid", status: "active", location: "hq" },
  { id: "13", name: "Lisa Wong", department: "design", designation: "junior", status: "active", location: "remote-us" },
  { id: "14", name: "Daniel Lee", department: "eng", designation: "senior", status: "leave", location: "hq" },
  { id: "15", name: "Anna Schmidt", department: "marketing", designation: "director", status: "active", location: "hq" },
];

// ============================================================================
// Demo page.
// ============================================================================

export default function FilterPanelDemo() {
  const [activePage, setActivePage] = useState("employees");
  const [applied, setApplied] = useState<FilterSelection>({
    department: ["eng", "product", "design"],
    status: ["active"],
  });

  // Filter the mock data based on what the user applied.
  const filtered = MOCK_EMPLOYEES.filter((employee) => {
    const depts = applied.department ?? [];
    const desigs = applied.designation ?? [];
    const statuses = applied.status ?? [];
    const locs = applied.location ?? [];

    if (depts.length > 0 && !depts.includes(employee.department)) return false;
    if (desigs.length > 0 && !desigs.includes(employee.designation)) return false;
    if (statuses.length > 0 && !statuses.includes(employee.status)) return false;
    if (locs.length > 0 && !locs.includes(employee.location)) return false;

    return true;
  });

  const labelFor = (categoryKey: string, value: string) => {
    const page = FILTER_PAGES.find((p) => p.key === activePage);
    const category = page?.categories.find((c) => c.key === categoryKey);
    type Option = NonNullable<typeof category>["options"][number];
    const flatten = (opts: Option[]): Option[] =>
      opts.flatMap((o) => [o, ...flatten(o.children ?? [])]);
    return flatten(category?.options ?? []).find((o) => o.value === value)?.label ?? value;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-7xl">
        {/* Page header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Global Filter Panel Demo</h1>
          <p className="mt-1 text-sm text-gray-500">
            Enterprise-grade filtering for HR pages — compact, restrained, and data-driven.
          </p>
        </div>

        {/* The panel itself */}
        <GlobalFilterPanel
          pages={FILTER_PAGES}
          activePageKey={activePage}
          onPageChange={(key) => {
            setActivePage(key);
            // Switching pages resets filters — each page defines its own categories.
            setApplied(key === "employees" ? { status: ["active"] } : { period: ["2026-08"] });
          }}
          value={applied}
          defaults={activePage === "employees" ? { status: ["active"] } : { period: ["2026-08"] }}
          onApply={setApplied}
          className="mb-6"
        />

        {/* Results table — live, filtered by `applied` */}
        {activePage === "employees" && (
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 bg-gray-50/50 px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users size={16} className="text-gray-500" />
                  <h2 className="text-sm font-semibold text-gray-700">Employee Results</h2>
                </div>
                <span className="text-xs text-gray-500">
                  {filtered.length} of {MOCK_EMPLOYEES.length} employees
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-50/30">
                  <tr>
                    <th className="px-4 py-2.5 font-medium text-gray-700">Name</th>
                    <th className="px-4 py-2.5 font-medium text-gray-700">Department</th>
                    <th className="px-4 py-2.5 font-medium text-gray-700">Designation</th>
                    <th className="px-4 py-2.5 font-medium text-gray-700">Status</th>
                    <th className="px-4 py-2.5 font-medium text-gray-700">Location</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                        No employees match the selected filters.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((emp) => (
                      <tr key={emp.id} className="hover:bg-gray-50/50">
                        <td className="px-4 py-2.5 font-medium text-gray-900">{emp.name}</td>
                        <td className="px-4 py-2.5 text-gray-600">{labelFor("department", emp.department)}</td>
                        <td className="px-4 py-2.5 text-gray-600">{labelFor("designation", emp.designation)}</td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                              emp.status === "active"
                                ? "bg-green-50 text-green-700"
                                : emp.status === "probation"
                                  ? "bg-amber-50 text-amber-700"
                                  : emp.status === "leave"
                                    ? "bg-blue-50 text-blue-700"
                                    : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {labelFor("status", emp.status)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-600">{labelFor("location", emp.location)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activePage === "payroll" && (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
            <DollarSign size={32} className="mx-auto mb-3 text-gray-400" />
            <h3 className="mb-1 text-sm font-semibold text-gray-700">Payroll View</h3>
            <p className="text-xs text-gray-500">
              A real payroll table would go here, filtered by Pay Period / Department / Pay Type.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
