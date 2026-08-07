"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import PartySocket from "partysocket";
import type { GameState, ServerMessage, ClientMessage, Concept, Player } from "@/lib/game-types";
import Dial from "@/components/Dial";

// ─── Helpers ─────────────────────────────────────────────────────────────────
const AVATAR_COLORS = [
    "#8b5cf6", "#22d3ee", "#ec4899", "#f59e0b", "#10b981", "#3b82f6",
];

function getAvatarColor(id: string) {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function scoreTier(score: number): string {
    if (score >= 95) return "🎯 Perfect!";
    if (score >= 80) return "🔥 Hot!";
    if (score >= 60) return "👍 Close!";
    if (score >= 40) return "😬 Getting there…";
    return "❌ Miss!";
}

function scoreTierColor(score: number): string {
    if (score >= 95) return "#fbbf24";
    if (score >= 80) return "#f97316";
    if (score >= 60) return "#4ade80";
    if (score >= 40) return "#94a3b8";
    return "#f87171";
}

type ConnectionStatus = "connecting" | "connected" | "error";
const STATUS_LABELS: Record<ConnectionStatus, string> = {
    connecting: "Connecting…",
    connected: "Connected",
    error: "Connection error",
};

const DEFAULT_STATE: GameState = {
    gameMode: "coop",
    phase: "lobby",
    players: [],
    hostId: null,
    clueGiverId: null,
    activeTeam: null,
    teamScores: { cyan: 0, pink: 0 },
    coopScore: 0,
    clueGiverHistory: [],
    targetValue: 50,
    concept: null,
    clue: "",
    dialValue: 50,
    scoreThisRound: null,
};

// ─── Extracted Components ─────────────────────────────────────────────────────

function ConceptBadge({ concept }: { concept: Concept | null }) {
    if (!concept) return null;
    return (
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "2rem", width: "100%", position: "relative" }}>
            <div className="dual-spect-bg" />
            <span className="concept-badge dual-concept-badge">
                <span className="concept-left">{concept.left}</span>
                <span className="slash">vs</span>
                <span className="concept-right">{concept.right}</span>
            </span>
        </div>
    );
}

function StatusBar({
    connStatus,
    phase,
    isHost,
    onReset
}: {
    connStatus: ConnectionStatus;
    phase: string;
    isHost: boolean;
    onReset: () => void;
}) {
    return (
        <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: "1.5rem", width: "100%",
        }}>
            <div style={{
                display: "flex", alignItems: "center", gap: "0.5rem",
                padding: "0.5rem 0.875rem", borderRadius: "999px",
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
            }}>
                <span className={`status-dot ${connStatus}`} />
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    {STATUS_LABELS[connStatus]}
                </span>
            </div>

            {phase !== "lobby" && isHost && (
                <button
                    onClick={onReset}
                    className="reset-btn"
                    title="Reset game back to lobby"
                >
                    ⚙️ Reset Room
                </button>
            )}
        </div>
    );
}

function GlobalScoreboard({ score }: { score: number }) {
    return (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", marginBottom: "1.5rem", padding: "0.5rem 1rem", background: "rgba(255,255,255,0.03)", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <span style={{ fontSize: "0.85rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>Co-op Score</span>
                <span style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--text-primary)" }}>{score}</span>
            </div>
        </div>
    );
}

function Scoreboard({ activeTeam, scores }: { activeTeam: "cyan" | "pink" | null, scores: { cyan: number, pink: number } }) {
    if (!activeTeam) return null;
    return (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", padding: "0.5rem 1rem", background: "rgba(255,255,255,0.03)", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--accent-cyan)", fontWeight: 800 }}>
                {activeTeam === "cyan" && <span style={{ fontSize: "1.2rem" }}>▶</span>}
                Team Cyan: {scores.cyan}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
                Score
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--accent-pink)", fontWeight: 800 }}>
                Team Pink: {scores.pink}
                {activeTeam === "pink" && <span style={{ fontSize: "1.2rem" }}>◀</span>}
            </div>
        </div>
    );
}

function PlayerList({
    players, hostId, clueGiverId, myId, onToggleTeam, gameMode
}: {
    players: Player[], hostId: string | null, clueGiverId: string | null, myId: string, onToggleTeam?: (team: "cyan" | "pink") => void, gameMode: "coop" | "teams"
}) {
    const renderPlayer = (p: Player) => (
        <div key={p.id} className="player-badge" style={{ padding: "0.4rem 0.75rem", gap: "0.5rem" }}>
            <span style={{ fontWeight: 600, fontSize: "0.85rem", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {p.username} {p.id === hostId && "👑"}
            </span>
            <div style={{ display: "flex", gap: "0.25rem", flexShrink: 0 }}>
                {p.id === clueGiverId && <span className="tag-cluegiver" style={{ fontSize: "0.6rem" }}>Giver</span>}
                {p.id === myId && <span className="tag-you" style={{ fontSize: "0.6rem" }}>You</span>}
            </div>
        </div>
    );

    if (gameMode === "coop") {
        return (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                {players.map(renderPlayer)}
            </div>
        );
    }

    const unassigned = players.filter(p => !p.team);
    const cyan = players.filter(p => p.team === "cyan");
    const pink = players.filter(p => p.team === "pink");

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {unassigned.length > 0 && (
                <div style={{ background: "rgba(255,255,255,0.02)", padding: "0.75rem", borderRadius: "8px" }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.5rem", textTransform: "uppercase", fontWeight: 700 }}>Unassigned</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                        {unassigned.map(renderPlayer)}
                    </div>
                </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div style={{ background: "rgba(34, 211, 238, 0.05)", border: "1px solid rgba(34, 211, 238, 0.2)", borderRadius: "8px", padding: "0.75rem" }}>
                    <div style={{ fontSize: "0.8rem", color: "var(--accent-cyan)", marginBottom: "0.5rem", textTransform: "uppercase", fontWeight: 800, textAlign: "center" }}>Team Cyan</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", minHeight: "2rem" }}>
                        {cyan.map(renderPlayer)}
                    </div>
                    {onToggleTeam && (
                        <button onClick={() => onToggleTeam("cyan")} style={{ marginTop: "0.75rem", width: "100%", padding: "0.4rem", background: "rgba(34,211,238,0.15)", border: "1px solid var(--accent-cyan)", color: "var(--accent-cyan)", borderRadius: "6px", fontSize: "0.75rem", cursor: "pointer", fontWeight: 700 }}>
                            Join Cyan
                        </button>
                    )}
                </div>

                <div style={{ background: "rgba(236, 72, 153, 0.05)", border: "1px solid rgba(236, 72, 153, 0.2)", borderRadius: "8px", padding: "0.75rem" }}>
                    <div style={{ fontSize: "0.8rem", color: "var(--accent-pink)", marginBottom: "0.5rem", textTransform: "uppercase", fontWeight: 800, textAlign: "center" }}>Team Pink</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", minHeight: "2rem" }}>
                        {pink.map(renderPlayer)}
                    </div>
                    {onToggleTeam && (
                        <button onClick={() => onToggleTeam("pink")} style={{ marginTop: "0.75rem", width: "100%", padding: "0.4rem", background: "rgba(236,72,153,0.15)", border: "1px solid var(--accent-pink)", color: "var(--accent-pink)", borderRadius: "6px", fontSize: "0.75rem", cursor: "pointer", fontWeight: 700 }}>
                            Join Pink
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Main Game Client ─────────────────────────────────────────────────────────

export default function GameClient({ roomCode, username }: { roomCode: string; username: string }) {
    const [game, setGame] = useState<GameState>(DEFAULT_STATE);
    const [connStatus, setConnStatus] = useState<ConnectionStatus>("connecting");
    const [clueInput, setClueInput] = useState("");
    const [myId, setMyId] = useState("");
    const [localDial, setLocalDial] = useState(50);
    const socketRef = useRef<PartySocket | null>(null);
    const usernameRef = useRef(username); // Stable ref for reconnection

    // Keep username ref current
    useEffect(() => { usernameRef.current = username; }, [username]);

    // Reset localDial when entering guessing phase
    useEffect(() => {
        if (game.phase === "guessing") {
            setLocalDial(game.dialValue);
        }
    }, [game.phase]); // eslint-disable-line react-hooks/exhaustive-deps

    const send = useCallback((msg: ClientMessage) => {
        socketRef.current?.send(JSON.stringify(msg));
    }, []);

    useEffect(() => {
        const rawHost = process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? "localhost:1999";
        const host = rawHost.replace(/^https?:\/\//i, "").replace(/\/+$/, "");

        // Generate a unique ID per tab (sessionStorage), so 2 tabs in the same browser
        // can join as two distinct players without kicking each other due to shared localStorage ID.
        let tabId = sessionStorage.getItem("wl_client_id");
        if (!tabId) {
            tabId = `client_${Math.random().toString(36).substring(2, 9)}`;
            sessionStorage.setItem("wl_client_id", tabId);
        }

        const socket = new PartySocket({ host, room: roomCode, id: tabId });
        socketRef.current = socket;

        // "open" fires on initial connect AND on every auto-reconnect
        socket.addEventListener("open", () => {
            setConnStatus("connected");
            socket.send(JSON.stringify({ type: "join", username: usernameRef.current }));
        });

        socket.addEventListener("message", (ev: MessageEvent) => {
            try {
                const msg = JSON.parse(ev.data as string) as ServerMessage;
                if (msg.type === "init") {
                    setMyId(msg.id);
                } else if (msg.type === "game_state") {
                    setGame(msg.state);
                }
            } catch { /* ignore malformed */ }
        });

        socket.addEventListener("error", () => setConnStatus("error"));
        socket.addEventListener("close", () =>
            setConnStatus(prev => prev === "connected" ? "error" : prev)
        );

        return () => { socket.close(); };
    }, [roomCode]);

    const isClueGiver = !!myId && myId === game.clueGiverId;
    const isHost = !!myId && myId === game.hostId;
    const myPlayer = game.players.find(p => p.id === myId);
    const isMyTeamTurn = myPlayer?.team === game.activeTeam;

    const rafRef = useRef<number | null>(null);
    const handleDialChange = useCallback((val: number) => {
        setLocalDial(val);
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
            send({ type: "update_dial", value: val });
        });
    }, [send]);

    const handleReset = useCallback(() => send({ type: "reset_game" }), [send]);
    const handlePlayAgain = useCallback(() => send({ type: "play_again" }), [send]);

    // ─── PHASE: LOBBY ─────────────────────────────────────────────────────────
    if (game.phase === "lobby") {
        return (
            <div className="phase-enter" style={{ width: "100%", maxWidth: "480px", margin: "0 auto" }}>
                <StatusBar connStatus={connStatus} phase={game.phase} isHost={isHost} onReset={handleReset} />
                <div className="glass-card dual-border" style={{ padding: "1.5rem", marginBottom: "1rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                        <h2 style={{ fontWeight: 700, fontSize: "1rem" }}>Players in Lobby</h2>
                        <span className="player-count-badge">{game.players.length} / 8</span>
                    </div>

                    <div style={{ marginBottom: "1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,0.03)", padding: "0.75rem", borderRadius: "8px" }}>
                        <div style={{ fontSize: "0.85rem", fontWeight: 600 }}>Game Mode</div>
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                            <button
                                onClick={() => isHost && send({ type: "toggle_mode", mode: "coop" })}
                                style={{ padding: "0.4rem 0.75rem", borderRadius: "6px", fontSize: "0.75rem", fontWeight: 700, cursor: isHost ? "pointer" : "default", background: game.gameMode === "coop" ? "rgba(255,255,255,0.15)" : "transparent", color: game.gameMode === "coop" ? "#fff" : "var(--text-muted)", border: "none" }}
                            >
                                Co-op
                            </button>
                            <button
                                onClick={() => isHost && send({ type: "toggle_mode", mode: "teams" })}
                                style={{ padding: "0.4rem 0.75rem", borderRadius: "6px", fontSize: "0.75rem", fontWeight: 700, cursor: isHost ? "pointer" : "default", background: game.gameMode === "teams" ? "rgba(255,255,255,0.15)" : "transparent", color: game.gameMode === "teams" ? "#fff" : "var(--text-muted)", border: "none" }}
                            >
                                Teams
                            </button>
                        </div>
                    </div>

                    {game.players.length === 0 ? (
                        <div style={{ textAlign: "center", padding: "2.5rem 1rem", color: "var(--text-muted)" }}>
                            <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>🎙️</div>
                            <p style={{ fontSize: "0.9rem" }}>Waiting for players to join…</p>
                        </div>
                    ) : (
                        <PlayerList
                            players={game.players}
                            hostId={game.hostId}
                            clueGiverId={game.clueGiverId}
                            myId={myId}
                            onToggleTeam={(team) => send({ type: "toggle_team", team })}
                            gameMode={game.gameMode}
                        />
                    )}
                </div>

                {isHost ? (
                    <button
                        className="wl-btn dual-btn"
                        onClick={() => send({ type: "start_game" })}
                        disabled={game.players.length < 2}
                    >
                        🚀 {game.players.length < 2 ? "Need 2+ players" : "Start Game"}
                    </button>
                ) : (
                    <div className="waiting-host-msg">
                        ⏳ Waiting for Host ({game.players.find(p => p.id === game.hostId)?.username ?? "…"}) to start…
                    </div>
                )}

                <p style={{ marginTop: "1rem", textAlign: "center", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    Share code <strong style={{ color: "var(--text-primary)", letterSpacing: "0.08em" }}>{roomCode}</strong> with friends
                </p>
            </div>
        );
    }

    // ─── PHASE: WRITING CLUE ──────────────────────────────────────────────────
    if (game.phase === "writing_clue") {
        return (
            <div className="phase-enter" style={{ width: "100%", maxWidth: "480px", margin: "0 auto" }}>
                <StatusBar connStatus={connStatus} phase={game.phase} isHost={isHost} onReset={handleReset} />
                {game.gameMode === "coop" ? <GlobalScoreboard score={game.coopScore} /> : <Scoreboard activeTeam={game.activeTeam} scores={game.teamScores} />}
                <ConceptBadge concept={game.concept} />

                {isClueGiver ? (
                    <>
                        <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
                            <p className="role-super-title">You are the Clue Giver</p>
                            <h2 style={{ fontWeight: 800, fontSize: "1.5rem", marginBottom: "1rem" }}>
                                Give a one-word clue
                            </h2>
                        </div>

                        {/* Target Dial — read-only, shows where the target is */}
                        <div className="glass-card dual-border" style={{ padding: "1.5rem", marginBottom: "1.5rem", textAlign: "center" }}>
                            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.5rem" }}>
                                🎯 Your Target Position
                            </p>
                            <Dial
                                value={game.targetValue}
                                readOnly
                                leftLabel={game.concept?.left}
                                rightLabel={game.concept?.right}
                                targetValue={game.targetValue}
                            />
                            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.5rem" }}>
                                The guessers will try to land on the gold marker ↑
                            </p>
                        </div>

                        {/* Clue input form */}
                        <div className="glass-card" style={{ padding: "1.5rem" }}>
                            <form
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    if (!clueInput.trim()) return;
                                    send({ type: "submit_clue", clue: clueInput.trim() });
                                    setClueInput("");
                                }}
                                style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
                            >
                                <label className="wl-label" htmlFor="clue-input">Your one-word clue</label>
                                <input
                                    id="clue-input"
                                    className="wl-input"
                                    style={{ fontSize: "1.2rem", fontWeight: 600, textAlign: "center" }}
                                    type="text"
                                    placeholder="e.g. Volcano"
                                    value={clueInput}
                                    onChange={(e) => setClueInput(e.target.value.slice(0, 40))}
                                    autoFocus
                                    autoComplete="off"
                                />
                                <button type="submit" className="wl-btn dual-btn" disabled={!clueInput.trim()}>
                                    Submit Clue →
                                </button>
                            </form>
                        </div>
                    </>
                ) : (
                    <div className="glass-card waiting-pulse dual-border" style={{ padding: "3rem 1.5rem", textAlign: "center", marginBottom: "1.5rem" }}>
                        <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🤔</div>
                        <p style={{ fontWeight: 700, fontSize: "1.1rem", marginBottom: "0.5rem" }}>
                            {game.players.find(p => p.id === game.clueGiverId)?.username ?? "Someone"} is thinking…
                        </p>
                        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
                            Get ready to guess!
                        </p>
                    </div>
                )}

                <div style={{ marginTop: "1.25rem" }}>
                    <PlayerList players={game.players} hostId={game.hostId} clueGiverId={game.clueGiverId} myId={myId} gameMode={game.gameMode} />
                </div>
            </div>
        );
    }

    // ─── PHASE: GUESSING ──────────────────────────────────────────────────────
    if (game.phase === "guessing") {
        const canGuess = game.gameMode === "coop" ? !isClueGiver : (!isClueGiver && isMyTeamTurn);

        return (
            <div className="phase-enter" style={{ width: "100%", maxWidth: "480px", margin: "0 auto" }}>
                <StatusBar connStatus={connStatus} phase={game.phase} isHost={isHost} onReset={handleReset} />
                {game.gameMode === "coop" ? <GlobalScoreboard score={game.coopScore} /> : <Scoreboard activeTeam={game.activeTeam} scores={game.teamScores} />}
                <ConceptBadge concept={game.concept} />

                <div className="glass-card dual-border" style={{ padding: "1.5rem", marginBottom: "1.25rem" }}>
                    <div style={{ textAlign: "center", marginBottom: "1rem" }}>
                        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.5rem" }}>
                            {isClueGiver ? "Your clue" : "The clue is"}
                        </p>
                        <p className="clue-display">&ldquo;{game.clue}&rdquo;</p>
                    </div>

                    <Dial
                        value={isClueGiver ? game.dialValue : localDial}
                        onChange={canGuess ? handleDialChange : undefined}
                        readOnly={!canGuess}
                        leftLabel={game.concept?.left}
                        rightLabel={game.concept?.right}
                        targetValue={isClueGiver ? game.targetValue : undefined}
                    />

                    {canGuess && (
                        <button
                            className="wl-btn dual-btn"
                            onClick={() => send({ type: "lock_in" })}
                            style={{ marginTop: "1rem" }}
                        >
                            🔒 Lock In — {Math.round(localDial)}
                        </button>
                    )}
                    {isClueGiver && (
                        <p style={{ textAlign: "center", fontSize: "0.8rem", color: "var(--text-muted)", fontStyle: "italic", marginTop: "1rem" }}>
                            Watching the guessers move the needle…
                        </p>
                    )}
                    {!isClueGiver && game.gameMode === "teams" && !isMyTeamTurn && (
                        <p style={{ textAlign: "center", fontSize: "0.8rem", color: "var(--text-muted)", fontStyle: "italic", marginTop: "1rem" }}>
                            Waiting for Team {game.activeTeam === "cyan" ? "Cyan" : "Pink"} to guess…
                        </p>
                    )}
                </div>

                <PlayerList players={game.players} hostId={game.hostId} clueGiverId={game.clueGiverId} myId={myId} gameMode={game.gameMode} />
            </div>
        );
    }

    // ─── PHASE: REVEALED ──────────────────────────────────────────────────────
    if (game.phase === "revealed") {
        const score = game.scoreThisRound ?? 0;
        const tier = scoreTier(score);
        const color = scoreTierColor(score);

        return (
            <div className="phase-enter" style={{ width: "100%", maxWidth: "480px", margin: "0 auto" }}>
                <StatusBar connStatus={connStatus} phase={game.phase} isHost={isHost} onReset={handleReset} />
                {game.gameMode === "coop" ? <GlobalScoreboard score={game.coopScore} /> : <Scoreboard activeTeam={game.activeTeam} scores={game.teamScores} />}
                <ConceptBadge concept={game.concept} />

                <div className="glass-card dual-border" style={{ padding: "2rem 1.5rem", marginBottom: "1.25rem", textAlign: "center" }}>
                    <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "1rem" }}>
                        Result
                    </p>
                    <div className="score-number" style={{ color }}>{score}</div>
                    <div style={{ fontSize: "1.2rem", fontWeight: 700, marginTop: "0.5rem", marginBottom: "1.5rem", color }}>
                        {tier}
                    </div>

                    <Dial
                        value={game.dialValue}
                        readOnly
                        leftLabel={game.concept?.left}
                        rightLabel={game.concept?.right}
                        targetValue={game.targetValue}
                        guessValue={game.dialValue}
                    />
                    <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.75rem" }}>
                        🟡 Target: {game.targetValue} &nbsp;•&nbsp; 🟣 Guess: {game.dialValue}
                    </p>
                </div>

                {isHost ? (
                    <button className="wl-btn dual-btn" onClick={handlePlayAgain}>
                        🔄 Play Again
                    </button>
                ) : (
                    <div className="waiting-host-msg">
                        ⏳ Waiting for Host to start next round…
                    </div>
                )}

                <div style={{ marginTop: "1.25rem" }}>
                    <PlayerList players={game.players} hostId={game.hostId} clueGiverId={game.clueGiverId} myId={myId} gameMode={game.gameMode} />
                </div>
            </div>
        );
    }

    return null;
}
