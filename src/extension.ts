import * as vscode from 'vscode';
import { TimeEntry, GitCommitInfo, SessionState } from './models';
import { DataService } from './dataService';
import { IdleDetectionService } from './idleDetectionService';

/**
 * SWXTimeTracker - Flow Diagram
 * 
 *     ┌─────────────────┐
 *     │ activate()      │
 *     │ - Create tracker│
 *     │ - Register cmds │
 *     │ - Check autoStart│
 *     └─────────────────┘
 *              │
 *              ▼
 *     ┌─────────────────┐
 *     │ Constructor     │
 *     │ - Init services │
 *     │ - Load session  │
 *     └─────────────────┘
 *              │
 *         ┌────┴────┐
 *         ▼         ▼
 * ┌──────────────┐ ┌──────────────┐
 * │Resume old    │ │Start new     │
 * │session?      │ │session       │
 * │(autoStart)   │ │              │
 * └──────────────┘ └──────────────┘
 *         │             │
 *         ▼             ▼
 * ┌──────────────┐ ┌──────────────┐
 * │startTracking()│ │startTracking()│
 * │- Create Entry│ │- Create Entry│
 * │- Start Idle  │ │- Start Idle  │
 * │- Save to DB  │ │- Save to DB  │
 * └──────────────┘ └──────────────┘
 *         │             │
 *         └──────┬──────┘
 *                ▼
 *        ┌──────────────┐       ┌──────────────┐
 *        │ User Actions │──────▶│ addComment() │
 *        │ - Add comment│       │ - Save update│
 *        │ - Show report│       └──────────────┘
 *        │ - Stop       │
 *        │ - Export     │       ┌──────────────┐
 *        │ - Reset      │──────▶│ showReport() │
 *        └──────────────┘       │ - Calc time  │
 *                │              └──────────────┘
 *                ▼
 *        ┌──────────────┐       ┌──────────────┐
 *        │Manual Stop or│──────▶│stopTracking()│
 *        │Idle Timeout  │       │- Calc duration│
 *        └──────────────┘       │- Save to DB  │
 *                │              │- Stop Idle   │
 *                │              └──────────────┘
 *                ▼                      │
 *        ┌──────────────┐              │
 *        │handleIdle    │◀─────────────┘
 *        │Timeout()     │
 *        │- End at last │
 *        │  activity    │
 *        │- Save & notify│
 *        └──────────────┘
 *                │
 *                ▼
 *        ┌──────────────┐
 *        │ deactivate() │
 *        │ - Auto stop  │
 *        │ - Cleanup    │
 *        └──────────────┘
 */

/**
 * Main time tracking controller for the VS Code extension
 * Manages time sessions, comments, and reporting
 */
export class SWXTimeTracker {
    private context: vscode.ExtensionContext;
    public dataService: DataService;
    private idleDetectionService: IdleDetectionService;
    private session: SessionState;
    /** Timer for auto-saving current session */
    private autoSaveTimer?: NodeJS.Timer;
    /** File watcher for Git commits - TODO: Implement Git integration */
    private gitWatcher?: vscode.FileSystemWatcher;

    /**
     * Initialize the time tracker
     * @param context - VS Code extension context
     */
    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.dataService = new DataService(context);
        this.idleDetectionService = new IdleDetectionService(context);
        this.session = {
            isTracking: false,
            lastActivity: Date.now()
        };
        
        // Load existing session on startup
        this.loadExistingSession();
        
        // TODO: Setup Git watcher for commit tracking
    }
    
    /**
     * Load existing session from storage
     */
    private async loadExistingSession() {
        const currentSession = await this.dataService.getCurrentSession();
        if (currentSession && !currentSession.endTime) {
            
            if (this.idleDetectionService.shouldResumeSession(currentSession)) {
                // Resume if within idle threshold
                this.session.isTracking = true;
                this.session.currentSession = currentSession;
                this.session.lastActivity = Date.now();
                
                // Start idle detection for resumed session
                this.idleDetectionService.startTracking(
                    currentSession,
                    this.handleIdleTimeout.bind(this)
                );
                
                // Start auto-save timer for resumed session
                this.startAutoSave();
                
                vscode.window.showInformationMessage(
                    `Resumed tracking for ${currentSession.project}`
                );
            } else {
                // Auto-stop if session too old
                const stoppedSession = this.idleDetectionService.autoStopOldSession(currentSession);
                await this.dataService.saveEntry(stoppedSession);
                await this.dataService.saveCurrentSession(undefined);
                vscode.window.showInformationMessage(
                    `Previous session auto-stopped (idle timeout)`
                );
            }
        }
    }

    /**
     * Start a new time tracking session
     * Creates a new TimeEntry and sets tracking state to active
     */
    public async startTracking() {
        if (this.session.isTracking) {
            vscode.window.showInformationMessage('Tracking already running');
            return;
        }
        
        const projectName = vscode.workspace.name || 'Unknown';
        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
        
        this.session.isTracking = true;
        this.session.lastActivity = Date.now();
        this.session.currentSession = {
            id: String(Date.now()),
            date: new Date().toISOString().slice(0, 10),
            startTime: Date.now(),
            environmentId: 'temp-env-id', // TODO: Implement EnvironmentEntry logic
            project: projectName,
            workspace: workspacePath
        };
        
        // Start idle detection for new session
        this.idleDetectionService.startTracking(
            this.session.currentSession!,
            this.handleIdleTimeout.bind(this)
        );
        
        // Start auto-save timer
        this.startAutoSave();
        
        // Persist session to storage
        await this.dataService.saveCurrentSession(this.session.currentSession);
        
        // TODO: Initialize Git commit watcher
        vscode.window.showInformationMessage(`Time tracking started for ${projectName}`);
    }

    /**
     * Stop the current tracking session
     * Calculates duration and updates the session end time
     */
    public async stopTracking() {
        if (!this.session.isTracking || !this.session.currentSession) {
            vscode.window.showInformationMessage('Tracking is not running');
            return;
        }
        
        this.session.currentSession.endTime = Date.now();
        this.session.currentSession.duration =
            this.session.currentSession.endTime - this.session.currentSession.startTime;
        
        // Stop idle detection
        this.idleDetectionService.stopTracking();
        
        // Stop auto-save timer
        this.stopAutoSave();
        
        // Save completed session to storage
        await this.dataService.saveEntry(this.session.currentSession);
        
        // Clear current session
        await this.dataService.saveCurrentSession(undefined);
        
        const minutes = Math.round(this.session.currentSession.duration / 60000);
        this.session.isTracking = false;
        this.session.currentSession = undefined;
        
        // TODO: Collect and save Git commits made during session
        vscode.window.showInformationMessage(`Time tracking stopped: ${minutes} minutes`);
    }


    /**
     * Handle idle timeout callback from IdleDetectionService
     * @param session Current session that timed out
     * @param lastActivity Timestamp of last activity
     */
    private async handleIdleTimeout(session: TimeEntry, lastActivity: number): Promise<void> {
        // Stop auto-save timer
        this.stopAutoSave();
        
        // Stop tracking with last activity as end time
        session.endTime = lastActivity;
        session.duration = lastActivity - session.startTime;
        
        // Save completed session
        await this.dataService.saveEntry(session);
        await this.dataService.saveCurrentSession(undefined);
        
        const minutes = Math.round(session.duration / 60000);
        this.session.isTracking = false;
        this.session.currentSession = undefined;
        
        vscode.window.showWarningMessage(
            `Time tracking auto-stopped after ${minutes} minutes (idle timeout)`
        );
    }
    
    /**
     * Get idle detection status
     */
    public getIdleStatus() {
        return this.idleDetectionService.getIdleStatus();
    }
    
    /**
     * Start auto-save timer for current session
     */
    private startAutoSave(): void {
        // Get configured interval (in seconds, default 5 minutes)
        const intervalSeconds = vscode.workspace
            .getConfiguration('timeTracker')
            .get<number>('autoSaveInterval', 300);
        
        // If interval is 0, auto-save is disabled
        if (intervalSeconds <= 0) {
            return;
        }
        
        // Clear any existing timer
        this.stopAutoSave();
        
        // Start new timer
        this.autoSaveTimer = setInterval(async () => {
            if (this.session.isTracking && this.session.currentSession) {
                // Calculate current duration
                const currentDuration = Date.now() - this.session.currentSession.startTime;
                
                // Update session with current duration (as checkpoint)
                const updatedSession = {
                    ...this.session.currentSession,
                    duration: currentDuration
                };
                
                // Save to storage
                await this.dataService.saveCurrentSession(updatedSession);
                
                // Update local reference
                this.session.currentSession = updatedSession;
            }
        }, intervalSeconds * 1000); // Convert to milliseconds
    }
    
    /**
     * Stop auto-save timer
     */
    private stopAutoSave(): void {
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
            this.autoSaveTimer = undefined;
        }
    }

    /**
     * Add a comment to the current session
     * Opens an input box for the user to enter a comment
     */
    public addComment = async () => {
        const input = await vscode.window.showInputBox({ 
            placeHolder: 'Comment (English only)',
            prompt: 'Add a description for this time tracking session'
        });
        
        if (input && this.session.currentSession) {
            this.session.currentSession.comment = input;
            // Persist comment update to storage
            await this.dataService.saveCurrentSession(this.session.currentSession);
            vscode.window.showInformationMessage('Comment added');
        }
    };

    /**
     * Display a report of the current or last session
     * Shows duration in minutes via information message
     */
    public showReport() {
        const s = this.session.currentSession;
        if (s && this.session.isTracking) {
            // Calculate elapsed time for running session
            const mins = Math.round((Date.now() - s.startTime) / 60000);
            vscode.window.showInformationMessage(`Running session: ${mins} minutes`);
        } else if (s && s.duration) {
            // Show duration of completed session
            const mins = Math.round(s.duration / 60000);
            vscode.window.showInformationMessage(`Last session: ${mins} minutes`);
        } else {
            vscode.window.showInformationMessage('No session data available');
        }
        // TODO: Implement detailed report with multiple sessions
        // TODO: Add daily/weekly/monthly summaries
    }

    /**
     * Reset today's tracking data
     * Clears the current session and stops tracking
     */
    public async resetToday() {
        // Stop idle detection
        this.idleDetectionService.stopTracking();
        
        // Stop auto-save timer
        this.stopAutoSave();
        
        this.session.isTracking = false;
        this.session.currentSession = undefined;
        // Clear current session from storage
        await this.dataService.saveCurrentSession(undefined);
        vscode.window.showInformationMessage('Today reset');
    }

    /**
     * Export time tracking data as CSV
     */
    public async exportData() {
        const currentMonth = new Date().toISOString().slice(0, 7);
        const csv = await this.dataService.exportToCSV(currentMonth);
        
        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(`time-report-${currentMonth}.csv`),
            filters: { 'CSV files': ['csv'] }
        });
        
        if (uri) {
            await vscode.workspace.fs.writeFile(uri, Buffer.from(csv));
            vscode.window.showInformationMessage('Time report exported successfully');
        }
    }

    /**
     * Open a JSON editor for manual session editing
     * Creates a temporary document with session data
     */
    public async openSessionEditor() {
        const entries = await this.dataService.getAllEntries();
        const currentSession = await this.dataService.getCurrentSession();
        const metadata = await this.dataService.getMetadata();
        
        const content = JSON.stringify({
            metadata,
            currentSession,
            sessions: entries
        }, null, 2);
        
        const doc = await vscode.workspace.openTextDocument({
            language: 'json',
            content
        });
        vscode.window.showTextDocument(doc);
    }

    /**
     * Get current tracking state
     * @returns true if currently tracking time, false otherwise
     */
    public get isTracking() {
        return this.session.isTracking;
    }
    
   
    /**
     * Cleanup timers and listeners
     */
    public dispose() {
        this.stopAutoSave();
        this.idleDetectionService.dispose();
        if (this.gitWatcher) {
            this.gitWatcher.dispose();
        }
    }
}

/** Global tracker instance */
let trackerInstance: SWXTimeTracker | undefined;

/**
 * Activate the extension
 * Called when the extension is activated by VS Code
 * @param context - Extension context provided by VS Code
 */
export function activate(context: vscode.ExtensionContext) {
    trackerInstance = new SWXTimeTracker(context);

    // Register all commands
    context.subscriptions.push(
        vscode.commands.registerCommand('timeTracker.startTracking', async () => await trackerInstance!.startTracking()),
        vscode.commands.registerCommand('timeTracker.stopTracking', async () => await trackerInstance!.stopTracking()),
        vscode.commands.registerCommand('timeTracker.addComment', async () => await trackerInstance!.addComment()),
        vscode.commands.registerCommand('timeTracker.showReport', () => trackerInstance!.showReport()),
        vscode.commands.registerCommand('timeTracker.resetToday', async () => await trackerInstance!.resetToday()),
        vscode.commands.registerCommand('timeTracker.exportData', async () => await trackerInstance!.exportData()),
        vscode.commands.registerCommand('timeTracker.openSessionEditor', async () => await trackerInstance!.openSessionEditor()),
        
        // Temporary test command
        vscode.commands.registerCommand('timeTracker.showStorageUri', () => {
            const storageUri = context.storageUri?.fsPath || 'undefined';
            const globalStorageUri = context.globalStorageUri?.fsPath || 'undefined';
            const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || 'No workspace';
            const remoteName = vscode.env.remoteName || 'local';
            
            vscode.window.showInformationMessage(
                `Storage Info:\nStorage: ${storageUri}\nGlobal: ${globalStorageUri}\nWorkspace: ${workspacePath}\nRemote: ${remoteName}`,
                'Copy to Clipboard'
            ).then(selection => {
                if (selection === 'Copy to Clipboard') {
                    vscode.env.clipboard.writeText(`Storage: ${storageUri}\nGlobal: ${globalStorageUri}\nWorkspace: ${workspacePath}\nRemote: ${remoteName}`);
                }
            });
        }),
        
        // Export globalState data as JSON
        vscode.commands.registerCommand('timeTracker.exportGlobalState', async () => {
            const jsonData = await trackerInstance!.dataService.exportGlobalStateData();
            
            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(`timetracker-globalstate-${new Date().toISOString().slice(0, 10)}.json`),
                filters: { 'JSON files': ['json'] }
            });
            
            if (uri) {
                await vscode.workspace.fs.writeFile(uri, Buffer.from(jsonData));
                vscode.window.showInformationMessage('GlobalState data exported successfully');
            }
        }),
    );

    // Check auto-start configuration
    const cfg = vscode.workspace.getConfiguration('timeTracker');
    if (cfg.get<boolean>('autoStart', true)) {
        vscode.commands.executeCommand('timeTracker.startTracking');
    }
}

/**
 * Deactivate the extension
 * Called when the extension is deactivated or VS Code is closing
 * Handles auto-stop functionality based on configuration
 */
export async function deactivate() {
    // Check auto-stop configuration and stop tracking if enabled
    const cfg = vscode.workspace.getConfiguration('timeTracker');
    if (cfg.get<boolean>('autoStop', true) && trackerInstance?.isTracking) {
        await trackerInstance.stopTracking();
    }
    
    // Cleanup services
    trackerInstance?.dispose();
}
