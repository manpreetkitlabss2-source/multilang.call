import { SUPPORTED_LANGUAGES, type SupportedLanguageCode } from "@multilang-call/shared";

interface LanguageSelectorProps {
  label?: string;
  value: SupportedLanguageCode;
  onChange: (value: SupportedLanguageCode) => void;
}

const LanguageSelector = ({
  label = "Preferred language",
  value,
  onChange
}: LanguageSelectorProps) => (
  <label className="flex flex-col gap-2 text-sm font-medium text-ink">
    <span>{label}</span>
    <select
      className="rounded-2xl border border-teal-200 bg-white px-4 py-3 shadow-sm outline-none transition focus:border-accent"
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
