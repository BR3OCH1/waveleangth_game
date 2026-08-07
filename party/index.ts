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
    activeTeam: null,
    teamScores: { cyan: 0, pink: 0 },
    clueGiverHistory: [],
    targetValue: 50,
    concept: null,
    clue: "",
    dialValue: 50,
    scoreThisRound: null,
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
      case "toggle_team":
        this.handleToggleTeam(sender.id, msg.team);
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
    const player: Player = { id, username, team: null }; // default unassigned
    if (existing >= 0) {
      player.team = this.state.players[existing].team;
      this.state.players[existing] = player;
    } else {
      this.state.players.push(player);
    }
    this.updateHostId();
    this.broadcastState();
  }

  private handleToggleTeam(id: string, team: "cyan" | "pink") {
    if (this.state.phase !== "lobby") return;
    const existing = this.state.players.find(p => p.id === id);
    if (existing) {
      existing.team = team;
      this.broadcastState();
    }
  }

  private handleStartGame(senderId: string) {
    const cyanPlayers = this.state.players.filter(p => p.team === "cyan");
    const pinkPlayers = this.state.players.filter(p => p.team === "pink");
    if (cyanPlayers.length < 1 || pinkPlayers.length < 1) return;
    if (senderId !== this.state.hostId) return; // Host-only

    const startTeam = Math.random() < 0.5 ? "cyan" : "pink";
    const activePlayers = startTeam === "cyan" ? cyanPlayers : pinkPlayers;
    const clueGiver = pick(activePlayers);

    this.state = {
      ...this.state,
      phase: "writing_clue",
      activeTeam: startTeam,
      clueGiverId: clueGiver.id,
      clueGiverHistory: [clueGiver.id],
      teamScores: { cyan: 0, pink: 0 },
      targetValue: randomInt(5, 95), // avoid extreme edges
      concept: pick(CONCEPTS),
      clue: "",
      dialValue: 50,
      scoreThisRound: null,
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
    const lockingPlayer = this.state.players.find(p => p.id === senderId);
    if (lockingPlayer?.team !== this.state.activeTeam) return;

    const score = calcScore(this.state.dialValue, this.state.targetValue);
    this.state.scoreThisRound = score;
    this.state.phase = "revealed";

    if (this.state.activeTeam === "cyan") {
      this.state.teamScores.cyan += score;
    } else if (this.state.activeTeam === "pink") {
      this.state.teamScores.pink += score;
    }
    this.broadcastState();
  }

  private handlePlayAgain(senderId: string) {
    if (this.state.phase !== "revealed") return;
    if (senderId !== this.state.hostId) return; // Host-only

    const nextTeam = this.state.activeTeam === "cyan" ? "pink" : "cyan";
    const activePlayers = this.state.players.filter(p => p.team === nextTeam);

    let availableGivers = activePlayers.filter(p => !this.state.clueGiverHistory.includes(p.id));
    if (availableGivers.length === 0) {
      const otherTeamHistory = this.state.clueGiverHistory.filter(id => {
        const p = this.state.players.find(x => x.id === id);
        return p?.team !== nextTeam;
      });
      this.state.clueGiverHistory = otherTeamHistory;
      availableGivers = activePlayers;
    }

    const nextGiver = pick(availableGivers);
    this.state.clueGiverHistory.push(nextGiver.id);

    this.state = {
      ...this.state,
      phase: "writing_clue",
      activeTeam: nextTeam,
      clueGiverId: nextGiver.id,
      targetValue: randomInt(5, 95),
      concept: pick(CONCEPTS),
      clue: "",
      dialValue: 50,
      scoreThisRound: null,
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
