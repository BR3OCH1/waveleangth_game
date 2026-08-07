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
  return Math.max(0, Math.round(100 - Math.abs(dial - target) * 2));
}

function defaultState(): GameState {
  return {
    phase: "lobby",
    players: [],
    hostId: null,
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

  constructor(readonly room: Party.Room) { }

  // ── Lifecycle ────────────────────────────────────────────────────────────────
  onConnect(conn: Party.Connection) {
    // Send init message with server-assigned connection ID
    conn.send(JSON.stringify({ type: "init", id: conn.id }));
    // Send full current state
    conn.send(this.snapshot());
  }

  onMessage(message: string, sender: Party.Connection) {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(message) as ClientMessage;
    } catch {
      return; // ignore malformed messages
    }

    switch (msg.type) {
      case "join":
        this.handleJoin(sender.id, msg.username);
        break;
      case "start_game":
        this.handleStartGame(sender.id);
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
        this.handlePlayAgain(sender.id);
        break;
      case "reset_game":
        this.handleResetGame(sender.id);
        break;
    }
  }

  onClose(conn: Party.Connection) {
    this.state.players = this.state.players.filter((p) => p.id !== conn.id);
    this.updateHostId();
    // If the clue giver disconnects mid-round, reset to lobby
    if (
      this.state.clueGiverId === conn.id &&
      this.state.phase !== "revealed"
    ) {
      this.state = {
        ...defaultState(),
        players: this.state.players,
        hostId: this.state.hostId,
      };
    }
    this.broadcastState();
  }

  onError(conn: Party.Connection) {
    this.onClose(conn);
  }

  // ── Host management ──────────────────────────────────────────────────────────
  private updateHostId(): void {
    if (this.state.players.length > 0) {
      // If current host is still connected, keep them. Otherwise, promote first player.
      const hostStillHere = this.state.players.some(p => p.id === this.state.hostId);
      if (!hostStillHere) {
        this.state.hostId = this.state.players[0].id;
      }
    } else {
      this.state.hostId = null;
    }
  }

  // ── Handlers ─────────────────────────────────────────────────────────────────
  private handleJoin(id: string, username: string) {
    const existing = this.state.players.findIndex((p) => p.id === id);
    const player: Player = { id, username };
    if (existing >= 0) {
      this.state.players[existing] = player;
    } else {
      this.state.players.push(player);
    }
    this.updateHostId();
    this.broadcastState();
  }

  private handleStartGame(senderId: string) {
    if (this.state.players.length < 2) return;
    if (senderId !== this.state.hostId) return; // Host-only
    const clueGiver = pick(this.state.players);
    this.state = {
      ...this.state,
      phase: "writing_clue",
      clueGiverId: clueGiver.id,
      targetValue: randomInt(5, 95),
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

  private handlePlayAgain(senderId: string) {
    if (this.state.phase !== "revealed") return;
    if (senderId !== this.state.hostId) return; // Host-only
    this.state = {
      ...defaultState(),
      players: this.state.players,
      hostId: this.state.hostId,
    };
    this.broadcastState();
  }

  private handleResetGame(senderId: string) {
    if (senderId !== this.state.hostId) return; // Host-only
    this.state = {
      ...defaultState(),
      players: this.state.players,
      hostId: this.state.hostId,
    };
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
