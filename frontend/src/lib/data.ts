import raw from "./dataset.json";
import type { Dataset, Grade } from "./domain";
// The generated dataset is verified against the domain validators in the test suite.
export const data = raw as Dataset;
export const today = data.meta.as_of_date;
export const grades: Grade[] = ["Junior", "Middle", "Senior", "Lead"];
