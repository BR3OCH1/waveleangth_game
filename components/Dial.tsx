"use client";

interface DialProps {
    value: number;           // 0–100
    onChange?: (v: number) => void;
    readOnly?: boolean;
    leftLabel?: string;
    rightLabel?: string;
}

export default function Dial({
    value,
    onChange,
    readOnly = false,
    leftLabel = "",
    rightLabel = "",
}: DialProps) {
    const pct = value; // 0–100 maps 1:1 to percentage

    return (
        <div style={{ width: "100%" }}>
            {/* Track + thumb */}
            <div style={{ position: "relative", padding: "0.25rem 0" }}>
                {/* Value bubble */}
                <div
                    style={{
                        position: "absolute",
                        top: "-2.4rem",
                        left: `calc(${pct}% - 1.5rem)`,
                        width: "3rem",
                        textAlign: "center",
                        background: "rgba(139,92,246,0.9)",
                        color: "#fff",
                        borderRadius: "0.5rem",
                        fontSize: "0.85rem",
                        fontWeight: 700,
                        padding: "0.2rem 0",
                        pointerEvents: "none",
                        transition: "left 0.05s",
                        zIndex: 2,
                    }}
                >
                    {Math.round(value)}
                </div>

                <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={value}
                    disabled={readOnly}
                    onChange={(e) => onChange?.(Number(e.target.value))}
                    className="wl-dial"
                    style={{ width: "100%", cursor: readOnly ? "default" : "pointer" }}
                />
            </div>

            {/* Left / Right spectrum labels */}
            {(leftLabel || rightLabel) && (
                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginTop: "0.5rem",
                    }}
                >
                    <span
                        style={{
                            fontSize: "0.8rem",
                            fontWeight: 600,
                            color: "var(--accent-cyan)",
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                        }}
                    >
                        {leftLabel}
                    </span>
                    <span
                        style={{
                            fontSize: "0.8rem",
                            fontWeight: 600,
                            color: "var(--accent-pink)",
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                        }}
                    >
                        {rightLabel}
                    </span>
                </div>
            )}
        </div>
    );
}
