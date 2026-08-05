import { describe, it, expect } from "vitest";
import { mergeWithMaster, type CvContent } from "./cv-schema";

const master: CvContent = {
  full_name: "Conor Bourke",
  contact_line: "conor@example.com",
  role_title: "Operations Manager",
  about_me: "Master about me.",
  experience: [
    {
      company: "Acme Ltd",
      dates: "Jan 2020 – Mar 2023",
      role_title: "Ops Lead",
      responsibilities: ["Ran the warehouse"],
      achievements: ["Cut costs 10%"],
    },
  ],
  licenses: ["Forklift licence"],
  education: [
    { institution: "Uni of Life", qualification: "BSc", dates: "2016 – 2019" },
  ],
};

describe("mergeWithMaster — fixed slots are inherited, variable slots tailored", () => {
  it("never lets a role template change company, dates, job title or education", () => {
    const merged = mergeWithMaster(master, {
      role_title: "Logistics Director",
      about_me: "Tailored summary for a logistics role.",
      licenses: ["Forklift licence", "HGV"],
      experience_overrides: [
        { responsibilities: ["Optimised routing"], achievements: ["Saved £1m"] },
      ],
    });

    // Fixed — straight from the master.
    expect(merged.full_name).toBe("Conor Bourke");
    expect(merged.contact_line).toBe("conor@example.com");
    expect(merged.experience[0].company).toBe("Acme Ltd");
    expect(merged.experience[0].dates).toBe("Jan 2020 – Mar 2023");
    expect(merged.experience[0].role_title).toBe("Ops Lead"); // job title never changes
    expect(merged.education).toEqual(master.education);

    // Variable — taken from the override.
    expect(merged.role_title).toBe("Logistics Director");
    expect(merged.about_me).toBe("Tailored summary for a logistics role.");
    expect(merged.licenses).toEqual(["Forklift licence", "HGV"]);
    expect(merged.experience[0].responsibilities).toEqual(["Optimised routing"]);
    expect(merged.experience[0].achievements).toEqual(["Saved £1m"]);
  });

  it("falls back to master values when no override is supplied", () => {
    const merged = mergeWithMaster(master, {});
    expect(merged).toEqual(master);
  });

  it("keeps experience array length and order aligned to the master", () => {
    const merged = mergeWithMaster(master, {
      experience_overrides: [{ responsibilities: ["only responsibilities changed"] }],
    });
    expect(merged.experience).toHaveLength(1);
    expect(merged.experience[0].company).toBe("Acme Ltd");
    expect(merged.experience[0].role_title).toBe("Ops Lead"); // fixed → master
    expect(merged.experience[0].responsibilities).toEqual(["only responsibilities changed"]);
    expect(merged.experience[0].achievements).toEqual(["Cut costs 10%"]); // fallback to master
  });
});
