import * as vscode from 'vscode';
import { TimeEntry, MonthlyReport, ProjectReport, TrackerMetadata } from './models';

/**
 * Service for managing time tracking data persistence
 * Uses VSCode GlobalState for storage
 */
export class DataService {
  private static readonly ENTRIES_KEY = 'timeEntries';
  private static readonly CURRENT_SESSION_KEY = 'currentSession';
  private static readonly METADATA_KEY = 'metadata';
  private static readonly VERSION = '1.0.0';

  constructor(private context: vscode.ExtensionContext) {}

  /**
   * Initialize metadata if not exists
   */
  private async initializeMetadata(): Promise<TrackerMetadata> {
    let metadata = await this.getMetadata();
    if (!metadata) {
      metadata = {
        version: DataService.VERSION,
        totalTrackedMs: 0,
        projectCount: 0,
        lastSaved: Date.now(),
      };
      await this.context.globalState.update(DataService.METADATA_KEY, metadata);
    }
    return metadata;
  }

  /**
   * Get all time entries
   */
  async getAllEntries(): Promise<TimeEntry[]> {
    const entries = this.context.globalState.get<TimeEntry[]>(DataService.ENTRIES_KEY, []);
    return entries;
  }

  /**
   * Save a new time entry
   */
  async saveEntry(entry: TimeEntry): Promise<void> {
    const entries = await this.getAllEntries();
    entries.push(entry);
    
    // Update metadata
    const metadata = await this.getMetadata() || await this.initializeMetadata();
    metadata.totalTrackedMs += (entry.duration || 0);
    metadata.lastSaved = Date.now();
    if (!metadata.firstTrackingDate || entry.date < metadata.firstTrackingDate) {
      metadata.firstTrackingDate = entry.date;
    }
    
    // Update project count
    const projects = new Set(entries.map(e => e.project));
    metadata.projectCount = projects.size;
    
    // Save both entries and metadata
    await this.context.globalState.update(DataService.ENTRIES_KEY, entries);
    await this.context.globalState.update(DataService.METADATA_KEY, metadata);
  }

  /**
   * Update an existing entry
   */
  async updateEntry(entryId: string, updates: Partial<TimeEntry>): Promise<void> {
    const entries = await this.getAllEntries();
    const index = entries.findIndex(e => e.id === entryId);
    
    if (index !== -1) {
      entries[index] = { ...entries[index], ...updates };
      await this.context.globalState.update(DataService.ENTRIES_KEY, entries);
      
      // Update metadata if duration changed
      if (updates.duration !== undefined) {
        const metadata = await this.getMetadata() || await this.initializeMetadata();
        metadata.lastSaved = Date.now();
        await this.context.globalState.update(DataService.METADATA_KEY, metadata);
      }
    }
  }

  /**
   * Get current session
   */
  async getCurrentSession(): Promise<TimeEntry | undefined> {
    return this.context.globalState.get<TimeEntry>(DataService.CURRENT_SESSION_KEY);
  }

  /**
   * Save current session
   */
  async saveCurrentSession(session: TimeEntry | undefined): Promise<void> {
    await this.context.globalState.update(DataService.CURRENT_SESSION_KEY, session);
  }

  /**
   * Get entries for a specific month
   */
  async getEntriesForMonth(yearMonth: string): Promise<TimeEntry[]> {
    const allEntries = await this.getAllEntries();
    return allEntries.filter(entry => entry.date.startsWith(yearMonth));
  }

  /**
   * Get entries for a specific project
   */
  async getEntriesForProject(projectName: string): Promise<TimeEntry[]> {
    const allEntries = await this.getAllEntries();
    return allEntries.filter(entry => entry.project === projectName);
  }

  /**
   * Generate monthly report
   */
  async getMonthlyReport(yearMonth?: string): Promise<MonthlyReport> {
    // Default to current month
    const targetMonth = yearMonth || new Date().toISOString().slice(0, 7);
    const entries = await this.getEntriesForMonth(targetMonth);
    
    // Group by project
    const projectMap = new Map<string, ProjectReport>();
    let totalHours = 0;
    let totalSessions = 0;

    for (const entry of entries) {
      if (!entry.duration) continue;
      
      const hours = entry.duration / 3600000; // ms to hours
      totalHours += hours;
      totalSessions++;

      if (!projectMap.has(entry.project)) {
        projectMap.set(entry.project, {
          hours: 0,
          sessions: 0,
          entries: []
        });
      }

      const projectReport = projectMap.get(entry.project)!;
      projectReport.hours += hours;
      projectReport.sessions++;
      projectReport.entries.push(entry);
    }

    // Convert map to object
    const projects: { [key: string]: ProjectReport } = {};
    projectMap.forEach((value, key) => {
      projects[key] = value;
      // Round hours to 2 decimal places
      projects[key].hours = Math.round(projects[key].hours * 100) / 100;
    });

    return {
      month: targetMonth,
      totalHours: Math.round(totalHours * 100) / 100,
      totalSessions,
      projects
    };
  }

  /**
   * Get all unique projects
   */
  async getAllProjects(): Promise<string[]> {
    const entries = await this.getAllEntries();
    const projects = new Set(entries.map(e => e.project));
    return Array.from(projects).sort();
  }

  /**
   * Get metadata
   */
  async getMetadata(): Promise<TrackerMetadata | undefined> {
    return this.context.globalState.get<TrackerMetadata>(DataService.METADATA_KEY);
  }

  /**
   * Export data as CSV
   */
  async exportToCSV(yearMonth?: string): Promise<string> {
    const report = await this.getMonthlyReport(yearMonth);
    
    let csv = 'Date,Start Time,End Time,Duration (min),Project,Workspace,Comment\n';
    
    // Sort all entries by date and time
    const allEntries: TimeEntry[] = [];
    Object.values(report.projects).forEach(p => allEntries.push(...p.entries));
    allEntries.sort((a, b) => a.startTime - b.startTime);
    
    for (const entry of allEntries) {
      const startTime = new Date(entry.startTime).toLocaleTimeString();
      const endTime = entry.endTime ? new Date(entry.endTime).toLocaleTimeString() : '';
      const duration = entry.duration ? Math.round(entry.duration / 60000) : 0;
      const comment = entry.comment || '';
      
      csv += `${entry.date},${startTime},${endTime},${duration},"${entry.project}","${entry.workspace}","${comment}"\n`;
    }
    
    // Add summary
    csv += '\n\nSummary\n';
    csv += `Total Hours,${report.totalHours}\n`;
    csv += `Total Sessions,${report.totalSessions}\n`;
    csv += '\nBy Project\n';
    
    Object.entries(report.projects).forEach(([project, data]) => {
      csv += `${project},${data.hours}h,${data.sessions} sessions\n`;
    });
    
    return csv;
  }

  /**
   * Clear all data (for testing/reset)
   */
  async clearAllData(): Promise<void> {
    await this.context.globalState.update(DataService.ENTRIES_KEY, undefined);
    await this.context.globalState.update(DataService.CURRENT_SESSION_KEY, undefined);
    await this.context.globalState.update(DataService.METADATA_KEY, undefined);
  }

  /**
   * Export all globalState data as JSON
   */
  async exportGlobalStateData(): Promise<string> {
    const entries = await this.getAllEntries();
    const currentSession = await this.getCurrentSession();
    const metadata = await this.getMetadata();
    
    const exportData = {
      version: DataService.VERSION,
      exportTimestamp: Date.now(),
      exportDate: new Date().toISOString(),
      data: {
        entries,
        currentSession,
        metadata
      },
      keys: {
        ENTRIES_KEY: DataService.ENTRIES_KEY,
        CURRENT_SESSION_KEY: DataService.CURRENT_SESSION_KEY,
        METADATA_KEY: DataService.METADATA_KEY
      }
    };
    
    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Get statistics
   */
  async getStatistics(): Promise<{
    totalEntries: number;
    totalHours: number;
    projectCount: number;
    currentMonth: { hours: number; sessions: number };
    lastMonth: { hours: number; sessions: number };
  }> {
    const entries = await this.getAllEntries();
    const metadata = await this.getMetadata() || await this.initializeMetadata();
    
    const now = new Date();
    const currentMonth = now.toISOString().slice(0, 7);
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1);
    const lastMonth = lastMonthDate.toISOString().slice(0, 7);
    
    const currentMonthReport = await this.getMonthlyReport(currentMonth);
    const lastMonthReport = await this.getMonthlyReport(lastMonth);
    
    return {
      totalEntries: entries.length,
      totalHours: Math.round((metadata.totalTrackedMs / 3600000) * 100) / 100,
      projectCount: metadata.projectCount,
      currentMonth: {
        hours: currentMonthReport.totalHours,
        sessions: currentMonthReport.totalSessions
      },
      lastMonth: {
        hours: lastMonthReport.totalHours,
        sessions: lastMonthReport.totalSessions
      }
    };
  }
}