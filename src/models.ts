/**
 * Data models for SWX Time Tracker
 */

/**
 * Project entry for managing projects
 */
export interface ProjectEntry {
  /** Generic hash value as unique identifier */
  id: string;
  /** Project name */
  name: string;
  /** Project description */
  description?: string;
  /** Project creation timestamp */
  createdAt: number;
}

/**
 * Environment entry for different development environments
 */
export interface EnvironmentEntry {
  /** Project ID reference (undefined if not assigned) */
  projectId?: string;
  /** Unique environment ID (hash from Storage path) */
  id: string;
  /** VSCode storage path */
  storagePath: string;
  /** VSCode global storage path */
  globalStoragePath: string;
  /** Workspace path */
  workspacePath: string;
  /** Remote environment name (local, dev-container, ssh, wsl, etc.) */
  remoteName: string;
  /** Git remote URL (if available) */
  gitRemoteUrl?: string;
  /** Environment creation timestamp */
  createdAt: number;
  /** Last access timestamp */
  lastAccess: number;
}

/**
 * Represents a single time tracking entry
 */
export interface TimeEntry {
  /** Environment ID reference */
  environmentId: string;
  /** Unique identifier (timestamp-based) */
  id: string;
  /** Date in ISO format (YYYY-MM-DD) */
  date: string;
  /** Unix timestamp when tracking started */
  startTime: number;
  /** Unix timestamp when tracking ended */
  endTime?: number;
  /** Total duration in milliseconds */
  duration?: number;
  /** User-provided comment */
  comment?: string;
  /** Project name from workspace */
  project: string;
  /** Full workspace path */
  workspace: string;
  /** Git commits during session */
  gitCommits?: GitCommitInfo[];
}

/**
 * Git commit information
 */
export interface GitCommitInfo {
  /** Commit hash */
  hash: string;
  /** Commit message */
  message: string;
  /** Unix timestamp */
  timestamp: number;
  /** Author name/email */
  author: string;
}

/**
 * Monthly report data structure
 */
export interface MonthlyReport {
  /** Month in YYYY-MM format */
  month: string;
  /** Total hours tracked */
  totalHours: number;
  /** Total number of sessions */
  totalSessions: number;
  /** Breakdown by project */
  projects: {
    [projectName: string]: ProjectReport;
  };
}

/**
 * Project-specific report data
 */
export interface ProjectReport {
  /** Total hours for project */
  hours: number;
  /** Number of sessions */
  sessions: number;
  /** All time entries */
  entries: TimeEntry[];
}

/**
 * Metadata for tracking statistics and performance optimization
 * Caches aggregated values to avoid recalculating from all entries
 */
export interface TrackerMetadata {
  /** Schema version */
  version: string;
  /** Total tracked time across all projects */
  totalTrackedMs: number;
  /** Number of tracked projects */
  projectCount: number;
  /** Last save timestamp */
  lastSaved: number;
  /** First tracking date */
  firstTrackingDate?: string;
}

/**
 * Current session state
 */
export interface SessionState {
  /** Whether tracking is active */
  isTracking: boolean;
  /** Current session data */
  currentSession?: TimeEntry;
  /** Last activity timestamp */
  lastActivity: number;
}