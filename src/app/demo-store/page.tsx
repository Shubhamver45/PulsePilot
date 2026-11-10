"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ShoppingBag,
  ShoppingCart,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Sliders,
  Sparkles,
  Zap,
  Play,
  CreditCard,
  ShieldCheck,
  Star,
  Plus,
  Minus,
  Trash2,
  RefreshCw,
  User,
  AlertTriangle,
  Lock,
  Tag,
  Truck,
  Box,
  Layers,
  Check,
  Activity,
  Cpu,
  BarChart3,
  ExternalLink,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PageHeader } from "@/components/ui/PageHeader";

// -----------------------------------------------------------------------------
// PRODUCT CATALOG DATA
// -----------------------------------------------------------------------------
export interface Product {
  id: string;
  name: string;
  category: "Hardware" | "Workstation" | "Accessories";
  price: number;
  originalPrice?: number;
  rating: number;
  reviewsCount: number;
  inStock: boolean;
  image: string;
  tagline: string;
  description: string;
  specs: { [key: string]: string };
}

const PRODUCTS: Product[] = [
  {
    id: "prod-1",
    name: "PulsePilot Neural AI Edge Accelerator",
    category: "Hardware",
    price: 1249.0,
    originalPrice: 1399.0,
    rating: 4.9,
    reviewsCount: 142,
    inStock: true,
    image: "https://images.unsplash.com/photo-1591488320449-011701bb6704?auto=format&fit=crop&w=800&q=80",
    tagline: "PCIe Gen 4.0 accelerator card with 48GB VRAM for local LLM inference.",
    description:
      "Designed for autonomous AI agents and local inference pipelines. Delivers 320 TFLOPS of FP16 compute with ultra-quiet dual-axial cooling and native vLLM acceleration.",
    specs: {
      "Compute Cores": "16,384 Tensor Cores",
      Memory: "48GB GDDR6X (960 GB/s)",
      Interface: "PCIe 4.0 x16",
      "Power Draw": "285W TDP",
    },
  },
  {
    id: "prod-2",
    name: "Apex Pro Mechanical AI Keyboard",
    category: "Accessories",
    price: 189.99,
    originalPrice: 219.99,
    rating: 4.8,
    reviewsCount: 388,
    inStock: true,
    image: "https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=800&q=80",
    tagline: "75% Wireless custom mechanical keyboard with dedicated AI macro dial.",
    description:
      "CNC anodized aluminum chassis, factory-lubed Gateron Oil King linear switches, hot-swappable PCB, and a custom multi-function rotary encoder for fast prompt cycling.",
    specs: {
      Layout: "75% ANSI (82 Keys)",
      Switches: "Gateron Oil Kings (Linear)",
      Connectivity: "2.4GHz Wireless / Bluetooth 5.2 / USB-C",
      Battery: "4,000 mAh (Up to 200 hours)",
    },
  },
  {
    id: "prod-3",
    name: "Prism 4K Ultra-Wide Curved Monitor 34\"",
    category: "Workstation",
    price: 729.99,
    originalPrice: 849.99,
    rating: 4.7,
    reviewsCount: 215,
    inStock: true,
    image: "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&w=800&q=80",
    tagline: "34-inch 144Hz WQHD curved IPS display with 90W USB-C Power Delivery.",
    description:
      "Immerse yourself in wide workspace clarity with 3440x1440 resolution, 99% sRGB color gamut calibration, and seamless one-cable charging and display connectivity.",
    specs: {
      Resolution: "3440 x 1440 (21:9 WQHD)",
      "Refresh Rate": "144Hz Adaptive Sync",
      Curvature: "1800R",
      Ports: "USB-C (90W PD), 2x HDMI 2.1, 1x DP 1.4",
    },
  },
  {
    id: "prod-4",
    name: "Studio One Reference Planar Headphones",
    category: "Accessories",
    price: 299.99,
    originalPrice: 349.99,
    rating: 4.9,
    reviewsCount: 164,
    inStock: true,
    image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80",
    tagline: "Open-back planar magnetic audiophile reference headphones for deep focus.",
    description:
      "Engineered with ultra-thin nano-scale diaphragms for transparent, fatigue-free audio playback during intense engineering and deep-work sessions.",
    specs: {
      Transducer: "Planar Magnetic (100mm)",
      "Frequency Response": "10Hz – 50kHz",
      Impedance: "32 Ohms",
      Weight: "360g",
    },
  },
  {
    id: "prod-5",
    name: "Vanguard Dual-Motor Standing Desk",
    category: "Workstation",
    price: 549.99,
    rating: 4.8,
    reviewsCount: 92,
    inStock: true,
    image: "https://images.unsplash.com/photo-1595515106969-1ce29566ff1c?auto=format&fit=crop&w=800&q=80",
    tagline: "Heavy-duty electric height-adjustable desk with solid bamboo desktop.",
    description:
      "Smooth whisper-quiet dual motors with 300 lbs load capacity, anti-collision sensor, and 4 programmable memory presets for seamless sit-to-stand transitions.",
    specs: {
      Desktop: "60\" x 30\" Solid Carbonized Bamboo",
      "Height Range": "25.0\" to 50.5\"",
      Motors: "Dual Heavy-Duty (1.5 in/sec)",
      Capacity: "300 lbs (136 kg)",
    },
  },
  {
    id: "prod-6",
    name: "Artisan Precision Desk Mat (900x400mm)",
    category: "Accessories",
    price: 39.99,
    originalPrice: 49.99,
    rating: 4.9,
    reviewsCount: 512,
    inStock: true,
    image: "https://images.unsplash.com/photo-1616400619175-5beda3a17896?auto=format&fit=crop&w=800&q=80",
    tagline: "Hydrophobic micro-weave Cordura fabric with anti-fray stitched borders.",
    description:
      "Water-repellent spill-resistant surface with high-density natural rubber base to anchor your keyboard, mouse, and desktop gear in place without shifting.",
    specs: {
      Dimensions: "900 x 400 x 4 mm",
      Surface: "Hydrophobic Cordura Micro-Weave",
      Base: "Non-Slip Natural Rubber",
      Stitching: "Low-Profile 360° Anti-Fray",
    },
  },
];

interface CartItem {
  product: Product;
  quantity: number;
}

type StoreView = "CATALOG" | "DETAILS" | "CART" | "CHECKOUT" | "CONFIRMATION";

export default function DemoStorePage() {
  // Navigation View State
  const [currentView, setCurrentView] = useState<StoreView>("CATALOG");
  const [selectedProduct, setSelectedProduct] = useState<Product>(PRODUCTS[0]);

  // Shopping Cart State
  const [cart, setCart] = useState<CartItem[]>([
    { product: PRODUCTS[1], quantity: 1 }, // Default keyboard in cart
  ]);
  const [couponCode, setCouponCode] = useState("GROWTH20");
  const [discountApplied, setDiscountApplied] = useState(true);

  // Stable Identity State (Flagsmith Requirement)
  const [distinctUserId, setDistinctUserId] = useState<string>("user_alex_dev");
  const [customIdentityInput, setCustomIdentityInput] = useState("");

  // Evaluated Flagsmith Experiment State
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluatedVariant, setEvaluatedVariant] = useState<{
    variantKey: string;
    variantName: string;
    layout: "multi_step" | "single_page" | "express";
    title: string;
    badge: string;
    expressPayment: boolean;
  }>({
    variantKey: "control",
    variantName: "Multi-Step Checkout",
    layout: "multi_step",
    title: "Multi-Step Checkout",
    badge: "Standard Multi-Step",
    expressPayment: false,
  });

  // Telemetry Tracking State
  const [exposureLogged, setExposureLogged] = useState(false);
  const [conversionLogged, setConversionLogged] = useState(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [lastOrderDetails, setLastOrderDetails] = useState<{
    orderId: string;
    total: number;
    itemsCount: number;
    variantUsed: string;
    userId: string;
    timestamp: string;
  } | null>(null);

  // Multi-step Checkout Step (for Control)
  const [multiStepIndex, setMultiStepIndex] = useState<number>(1);

  // Checkout Form State
  const [shippingForm, setShippingForm] = useState({
    fullName: "Alex Rivera",
    email: "alex.rivera@example.com",
    address: "452 Silicon Blvd, Suite 300",
    city: "San Francisco",
    state: "CA",
    zip: "94107",
    cardNumber: "•••• •••• •••• 4242",
    expiry: "12/28",
    cvc: "888",
  });

  // Traffic Simulator State
  const [simulatorEnabled, setSimulatorEnabled] = useState(true);
  const [simulatorCount, setSimulatorCount] = useState<number>(25);
  const [simulatorScenario, setSimulatorScenario] = useState<"SINGLE_PAGE_WINS" | "EXPRESS_WINS" | "FLAT">("SINGLE_PAGE_WINS");
  const [isSimulating, setIsSimulating] = useState(false);
  const [simProgress, setSimProgress] = useState(0);
  const [simResults, setSimResults] = useState<{
    totalSimulated: number;
    exposures: number;
    conversions: number;
    lift: number;
  } | null>(null);

  // 1. Evaluate Flag on Identity Change
  const evaluateFlagsmith = async (identity: string) => {
    setIsEvaluating(true);
    try {
      const res = await fetch(`/api/flagsmith/evaluate?flag=checkout_experience&identity=${encodeURIComponent(identity)}`);
      const data = await res.json();

      let parsedValue: any = {};
      try {
        parsedValue = typeof data.value === "string" ? JSON.parse(data.value) : data.value;
      } catch (e) {
        parsedValue = {};
      }

      const layout =
        data.variantKey === "variant_single_page"
          ? "single_page"
          : data.variantKey === "variant_express"
          ? "express"
          : "multi_step";

      setEvaluatedVariant({
        variantKey: data.variantKey || "control",
        variantName:
          data.variantKey === "variant_single_page"
            ? "Variant A: Single-Page Checkout"
            : data.variantKey === "variant_express"
            ? "Variant B: Express Checkout"
            : "Control: Multi-Step Checkout",
        layout,
        title: parsedValue?.title || (layout === "single_page" ? "Single-Page Checkout" : layout === "express" ? "Express Checkout" : "Multi-Step Checkout"),
        badge: parsedValue?.badge || (layout === "single_page" ? "Streamlined 1-Page" : layout === "express" ? "1-Click Express" : "Standard Multi-Step"),
        expressPayment: Boolean(parsedValue?.expressPayment),
      });

      // Reset step
      setMultiStepIndex(1);
    } catch (err) {
      console.error("Flagsmith evaluation failed:", err);
    } finally {
      setIsEvaluating(false);
    }
  };

  // Trigger evaluation on initial load or distinctUserId change
  useEffect(() => {
    evaluateFlagsmith(distinctUserId);
  }, [distinctUserId]);

  // 2. Record Exposure when entering Checkout
  useEffect(() => {
    if (currentView === "CHECKOUT" && !exposureLogged) {
      fetch("/api/telemetry/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          experimentFlag: "checkout_experience",
          distinctUserId,
          eventType: "EXPOSURE",
          variantKey: evaluatedVariant.variantKey,
          properties: {
            cartItems: cart.length,
            cartSubtotal: calculateSubtotal(),
            assignedLayout: evaluatedVariant.layout,
            isSynthetic: false,
          },
        }),
      }).catch((e) => console.warn("Exposure tracking error:", e));
      setExposureLogged(true);
    }
  }, [currentView, distinctUserId, evaluatedVariant.variantKey, exposureLogged]);

  // Calculations
  const calculateSubtotal = () =>
    cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);

  const calculateDiscount = () => (discountApplied ? calculateSubtotal() * 0.2 : 0);
  const calculateShipping = () => (calculateSubtotal() > 100 || calculateSubtotal() === 0 ? 0 : 15.0);
  const calculateTotal = () => Math.max(0, calculateSubtotal() - calculateDiscount() + calculateShipping());

  // Add / Remove from Cart
  const addToCart = (product: Product, quantity = 1) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      return [...prev, { product, quantity }];
    });
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.id === productId) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  // 3. Complete Checkout (Record Conversion with EXACT SAME Identity)
  const handleCompleteOrder = async () => {
    setIsSubmittingOrder(true);
    try {
      const orderId = `ORD-${Math.floor(100000 + Math.random() * 900000)}`;

      // Send conversion telemetry to Flagsmith with IDENTICAL distinctUserId
      const res = await fetch("/api/telemetry/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          experimentFlag: "checkout_experience",
          distinctUserId, // CRITICAL: Must match exposure distinctUserId
          eventType: "CONVERSION",
          variantKey: evaluatedVariant.variantKey,
          metricKey: "checkout_completed",
          properties: {
            orderId,
            revenue: calculateTotal(),
            itemsCount: cart.reduce((c, i) => c + i.quantity, 0),
            variantLayout: evaluatedVariant.layout,
            isSynthetic: false,
          },
        }),
      });

      if (res.ok) {
        setConversionLogged(true);
        setLastOrderDetails({
          orderId,
          total: calculateTotal(),
          itemsCount: cart.reduce((c, i) => c + i.quantity, 0),
          variantUsed: evaluatedVariant.variantName,
          userId: distinctUserId,
          timestamp: new Date().toLocaleTimeString(),
        });
        setCart([]); // Clear cart
        setCurrentView("CONFIRMATION");
      }
    } catch (err) {
      console.error("Order completion failed:", err);
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  // 4. Run Batch Demo Traffic Simulator
  const handleRunSimulation = async () => {
    if (!simulatorEnabled) return;
    setIsSimulating(true);
    setSimProgress(10);

    try {
      const interval = setInterval(() => {
        setSimProgress((prev) => (prev < 90 ? prev + 20 : prev));
      }, 200);

      const res = await fetch("/api/flagsmith/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          featureFlagName: "checkout_experience",
          count: simulatorCount,
          scenario: simulatorScenario,
        }),
      });

      clearInterval(interval);
      setSimProgress(100);

      const data = await res.json();
      if (data.success) {
        setSimResults({
          totalSimulated: data.result.syntheticVisitorsGenerated,
          exposures: data.result.exposures,
          conversions: data.result.conversions,
          lift: simulatorScenario === "SINGLE_PAGE_WINS" ? 20.3 : simulatorScenario === "EXPRESS_WINS" ? 14.5 : 0.8,
        });
      }
    } catch (err) {
      console.error("Simulation failed:", err);
    } finally {
      setTimeout(() => setIsSimulating(false), 500);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-150 pb-20">
      {/* Page Header */}
      <PageHeader
        title="PulsePilot Demo Shop"
        description="Live customer storefront demonstrating real-time Flagsmith feature flag evaluation, exposure tracking, and conversion attribution."
        badge={
          <div className="flex items-center gap-2">
            <StatusBadge status="active" label="FLAGSMITH SDK LIVE" />
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
              Exp: checkout_experience
            </span>
          </div>
        }
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentView("CART")}
              className="px-3.5 py-1.5 rounded-md bg-surface border border-border hover:bg-surface-subtle text-xs font-semibold text-text flex items-center gap-2 shadow-xs transition-colors relative"
            >
              <ShoppingCart className="w-4 h-4 text-primary" />
              <span>Cart ({cart.reduce((s, i) => s + i.quantity, 0)})</span>
              {cart.length > 0 && (
                <span className="w-2 h-2 rounded-full bg-primary absolute -top-1 -right-1 animate-pulse" />
              )}
            </button>
            <Link
              href="/analytics"
              className="px-3 py-1.5 rounded-md bg-primary hover:bg-primary-dark text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <BarChart3 className="w-3.5 h-3.5" /> View Experiment Intelligence
            </Link>
          </div>
        }
      />

      {/* TOP BAR: IDENTITY SELECTOR & FLAGSMITH VARIANT FLOATING BADGE */}
      <div className="p-4 rounded-xl border border-violet-200 bg-gradient-to-r from-violet-50/80 via-white to-violet-50/50 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Identity Controller */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <User className="w-4 h-4 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <label className="text-[11px] font-bold text-text-secondary uppercase tracking-wider block">
                Visitor Identity (Deterministic Flagsmith Hashing)
              </label>
              <span className="text-[10px] text-emerald-700 bg-emerald-100 font-bold px-1.5 py-0.2 rounded font-mono">
                Stable ID
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <select
                value={distinctUserId}
                onChange={(e) => {
                  setDistinctUserId(e.target.value);
                  setExposureLogged(false);
                  setConversionLogged(false);
                }}
                className="text-xs font-mono font-bold bg-white border border-border rounded-md px-2.5 py-1 text-text shadow-xs focus:ring-1 focus:ring-primary focus:outline-hidden"
              >
                <option value="user_alex_dev">user_alex_dev (Evaluates to: Single-Page)</option>
                <option value="user_sarah_frontend">user_sarah_frontend (Evaluates to: Express)</option>
                <option value="user_david_lead">user_david_lead (Evaluates to: Multi-Step)</option>
                <option value="user_elena_ai">user_elena_ai (Evaluates to: Single-Page)</option>
                <option value="user_marcus_cto">user_marcus_cto (Evaluates to: Multi-Step)</option>
              </select>

              <button
                onClick={() => {
                  const randomId = `visitor_${Math.random().toString(36).slice(2, 8)}`;
                  setDistinctUserId(randomId);
                  setExposureLogged(false);
                  setConversionLogged(false);
                }}
                className="p-1 rounded-md border border-border bg-white hover:bg-surface-subtle text-text-secondary"
                title="Generate Random Stable Visitor ID"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isEvaluating ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Live Evaluated Variant Pill */}
        <div className="flex items-center gap-2 self-start md:self-auto p-2 rounded-lg bg-white border border-violet-200 shadow-xs">
          <div className="text-right">
            <div className="text-[10px] text-text-muted uppercase font-mono">Assigned Variation</div>
            <div className="text-xs font-bold text-text font-mono flex items-center gap-1.5 justify-end">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
              <span>{evaluatedVariant.variantName}</span>
            </div>
          </div>
          <span className="px-2 py-1 rounded text-[11px] font-bold bg-primary text-white font-mono shrink-0">
            {evaluatedVariant.badge}
          </span>
        </div>
      </div>

      {/* DEMO TRAFFIC SIMULATOR DRAWER / ACCORDION */}
      <div className="p-4 rounded-xl border border-border bg-surface shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Zap className="w-4 h-4 text-amber-500 shrink-0" />
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-bold text-text uppercase tracking-wide">
                  Synthetic Demo Traffic Simulator
                </h4>
                <span className="px-2 py-0.5 rounded text-[10px] bg-amber-100 text-amber-900 border border-amber-300 font-bold uppercase">
                  Synthetic Telemetry Only
                </span>
              </div>
              <p className="text-[11px] text-text-secondary">
                Generate batches of realistic visitors, stream Flagsmith exposures, and trigger conversions.
              </p>
            </div>
          </div>

          {/* Toggle Simulator */}
          <div className="flex items-center gap-3">
            <label className="text-[11px] font-medium text-text-secondary flex items-center gap-1.5">
              <span>Enable Simulator:</span>
              <input
                type="checkbox"
                checked={simulatorEnabled}
                onChange={(e) => setSimulatorEnabled(e.target.checked)}
                className="w-4 h-4 accent-primary rounded cursor-pointer"
              />
            </label>
          </div>
        </div>

        {simulatorEnabled && (
          <div className="pt-2 border-t border-border grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="text-[10px] font-bold text-text-muted block uppercase">Visitor Batch Size</label>
              <select
                value={simulatorCount}
                onChange={(e) => setSimulatorCount(Number(e.target.value))}
                className="w-full mt-1 p-1.5 rounded bg-surface-subtle border border-border font-mono text-text text-xs"
              >
                <option value={20}>20 Visitors</option>
                <option value={50}>50 Visitors</option>
                <option value={100}>100 Visitors</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold text-text-muted block uppercase">Experiment Scenario</label>
              <select
                value={simulatorScenario}
                onChange={(e) => setSimulatorScenario(e.target.value as any)}
                className="w-full mt-1 p-1.5 rounded bg-surface-subtle border border-border text-text text-xs font-semibold"
              >
                <option value="SINGLE_PAGE_WINS">Variant A (Single-Page) Wins (+20% Lift)</option>
                <option value="EXPRESS_WINS">Variant B (Express) Wins (+15% Lift)</option>
                <option value="FLAT">Neutral Flat Baseline (0% Lift)</option>
              </select>
            </div>

            <div className="sm:col-span-2 flex items-end gap-2">
              <button
                onClick={handleRunSimulation}
                disabled={isSimulating}
                className="w-full py-1.5 px-3 rounded-md bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-colors disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5" />
                {isSimulating ? `Simulating ${simulatorCount} Visitors...` : `Stream ${simulatorCount} Synthetic Visitors`}
              </button>
            </div>
          </div>
        )}

        {/* Simulation Progress & Results */}
        {isSimulating && (
          <div className="space-y-1 pt-1">
            <div className="flex justify-between text-[11px] text-text-secondary font-mono">
              <span>Streaming Flagsmith Exposures & Conversions...</span>
              <span>{simProgress}%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                style={{ width: `${simProgress}%` }}
                className="h-full bg-amber-500 transition-all duration-300"
              />
            </div>
          </div>
        )}

        {simResults && !isSimulating && (
          <div className="p-2.5 rounded bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Generated <strong>{simResults.totalSimulated}</strong> synthetic visitors &rarr;{" "}
                <strong>{simResults.conversions}</strong> conversions recorded.
              </span>
            </div>
            <span className="font-mono font-bold text-amber-800">
              +{simResults.lift}% Lift Attributed
            </span>
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* STORE VIEW 1: PRODUCT CATALOG LISTING */}
      {/* ===================================================================== */}
      {currentView === "CATALOG" && (
        <div className="space-y-6">
          {/* Hero Banner */}
          <div className="p-8 rounded-2xl bg-gradient-to-r from-violet-700 via-purple-700 to-indigo-800 text-white shadow-md relative overflow-hidden">
            <div className="relative z-10 max-w-xl space-y-2">
              <span className="text-xs uppercase tracking-wider font-mono px-2.5 py-0.5 rounded-full bg-white/20 text-white">
                Developer & AI Workstation Gear
              </span>
              <h2 className="text-2xl font-bold tracking-tight">
                High-Performance Hardware & Workstation Setup
              </h2>
              <p className="text-xs text-violet-100 leading-relaxed">
                Test how checkout variation influences purchase conversion. Add items to your cart,
                proceed to checkout, and observe real-time Flagsmith telemetry streaming.
              </p>
            </div>
          </div>

          {/* Product Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {PRODUCTS.map((product) => (
              <div
                key={product.id}
                className="rounded-xl border border-border bg-surface overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col justify-between group"
              >
                <div>
                  <div className="relative h-48 w-full bg-slate-100 overflow-hidden cursor-pointer"
                    onClick={() => {
                      setSelectedProduct(product);
                      setCurrentView("DETAILS");
                    }}
                  >
                    <img
                      src={product.image}
                      alt={product.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <span className="absolute top-3 left-3 px-2 py-0.5 rounded text-[10px] font-bold bg-white/90 text-text backdrop-blur-xs font-mono shadow-xs">
                      {product.category}
                    </span>
                  </div>

                  <div className="p-5 space-y-2">
                    <div className="flex items-center gap-1 text-amber-500 text-xs">
                      <Star className="w-3.5 h-3.5 fill-current" />
                      <span className="font-bold text-text">{product.rating}</span>
                      <span className="text-text-muted">({product.reviewsCount})</span>
                    </div>

                    <h3
                      onClick={() => {
                        setSelectedProduct(product);
                        setCurrentView("DETAILS");
                      }}
                      className="text-sm font-bold text-text hover:text-primary transition-colors cursor-pointer line-clamp-1"
                    >
                      {product.name}
                    </h3>
                    <p className="text-xs text-text-secondary line-clamp-2 leading-relaxed">
                      {product.tagline}
                    </p>
                  </div>
                </div>

                <div className="p-5 pt-0 border-t border-border mt-3 flex items-center justify-between">
                  <div>
                    <span className="text-base font-bold text-text font-mono">
                      ${product.price.toFixed(2)}
                    </span>
                    {product.originalPrice && (
                      <span className="text-xs text-text-muted line-through ml-2 font-mono">
                        ${product.originalPrice.toFixed(2)}
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => {
                      addToCart(product, 1);
                      setCurrentView("CART");
                    }}
                    className="px-3 py-1.5 rounded-md bg-primary hover:bg-primary-dark text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add to Cart
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* STORE VIEW 2: PRODUCT DETAILS */}
      {/* ===================================================================== */}
      {currentView === "DETAILS" && (
        <div className="space-y-6">
          <button
            onClick={() => setCurrentView("CATALOG")}
            className="text-xs font-semibold text-text-secondary hover:text-text flex items-center gap-1.5 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Products
          </button>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 p-6 rounded-xl border border-border bg-surface shadow-xs">
            {/* Image */}
            <div className="h-96 rounded-xl overflow-hidden bg-slate-100 border border-border">
              <img
                src={selectedProduct.image}
                alt={selectedProduct.name}
                className="w-full h-full object-cover"
              />
            </div>

            {/* Details & Specs */}
            <div className="space-y-5 flex flex-col justify-between">
              <div className="space-y-3">
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-surface-subtle text-text-secondary border border-border">
                  {selectedProduct.category}
                </span>
                <h1 className="text-2xl font-bold text-text tracking-tight">
                  {selectedProduct.name}
                </h1>

                <div className="flex items-center gap-2 text-xs">
                  <div className="flex items-center text-amber-500">
                    <Star className="w-4 h-4 fill-current" />
                    <span className="font-bold text-text ml-1">{selectedProduct.rating}</span>
                  </div>
                  <span className="text-text-muted">• {selectedProduct.reviewsCount} verified customer ratings</span>
                  <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded ml-2">
                    In Stock
                  </span>
                </div>

                <div className="text-2xl font-bold font-mono text-text pt-2">
                  ${selectedProduct.price.toFixed(2)}
                  {selectedProduct.originalPrice && (
                    <span className="text-sm text-text-muted line-through ml-3 font-normal">
                      ${selectedProduct.originalPrice.toFixed(2)}
                    </span>
                  )}
                </div>

                <p className="text-xs text-text-secondary leading-relaxed pt-2">
                  {selectedProduct.description}
                </p>

                {/* Specs Table */}
                <div className="pt-3 border-t border-border">
                  <h4 className="text-xs font-bold text-text mb-2 uppercase tracking-wide">
                    Technical Specifications
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                    {Object.entries(selectedProduct.specs).map(([k, v]) => (
                      <div key={k} className="p-2 rounded bg-surface-subtle border border-border">
                        <span className="text-text-muted text-[10px] block">{k}</span>
                        <span className="text-text font-bold">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-border flex items-center gap-3">
                <button
                  onClick={() => {
                    addToCart(selectedProduct, 1);
                    setCurrentView("CART");
                  }}
                  className="w-full py-3 rounded-lg bg-primary hover:bg-primary-dark text-white font-bold text-sm flex items-center justify-center gap-2 shadow-xs transition-colors"
                >
                  <ShoppingCart className="w-4 h-4" /> Add to Cart & Checkout
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* STORE VIEW 3: SHOPPING CART */}
      {/* ===================================================================== */}
      {currentView === "CART" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setCurrentView("CATALOG")}
              className="text-xs font-semibold text-text-secondary hover:text-text flex items-center gap-1.5 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Continue Shopping
            </button>
            <h2 className="text-lg font-bold text-text">Shopping Cart ({cart.length} items)</h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Cart Items List */}
            <div className="lg:col-span-2 space-y-3">
              {cart.length === 0 ? (
                <div className="p-12 text-center rounded-xl border border-border bg-surface space-y-3">
                  <ShoppingBag className="w-10 h-10 text-text-muted mx-auto" />
                  <h3 className="text-sm font-bold text-text">Your cart is currently empty</h3>
                  <p className="text-xs text-text-secondary">Add demo products from our catalog to test checkout variation.</p>
                  <button
                    onClick={() => setCurrentView("CATALOG")}
                    className="px-4 py-2 rounded-md bg-primary text-white text-xs font-bold"
                  >
                    Browse Catalog
                  </button>
                </div>
              ) : (
                cart.map((item) => (
                  <div
                    key={item.product.id}
                    className="p-4 rounded-xl border border-border bg-surface shadow-xs flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-4">
                      <img
                        src={item.product.image}
                        alt={item.product.name}
                        className="w-16 h-16 rounded-lg object-cover border border-border"
                      />
                      <div>
                        <h4 className="text-sm font-bold text-text">{item.product.name}</h4>
                        <span className="text-xs text-text-secondary font-mono">
                          ${item.product.price.toFixed(2)} each
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      {/* Quantity Controls */}
                      <div className="flex items-center border border-border rounded-md bg-surface-subtle">
                        <button
                          onClick={() => updateQuantity(item.product.id, -1)}
                          className="p-1.5 text-text-secondary hover:text-text"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="px-3 text-xs font-mono font-bold text-text">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateQuantity(item.product.id, 1)}
                          className="p-1.5 text-text-secondary hover:text-text"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="text-sm font-mono font-bold text-text w-20 text-right">
                        ${(item.product.price * item.quantity).toFixed(2)}
                      </div>

                      <button
                        onClick={() => removeFromCart(item.product.id)}
                        className="p-1.5 text-text-muted hover:text-danger transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Order Summary & Proceed to Checkout */}
            <div className="p-6 rounded-xl border border-border bg-surface shadow-xs space-y-4 self-start">
              <h3 className="text-sm font-bold text-text uppercase tracking-wide">Order Summary</h3>

              <div className="space-y-2 text-xs text-text-secondary">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="font-mono text-text">${calculateSubtotal().toFixed(2)}</span>
                </div>
                {discountApplied && (
                  <div className="flex justify-between text-emerald-700 font-semibold">
                    <span>Discount (20% Off GROWTH20)</span>
                    <span className="font-mono">-${calculateDiscount().toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Shipping</span>
                  <span className="font-mono text-text">
                    {calculateShipping() === 0 ? "FREE" : `$${calculateShipping().toFixed(2)}`}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t border-border font-bold text-sm text-text">
                  <span>Estimated Total</span>
                  <span className="font-mono text-primary">${calculateTotal().toFixed(2)}</span>
                </div>
              </div>

              {/* Coupon Code */}
              <div className="pt-2 border-t border-border flex gap-2 text-xs">
                <input
                  type="text"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value)}
                  placeholder="Coupon Code"
                  className="w-full p-2 rounded bg-surface-subtle border border-border font-mono text-xs uppercase text-text"
                />
                <button
                  onClick={() => setDiscountApplied(couponCode.toUpperCase() === "GROWTH20")}
                  className="px-3 py-2 rounded bg-surface-subtle border border-border font-bold hover:bg-slate-200 text-text transition-colors"
                >
                  Apply
                </button>
              </div>

              <button
                onClick={() => {
                  setExposureLogged(false); // Trigger exposure on next view
                  setCurrentView("CHECKOUT");
                }}
                disabled={cart.length === 0}
                className="w-full py-3 rounded-lg bg-primary hover:bg-primary-dark text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-xs transition-colors disabled:opacity-50"
              >
                Proceed to Checkout <ArrowRight className="w-4 h-4" />
              </button>

              <div className="p-2.5 rounded bg-violet-50 border border-violet-200 text-[11px] text-violet-800 leading-relaxed">
                <strong>Experiment Preview:</strong> Entering checkout will evaluate flag{" "}
                <code>checkout_experience</code> for <code>{distinctUserId}</code> and render the
                assigned variation (Multi-Step vs Single-Page vs Express).
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* STORE VIEW 4: CHECKOUT EXPERIENCE (FLAGSMITH EXPERIMENT DRIVEN) */}
      {/* ===================================================================== */}
      {currentView === "CHECKOUT" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setCurrentView("CART")}
              className="text-xs font-semibold text-text-secondary hover:text-text flex items-center gap-1.5 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Cart
            </button>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-surface-subtle text-text border border-border">
                Variation: <strong>{evaluatedVariant.variantName}</strong>
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                EXPOSURE RECORDED
              </span>
            </div>
          </div>

          {/* ----------------------------------------------------------------- */}
          {/* EXPERIMENT VARIATION 1: CONTROL (MULTI-STEP CHECKOUT) */}
          {/* ----------------------------------------------------------------- */}
          {evaluatedVariant.layout === "multi_step" && (
            <div className="max-w-2xl mx-auto p-6 rounded-xl border border-border bg-surface shadow-xs space-y-6">
              <div className="border-b border-border pb-4">
                <span className="text-xs font-mono uppercase text-text-muted block">
                  Control Variant: Multi-Step Checkout Flow
                </span>
                <h2 className="text-lg font-bold text-text mt-0.5">
                  Complete Your Order (Step {multiStepIndex} of 3)
                </h2>

                {/* Step Indicators */}
                <div className="flex items-center justify-between mt-4 text-xs font-semibold">
                  <span className={multiStepIndex >= 1 ? "text-primary" : "text-text-muted"}>
                    1. Shipping Address
                  </span>
                  <span className={multiStepIndex >= 2 ? "text-primary" : "text-text-muted"}>
                    2. Payment Details
                  </span>
                  <span className={multiStepIndex >= 3 ? "text-primary" : "text-text-muted"}>
                    3. Review & Place Order
                  </span>
                </div>
                <div className="h-1.5 w-full bg-slate-200 rounded-full mt-2 overflow-hidden">
                  <div
                    style={{ width: `${(multiStepIndex / 3) * 100}%` }}
                    className="h-full bg-primary transition-all duration-300"
                  />
                </div>
              </div>

              {/* Step 1: Shipping */}
              {multiStepIndex === 1 && (
                <div className="space-y-4 text-xs">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="font-semibold text-text block mb-1">Full Name</label>
                      <input
                        type="text"
                        value={shippingForm.fullName}
                        onChange={(e) => setShippingForm({ ...shippingForm, fullName: e.target.value })}
                        className="w-full p-2 rounded bg-surface-subtle border border-border text-text"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-text block mb-1">Email</label>
                      <input
                        type="email"
                        value={shippingForm.email}
                        onChange={(e) => setShippingForm({ ...shippingForm, email: e.target.value })}
                        className="w-full p-2 rounded bg-surface-subtle border border-border text-text"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="font-semibold text-text block mb-1">Street Address</label>
                    <input
                      type="text"
                      value={shippingForm.address}
                      onChange={(e) => setShippingForm({ ...shippingForm, address: e.target.value })}
                      className="w-full p-2 rounded bg-surface-subtle border border-border text-text"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="font-semibold text-text block mb-1">City</label>
                      <input
                        type="text"
                        value={shippingForm.city}
                        onChange={(e) => setShippingForm({ ...shippingForm, city: e.target.value })}
                        className="w-full p-2 rounded bg-surface-subtle border border-border text-text"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-text block mb-1">State</label>
                      <input
                        type="text"
                        value={shippingForm.state}
                        onChange={(e) => setShippingForm({ ...shippingForm, state: e.target.value })}
                        className="w-full p-2 rounded bg-surface-subtle border border-border text-text"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-text block mb-1">Zip Code</label>
                      <input
                        type="text"
                        value={shippingForm.zip}
                        onChange={(e) => setShippingForm({ ...shippingForm, zip: e.target.value })}
                        className="w-full p-2 rounded bg-surface-subtle border border-border text-text"
                      />
                    </div>
                  </div>

                  <button
                    onClick={() => setMultiStepIndex(2)}
                    className="w-full py-2.5 rounded-md bg-primary hover:bg-primary-dark text-white font-bold text-xs mt-2"
                  >
                    Continue to Step 2: Payment Details &rarr;
                  </button>
                </div>
              )}

              {/* Step 2: Payment */}
              {multiStepIndex === 2 && (
                <div className="space-y-4 text-xs">
                  <div>
                    <label className="font-semibold text-text block mb-1">Card Number</label>
                    <input
                      type="text"
                      value={shippingForm.cardNumber}
                      onChange={(e) => setShippingForm({ ...shippingForm, cardNumber: e.target.value })}
                      className="w-full p-2 rounded bg-surface-subtle border border-border font-mono text-text"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="font-semibold text-text block mb-1">Expiration (MM/YY)</label>
                      <input
                        type="text"
                        value={shippingForm.expiry}
                        onChange={(e) => setShippingForm({ ...shippingForm, expiry: e.target.value })}
                        className="w-full p-2 rounded bg-surface-subtle border border-border font-mono text-text"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-text block mb-1">CVC Code</label>
                      <input
                        type="text"
                        value={shippingForm.cvc}
                        onChange={(e) => setShippingForm({ ...shippingForm, cvc: e.target.value })}
                        className="w-full p-2 rounded bg-surface-subtle border border-border font-mono text-text"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => setMultiStepIndex(1)}
                      className="w-1/3 py-2.5 rounded-md bg-surface border border-border text-text font-semibold text-xs"
                    >
                      &larr; Back
                    </button>
                    <button
                      onClick={() => setMultiStepIndex(3)}
                      className="w-2/3 py-2.5 rounded-md bg-primary hover:bg-primary-dark text-white font-bold text-xs"
                    >
                      Continue to Step 3: Review Order &rarr;
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Review */}
              {multiStepIndex === 3 && (
                <div className="space-y-4 text-xs">
                  <div className="p-3 rounded-md bg-surface-subtle border border-border space-y-2">
                    <div className="flex justify-between font-bold text-text">
                      <span>Order Total to Charge:</span>
                      <span className="font-mono text-primary text-sm">${calculateTotal().toFixed(2)}</span>
                    </div>
                    <div className="text-[11px] text-text-secondary">
                      Delivering to: {shippingForm.fullName}, {shippingForm.address}, {shippingForm.city}
                    </div>
                    <div className="text-[11px] text-text-secondary">
                      Payment Card: {shippingForm.cardNumber}
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => setMultiStepIndex(2)}
                      className="w-1/3 py-2.5 rounded-md bg-surface border border-border text-text font-semibold text-xs"
                    >
                      &larr; Back
                    </button>
                    <button
                      onClick={handleCompleteOrder}
                      disabled={isSubmittingOrder}
                      className="w-2/3 py-3 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      {isSubmittingOrder ? "Recording Conversion..." : `Confirm & Pay $${calculateTotal().toFixed(2)}`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ----------------------------------------------------------------- */}
          {/* EXPERIMENT VARIATION 2: VARIANT A (SINGLE-PAGE CHECKOUT) */}
          {/* ----------------------------------------------------------------- */}
          {evaluatedVariant.layout === "single_page" && (
            <div className="max-w-4xl mx-auto p-6 rounded-xl border border-primary/30 bg-surface shadow-sm space-y-6">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div>
                  <span className="text-xs font-mono uppercase text-primary font-bold">
                    Variant A: Streamlined Single-Page Layout
                  </span>
                  <h2 className="text-lg font-bold text-text mt-0.5">
                    Express 1-Page Checkout (Zero Friction)
                  </h2>
                </div>
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-primary-light text-primary border border-primary/20">
                  Coupon GROWTH20 Applied (-20%)
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
                {/* Left: Shipping & Billing on Single Screen */}
                <div className="space-y-4">
                  <h4 className="font-bold text-text uppercase tracking-wide">1. Shipping Information</h4>
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={shippingForm.fullName}
                      onChange={(e) => setShippingForm({ ...shippingForm, fullName: e.target.value })}
                      placeholder="Full Name"
                      className="w-full p-2 rounded bg-surface-subtle border border-border text-text"
                    />
                    <input
                      type="email"
                      value={shippingForm.email}
                      onChange={(e) => setShippingForm({ ...shippingForm, email: e.target.value })}
                      placeholder="Email Address"
                      className="w-full p-2 rounded bg-surface-subtle border border-border text-text"
                    />
                    <input
                      type="text"
                      value={shippingForm.address}
                      onChange={(e) => setShippingForm({ ...shippingForm, address: e.target.value })}
                      placeholder="Street Address"
                      className="w-full p-2 rounded bg-surface-subtle border border-border text-text"
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <input
                        type="text"
                        value={shippingForm.city}
                        onChange={(e) => setShippingForm({ ...shippingForm, city: e.target.value })}
                        placeholder="City"
                        className="p-2 rounded bg-surface-subtle border border-border text-text"
                      />
                      <input
                        type="text"
                        value={shippingForm.state}
                        onChange={(e) => setShippingForm({ ...shippingForm, state: e.target.value })}
                        placeholder="State"
                        className="p-2 rounded bg-surface-subtle border border-border text-text"
                      />
                      <input
                        type="text"
                        value={shippingForm.zip}
                        onChange={(e) => setShippingForm({ ...shippingForm, zip: e.target.value })}
                        placeholder="Zip"
                        className="p-2 rounded bg-surface-subtle border border-border text-text"
                      />
                    </div>
                  </div>
                </div>

                {/* Right: Payment on Same Screen */}
                <div className="space-y-4">
                  <h4 className="font-bold text-text uppercase tracking-wide">2. Payment Method</h4>
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={shippingForm.cardNumber}
                      onChange={(e) => setShippingForm({ ...shippingForm, cardNumber: e.target.value })}
                      placeholder="Card Number"
                      className="w-full p-2 rounded bg-surface-subtle border border-border font-mono text-text"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={shippingForm.expiry}
                        onChange={(e) => setShippingForm({ ...shippingForm, expiry: e.target.value })}
                        placeholder="MM/YY"
                        className="p-2 rounded bg-surface-subtle border border-border font-mono text-text"
                      />
                      <input
                        type="text"
                        value={shippingForm.cvc}
                        onChange={(e) => setShippingForm({ ...shippingForm, cvc: e.target.value })}
                        placeholder="CVC"
                        className="p-2 rounded bg-surface-subtle border border-border font-mono text-text"
                      />
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-surface-subtle border border-border space-y-1 mt-4">
                    <div className="flex justify-between font-bold text-text">
                      <span>Total Amount:</span>
                      <span className="font-mono text-primary text-sm">${calculateTotal().toFixed(2)}</span>
                    </div>
                    <span className="text-[10px] text-text-muted">Includes free express courier delivery</span>
                  </div>

                  <button
                    onClick={handleCompleteOrder}
                    disabled={isSubmittingOrder}
                    className="w-full py-3 rounded-lg bg-primary hover:bg-primary-dark text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-xs transition-colors"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    {isSubmittingOrder ? "Recording Conversion..." : `Complete Purchase ($${calculateTotal().toFixed(2)})`}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ----------------------------------------------------------------- */}
          {/* EXPERIMENT VARIATION 3: VARIANT B (EXPRESS 1-CLICK CHECKOUT) */}
          {/* ----------------------------------------------------------------- */}
          {evaluatedVariant.layout === "express" && (
            <div className="max-w-md mx-auto p-6 rounded-xl border border-emerald-300 bg-surface shadow-md space-y-5">
              <div className="text-center space-y-1 border-b border-border pb-4">
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">
                  Variant B: 1-Click Express Checkout
                </span>
                <h2 className="text-lg font-bold text-text">Instant Express Payment</h2>
                <p className="text-xs text-text-secondary">
                  Authorize payment in one click with your saved digital wallet.
                </p>
              </div>

              {/* Express 1-Click Digital Wallets */}
              <div className="space-y-2">
                <button
                  onClick={handleCompleteOrder}
                  disabled={isSubmittingOrder}
                  className="w-full py-3 rounded-lg bg-black hover:bg-zinc-800 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-colors"
                >
                  <CreditCard className="w-4 h-4" />
                  {isSubmittingOrder ? "Processing Express..." : `Pay with Apple Pay ($${calculateTotal().toFixed(2)})`}
                </button>

                <button
                  onClick={handleCompleteOrder}
                  disabled={isSubmittingOrder}
                  className="w-full py-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-colors"
                >
                  <Zap className="w-4 h-4 text-amber-400" />
                  {isSubmittingOrder ? "Processing Express..." : `Pay with Google Pay ($${calculateTotal().toFixed(2)})`}
                </button>
              </div>

              <div className="relative my-3 text-center">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <span className="relative bg-surface px-2 text-[10px] text-text-muted uppercase">
                  Or enter minimal info
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <input
                  type="email"
                  value={shippingForm.email}
                  onChange={(e) => setShippingForm({ ...shippingForm, email: e.target.value })}
                  placeholder="Email"
                  className="w-full p-2 rounded bg-surface-subtle border border-border text-text"
                />
                <input
                  type="text"
                  value={shippingForm.cardNumber}
                  onChange={(e) => setShippingForm({ ...shippingForm, cardNumber: e.target.value })}
                  placeholder="Card Number"
                  className="w-full p-2 rounded bg-surface-subtle border border-border font-mono text-text"
                />

                <button
                  onClick={handleCompleteOrder}
                  disabled={isSubmittingOrder}
                  className="w-full py-2.5 mt-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Check className="w-3.5 h-3.5" />
                  {isSubmittingOrder ? "Recording..." : `Instant Pay $${calculateTotal().toFixed(2)}`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* STORE VIEW 5: ORDER CONFIRMATION & TELEMETRY RECEIPT */}
      {/* ===================================================================== */}
      {currentView === "CONFIRMATION" && lastOrderDetails && (
        <div className="max-w-2xl mx-auto p-8 rounded-2xl border border-emerald-200 bg-surface shadow-md space-y-6 text-center animate-in zoom-in-95">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-inner">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div className="space-y-1">
            <span className="text-[11px] font-mono uppercase px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold">
              Conversion Event Recorded in Flagsmith
            </span>
            <h2 className="text-2xl font-bold text-text tracking-tight mt-1">
              Thank You for Your Order!
            </h2>
            <p className="text-xs text-text-secondary">
              Order <strong>#{lastOrderDetails.orderId}</strong> has been successfully placed and attributed.
            </p>
          </div>

          {/* Telemetry Attribution Card */}
          <div className="p-4 rounded-xl bg-surface-subtle border border-border text-left space-y-2 text-xs">
            <h4 className="font-bold text-text uppercase text-[10px] tracking-wider flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-primary" /> Flagsmith Telemetry Attribution Record
            </h4>
            <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
              <div>
                <span className="text-text-muted block text-[10px]">Experiment Flag:</span>
                <span className="text-text font-bold">checkout_experience</span>
              </div>
              <div>
                <span className="text-text-muted block text-[10px]">Assigned Variant:</span>
                <span className="text-primary font-bold">{lastOrderDetails.variantUsed}</span>
              </div>
              <div>
                <span className="text-text-muted block text-[10px]">Distinct User ID:</span>
                <span className="text-text font-bold">{lastOrderDetails.userId}</span>
              </div>
              <div>
                <span className="text-text-muted block text-[10px]">Attributed Event:</span>
                <span className="text-emerald-700 font-bold">checkout_completed</span>
              </div>
            </div>
          </div>

          <div className="flex justify-center gap-3 pt-2">
            <button
              onClick={() => {
                setCart([{ product: PRODUCTS[1], quantity: 1 }]);
                setCurrentView("CATALOG");
              }}
              className="px-4 py-2 rounded-md bg-surface border border-border text-text font-semibold text-xs hover:bg-surface-subtle transition-colors"
            >
              Back to Demo Store
            </button>
            <Link
              href="/analytics"
              className="px-4 py-2 rounded-md bg-primary hover:bg-primary-dark text-white font-bold text-xs flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <BarChart3 className="w-3.5 h-3.5" /> Inspect Experiment Analytics & Lift
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
