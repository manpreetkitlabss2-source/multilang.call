import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { SUPPORTED_LANGUAGES } from "@multilang-call/shared";
const LanguageSelector = ({ label = "Preferred language", value, onChange, variant = "light" }) => (_jsxs("label", { className: `flex flex-col gap-2 text-sm font-medium ${variant === "dark" ? "text-white" : "text-ink"}`, children: [_jsx("span", { children: label }), _jsx("select", { className: variant === "dark"
                ? "rounded-2xl border border-teal-200 bg-white px-4 py-3 outline-none focus:border-accent"
                : "rounded-2xl border border-teal-200 bg-white px-4 py-3 outline-none focus:border-accent", value: value, onChange: (event) => onChange(event.target.value), children: SUPPORTED_LANGUAGES.map((language) => (_jsx("option", { value: language.code, children: language.label }, language.code))) })] }));
export default LanguageSelector;
