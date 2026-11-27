import type { Category } from "@/lib/constants";

export type DefaultTemplate = { name: string; category: Category; subject: string; body: string; isDefault: boolean };

const SUBJECT = "Application for {{job_role}}{{#company_name}} at {{company_name}}{{/company_name}}{{#candidate_name}} – {{candidate_name}}{{/candidate_name}}";

const intro = (focus: string) => `Dear {{recruiter_name|Hiring Manager}},

I am writing to express my interest in the {{job_role}} position{{#company_name}} at {{company_name}}{{/company_name}}. ${focus}{{#current_title}} I currently work as {{current_title}}{{#years_experience}} with {{years_experience}} years of experience{{/years_experience}}.{{/current_title}}{{^current_title}}{{#years_experience}} I have {{years_experience}} years of experience.{{/years_experience}}{{/current_title}}
{{#primary_skills}}
My core skills include {{primary_skills}}.
{{/primary_skills}}`;

const outro = `
I have attached my resume for your review and would welcome the chance to discuss how I can contribute to your team. Thank you for your time and consideration.

Best regards,
{{candidate_name}}{{#candidate_phone}}
{{candidate_phone}}{{/candidate_phone}}{{#candidate_email}}
{{candidate_email}}{{/candidate_email}}{{#linkedin_url}}
LinkedIn: {{linkedin_url}}{{/linkedin_url}}{{#github_url}}
GitHub: {{github_url}}{{/github_url}}{{#portfolio_url}}
Portfolio: {{portfolio_url}}{{/portfolio_url}}`;

export const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  { name: "Frontend Developer – standard", category: "frontend", isDefault: true, subject: SUBJECT, body: intro("My work centres on building clear, accessible and responsive user interfaces.") + outro },
  { name: "Backend Developer – standard", category: "backend", isDefault: true, subject: SUBJECT, body: intro("My work centres on designing reliable APIs, data models and server-side systems.") + outro },
  { name: "Full Stack Developer – standard", category: "fullstack", isDefault: true, subject: SUBJECT, body: intro("I enjoy working across the stack, from user interfaces to APIs and databases.") + outro },
  { name: "Custom – blank starter", category: "custom", isDefault: true, subject: SUBJECT, body: intro("I believe my background is a strong match for this role.") + outro },
];
