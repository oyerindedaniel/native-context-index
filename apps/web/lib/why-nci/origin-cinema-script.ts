/**
 * Scripted beats for the Why NCI origin cinema. Wording is abbreviated from a
 * real agent trace; timings are controlled in the player component.
 */

export type OriginMonoBeat = {
  readonly beatKind: "mono";
  readonly text: string;
  readonly typingMsPerChar?: number;
};

export type OriginPillBeat = {
  readonly beatKind: "pill";
  readonly text: string;
};

export type OriginCardBeat = {
  readonly beatKind: "card";
  readonly title: string;
  readonly body: string;
};

export type OriginBeat = OriginMonoBeat | OriginPillBeat | OriginCardBeat;

export interface OriginScene {
  readonly sceneKey: string;
  readonly beats: readonly OriginBeat[];
}

export const ORIGIN_SCENES: readonly OriginScene[] = [
  {
    sceneKey: "grep-permissions",
    beats: [
      {
        beatKind: "mono",
        text: "Grepped PermissionHook|usePermissions in expo-modules-core",
      },
      { beatKind: "pill", text: "No matches found" },
    ],
  },
  {
    sceneKey: "grep-hooks",
    beats: [
      {
        beatKind: "mono",
        text: "Grepped createPermissionHook|PermissionHook in expo-modules-core",
      },
      { beatKind: "pill", text: "No matches found" },
    ],
  },
  {
    sceneKey: "fetch-docs",
    beats: [
      {
        beatKind: "mono",
        text: "Fetched page https://docs.expo.dev/versions/latest/sdk/camera/",
      },
      {
        beatKind: "card",
        title: "docs.expo.dev /versions/latest/sdk/camera/",
        body:
          "# Expo Camera\n\n" +
          "A React component that renders a preview for the device's front or back camera. Android (device only), iOS (device only), Web, Included in Expo Go.\n\n" +
          "> For the complete documentation index, see llms.txt.",
      },
    ],
  },
  {
    sceneKey: "read-types",
    beats: [
      { beatKind: "mono", text: "Read types.d.ts L1–7" },
      {
        beatKind: "mono",
        text: "Grepped useCameraPermissions|getPermission in expo-camera",
      },
    ],
  },
  {
    sceneKey: "explore",
    beats: [
      {
        beatKind: "mono",
        text: "Explored 4 files, 4 searches, 1 fetch",
        typingMsPerChar: 14,
      },
      {
        beatKind: "mono",
        text: "Searched **/*ermission* in expo-modules-core",
        typingMsPerChar: 10,
      },
      { beatKind: "mono", text: "Read index.d.ts L1–50", typingMsPerChar: 9 },
      { beatKind: "mono", text: "Thought for 1s", typingMsPerChar: 18 },
      { beatKind: "mono", text: "Read index.d.ts L50–69", typingMsPerChar: 9 },
      {
        beatKind: "mono",
        text: "Grepped PermissionHook|usePermissions in expo-modules-core",
        typingMsPerChar: 8,
      },
      { beatKind: "pill", text: "No matches found" },
      {
        beatKind: "mono",
        text: "Grepped createPermissionHook|PermissionHook in expo-modules-core",
        typingMsPerChar: 8,
      },
      { beatKind: "pill", text: "No matches found" },
      { beatKind: "mono", text: "Read types.d.ts L1–7", typingMsPerChar: 10 },
      {
        beatKind: "mono",
        text: "Fetched page https://docs.expo.dev/versions/latest/sdk/camera/",
        typingMsPerChar: 7,
      },
      {
        beatKind: "mono",
        text: "Grepped useCameraPermissions|getPermission in …",
        typingMsPerChar: 8,
      },
      {
        beatKind: "mono",
        text: "Identifying the issue: useCameraPermissions() returns a third function — GetPermissionMethod — used to sync permission state from the OS.",
        typingMsPerChar: 5,
      },
    ],
  },
] as const;
