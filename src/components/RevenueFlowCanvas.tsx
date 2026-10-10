import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, RefreshCw, Zap, Shield, Activity, Layers, Sparkles } from 'lucide-react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  color: string;
  type: 'healthy' | 'leak' | 'recovered';
  amount: number;
  label: string;
  progress: number;
  streamId: number;
}

interface RevenueFlowCanvasProps {
  interactive?: boolean;
  activeMode?: 'all' | 'leaks' | 'recovery';
  className?: string;
  onSelectNode?: (nodeInfo: { title: string; volume: string; rate: string; status: string }) => void;
}

export const RevenueFlowCanvas: React.FC<RevenueFlowCanvasProps> = ({
  interactive = true,
  activeMode = 'all',
  className = '',
  onSelectNode,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [recoveredCounter, setRecoveredCounter] = useState(14820);
  const [activePreset, setActivePreset] = useState<'nominal' | 'heavy_load' | 'critical_dunning'>('nominal');
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const particlesRef = useRef<Particle[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const mousePosRef = useRef<{ x: number; y: number; active: boolean }>({ x: -1000, y: -1000, active: false });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = (canvas.width = canvas.parentElement?.clientWidth || 1000);
    let height = (canvas.height = canvas.parentElement?.clientHeight || 480);

    const handleResize = () => {
      if (!canvas || !canvas.parentElement) return;
      width = canvas.width = canvas.parentElement.clientWidth;
      height = canvas.height = canvas.parentElement.clientHeight || 480;
    };

    window.addEventListener('resize', handleResize);

    // Initial particle pool
    const streams = [
      { yOffset: -0.2, type: 'healthy', color: '#10b981', weight: 0.65 },
      { yOffset: 0.0, type: 'healthy', color: '#34d399', weight: 0.15 },
      { yOffset: 0.18, type: 'leak', color: '#f43f5e', weight: 0.12 },
      { yOffset: 0.28, type: 'leak', color: '#fbbf24', weight: 0.08 },
    ];

    const amounts = [120, 240, 480, 1250, 3400, 8900];

    const spawnParticle = (): Particle => {
      const streamIdx = Math.floor(Math.random() * streams.length);
      const stream = streams[streamIdx];
      const isLeak = stream.type === 'leak';
      const isRecovered = Math.random() > 0.35 && isLeak;

      return {
        x: 0,
        y: height * 0.5 + height * stream.yOffset + (Math.random() - 0.5) * 40,
        vx: 1.8 + Math.random() * 2.2,
        vy: (Math.random() - 0.5) * 0.4,
        size: Math.random() * 2.5 + 1.5,
        alpha: Math.random() * 0.7 + 0.3,
        color: isRecovered ? '#06b6d4' : stream.color,
        type: isRecovered ? 'recovered' : (stream.type as any),
        amount: amounts[Math.floor(Math.random() * amounts.length)],
        label: isRecovered ? 'AUTO-RECAPTURED' : isLeak ? 'LEAK INTERCEPT' : 'SETTLED MRR',
        progress: 0,
        streamId: streamIdx,
      };
    };

    // Prepopulate
    particlesRef.current = Array.from({ length: 90 }, () => {
      const p = spawnParticle();
      p.x = Math.random() * width;
      p.progress = p.x / width;
      return p;
    });

    let lastTime = performance.now();

    const render = (time: number) => {
      const dt = (time - lastTime) / 1000;
      lastTime = time;

      ctx.clearRect(0, 0, width, height);

      // 1. Draw Architectural Conduit Guide Curves (Subtle glowing paths)
      const centerY = height * 0.5;
      const startX = 40;
      const midX = width * 0.45;
      const leakX = width * 0.72;
      const endX = width - 40;

      // Conduit paths
      ctx.lineWidth = 1;
      
      // Healthy Main River
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.12)';
      ctx.beginPath();
      ctx.moveTo(startX, centerY);
      ctx.bezierCurveTo(midX, centerY - 60, width * 0.7, centerY - 60, endX, centerY - 50);
      ctx.stroke();

      // Leak Divergence Vector
      ctx.strokeStyle = 'rgba(244, 63, 94, 0.15)';
      ctx.beginPath();
      ctx.moveTo(midX - 20, centerY);
      ctx.bezierCurveTo(width * 0.55, centerY + 80, leakX, centerY + 110, endX, centerY + 120);
      ctx.stroke();

      // Autonomous Recovery Interception Arc
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.25)';
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(leakX - 40, centerY + 90);
      ctx.bezierCurveTo(width * 0.78, centerY + 40, width * 0.85, centerY - 20, endX, centerY - 45);
      ctx.stroke();
      ctx.setLineDash([]);

      // 2. Render Functional Pipeline Node Anchors
      const nodes = [
        { x: startX + 40, y: centerY, label: 'INGEST: MRR STREAMS', tag: '$284,500/mo', color: '#94a3b8' },
        { x: midX, y: centerY - 30, label: 'GATEWAY ROUTER', tag: '99.4% Latency SLA', color: '#10b981' },
        { x: leakX - 20, y: centerY + 95, label: 'LEAK ZONE (DUNNING/GATEWAY)', tag: '14.2% At-Risk', color: '#f43f5e' },
        { x: width * 0.82, y: centerY - 10, label: 'REVIVEOS NEURAL INTERCEPT', tag: '84.6% Auto-Recovered', color: '#06b6d4' },
        { x: endX - 30, y: centerY - 50, label: 'SETTLED REVENUE VAULT', tag: '$278,920 Captured', color: '#10b981' },
      ];

      nodes.forEach((node) => {
        const isHover = hoveredNode === node.label;
        ctx.fillStyle = isHover ? '#ffffff' : node.color;
        
        // Node halo
        ctx.beginPath();
        ctx.arc(node.x, node.y, isHover ? 8 : 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = node.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(node.x, node.y, isHover ? 16 : 10, 0, Math.PI * 2);
        ctx.stroke();

        // Node Label
        ctx.font = '500 10px "JetBrains Mono", monospace';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.textAlign = 'center';
        ctx.fillText(node.label, node.x, node.y - 18);

        ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = node.color;
        ctx.fillText(node.tag, node.x, node.y + 24);
      });

      // 3. Update and draw particles
      if (isPlaying) {
        if (particlesRef.current.length < 110) {
          particlesRef.current.push(spawnParticle());
        }
      }

      particlesRef.current.forEach((p, idx) => {
        if (isPlaying) {
          p.x += p.vx;
          p.progress = p.x / width;

          // Trajectory morphing based on stream type
          if (p.type === 'healthy') {
            const targetY = centerY - 50 + Math.sin(p.x * 0.01 + p.streamId) * 15;
            p.y += (targetY - p.y) * 0.05;
          } else if (p.type === 'leak') {
            if (p.progress > 0.4) {
              const targetY = centerY + 100 + Math.sin(p.x * 0.02) * 18;
              p.y += (targetY - p.y) * 0.06;
            }
          } else if (p.type === 'recovered') {
            if (p.progress > 0.65) {
              // Intercept arc pulling back to healthy vault
              const targetY = centerY - 40 + Math.sin(p.x * 0.015) * 10;
              p.y += (targetY - p.y) * 0.08;
            } else if (p.progress > 0.35) {
              // Diving into leak zone before recovery
              const targetY = centerY + 70;
              p.y += (targetY - p.y) * 0.05;
            }
          }

          // Mouse electromagnetic repulsion/attraction
          if (mousePosRef.current.active) {
            const dx = p.x - mousePosRef.current.x;
            const dy = p.y - mousePosRef.current.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 90) {
              const force = (90 - dist) / 90;
              p.x += (dx / dist) * force * 4;
              p.y += (dy / dist) * force * 4;
            }
          }
        }

        // Draw particle trail & head
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();

        // Draw money amount on key recovered nodes
        if (p.type === 'recovered' && p.progress > 0.7 && p.progress < 0.85) {
          ctx.font = '600 9px "JetBrains Mono", monospace';
          ctx.fillStyle = '#06b6d4';
          ctx.fillText(`+$${p.amount}`, p.x + 8, p.y - 4);
        }

        ctx.globalAlpha = 1;

        // Reset particle when exiting screen
        if (p.x > width) {
          particlesRef.current[idx] = spawnParticle();
        }
      });

      animationFrameRef.current = requestAnimationFrame(render);
    };

    animationFrameRef.current = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isPlaying, hoveredNode]);

  // Handle periodic recovered counter animation
  useEffect(() => {
    const interval = setInterval(() => {
      setRecoveredCounter((prev) => prev + Math.floor(Math.random() * 85 + 25));
    }, 2800);
    return () => clearInterval(interval);
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!interactive || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    mousePosRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      active: true,
    };
  };

  const handleMouseLeave = () => {
    mousePosRef.current.active = false;
    setHoveredNode(null);
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`relative w-full overflow-hidden rounded-2xl bg-[#06080d] border border-white/[0.08] shadow-2xl backdrop-blur-xl ${className}`}
    >
      {/* Top Telemetry Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-white/[0.06] bg-black/40 text-xs font-mono">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-white font-medium tracking-tight">LIVE REVENUE VECTOR SIMULATION</span>
          </div>
          <span className="text-slate-600">/</span>
          <span className="text-slate-400">LATENCY: 14ms</span>
          <span className="text-slate-600">/</span>
          <span className="text-emerald-400 font-semibold">ENGINE: ACTIVE</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-slate-400 hidden sm:block">
            AUTONOMOUS RECOVERIES TODAY: <span className="text-cyan-400 font-bold tabular-nums">${recoveredCounter.toLocaleString()}</span>
          </div>
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 hover:text-white transition-colors cursor-pointer border border-white/[0.08]"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 text-emerald-400" />}
            <span className="text-[11px]">{isPlaying ? 'PAUSE FLOW' : 'RESUME'}</span>
          </button>
        </div>
      </div>

      {/* Interactive HTML Canvas */}
      <div className="relative w-full h-[400px] md:h-[480px]">
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full cursor-crosshair" />

        {/* Ambient Overlay Gradients */}
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-[#06080d] via-transparent to-transparent opacity-80" />
        <div className="absolute inset-0 pointer-events-none bg-radial-grid opacity-30" />

        {/* Floating Interactive HUD Controls at Bottom */}
        <div className="absolute bottom-4 left-6 right-6 flex flex-wrap items-center justify-between gap-4 pointer-events-auto">
          {/* Stream Legend Indicators */}
          <div className="flex flex-wrap items-center gap-4 text-xs font-mono bg-black/60 backdrop-blur-md px-4 py-2 rounded-xl border border-white/[0.08]">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />
              <span className="text-slate-300">Clean MRR Flow</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500 shadow-sm shadow-rose-500/50" />
              <span className="text-slate-300">Payment Leaks & Churn</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400/50" />
              <span className="text-cyan-300 font-medium">ReviveOS Autonomous Reroute</span>
            </div>
          </div>

          <div className="text-[11px] font-mono text-slate-500 hidden lg:block">
            [HOVER TO INDUCE ELECTROMAGNETIC VECTOR RESISTANCE]
          </div>
        </div>
      </div>
    </div>
  );
};
