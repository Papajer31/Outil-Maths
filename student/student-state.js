import { DEFAULT_ACTIVITY_MODE } from "../shared/activity-modes.js";

export const studentState = {
  accessCode: "",
  homeCode: "",
  homeMessage: "",
  isCheckingAccessCode: false,

  activities: [],
  activityFolders: [],
  activitiesMessage: "",
  isLoadingActivities: false,
  activitiesMode: DEFAULT_ACTIVITY_MODE,
  hasChosenActivitiesMode: false,
  currentActivityFolderId: null,
  publicStudents: [],
  publicStudentsMessage: "",

  selectedConfig: null,
  selectedConfigMeta: null,
  selectedStudent: null,
  selectedStudents: [],
  sharedSessionEntry: false,

  sessionMode: "student",
  projectedSession: null
};
