"use client";

import { useRef, useCallback, useEffect } from "react";

/**
 * 180° Semicircle Wavelength Dial
 *
 * - Far left = 0° (value 0)
 * - Straight up = 90° (value 50)
 * - Far right = 180° (value 100)
 *
 * Uses mouse/touch events to calculate pointer angle relative to the
 * center-bottom of the semicircle.
 */

interface DialProps {
    value: number;           // 0–100
    onChange?: (v: number) => void;
    readOnly?: boolean;
    leftLabel?: string;
    rightLabel?: string;
    /** Show a gold target marker at this value (0-100). Visible to clue giver. */
    targetValue?: number;
    /** Show a purple guess marker at this value (0-100). Visible on reveal. */
    guessValue?: number;
}

/** Convert 0-100 percentage to 0-180 degrees */
function valueToDeg(value: number): number {
    return (value / 100) * 180;
}

/** Convert 0-180 degrees to 0-100 percentage */
function degToValue(deg: number): number {
    return (deg / 180) * 100;
}

/** Given a pointer position and the center of the dial, compute the angle in degrees (0=left, 180=right). */
function pointerAngle(clientX: number, clientY: number, cx: number, cy: number): number {
    const dx = clientX - cx;
    const dy = cy - clientY; // flip Y: up is positive
    // atan2 gives angle from positive X axis. We want 0=left, 90=up, 180=right.
    // When pointing left: dx<0, dy=0 -> atan2(0, -1) = PI -> angle = PI
    // When pointing up: dx=0, dy>0 -> atan2(1, 0) = PI/2
    // When pointing right: dx>0, dy=0 -> atan2(0, 1) = 0
    let angleRad = Math.atan2(dy, dx);
    // Convert: 0 rad = right (180°), PI rad = left (0°)
    let angleDeg = 180 - (angleRad * 180) / Math.PI;
    // Clamp to [0, 180]
    angleDeg = Math.max(0, Math.min(180, angleDeg));
    return angleDeg;
}

export default function Dial({
    value,
    onChange,
    readOnly = false,
    leftLabel = "",
    rightLabel = "",
    targetValue,
    guessValue,
}: DialProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const isDragging = useRef(false);

    const RADIUS = 130; // SVG coordinate radius
    const CENTER_X = 150;
    const CENTER_Y = 150;
    const STROKE_WIDTH = 36;

    const needleDeg = valueToDeg(value);

    const getCenter = useCallback(() => {
        if (!containerRef.current) return { cx: 0, cy: 0 };
        const rect = containerRef.current.getBoundingClientRect();
        return {
            cx: rect.left + rect.width / 2,
            cy: rect.top + rect.height, // bottom center of the semicircle
        };
    }, []);

    const handlePointerMove = useCallback((clientX: number, clientY: number) => {
        if (!isDragging.current || readOnly || !onChange) return;
        const { cx, cy } = getCenter();
        const deg = pointerAngle(clientX, clientY, cx, cy);
        const newValue = Math.round(degToValue(deg));
        onChange(Math.max(0, Math.min(100, newValue)));
    }, [readOnly, onChange, getCenter]);

    const handlePointerDown = useCallback((clientX: number, clientY: number) => {
        if (readOnly || !onChange) return;
        isDragging.current = true;
        handlePointerMove(clientX, clientY);
    }, [readOnly, onChange, handlePointerMove]);

    // Global mouse/touch listeners for drag
    useEffect(() => {
        if (readOnly) return;

        const onMouseMove = (e: MouseEvent) => handlePointerMove(e.clientX, e.clientY);
        const onMouseUp = () => { isDragging.current = false; };
        const onTouchMove = (e: TouchEvent) => {
            if (e.touches.length > 0) {
                handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
            }
        };
        const onTouchEnd = () => { isDragging.current = false; };

        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
        window.addEventListener("touchmove", onTouchMove, { passive: true });
        window.addEventListener("touchend", onTouchEnd);

        return () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
            window.removeEventListener("touchmove", onTouchMove);
            window.removeEventListener("touchend", onTouchEnd);
        };
    }, [readOnly, handlePointerMove]);

    // Arc path for the semicircle track (left to right, 180°)
    const arcPath = `M ${CENTER_X - RADIUS} ${CENTER_Y} A ${RADIUS} ${RADIUS} 0 0 1 ${CENTER_X + RADIUS} ${CENTER_Y}`;

    // Needle endpoint (from center-bottom, extending to the arc edge)
    const needleLength = RADIUS - 8;
    const needleRad = ((180 - needleDeg) * Math.PI) / 180;
    const needleX = CENTER_X + Math.cos(needleRad) * needleLength;
    const needleY = CENTER_Y - Math.sin(needleRad) * needleLength;

    // Tick marks
    const ticks = [];
    for (let i = 0; i <= 10; i++) {
        const deg = (i / 10) * 180;
        const rad = ((180 - deg) * Math.PI) / 180;
        const outerR = RADIUS + 18;
        const innerR = RADIUS - (i % 5 === 0 ? 20 : 18);
        ticks.push({
            x1: CENTER_X + Math.cos(rad) * innerR,
            y1: CENTER_Y - Math.sin(rad) * innerR,
            x2: CENTER_X + Math.cos(rad) * outerR,
            y2: CENTER_Y - Math.sin(rad) * outerR,
            major: i % 5 === 0,
        });
    }

    // Target marker position (gold circle on the arc)
    const renderMarker = (val: number, color: string, label?: string) => {
        const markerDeg = valueToDeg(val);
        const markerRad = ((180 - markerDeg) * Math.PI) / 180;
        const mx = CENTER_X + Math.cos(markerRad) * RADIUS;
        const my = CENTER_Y - Math.sin(markerRad) * RADIUS;
        return (
            <g key={`marker-${color}`}>
                <circle cx={mx} cy={my} r={14} fill={color} stroke="#fff" strokeWidth={2.5} style={{ filter: `drop-shadow(0 0 8px ${color})` }} />
                {label && (
                    <text x={mx} y={my + 4} textAnchor="middle" fill="#000" fontSize="10" fontWeight="800">
                        {label}
                    </text>
                )}
            </g>
        );
    };

    return (
        <div className="wl-dial-container" ref={containerRef}>
            <svg
                viewBox={`0 ${CENTER_Y - RADIUS - 30} 300 ${RADIUS + 45}`}
                className="wl-dial-svg"
                onMouseDown={(e) => handlePointerDown(e.clientX, e.clientY)}
                onTouchStart={(e) => {
                    if (e.touches.length > 0) {
                        handlePointerDown(e.touches[0].clientX, e.touches[0].clientY);
                    }
                }}
            >
                {/* Gradient definition */}
                <defs>
                    <linearGradient id="dial-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="var(--accent-cyan)" />
                        <stop offset="50%" stopColor="var(--accent-violet)" />
                        <stop offset="100%" stopColor="var(--accent-pink)" />
                    </linearGradient>
                    <linearGradient id="dial-bg" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="rgba(34,211,238,0.15)" />
                        <stop offset="100%" stopColor="rgba(236,72,153,0.15)" />
                    </linearGradient>
                </defs>

                {/* Background arc (faint) */}
                <path d={arcPath} fill="none" stroke="url(#dial-bg)" strokeWidth={STROKE_WIDTH + 14} strokeLinecap="round" />

                {/* Main colored arc */}
                <path d={arcPath} fill="none" stroke="url(#dial-gradient)" strokeWidth={STROKE_WIDTH} strokeLinecap="round" />

                {/* Tick marks */}
                {ticks.map((t, i) => (
                    <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
                        stroke={t.major ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.2)"}
                        strokeWidth={t.major ? 2 : 1} />
                ))}

                {/* Target marker (gold) */}
                {targetValue !== undefined && renderMarker(targetValue, "#fbbf24", String(targetValue))}

                {/* Guess marker (purple) */}
                {guessValue !== undefined && renderMarker(guessValue, "#8b5cf6")}

                {/* Needle */}
                <line
                    x1={CENTER_X} y1={CENTER_Y}
                    x2={needleX} y2={needleY}
                    stroke="#fff"
                    strokeWidth={4}
                    strokeLinecap="round"
                    style={{
                        transition: readOnly ? "all 0.15s ease" : "none",
                        filter: "drop-shadow(0 0 6px rgba(255,255,255,0.6))",
                    }}
                />

                {/* Needle hub */}
                <circle cx={CENTER_X} cy={CENTER_Y} r={10} fill="var(--accent-violet)" stroke="#fff" strokeWidth={3} />

                {/* Needle tip glow */}
                <circle cx={needleX} cy={needleY} r={6} fill="#fff" style={{ filter: "drop-shadow(0 0 8px rgba(139,92,246,0.9))" }} />
            </svg>

            {/* Value display */}
            <div className="wl-dial-value">{Math.round(value)}</div>

            {/* Labels */}
            {(leftLabel || rightLabel) && (
                <div className="wl-dial-labels">
                    <span className="wl-dial-label-left">{leftLabel}</span>
                    <span className="wl-dial-label-right">{rightLabel}</span>
                </div>
            )}
        </div>
    );
}
