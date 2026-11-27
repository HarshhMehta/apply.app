export const TEMPLATE_VARIABLES = [
  { key: "candidate_name", label: "Your name" },
  { key: "candidate_email", label: "Your professional email" },
  { key: "candidate_phone", label: "Your phone number" },
  { key: "job_role", label: "Job role" },
  { key: "company_name", label: "Company name (optional)" },
  { key: "recruiter_name", label: "Recruiter name (optional)" },
  { key: "current_title", label: "Your current job title" },
  { key: "years_experience", label: "Years of experience" },
  { key: "primary_skills", label: "Primary skills" },
  { key: "secondary_skills", label: "Secondary skills" },
  { key: "portfolio_url", label: "Portfolio URL" },
  { key: "linkedin_url", label: "LinkedIn URL" },
  { key: "github_url", label: "GitHub URL" },
] as const;

export type VariableKey = (typeof TEMPLATE_VARIABLES)[number]["key"];
export type TemplateVars = Partial<Record<VariableKey, string | undefined | null>>;

const KNOWN = new Set<string>(TEMPLATE_VARIABLES.map((v) => v.key));

/** Used when a variable is empty and the template gives no `{{name|fallback}}`. */
export const DEFAULT_FALLBACKS: Partial<Record<VariableKey, string>> = {
  recruiter_name: "Hiring Manager",
  company_name: "your organization",
};

export type RenderResult = { text: string; missing: string[]; unknown: string[] };

const SECTION = /\{\{([#^])\s*([a-z_]+)\s*\}\}((?:(?!\{\{[#^])[\s\S])*?)\{\{\/\s*\2\s*\}\}/g;
const VAR = /\{\{\s*([a-zA-Z_]+)\s*(?:\|([^}]*))?\}\}/g;

/**
 * Renders a template.
 *  {{name}}                      value, or the built-in fallback, or empty
 *  {{name|fallback text}}        value, or the inline fallback
 *  {{#name}}...{{/name}}         block shown only when `name` has a value
 *  {{^name}}...{{/name}}         block shown only when `name` is empty
 * Sections can be nested. Whitespace left behind by empty sections is tidied so the
 * email stays grammatical whether or not company/recruiter details exist.
 */
export function renderTemplate(source: string, vars: TemplateVars): RenderResult {
  const value = (k: string) => String((vars as Record<string, unknown>)[k] ?? "").trim();
  const missing = new Set<string>();
  const unknown = new Set<string>();

  let text = source.replace(/\r\n/g, "\n");

  // Resolve innermost sections first so nesting works.
  for (let i = 0; i < 20; i++) {
    let changed = false;
    text = text.replace(SECTION, (_m, kind: string, name: string, inner: string) => {
      changed = true;
      if (!KNOWN.has(name)) unknown.add(name);
      const has = value(name) !== "";
      return (kind === "#" ? has : !has) ? inner : "";
    });
    if (!changed) break;
  }

  text = text.replace(VAR, (m, name: string, fallback?: string) => {
    if (!KNOWN.has(name)) {
      unknown.add(name);
      return m;
    }
    const v = value(name);
    if (v) return v;
    if (fallback !== undefined) return fallback.trim();
    const builtin = DEFAULT_FALLBACKS[name as VariableKey];
    if (builtin) return builtin;
    missing.add(name);
    return "";
  });

  return { text: tidy(text), missing: [...missing], unknown: [...unknown] };
}

export function tidy(text: string): string {
  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,.;:!?])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Subjects must be a single clean line (also blocks header injection). */
export function renderSubject(source: string, vars: TemplateVars): RenderResult {
  const r = renderTemplate(source, vars);
  return { ...r, text: r.text.replace(/[\r\n]+/g, " ").replace(/\s{2,}/g, " ").trim() };
}

export function findVariablesInUse(source: string): string[] {
  const names = new Set<string>();
  for (const m of source.matchAll(/\{\{[#^/]?\s*([a-zA-Z_]+)/g)) names.add(m[1]);
  return [...names];
}
