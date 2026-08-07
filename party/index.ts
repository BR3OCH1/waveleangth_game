import type * as Party from "partykit/server";
import type {
  GameState,
  Player,
  ClientMessage,
  Concept,
} from "../lib/game-types";

// ─── Concept bank ─────────────────────────────────────────────────────────────
const CONCEPTS: Concept[] = [
  { left: "Cold", right: "Hot" },
  { left: "Slow", right: "Fast" },
  { left: "Ugly", right: "Beautiful" },
  { left: "Weak", right: "Powerful" },
  { left: "Boring", right: "Exciting" },
  { left: "Ancient", right: "Futuristic" },
  { left: "Silent", right: "Loud" },
  { left: "Dangerous", right: "Safe" },
  { left: "Cheap", right: "Expensive" },
  { left: "Sad", right: "Happy" },
  { left: "Simple", right: "Complex" },
  { left: "Natural", right: "Artificial" },
  { left: "Fictional", right: "Real" },
  { left: "Tiny", right: "Massive" },
];

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[randomInt(0, arr.length - 1)];
}

function calcScore(dial: number, target: number): number {
  const distance = Math.abs(dial - target);
  return Math.max(0, Math.round(100 - distance * 2));
}

// ─── Default state factory ────────────────────────────────────────────────────
function defaultState(): GameState {
  return {
    phase: "lobby",
    players: [],
    clueGiverId: null,
    targetValue: 50,
    concept: null,
    clue: "",
    dialValue: 50,
    score: null,
  };
}

// ─── Server ───────────────────────────────────────────────────────────────────
export default class WavelengthParty implements Party.Server {
  private state: GameState = defaultState();
  // Map of connectionId → username (so we can restore on reconnect)
  private connections: Map<string, string> = new Map();

  constructor(readonly room: Party.Room) { }

  // ── Lifecycle ────────────────────────────────────────────────────────────────
  onConnect(conn: Party.Connection) {
    // Send the full current state to the newly connected socket
    conn.send(this.snapshot());
  }

  onMessage(message: string, sender: Party.Connection) {
    const msg = JSON.parse(message) as ClientMessage;

    switch (msg.type) {
      case "join":
        this.handleJoin(sender.id, msg.username);
        break;
      case "start_game":
        this.handleStartGame();
        break;
      case "submit_clue":
        this.handleSubmitClue(sender.id, msg.clue);
        break;
      case "update_dial":
        this.handleUpdateDial(sender.id, msg.value);
        break;
      case "lock_in":
        this.handleLockIn(sender.id);
        break;
      case "play_again":
        this.handlePlayAgain();
        break;
    }
  }

  onClose(conn: Party.Connection) {
    this.connections.delete(conn.id);
    this.state.players = this.state.players.filter((p) => p.id !== conn.id);
    // If the clue giver disconnects mid-round, reset to lobby
    if (
      this.state.clueGiverId === conn.id &&
      this.state.phase !== "revealed"
    ) {
      this.state = { ...defaultState(), players: this.state.players };
    }
    this.broadcastState();
  }

  onError(conn: Party.Connection, error: Error) {
    console.error(`[wavelength] connection ${conn.id} error:`, error);
    this.onClose(conn);
  }

  // ── Handlers ─────────────────────────────────────────────────────────────────
  private handleJoin(id: string, username: string) {
    this.connections.set(id, username);
    // Upsert: update username if already in list, else add
    const existing = this.state.players.findIndex((p) => p.id === id);
    const player: Player = { id, username };
    if (existing >= 0) {
      this.state.players[existing] = player;
    } else {
      this.state.players.push(player);
    }
    this.broadcastState();
  }

  private handleStartGame() {
    if (this.state.players.length < 1) return;
    const clueGiver = pick(this.state.players);
    this.state = {
      ...this.state,
      phase: "writing_clue",
      clueGiverId: clueGiver.id,
      targetValue: randomInt(5, 95), // avoid extreme edges
      concept: pick(CONCEPTS),
      clue: "",
      dialValue: 50,
      score: null,
    };
    this.broadcastState();
  }

  private handleSubmitClue(senderId: string, clue: string) {
    if (
      this.state.phase !== "writing_clue" ||
      senderId !== this.state.clueGiverId
    )
      return;
    this.state.clue = clue.trim().slice(0, 40);
    this.state.phase = "guessing";
    this.broadcastState();
  }

  private handleUpdateDial(senderId: string, value: number) {
    if (
      this.state.phase !== "guessing" ||
      senderId === this.state.clueGiverId
    )
      return;
    this.state.dialValue = Math.max(0, Math.min(100, Math.round(value)));
    this.broadcastState();
  }

  private handleLockIn(senderId: string) {
    if (
      this.state.phase !== "guessing" ||
      senderId === this.state.clueGiverId
    )
      return;
    this.state.score = calcScore(this.state.dialValue, this.state.targetValue);
    this.state.phase = "revealed";
    this.broadcastState();
  }

  private handlePlayAgain() {
    if (this.state.phase !== "revealed") return;
    this.state = { ...defaultState(), players: this.state.players };
    this.broadcastState();
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  private snapshot(): string {
    return JSON.stringify({ type: "game_state", state: this.state });
  }

  private broadcastState() {
    this.room.broadcast(this.snapshot());
  }
}

WavelengthParty satisfies Party.Worker;
