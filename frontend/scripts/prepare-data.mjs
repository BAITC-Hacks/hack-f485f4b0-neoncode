import { readFileSync, writeFileSync } from 'node:fs';
const root = new URL('../../dataset/case_1/career_quest_dataset/', import.meta.url);
const read = (name) => JSON.parse(readFileSync(new URL(`${name}.json`, root), 'utf8'));
const [header, ...rows] = readFileSync(new URL('activity_history.csv', root), 'utf8').trim().split(/\r?\n/);
const keys = header.split(',');
writeFileSync(new URL('../src/lib/dataset.json', import.meta.url), JSON.stringify({ employees: read('employees').employees, events: read('events').events, ...read('skills'), history: rows.map(row => Object.fromEntries(row.split(',').map((v, i) => [keys[i], v]))) }));
