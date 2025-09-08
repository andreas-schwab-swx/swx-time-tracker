import * as vscode from 'vscode';
import { TimeEntry } from './models';

/**
 * IdleDetectionService - Flow Diagram
 * 
 *     ┌─────────────────┐
 *     │ Constructor     │
 *     │ - Initialize    │
 *     └─────────────────┘
 *              │
 *              ▼
 *     ┌─────────────────┐
 *     │ startTracking() │
 *     │ - Set session   │
 *     │ - Set callback  │
 *     └─────────────────┘
 *              │
 *         ┌────┴────┐
 *         ▼         ▼
 * ┌──────────────┐ ┌──────────────┐
 * │setupActivity │ │startIdle     │
 * │Listeners()   │ │Detection()   │
 * └──────────────┘ └──────────────┘
 *         │             │
 *         ▼             ▼
 * ┌──────────────┐ ┌──────────────┐
 * │Activity Events│ │Timer Check   │
 * │- Text changes│ │Every 60 sec  │
 * │- Editor switch│ └──────────────┘
 * │- File save   │         │
 * │- Cursor move │         ▼
 * └──────────────┘   ┌──────────┐
 *         │          │ Idle >   │ No
 *         ▼          │10 min?   │────┐
 * ┌──────────────┐   └──────────┘    │
 * │updateActivity│         │ Yes     │
 * │- Set timestamp│         ▼         ▼
 * └──────────────┘   ┌─────────────────┐ │
 *                    │ onIdleTimeout() │ │
 *                    │ - Call callback │ │
 *                    └─────────────────┘ │
 *                             │          │
 *                             ▼          │
 *                    ┌─────────────────┐ │
 *                    │ stopTracking()  │◀┘
 *                    │ - Stop timer    │
 *                    │ - Remove listener│
 *                    │ - Clear session │
 *                    └─────────────────┘
 */

/**
 * Callback function type for idle timeout events
 */
export type IdleTimeoutCallback = (session: TimeEntry, lastActivity: number) => Promise<void>;

/**
 * Service for detecting user idle time and managing activity tracking
 * Automatically stops time tracking sessions when user is inactive
 */
export class IdleDetectionService {
    private context: vscode.ExtensionContext;
    private idleTimer?: NodeJS.Timer;
    private lastActivity: number = Date.now();
    private isTracking: boolean = false;
    private currentSession?: TimeEntry;
    private onIdleTimeout?: IdleTimeoutCallback;
    private activityListeners: vscode.Disposable[] = [];

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    /**
     * Start tracking idle time for a session
     * @param session Current tracking session
     * @param onTimeout Callback when idle timeout occurs
     */
    public startTracking(session: TimeEntry, onTimeout: IdleTimeoutCallback): void {
        // Clean up any existing tracking first
        this.stopTracking();
        
        this.isTracking = true;
        this.currentSession = session;
        this.onIdleTimeout = onTimeout;
        this.lastActivity = Date.now();
        
        // Start activity monitoring
        this.setupActivityListeners();
        this.startIdleDetection();
    }

    /**
     * Stop tracking idle time
     */
    public stopTracking(): void {
        this.isTracking = false;
        this.currentSession = undefined;
        this.onIdleTimeout = undefined;
        
        // Stop idle detection timer
        if (this.idleTimer) {
            clearInterval(this.idleTimer);
            this.idleTimer = undefined;
        }
        
        // Remove activity listeners
        this.activityListeners.forEach(listener => listener.dispose());
        this.activityListeners = [];
    }

    /**
     * Get the last activity timestamp
     */
    public getLastActivity(): number {
        return this.lastActivity;
    }

    /**
     * Update activity timestamp (can be called manually)
     */
    public updateActivity(): void {
        if (this.isTracking) {
            this.lastActivity = Date.now();
        }
    }

    /**
     * Get current idle time in milliseconds
     */
    public getIdleTime(): number {
        return Date.now() - this.lastActivity;
    }

    /**
     * Get configured idle threshold in milliseconds
     */
    private getIdleThreshold(): number {
        return vscode.workspace
            .getConfiguration('timeTracker')
            .get<number>('idleThreshold', 600) * 1000; // Convert seconds to ms
    }

    /**
     * Setup idle detection timer
     */
    private startIdleDetection(): void {
        // Check every minute for idle timeout
        this.idleTimer = setInterval(async () => {
            if (!this.isTracking || !this.currentSession || !this.onIdleTimeout) {
                return;
            }

            const idleThreshold = this.getIdleThreshold();
            const idleTime = this.getIdleTime();

            if (idleTime > idleThreshold) {
                // Call timeout callback with session and last activity time
                await this.onIdleTimeout(this.currentSession, this.lastActivity);
                
                // Stop tracking after timeout
                this.stopTracking();
            }
        }, 60000); // Check every minute
    }

    /**
     * Setup activity listeners to track user activity
     * Only active during tracking sessions
     */
    private setupActivityListeners(): void {
        // Track text document changes
        this.activityListeners.push(
            vscode.workspace.onDidChangeTextDocument(() => {
                this.updateActivity();
            })
        );

        // Track active editor changes
        this.activityListeners.push(
            vscode.window.onDidChangeActiveTextEditor(() => {
                this.updateActivity();
            })
        );

        // Track terminal activity
        this.activityListeners.push(
            vscode.window.onDidOpenTerminal(() => {
                this.updateActivity();
            })
        );

        // Track file saves
        this.activityListeners.push(
            vscode.workspace.onDidSaveTextDocument(() => {
                this.updateActivity();
            })
        );

        // Track selection changes (cursor movement)
        this.activityListeners.push(
            vscode.window.onDidChangeTextEditorSelection(() => {
                this.updateActivity();
            })
        );

        // Track visible editor changes (scrolling, etc.)
        this.activityListeners.push(
            vscode.window.onDidChangeTextEditorVisibleRanges(() => {
                this.updateActivity();
            })
        );
    }

    /**
     * Check if session should be resumed based on age
     * @param session Session to check
     * @returns true if session should be resumed, false if auto-stopped
     */
    public shouldResumeSession(session: TimeEntry): boolean {
        if (!session.startTime) {
            return false;
        }

        const idleThreshold = this.getIdleThreshold();
        const sessionAge = Date.now() - session.startTime;

        return sessionAge < idleThreshold;
    }

    /**
     * Auto-stop an old session that exceeds idle threshold
     * @param session Session to auto-stop
     * @returns Updated session with end time and duration
     */
    public autoStopOldSession(session: TimeEntry): TimeEntry {
        const idleThreshold = this.getIdleThreshold();
        
        return {
            ...session,
            endTime: session.startTime + idleThreshold,
            duration: idleThreshold
        };
    }

    /**
     * Get idle status information
     */
    public getIdleStatus(): {
        isTracking: boolean;
        idleTimeMs: number;
        idleThresholdMs: number;
        isIdle: boolean;
    } {
        const idleTimeMs = this.getIdleTime();
        const idleThresholdMs = this.getIdleThreshold();

        return {
            isTracking: this.isTracking,
            idleTimeMs,
            idleThresholdMs,
            isIdle: idleTimeMs > idleThresholdMs
        };
    }

    /**
     * Dispose of timers and listeners
     */
    public dispose(): void {
        this.stopTracking();
    }
}