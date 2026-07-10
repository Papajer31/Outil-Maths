import { DEFAULT_ACTIVITY_MODE } from "../shared/activity-modes.js";

export const studentState = {
  accessCode: "",
  homeCode: "",
  homeMessage: "",
  homeLaunchPhase: "",
  isCheckingAccessCode: false,

  activities: [],
  activityFolders: [],
  missions: [],
  missionsMessage: "",
  activityEntry: "",
  studentCode: "",
  activitiesMessage: "",
  isLoadingActivities: false,
  activitiesMode: DEFAULT_ACTIVITY_MODE,
  hasChosenActivitiesMode: false,
  currentActivityFolderId: null,
  publicStudents: [],
  publicStudentsMessage: "",

  selectedConfig: null,
  selectedConfigMeta: null,
  selectedMission: null,
  selectedStudent: null,
  selectedStudents: [],
  sharedSessionEntry: false,

  sessionMode: "student",
  projectedSession: null
};
