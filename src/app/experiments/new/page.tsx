"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  FlaskConical,
  Flag,
  CheckCircle2,
  AlertTriangle,
  Sliders,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  Copy,
  Check,
  Code2,
  Trash2,
  Plus,
  Play,
  FileCode,
  Layers,
  Activity,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ConfirmationModal } from "@/components/ui/ConfirmationModal";
import {
  ExperimentStrategy,
  ReadinessReview,
  MetricItemSchema,
  validateExperimentStrategy,
} from "@/lib/ai/schemas";

const selectableObjectives = [
  "Increase conversion",
  "Increase revenue",
  "Improve retention",
  "Reduce abandonment",
  "Improve engagement",
  "Improve onboarding",
  "Custom objective",
];

const availablePrimaryMetrics = [
  { key: "checkout_completed", name: "Checkout Completed", type: "CONVERSION_RATE" as const },
  { key: "registration_completed", name: "Registration Completed", type: "CONVERSION_RATE" as const },
  { key: "purchase_completed", name: "Purchase Completed", type: "CONVERSION_RATE" as const },
  { key: "subscription_started", name: "Subscription Started", type: "CONVERSION_RATE" as const },
  { key: "button_clicked", name: "Primary Button Clicked", type: "COUNT" as const },
];

const availableSecondaryMetrics = [
  { key: "session_duration_seconds"¶»§q«^