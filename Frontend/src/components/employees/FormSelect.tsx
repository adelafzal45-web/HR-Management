type Option = { value: string; label: string };

export default function FormSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label className="mb-5 block">
      <span className="mb-2 block text-[15px] font-medium text-gray-900 dark:text-gray-100">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg bg-gray-100 px-4 py-3.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60 dark:bg-gray-800 dark:text-gray-100"
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {hint && <span className="mt-1.5 block text-xs text-gray-400 dark:text-gray-500">{hint}</span>}
    </label>
  );
}
