import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

interface TimeEntry {
  id: string;
  date: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  comment?: string;
  project?: string;
  gitCommits?: GitCommitInfo[];
}

interface GitCommitInfo {
  hash: string;
  message: string;
  timestamp: number;
  author: string;
}

interface TimeSession {
    isTracking: boolean;
    currentSession?: TimeEntry;
    lastActivity: number;
}

export class SWXTimeTracker {
    private context: vscode.ExtensionContext;
    private session: TimeSession;
    private dataFile: string;
    private idleTimer?: NodeJS.Timer;
    private gitWatcher?: vscode.FileSystemWatcher;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.dataFile = path.join(context.globalStorageUri.fsPath, 'swx-time-tracker.json');
        this.session = {
            isTracking: false,
            lastActivity: Date.now()
        }
    };

    public startTracking() {
        if (this.session.isTracking) {
            vscode.window.showInformationMessage('Tracking already running');
            return;
        }
        this.session.isTracking = true;
        this.session.currentSession = {
            id: String(Date.now()),
            date: new Date().toISOString().slice(0, 10),
            startTime: Date.now(),
        };
        vscode.window.showInformationMessage('Time tracking started');
    }

    public stopTracking() {
        if (!this.session.isTracking || !this.session.currentSession) {
            vscode.window.showInformationMessage('Tracking is not running');
            return;
        }
        this.session.currentSession.endTime = Date.now();
        this.session.currentSession.duration =
            this.session.currentSession.endTime - this.session.currentSession.startTime;
        this.session.isTracking = false;
        vscode.window.showInformationMessage('Time tracking stopped');
    }

    public addComment = async () => {
        const input = await vscode.window.showInputBox({ placeHolder: 'Comment (English only)' });
        if (input && this.session.currentSession) {
            this.session.currentSession.comment = input;
            vscode.window.showInformationMessage('Comment added');
        }
    };

    public showReport() {
        const s = this.session.currentSession;
        if (s && this.session.isTracking) {
            const mins = Math.round((Date.now() - s.startTime) / 60000);
            vscode.window.showInformationMessage(`Running session: ${mins} minutes`);
        } else if (s && s.duration) {
            const mins = Math.round(s.duration / 60000);
            vscode.window.showInformationMessage(`Last session: ${mins} minutes`);
        } else {
            vscode.window.showInformationMessage('No session data available');
        }
    }

    public resetToday() {
        this.session.isTracking = false;
        this.session.currentSession = undefined;
        vscode.window.showInformationMessage('Today reset');
    }

    public exportData() {
        vscode.window.showInformationMessage('Export not implemented (minimal).');
    }

    public async openSessionEditor() {
        const doc = await vscode.workspace.openTextDocument({
            language: 'json',
            content: '{\n  "sessions": []\n}',
        });
        vscode.window.showTextDocument(doc);
    }

    public get isTracking() {
        return this.session.isTracking;
    }
}

let trackerInstance: SWXTimeTracker | undefined;

export function activate(context: vscode.ExtensionContext) {
    trackerInstance = new SWXTimeTracker(context);

    context.subscriptions.push(
        vscode.commands.registerCommand('timeTracker.startTracking', () => trackerInstance!.startTracking()),
        vscode.commands.registerCommand('timeTracker.stopTracking', () => trackerInstance!.stopTracking()),
        vscode.commands.registerCommand('timeTracker.addComment', () => trackerInstance!.addComment()),
        vscode.commands.registerCommand('timeTracker.showReport', () => trackerInstance!.showReport()),
        vscode.commands.registerCommand('timeTracker.resetToday', () => trackerInstance!.resetToday()),
        vscode.commands.registerCommand('timeTracker.exportData', () => trackerInstance!.exportData()),
        vscode.commands.registerCommand('timeTracker.openSessionEditor', () => trackerInstance!.openSessionEditor()),
    );

    const cfg = vscode.workspace.getConfiguration('timeTracker');
    if (cfg.get<boolean>('autoStart', true)) {
        vscode.commands.executeCommand('timeTracker.startTracking');
    }
}

export function deactivate() {
    const cfg = vscode.workspace.getConfiguration('timeTracker');
    if (cfg.get<boolean>('autoStop', true) && trackerInstance?.isTracking) {
        trackerInstance.stopTracking();
    }
}
