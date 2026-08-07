"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

const AVATAR_COLORS = [
  "#8b5cf6",
  "#22d3ee",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
];

function getAvatarColor(username: string) {
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function HomePage() {
  const [roomCode, setRoomCode] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  const codeRef = useRef<HTMLInputElement>(null);

  const handleRoomCode = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
    setRoomCode(val);
    setError("");
  };

  const handleCreateRoom = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let code = "";
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setRoomCode(code);
    setError("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomCode.length !== 4) {
      setError("Room code must be exactly 4 letters.");
      codeRef.current?.focus();
      return;
    }
    if (!username.trim()) {
      setError("Please enter a username.");
      return;
    }
    router.push(
      `/room/${roomCode}?username=${encodeURIComponent(username.trim())}`
    );
  };

  const isReady = roomCode.length === 4 && username.trim().length > 0;

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
        gap: "2.5rem",
      }}
    >
      {/* Hero */}
      <div style={{ textAlign: "center", maxWidth: "480px" }}>
        <div
          className="animate-float"
          style={{ fontSize: "3.5rem", marginBottom: "0.75rem" }}
          aria-hidden
        >
          🌊
        </div>
        <h1
          style={{
            fontSize: "clamp(2rem, 5vw, 3rem)",
            fontWeight: 800,
            letterSpacing: "-0.02em",
            lineHeight: 1.1,
            marginBottom: "0.75rem",
          }}
        >
          <span className="gradient-text">Wavelength</span>
        </h1>
        <p
          style={{
            color: "var(--text-muted)",
            fontSize: "1.05rem",
            lineHeight: 1.6,
          }}
        >
          The mind-reading party game. Find the frequency. Read the room.
        </p>
      </div>

      {/* Card */}
      <div
        className="glass-card animate-fade-in-up"
        style={{
          width: "100%",
          maxWidth: "400px",
          padding: "2rem",
        }}
      >
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Room Code */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label htmlFor="room-code" className="wl-label">
                Room Code
              </label>
              <button
                type="button"
                onClick={handleCreateRoom}
                style={{
                  background: "none", border: "none", color: "var(--accent-cyan)",
                  fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", padding: 0,
                  marginBottom: "0.5rem",
                }}
              >
                ✨ Create Random Code
              </button>
            </div>
            <input
              id="room-code"
              ref={codeRef}
              className="wl-input wl-code-input"
              type="text"
              inputMode="text"
              placeholder="ABCD"
              value={roomCode}
              onChange={handleRoomCode}
              maxLength={4}
              autoComplete="off"
              autoFocus
            />
            <p
              style={{
                marginTop: "0.375rem",
                fontSize: "0.75rem",
                color: "var(--text-muted)",
                textAlign: "center",
              }}
            >
              {roomCode.length}/4 letters
            </p>
          </div>

          {/* Username */}
          <div>
            <label htmlFor="username" className="wl-label">
              Your Name
            </label>
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              {username.trim() && (
                <span
                  className="avatar"
                  style={{
                    position: "absolute",
                    left: "0.75rem",
                    background: getAvatarColor(username.trim()),
                    color: "#fff",
                    zIndex: 1,
                  }}
                >
                  {username.trim()[0].toUpperCase()}
                </span>
              )}
              <input
                id="username"
                className="wl-input"
                type="text"
                placeholder="e.g. Alice"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError("");
                }}
                maxLength={20}
                style={username.trim() ? { paddingLeft: "3rem" } : undefined}
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <p
              role="alert"
              style={{
                fontSize: "0.85rem",
                color: "#f87171",
                textAlign: "center",
                padding: "0.5rem",
                background: "rgba(248, 113, 113, 0.08)",
                borderRadius: "0.5rem",
                border: "1px solid rgba(248, 113, 113, 0.2)",
              }}
            >
              {error}
            </p>
          )}

          <button type="submit" className="wl-btn" disabled={!isReady}>
            {isReady ? "Join Room →" : "Enter details to continue"}
          </button>
        </form>
      </div>

      <p style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
        Share the same room code with friends to play together
      </p>
    </main>
  );
}
