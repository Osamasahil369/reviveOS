import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  Sparkles,
  ArrowUpRight,
  ShieldCheck,
  Zap,
  Lock,
  CheckCircle2,
  TrendingUp,
  CreditCard,
  Layers,
  Activity,
  User,
  Mail,
  Eye,
  EyeOff,
  AlertCircle,
  RefreshCw,
  Search,
  Check,
  ChevronRight,
  Sliders,
  Compass,
} from 'lucide-react';
import { supabaseAuth } from '../lib/supabase.js';
import { AuthSession } from '../types/index.js';
import { InteractiveScannerSequence } from './InteractiveScannerSequence.js';

interface LandingPageProps {
  onSuccess: (session: AuthSession) => void;
}

// ---------------------------------------------------------------------------
// High-Performance React Three Fiber InstancedMesh Revenue Flow Particles
// ---------------------------------------------------------------------------
interface RevenueFlowMeshProps {
  count?: number;
  reducedMotion?: boolean;
}

function RevenueFlowMesh({ count = 1200, reducedMotion = false }: RevenueFlowMeshProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null!);
  const linesRef = useRef<THREE.LineSegments>(null!);
  const { mouse, viewport } = useThree();

  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Pre-generate particle telemetry parameters
  const particles = useMemo(() => {
    const data = [];
    const colors = [];
    const cEmerald = new THREE.Color('#34d399');
    const cJade = new THREE.Color('#10b981');
    const cPlatinum = new THREE.Color('#f8fafc');
    const cCyan = new THREE.Color('#38bdf8');
    const cMuted = new THREE.Color('#334155');

    for (let i = 0; i < count; i++) {
      const radius = 3 + Math.random() * 16;
      const angle = Math.random() * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const y = (Math.random() - 0.5) * 14;
      const z = (Math.random() - 0.5) * 35;

      const vx = (Math.random() - 0.5) * 0.005;
      const vy = (Math.random() - 0.5) * 0.005;
      const vz = 0.008 + Math.random() * 0.012; // Continuous forward drift

      const scale = 0.55 + Math.random() * 0.85;
      const phase = Math.random() * Math.PI * 2;

      const rand = Math.random();
      let color = cMuted;
      if (rand > 0.85) color = cEmerald;
      else if (rand > 0.65) color = cJade;
      else if (rand > 0.45) color = cPlatinum;
      else if (rand > 0.3) color = cCyan;

      data.push({ x, y, z, vx, vy, vz, scale, phase, ox: x, oy: y, oz: z });
      colors.push(color);
    }
    return { data, colors };
  }, [count]);

  useEffect(() => {
    if (!meshRef.current) return;
    particles.colors.forEach((color, i) => {
      meshRef.current.setColorAt(i, color);
    });
    meshRef.current.instanceColor!.needsUpdate = true;
  }, [particles]);

  const [linePositions, lineColors] = useMemo(() => {
    const positions: number[] = [];
    const colors: number[] = [];
    const maxDistance = 3.2;
    const maxConnectionsPerNode = 2;
    const sampleStep = Math.max(1, Math.floor(count / 280));

    for (let i = 0; i < count; i += sampleStep) {
      let connections = 0;
      const p1 = particles.data[i];

      for (let j = i + 1; j < count; j += sampleStep) {
        if (connections >= maxConnectionsPerNode) break;

        const p2 = particles.data[j];
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const dz = p1.z - p2.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist < maxDistance) {
          positions.push(p1.x, p1.y, p1.z);
          positions.push(p2.x, p2.y, p2.z);
          colors.push(0.2, 0.83, 0.6, 0.2, 0.83, 0.6);
          connections++;
        }
      }
    }

    return [new Float32Array(positions), new Float32Array(colors)];
  }, [count, particles]);

  const smoothMouse = useRef({ x: 0, y: 0 });

  useFrame((state, delta) => {
    if (!meshRef.current) return;

    const time = state.clock.getElapsedTime();

    smoothMouse.current.x += (mouse.x - smoothMouse.current.x) * 0.05;
    smoothMouse.current.y += (mouse.y - smoothMouse.current.y) * 0.05;

    const mouseWorldX = smoothMouse.current.x * (viewport.width / 2);
    const mouseWorldY = smoothMouse.current.y * (viewport.height / 2);

    for (let i = 0; i < count; i++) {
      const p = particles.data[i];

      if (!reducedMotion) {
        p.z += p.vz * (delta * 60);
        p.x += p.vx + Math.sin(time * 0.4 + p.phase) * 0.003;
        p.y += p.vy + Math.cos(time * 0.4 + p.phase) * 0.003;

        if (p.z > 15) {
          p.z = -25;
          p.x = p.ox + (Math.random() - 0.5) * 4;
          p.y = p.oy + (Math.random() - 0.5) * 4;
        }

        const dx = p.x - mouseWorldX;
        const dy = p.y - mouseWorldY;
        const distSq = dx * dx + dy * dy;
        if (distSq < 16 && distSq > 0.01) {
          const force = (16 - distSq) * 0.0008;
          p.x += (dx / Math.sqrt(distSq)) * force;
          p.y += (dy / Math.sqrt(distSq)) * force;
        }
      }

      dummy.position.set(p.x, p.y, p.z);
      const pulseScale = p.scale * (1 + Math.sin(time * 2 + p.phase) * 0.12);
      dummy.scale.set(pulseScale, pulseScale, pulseScale);
      dummy.updateMatrix();

      meshRef.current.setMatrixAt(i, dummy.matrix);
    }

    meshRef.current.instanceMatrix.needsUpdate = true;

    if (linesRef.current && !reducedMotion) {
      linesRef.current.rotation.y = time * 0.02 + smoothMouse.current.x * 0.08;
      linesRef.current.rotation.x = Math.sin(time * 0.015) * 0.025 - smoothMouse.current.y * 0.04;
    }
  });

  return (
    <group>
      <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false}>
        <sphereGeometry args={[0.04, 12, 12]} />
        <meshBasicMaterial transparent opacity={0.82} toneMapped={false} />
      </instancedMesh>

      {linePositions.length > 0 && (
        <lineSegments ref={linesRef}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[linePositions, 3]} />
            <bufferAttribute attach="attributes-color" args={[lineColors, 3]} />
          </bufferGeometry>
          <lineBasicMaterial
            vertexColors
            transparent
            opacity={0.10}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </lineSegments>
      )}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Main LandingPage Component
// ---------------------------------------------------------------------------
export const LandingPage: React.FC<LandingPageProps> = ({ onSuccess }) => {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup' | 'forgot'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [mrrEstimate, setMrrEstimate] = useState<number>(75000);
  const [selectedScannerNode, setSelectedScannerNode] = useState<'failure' | 'renewal' | 'expansion'>('failure');

  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      setPrefersReducedMotion(mediaQuery.matches);
      const listener = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    }
  }, []);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setInfoMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setErrorMessage('Please enter a valid work email address.');
      return;
    }

    setIsLoading(true);

    try {
      if (authMode === 'forgot') {
        const res = await supabaseAuth.resetPassword(trimmedEmail);
        setInfoMessage(res.message);
        setIsLoading(false);
        return;
      }

      if (authMode === 'signin') {
        if (!password) {
          setErrorMessage('Please enter your password.');
          setIsLoading(false);
          return;
        }
        const session = await supabaseAuth.signIn(trimmedEmail, password);
        onSuccess(session);
      } else if (authMode === 'signup') {
        if (!password || password.length < 6) {
          setErrorMessage('Password must be at least 6 characters.');
          setIsLoading(false);
          return;
        }
        const name = fullName.trim() || trimmedEmail.split('@')[0];
        const res = await supabaseAuth.signUp(trimmedEmail, name, password);
        if (res.is_authenticated) {
          onSuccess(res);
        } else {
          setInfoMessage(res.message || 'Account created! Please sign in with your credentials.');
          setAuthMode('signin');
        }
      }
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg.includes('confirmation email') || msg.includes('Error sending confirmation email')) {
        setInfoMessage('Account created! Please check your inbox or sign in with your credentials.');
        setAuthMode('signin');
      } else {
        setErrorMessage(msg || 'Authentication request failed.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleLaunchDemo = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const session = await supabaseAuth.launchDemoSession();
      onSuccess(session);
    } catch (err: any) {
      console.warn('[Demo Launch Warning]', err);
      // Clean, user-friendly fallback error message
      setErrorMessage('Unable to initialize demo workspace. Please sign in or create an account.');
    } finally {
      setIsLoading(false);
    }
  };

  // ARR Lift calculations
  const calculatedLeak = Math.round(mrrEstimate * 0.078);
  const calculatedRecovered = Math.round(calculatedLeak * 0.76);
  const calculatedArrLift = calculatedRecovered * 12;

  return (
    <div className="relative min-h-screen bg-[#07090e] text-[#f8fafc] font-sans antialiased selection:bg-emerald-400 selection:text-black overflow-x-hidden">
      {/* ------------------------------------------------------------------- */}
      {/* 1. REACT THREE FIBER REVENUE FLOWS WebGL CANVAS */}
      {/* ------------------------------------------------------------------- */}
      <div className="fixed inset-0 z-0 pointer-events-none opacity-75">
        <Canvas
          camera={{ position: [0, 0, 14], fov: 50, near: 0.1, far: 1000 }}
          gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
          dpr={[1, 2]}
          style={{ width: '100%', height: '100%' }}
        >
          <ambientLight intensity={0.6} />
          <RevenueFlowMesh count={1200} reducedMotion={prefersReducedMotion} />
        </Canvas>
      </div>

      {/* Atmospheric Top Laser Filament */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[1px] h-[360px] bg-gradient-to-b from-emerald-400/70 via-emerald-400/15 to-transparent pointer-events-none z-10" />

      {/* Ambient Radial Vignette */}
      <div className="fixed top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[350px] bg-emerald-500/[0.035] blur-[120px] pointer-events-none rounded-full" />

      {/* ------------------------------------------------------------------- */}
      {/* 2. REFINED MINIMAL HEADER */}
      {/* ------------------------------------------------------------------- */}
      <header className="relative z-30 w-full max-w-6xl mx-auto px-6 sm:px-10 py-6 flex items-center justify-between">
        <a href="/" className="text-xl font-bold tracking-tight text-white font-display hover:text-emerald-400 transition-colors flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
          <span>ReviveOS</span>
        </a>

        <nav className="hidden md:flex items-center gap-8 text-xs font-mono tracking-wider text-slate-400 uppercase">
          <a href="#stream" className="hover:text-emerald-400 transition-colors">Stream</a>
          <a href="#scanner" className="hover:text-emerald-400 transition-colors">Scanner</a>
          <a href="#simulator" className="hover:text-emerald-400 transition-colors">Simulator</a>
        </nav>

        <div className="flex items-center gap-3">
          <button
            onClick={handleLaunchDemo}
            className="text-xs text-slate-400 hover:text-white transition-colors hidden sm:block cursor-pointer font-mono tracking-wider uppercase px-2 py-1"
          >
            Demo
          </button>
          <button
            onClick={() => {
              setAuthMode('signin');
              setShowAuthModal(true);
            }}
            className="px-4 py-2 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-white text-xs font-medium border border-white/[0.1] transition-all cursor-pointer"
          >
            Sign In
          </button>
        </div>
      </header>

      {/* ------------------------------------------------------------------- */}
      {/* 3. HERO SECTION (SPARSE, PUNCHY & MONUMENTAL) */}
      {/* ------------------------------------------------------------------- */}
      <section className="relative z-10 pt-20 pb-32 px-6 sm:px-10 max-w-5xl mx-auto text-center flex flex-col items-center justify-center min-h-[82vh]">
        <div className="inline-flex items-center gap-2 mb-6 px-3.5 py-1 rounded-full bg-white/[0.03] border border-white/[0.08] text-[11px] font-mono text-slate-300 uppercase tracking-widest backdrop-blur-md">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
          <span>AUTONOMOUS REVENUE RECOVERY</span>
        </div>

        <h1 className="text-5xl sm:text-7xl md:text-8xl lg:text-[92px] font-bold tracking-tight text-white font-display leading-[0.98] max-w-4xl">
          Never lose <br />
          <span className="text-emerald-400">earned revenue.</span>
        </h1>

        <p className="mt-6 text-base sm:text-lg text-slate-400 font-normal max-w-xl mx-auto leading-relaxed">
          Automatically detect failed payments, prevent involuntary churn, and settle lost ARR in seconds.
        </p>

        {/* Primary High-Contrast Emerald Button */}
        <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            onClick={() => {
              setAuthMode('signup');
              setShowAuthModal(true);
            }}
            className="px-8 py-3.5 rounded-full bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-bold text-sm transition-all hover:scale-[1.02] active:scale-[0.98] shadow-[0_0_24px_rgba(52,211,153,0.28)] hover:shadow-[0_0_36px_rgba(52,211,153,0.45)] cursor-pointer flex items-center gap-2 group"
          >
            <span>Start free</span>
            <ArrowUpRight className="w-4 h-4 stroke-[2.5] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </button>

          <button
            onClick={() => setIsScannerOpen(true)}
            className="px-6 py-3.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-slate-200 text-sm font-medium border border-white/[0.1] transition-all cursor-pointer flex items-center gap-2 backdrop-blur-sm"
          >
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span>Run Sample Scan</span>
          </button>
        </div>

        <div className="mt-14 flex items-center justify-center gap-6 text-[11px] text-slate-500 font-mono uppercase tracking-wider">
          <span>Instant setup</span>
          <span>·</span>
          <span>Zero code required</span>
          <span>·</span>
          <span>SOC2 Type II</span>
        </div>
      </section>

      {/* ------------------------------------------------------------------- */}
      {/* 4. LIVE TELEMETRY STRIP */}
      {/* ------------------------------------------------------------------- */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 mb-24">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-3xl bg-white/[0.02] border border-white/[0.06] backdrop-blur-xl">
          <div className="p-5 rounded-2xl bg-black/40 border border-white/[0.04] text-center">
            <div className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-1">RECOVERED THIS MONTH</div>
            <div className="text-3xl font-bold text-white font-display tabular-nums">$142,800</div>
          </div>

          <div className="p-5 rounded-2xl bg-black/40 border border-white/[0.04] text-center">
            <div className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-1">AUTONOMOUS WIN RATE</div>
            <div className="text-3xl font-bold text-emerald-400 font-display tabular-nums">76.4%</div>
          </div>

          <div className="p-5 rounded-2xl bg-black/40 border border-white/[0.04] text-center">
            <div className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-1">SETTLEMENT LATENCY</div>
            <div className="text-3xl font-bold text-white font-display tabular-nums">0.02s</div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------- */}
      {/* 5. STAGE 01: THE STREAM */}
      {/* ------------------------------------------------------------------- */}
      <section id="stream" className="relative z-10 py-24 border-t border-white/[0.06] bg-[#07090e]/80">
        <div className="max-w-5xl mx-auto px-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-4">
            <div>
              <div className="text-xs font-mono text-emerald-400 uppercase tracking-widest font-semibold mb-2">01 / THE STREAM</div>
              <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-white font-display">Where revenue slips away.</h2>
            </div>
            <p className="text-sm text-slate-400 max-w-sm">6% to 9% of MRR is lost to involuntary declines, outdated cards, and bank throttling.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-2">
              <div className="text-[10px] font-mono text-slate-500 uppercase">INGESTION</div>
              <div className="text-lg font-bold text-white font-display">Stripe & Gateways</div>
              <p className="text-xs text-slate-400 leading-relaxed">Real-time webhook telemetry captured in 0.02ms.</p>
            </div>

            <div className="p-6 rounded-2xl bg-white/[0.02] border border-rose-500/20 space-y-2">
              <div className="text-[10px] font-mono text-rose-400 uppercase">FRACTURE DETECTED</div>
              <div className="text-lg font-bold text-white font-display">Soft Declines & Expiry</div>
              <p className="text-xs text-slate-400 leading-relaxed">Isolates recoverable failures before churn occurs.</p>
            </div>

            <div className="p-6 rounded-2xl bg-white/[0.02] border border-emerald-500/30 space-y-2">
              <div className="text-[10px] font-mono text-emerald-400 uppercase">RECOVERY ACTION</div>
              <div className="text-lg font-bold text-white font-display">Smart Retries & Links</div>
              <p className="text-xs text-slate-400 leading-relaxed">Liquidity window routing delivers 76% win rate.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------- */}
      {/* 6. STAGE 02: LEAK SCANNER */}
      {/* ------------------------------------------------------------------- */}
      <section id="scanner" className="relative z-10 py-24 border-t border-white/[0.06] bg-[#05070b]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center max-w-xl mx-auto mb-12">
            <div className="text-xs font-mono text-emerald-400 uppercase tracking-widest font-semibold mb-2">02 / SCANNER</div>
            <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-white font-display">Look closer.</h2>
            <p className="text-sm text-slate-400 mt-2">A single scan reveals hidden leaks across your entire customer base.</p>
          </div>

          <div className="relative h-[380px] sm:h-[420px] flex items-center justify-center select-none bg-black/40 rounded-3xl border border-white/[0.06]">
            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 600 400" fill="none">
              <ellipse cx="300" cy="200" rx="220" ry="110" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
              <ellipse cx="300" cy="200" rx="160" ry="80" stroke="rgba(52,211,153,0.18)" strokeWidth="1" />
              <ellipse cx="300" cy="200" rx="100" ry="50" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
            </svg>

            <div
              onClick={() => setSelectedScannerNode('failure')}
              className={`absolute left-8 sm:left-20 top-12 sm:top-16 transition-all cursor-pointer ${
                selectedScannerNode === 'failure' ? 'scale-105 opacity-100' : 'opacity-70 hover:opacity-100'
              }`}
            >
              <div className="text-[10px] font-mono text-slate-500 uppercase">PAYMENT DECLINE</div>
              <div className="text-2xl font-bold text-white font-display tabular-nums">₹2,400</div>
            </div>

            <div
              onClick={() => setSelectedScannerNode('renewal')}
              className={`absolute right-8 sm:right-20 top-16 sm:top-20 transition-all cursor-pointer text-right ${
                selectedScannerNode === 'renewal' ? 'scale-105 opacity-100' : 'opacity-70 hover:opacity-100'
              }`}
            >
              <div className="text-[10px] font-mono text-slate-500 uppercase">RENEWAL RISK</div>
              <div className="text-2xl font-bold text-white font-display tabular-nums">₹1,200</div>
            </div>

            <div
              onClick={() => setSelectedScannerNode('expansion')}
              className={`absolute left-14 sm:left-28 bottom-12 transition-all cursor-pointer ${
                selectedScannerNode === 'expansion' ? 'scale-105 opacity-100' : 'opacity-70 hover:opacity-100'
              }`}
            >
              <div className="text-[10px] font-mono text-slate-500 uppercase">EXPANSION CHURN</div>
              <div className="text-2xl font-bold text-white font-display tabular-nums">₹860</div>
            </div>

            <div
              onClick={() => setIsScannerOpen(true)}
              className="relative z-10 w-36 h-36 sm:w-40 sm:h-40 rounded-full bg-[#07090e] border border-emerald-400/40 flex flex-col items-center justify-center text-center shadow-[0_0_30px_rgba(52,211,153,0.18)] hover:border-emerald-400 transition-all cursor-pointer group"
            >
              <span className="text-[9px] font-mono text-slate-400 uppercase tracking-widest mb-0.5">SCAN</span>
              <span className="text-4xl sm:text-5xl font-bold text-white font-display tabular-nums leading-none">24</span>
              <span className="text-[9px] font-bold text-emerald-400 tracking-widest uppercase mt-1.5">SIGNALS FOUND</span>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------- */}
      {/* 7. STAGE 03: CLOSED LOOP */}
      {/* ------------------------------------------------------------------- */}
      <section className="relative z-10 py-24 border-t border-white/[0.06] bg-[#07090e]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-xs font-mono text-emerald-400 uppercase tracking-widest font-semibold mb-2">03 / ARCHITECTURE</div>
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-white font-display mb-12">
            Detect. Score. Recover. Optimize.
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-2">
              <div className="text-xs font-mono text-emerald-400 font-bold">01</div>
              <div className="text-base font-bold text-white font-display">Detect</div>
              <p className="text-xs text-slate-400">Soft declines & token expiry caught immediately.</p>
            </div>

            <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-2">
              <div className="text-xs font-mono text-emerald-400 font-bold">02</div>
              <div className="text-base font-bold text-white font-display">Score</div>
              <p className="text-xs text-slate-400">Smart win-probability ranking puts top value first.</p>
            </div>

            <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-2">
              <div className="text-xs font-mono text-emerald-400 font-bold">03</div>
              <div className="text-base font-bold text-white font-display">Recover</div>
              <p className="text-xs text-slate-400">Automated liquidity retries & friction-free links.</p>
            </div>

            <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-2">
              <div className="text-xs font-mono text-emerald-400 font-bold">04</div>
              <div className="text-base font-bold text-white font-display">Optimize</div>
              <p className="text-xs text-slate-400">Continuous ML settlement feedback loops.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------- */}
      {/* 8. STAGE 04: FLOW SIMULATOR */}
      {/* ------------------------------------------------------------------- */}
      <section id="simulator" className="relative z-10 py-24 border-t border-white/[0.06] bg-[#05070b]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-5 space-y-4">
              <div className="text-xs font-mono text-emerald-400 uppercase tracking-widest font-semibold">04 / SIMULATOR</div>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white font-display">Calculate your recoverable ARR.</h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                Estimate how much revenue you are losing each month and how much ReviveOS recovers automatically.
              </p>

              <div className="pt-2 space-y-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-400">YOUR MRR</span>
                  <span className="text-white font-bold text-sm font-display">${mrrEstimate.toLocaleString()}</span>
                </div>
                <input
                  type="range"
                  min="10000"
                  max="500000"
                  step="5000"
                  value={mrrEstimate}
                  onChange={(e) => setMrrEstimate(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                />
              </div>
            </div>

            <div className="lg:col-span-7 bg-white/[0.02] border border-white/[0.08] rounded-3xl p-6 sm:p-8 space-y-6">
              <div className="grid grid-cols-2 gap-4 border-b border-white/[0.06] pb-6">
                <div>
                  <div className="text-[10px] font-mono text-slate-500 uppercase">MONTHLY LEAK</div>
                  <div className="text-2xl sm:text-3xl font-bold text-rose-400 font-display tabular-nums mt-1">
                    ${calculatedLeak.toLocaleString()}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-mono text-slate-500 uppercase">RECOVERED (76%)</div>
                  <div className="text-2xl sm:text-3xl font-bold text-emerald-400 font-display tabular-nums mt-1">
                    +${calculatedRecovered.toLocaleString()}/mo
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <div className="text-[10px] font-mono text-slate-400 uppercase">ANNUAL REVENUE LIFT</div>
                  <div className="text-3xl sm:text-4xl font-bold text-white font-display tabular-nums mt-0.5">
                    +${calculatedArrLift.toLocaleString()} <span className="text-xs text-slate-500 font-normal">ARR</span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setAuthMode('signup');
                    setShowAuthModal(true);
                  }}
                  className="w-full sm:w-auto px-6 py-3 rounded-full bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-bold text-xs uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap shadow-[0_0_16px_rgba(52,211,153,0.25)]"
                >
                  Capture This Revenue ↗
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------- */}
      {/* 9. FINAL CLIMAX CALL-TO-ACTION */}
      {/* ------------------------------------------------------------------- */}
      <section className="relative z-10 py-28 px-6 max-w-4xl mx-auto text-center flex flex-col items-center justify-center border-t border-white/[0.06]">
        <h2 className="text-4xl sm:text-6xl md:text-7xl font-bold tracking-tight text-white font-display max-w-3xl">
          Stop leaking revenue today.
        </h2>

        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            onClick={() => {
              setAuthMode('signup');
              setShowAuthModal(true);
            }}
            className="px-8 py-3.5 rounded-full bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-bold text-sm transition-all hover:scale-[1.02] active:scale-[0.98] shadow-[0_0_24px_rgba(52,211,153,0.3)] cursor-pointer flex items-center gap-2 group"
          >
            <span>Start free</span>
            <ArrowUpRight className="w-4 h-4 stroke-[2.5] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </button>

          <button
            onClick={handleLaunchDemo}
            className="px-6 py-3.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 text-sm font-medium border border-white/[0.1] transition-colors cursor-pointer"
          >
            Launch Instant Demo
          </button>
        </div>
      </section>

      {/* ------------------------------------------------------------------- */}
      {/* 10. MINIMAL FOOTER */}
      {/* ------------------------------------------------------------------- */}
      <footer className="relative z-10 border-t border-white/[0.06] bg-black/40 py-6 px-6 sm:px-10">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono text-slate-500">
          <div className="flex items-center gap-2">
            <span className="text-emerald-400 font-bold">REVIVEOS</span>
            <span>—</span>
            <span>AUTONOMOUS REVENUE RECOVERY</span>
          </div>

          <div>
            <span>© 2026 REVIVEOS INC. · SOC2 TYPE II</span>
          </div>
        </div>
      </footer>

      {/* ------------------------------------------------------------------- */}
      {/* 11. SCANNER & AUTH MODALS */}
      {/* ------------------------------------------------------------------- */}
      <InteractiveScannerSequence
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onComplete={() => {
          setIsScannerOpen(false);
          handleLaunchDemo();
        }}
        currency="INR"
        opportunities={[]}
      />

      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-2xl animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-[#0a0d14] border border-white/[0.12] rounded-3xl p-8 shadow-2xl space-y-6 relative overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-400 flex items-center justify-center text-slate-950 font-bold">
                  <ShieldCheck className="w-4 h-4 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white font-display">
                    {authMode === 'signup' ? 'Create ReviveOS Account' : authMode === 'forgot' ? 'Reset Password' : 'Sign in to Workspace'}
                  </h3>
                  <p className="text-[10px] font-mono text-slate-400">ENTERPRISE ACCESS</p>
                </div>
              </div>

              <button
                onClick={() => setShowAuthModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/[0.05] transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-mono flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{errorMessage}</span>
              </div>
            )}
            {infoMessage && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-mono flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>{infoMessage}</span>
              </div>
            )}

            <form onSubmit={handleAuthSubmit} className="space-y-4">
              {authMode === 'signup' && (
                <div className="space-y-1">
                  <label className="text-[11px] font-mono text-slate-400 uppercase">Operator Name</label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                    <input
                      type="text"
                      placeholder="Jane Doe"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-black/60 border border-white/[0.1] text-white text-xs font-mono focus:border-emerald-400 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[11px] font-mono text-slate-400 uppercase">Work Email</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                  <input
                    type="email"
                    required
                    placeholder="operator@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-black/60 border border-white/[0.1] text-white text-xs font-mono focus:border-emerald-400 focus:outline-none"
                  />
                </div>
              </div>

              {authMode !== 'forgot' && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-mono text-slate-400 uppercase">Password</label>
                    {authMode === 'signin' && (
                      <button
                        type="button"
                        onClick={() => setAuthMode('forgot')}
                        className="text-[10px] font-mono text-emerald-400 hover:underline cursor-pointer"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-black/60 border border-white/[0.1] text-white text-xs font-mono focus:border-emerald-400 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-3 text-slate-500 hover:text-slate-300"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 rounded-full bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-bold text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2 mt-2 shadow-[0_0_20px_rgba(52,211,153,0.25)]"
              >
                {isLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <span>{authMode === 'signup' ? 'Create Workspace' : authMode === 'forgot' ? 'Send Reset Link' : 'Sign In'}</span>
                    <ArrowUpRight className="w-4 h-4 stroke-[2.5]" />
                  </>
                )}
              </button>
            </form>

            <div className="pt-2 border-t border-white/[0.06] flex flex-col gap-3 text-center text-xs font-mono">
              <div className="flex items-center justify-center gap-2 text-slate-400">
                <span>{authMode === 'signup' ? 'Already have an account?' : 'Need a workspace?'}</span>
                <button
                  type="button"
                  onClick={() => {
                    setErrorMessage(null);
                    setInfoMessage(null);
                    setAuthMode(authMode === 'signup' ? 'signin' : 'signup');
                  }}
                  className="text-emerald-400 font-bold hover:underline cursor-pointer"
                >
                  {authMode === 'signup' ? 'Sign In' : 'Create Account'}
                </button>
              </div>

              <button
                type="button"
                onClick={handleLaunchDemo}
                className="py-2.5 px-4 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 border border-white/[0.08] transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                <Zap className="w-3.5 h-3.5 text-emerald-400" />
                <span>Launch Instant Demo Workspace</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
