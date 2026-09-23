import raw from './dataset.json';
export type Employee = typeof raw.employees[number];
export type Event = typeof raw.events[number];
export type History = { record_id: string; employee_id: string; event_id: string; date: string; status: string; completion_pct: string };
export const data = raw;
export const today = '2026-10-01';
export const grades = ['Junior', 'Middle', 'Senior', 'Lead'];
export const skillName = (id: string) => data.skills.find(s => s.skill_id === id)?.name ?? id;
export function target(employee: Employee) {
  return data.role_profiles.find(p => p.role === (employee.career_goal?.target_role ?? employee.role) && p.grade === (employee.career_goal?.target_grade ?? grades[Math.min(3, grades.indexOf(employee.grade) + 1)]))!;
}
export function levels(employee: Employee, history: History[]) {
  const result: Record<string, number> = { ...employee.skills };
  history.filter(h => h.employee_id === employee.employee_id && h.status === 'completed' && h.date > employee.last_review_date).sort((a,b) => a.date.localeCompare(b.date)).forEach(h => {
    data.events.find(e => e.event_id === h.event_id)?.develops_skills.forEach(s => { result[s.skill_id] = Math.max(result[s.skill_id] ?? 0, Math.min(s.max_level, (result[s.skill_id] ?? 0) + s.gain)); });
  });
  return result;
}
export function progress(employee: Employee, history: History[]) {
  const current = levels(employee, history);
  const requirements = Object.entries(target(employee).required_skills) as [string, number][];
  return Math.round(100 * requirements.reduce((sum,[id,n]) => sum + Math.min(current[id] ?? 0,n),0) / requirements.reduce((sum,[,n]) => sum+n,0));
}
export function recommendations(employee: Employee, history: History[]) {
  const current = levels(employee, history), goal = target(employee);
  const own = history.filter(h => h.employee_id === employee.employee_id);
  return data.events.filter(e => !e.mandatory && e.target_roles.includes(employee.role) && e.target_grades.includes(employee.grade) && (e.format === 'self_paced' || e.upcoming_sessions.some(d => d >= today)) && !own.some(h => h.event_id === e.event_id && (h.status === 'in_progress' || (h.status === 'completed' && e.event_id !== 'EV_036'))) && Object.entries(e.prerequisites).every(([id,n]) => (current[id] ?? 0) >= (n as number))).map(event => {
    const gains = event.develops_skills.map(s => ({ id: s.skill_id, current: current[s.skill_id] ?? 0, required: (goal.required_skills as Record<string,number>)[s.skill_id] ?? 0, gain: Math.max(0, Math.min(s.gain, s.max_level - (current[s.skill_id] ?? 0))), critical: goal.critical_skills.includes(s.skill_id) })).filter(s => s.gain > 0 && s.current < s.required);
    const similar = own.filter(h => data.events.find(e => e.event_id === h.event_id)?.type === event.type);
    const skipped = similar.filter(h => ['no_show','dropped','declined'].includes(h.status)).length;
    const completed = similar.filter(h => h.status === 'completed').length;
    const score = gains.reduce((n,s) => n + Math.min(s.gain,s.required-s.current)*(s.critical ? 3 : 1),0) * (1 + completed/(similar.length+1)*0.2) / (1+skipped*0.35) / (1+event.duration_hours/40);
    return { event, gains, skipped, completed, score };
  }).filter(r => r.score > 0).sort((a,b) => b.score-a.score).slice(0,3);
}
export function parseHistory(text: string): History[] {
  const rows: string[][] = []; let row: string[] = [], cell = '', quoted = false;
  const source = text.replace(/^\uFEFF/, '');
  for (let i=0;i<source.length;i++) { const ch=source[i]; if(ch==='"') { if(quoted && source[i+1]==='"') {cell+='"';i++;} else quoted=!quoted; } else if(ch===',' && !quoted) {row.push(cell);cell='';} else if(ch==='\n' && !quoted) {row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';} else cell+=ch; }
  if(quoted) throw new Error('CSV: незакрытая кавычка.');
  if(cell || row.length) {row.push(cell.replace(/\r$/,''));rows.push(row);}
  const header=rows.shift() ?? [];
  if(!['record_id','employee_id','event_id','date','status','completion_pct'].every(k=>header.includes(k))) throw new Error('CSV: отсутствуют обязательные столбцы истории.');
  return rows.filter(r=>r.some(Boolean)).map(r=>Object.fromEntries(header.map((k,i)=>[k,r[i] ?? ''])) as History);
}
export function validateEmployees(value: unknown): Employee[] {
  const list = Array.isArray(value) ? value : (value as {employees?: unknown})?.employees;
  if(!Array.isArray(list) || !list.length) throw new Error('JSON должен содержать массив employees.');
  const ids = new Set<string>();
  for(const e of list) {
    if(!e || typeof e.employee_id !== 'string' || ids.has(e.employee_id) || typeof e.full_name !== 'string' || typeof e.department !== 'string' || !data.role_profiles.some(p=>p.role===e.role && p.grade===e.grade) || typeof e.last_review_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(e.last_review_date) || !e.skills || typeof e.skills !== 'object' || !Object.entries(e.skills).every(([id,n])=>data.skills.some(s=>s.skill_id===id) && typeof n==='number' && Number.isInteger(n) && n>=0 && n<=5) || (e.career_goal && !data.role_profiles.some(p=>p.role===e.career_goal.target_role && p.grade===e.career_goal.target_grade))) throw new Error('Проверьте ID, имя, отдел, роль, грейд, цель, дату оценки и навыки (0–5).');
    ids.add(e.employee_id);
  }
  return list as Employee[];
}
