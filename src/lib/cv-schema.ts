/**
 * Structured CV content. The AI only ever fills these slots — it never
 * produces layout. Rendering goes through the shared HTML/CSS → PDF pipeline
 * so a tailored CV is pixel-identical in layout to the master template.
 *
 * Fixed (inherited from master, never altered by role templates or AI):
 *   - experience[].company, experience[].dates
 *   - education
 *   - personal details (full_name, contact_line, address)
 * Variable (per role template / per generation):
 *   - about_me, role_title, experience[].responsibilities,
 *     experience[].achievements, licenses
 */

export interface CvExperience {
  company: string; // FIXED
  dates: string; // FIXED, e.g. "Jan 2020 – Mar 2023"
  role_title: string; // FIXED — kept exactly from master
  responsibilities: string[]; // variable
  achievements?: string[]; // variable — rendered under "Key Achievements:"
}

export interface CvEducation {
  institution: string;
  qualification: string;
  dates: string;
}

export interface CvContent {
  full_name: string;
  contact_line: string; // email · phone · location · linkedin
  address?: string; // FIXED — newline-separated postal address (cover letter header)
  role_title: string; // variable headline title (not shown on the CV itself)
  about_me: string; // variable
  experience: CvExperience[];
  licenses: string[]; // variable — licenses & qualifications
  education: CvEducation[]; // FIXED
}

export const EMPTY_CV: CvContent = {
  full_name: "",
  contact_line: "",
  address: "",
  role_title: "",
  about_me: "",
  experience: [],
  licenses: [],
  education: [],
};

/**
 * Build a role template / AI output from master + variable overrides,
 * structurally enforcing that fixed fields come from the master. Job titles,
 * companies, dates, education and personal details always come from the master;
 * only about_me, responsibilities, achievements and licenses are tailored.
 */
export function mergeWithMaster(
  master: CvContent,
  variable: {
    role_title?: string;
    about_me?: string;
    licenses?: string[];
    experience_overrides?: { responsibilities?: string[]; achievements?: string[] }[];
  }
): CvContent {
  return {
    full_name: master.full_name,
    contact_line: master.contact_line,
    address: master.address, // always fixed
    role_title: variable.role_title ?? master.role_title,
    about_me: variable.about_me ?? master.about_me,
    licenses: variable.licenses ?? master.licenses,
    education: master.education, // always fixed
    experience: master.experience.map((exp, i) => ({
      company: exp.company, // always fixed
      dates: exp.dates, // always fixed
      role_title: exp.role_title, // always fixed — never re-titled by the AI
      responsibilities:
        variable.experience_overrides?.[i]?.responsibilities ?? exp.responsibilities,
      achievements:
        variable.experience_overrides?.[i]?.achievements ?? exp.achievements ?? [],
    })),
  };
}
