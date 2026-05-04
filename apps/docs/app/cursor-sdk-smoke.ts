import { Cursor, createLocalRunEventNotifier } from "@cursor/sdk";

export type CursorSdkRunStorePathCheck = typeof createLocalRunEventNotifier;
export type CursorSdkDirectPathCheck = typeof Cursor;
