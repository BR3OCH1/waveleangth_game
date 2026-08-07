// ─── Shared types used by both party/index.ts and the frontend ───────────────

export type Phase =
    | "lobby"        // waiting for players, anyone can start
    | "writing_clue" // clue giver sees target, writes a one-word clue
    | "guessing"     // guessers drag the dial; clue giver watches
    | "revealed";    // everyone sees the result + score

export interface Player {
    id: string;
    username: string;
}

export interface Concept {
    left: string;
    right: string;
}

export interface GameState {
    phase: Phase;
    players: Player[];
    hostId: string | null;        // connection id of the room admin/host
    clueGiverId: string | null;   // connection id of the clue giver
    targetValue: number;          // 0–100, only visible to clue giver during writing_clue
    concept: Concept | null;
    clue: string;                 // the one-word clue
    dialValue: number;            // 0–100, moved by guessers in real-time
    score: number | null;         // 0–100, set on reveal
}

// ─── Message types ────────────────────────────────────────────────────────────

// Server → Client
export interface InitMessage {
    type: "init";
    id: string;
}

export interface GameStateMessage {
    type: "game_state";
    state: GameState;
}

export type ServerMessage = InitMessage | GameStateMessage;

// Client → Server
export interface JoinMsg { type: "join"; username: string }
export interface StartGameMsg { type: "start_game" }
export interface SubmitClueMsg { type: "submit_clue"; clue: string }
export interface UpdateDialMsg { type: "update_dial"; value: number }
export interface LockInMsg { type: "lock_in" }
export interface PlayAgainMsg { type: "play_again" }
export interface ResetGameMsg { type: "reset_game" }

export type ClientMessage =
    | JoinMsg
    | StartGameMsg
    | SubmitClueMsg
    | UpdateDialMsg
    | LockInMsg
    | PlayAgainMsg
    | ResetGameMsg;
