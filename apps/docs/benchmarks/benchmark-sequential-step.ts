import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { mkdir } from "node:fs/promises";

export const DEFAULT_PILOT_SEQUENTIAL_STEP_FILENAME =
  ".pilot-sequential-step.json";

export interface PilotSequentialStepState {
  version: 1;
  completedTaskIds: string[];
}

export function syncCompletedIdsWithPilotSet(
  completedTaskIds: readonly string[],
  pilotOrderedIds: readonly string[],
): string[] {
  const pilotSet = new Set(pilotOrderedIds);
  return completedTaskIds.filter((taskId) => pilotSet.has(taskId));
}

export function pickNextPilotTask<T extends { id: string }>(
  orderedPilotTasks: readonly T[],
  completedTaskIds: readonly string[],
): T | undefined {
  const done = new Set(completedTaskIds);
  return orderedPilotTasks.find((task) => !done.has(task.id));
}

export async function readPilotSequentialStepState(
  stateFilePath: string,
): Promise<PilotSequentialStepState> {
  try {
    const raw = await readFile(stateFilePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<PilotSequentialStepState>;
    if (parsed.version !== 1 || !Array.isArray(parsed.completedTaskIds)) {
      return { version: 1, completedTaskIds: [] };
    }
    return { version: 1, completedTaskIds: [...parsed.completedTaskIds] };
  } catch {
    return { version: 1, completedTaskIds: [] };
  }
}

async function ensureParentDirectory(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
}

export async function writePilotSequentialStepState(
  stateFilePath: string,
  state: PilotSequentialStepState,
): Promise<void> {
  await ensureParentDirectory(stateFilePath);
  await writeFile(stateFilePath, JSON.stringify(state, null, 2), "utf8");
}
