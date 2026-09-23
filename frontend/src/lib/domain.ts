/** Canonical frontend models. Dataset files and API DTOs are adapted at the boundary. */
export type Grade = "Junior" | "Middle" | "Senior" | "Lead";
export type SkillLevels = Partial<Record<string, number>>;
export interface CareerGoal {
  target_role: string;
  target_grade: Grade;
}
export interface Employee {
  employee_id: string;
  full_name: string;
  department: string;
  role: string;
  grade: Grade;
  tenure_months: number;
  skills: SkillLevels;
  career_goal: CareerGoal | null;
  last_review_date: string | null;
  manager_id?: string | null;
  hire_date?: string | null;
  work_format?: "office" | "hybrid" | "remote" | null;
  preferred_language?: "ru" | "en" | "kk" | null;
}
export interface SkillGain {
  skill_id: string;
  gain: number;
  max_level: number;
}
export interface Event {
  event_id: string;
  title: string;
  description: string;
  type:
    | "course"
    | "workshop"
    | "mentoring"
    | "certification"
    | "meetup"
    | "compliance"
    | "onboarding";
  format: "online" | "offline" | "self_paced";
  duration_hours: number;
  mandatory: boolean;
  target_roles: string[];
  target_grades: Grade[];
  develops_skills: SkillGain[];
  prerequisites: SkillLevels;
  upcoming_sessions: string[];
}
export interface History {
  record_id: string;
  employee_id: string;
  event_id: string;
  date: string;
  status:
    | "completed"
    | "in_progress"
    | "dropped"
    | "no_show"
    | "declined"
    | "overdue";
  completion_pct: string;
  /** Local completion happened after the loaded assessment, including same-day assessments. */
  demo_completion?: boolean;
}
export interface RoleProfile {
  role: string;
  grade: Grade;
  required_skills: SkillLevels;
  critical_skills: string[];
}
export interface Skill {
  skill_id: string;
  name: string;
  type: "hard" | "soft";
  category: string;
  description: string;
}
export interface Dataset {
  employees: Employee[];
  events: Event[];
  skills: Skill[];
  role_profiles: RoleProfile[];
  history: History[];
  meta: { dataset: string; version: string; as_of_date: string };
  proficiency_scale: Record<string, string>;
}
