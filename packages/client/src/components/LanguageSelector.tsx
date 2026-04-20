import { SUPPORTED_LANGUAGES, type SupportedLanguageCode } from "@multilang-call/shared";

interface LanguageSelectorProps {
  label?: string;
  value: SupportedLanguageCode;
  onChange: (value: SupportedLanguageCode) => void;
  variant?: "light" | "dark";
}

const LanguageSelector = ({
  label = "Preferred language",
  value,
  onChange,
  variant = "light"
}: LanguageSelectorProps) => (
  <label
    className={`flex flex-col gap-2 text-sm font-medium ${
      variant === "dark" ? "text-white" : "text-ink"
    }`}
  >
    <span>{label}</span>
    <select
      className={
        variant === "dark"
          ? "rounded-2xl border border-teal-200 bg-white px-4 py-3 outline-none focus:border-accent"
          : "rounded-2xl border border-teal-200 bg-white px-4 py-3 outline-none focus:border-accent"
      }
      value={value}
      onChange={(event) => onChange(event.target.value as SupportedLanguageCode)}
    >
      {SUPPORTED_LANGUAGES.map((language) => (
        <option key={language.code} value={language.code}>
          {language.label}
        </option>
      ))}
    </select>
  </label>
);

export default LanguageSelector;
