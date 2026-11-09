/**
 * High-Fidelity In-Memory Flagsmith Mock Adapter
 * PulsePilot AI — Offline & Judging Resilience
 */

export interface MockFeatureFlag {
  name: string;
  enabled: boolean;
  type: "MULTIVARIATE" | "BOOLEAN";
  value: string;
  multivariateOptions: {
    key: string;
    trafficAllocation: number;
    value: string;
  }[];
}

class FlagsmithMockStore {
  private flags: Map<string, MockFeatureFlag> = new Map();

  constructor() {
    this.seedDefaultFlags();
  }

  private seedDefaultFlags() {
    this.flags.set("exp_checkout_social_proof", {
      name: "exp_checkout_social_proof",
      enabled: true,
      type: "MULTIVARIATE",
      value: JSON.stringify({ badge: "Standard", cta: "Subscribe Now" }),
      multivariateOptions: [
        {
          key: "control",
          trafficAllocation: 50,
          value: JSON.stringify({ badge: "Standard", cta: "Subscribe Now" }),
        },
        {
          key: "variant_social_proof",
          trafficAllocation: 50,
          value: JSON.stringify({
            badge: "Loved by 10,000+ teams",
            cta: "Join 10,000+ Happy Teams",
            testimonial: "PulsePilot doubled our team's experiment cadence.",
          }),
        },
      ],
    });

    this.flags.set("exp_pricing_annual_default", {
      name: "exp_pricing_annual_default",
      enabled: true,
      type: "MULTIVARIATE",
      value: JSON.stringify({ default: "monthly" }),
      multivariateOptions: [
        { key: "control", trafficAllocation: 50, value: JSON.stringify({ default: "monthly" }) },
        { key: "variant_annual", trafficAllocation: 50, value: JSON.stringify({ default: "annual", badge: "Save 20%" }) },
      ],
    });
  }

  public getFlag(name: string): MockFeatureFlag | undefined {
    return this.flags.get(name);
  }

  public getAllFlags(): MockFeatureFlag[] {
    return Array.from(this.flags.values());
  }

  public setFlag(flag: MockFeatureFlag) {
    this.flags.set(flag.name, flag);
  }

  /**
   * Evaluates which variant an identity receives based on deterministic hashing.
   */
  public evaluateForIdentity(flagName: string, identity: string): { enabled: boolean; value: string; variantKey: string } {
    const flag = this.flags.get(flagName);
    if (!flag || !flag.enabled) {
      return { enabled: false, value: flag?.value ?? "", variantKey: "control" };
    }

    if (flag.type === "BOOLEAN" || flag.multivariateOptions.length === 0) {
      return { enabled: true, value: flag.value, variantKey: "control" };
    }

    // Deterministic hash based on identity string (e.g. 0 to 99)
    let hash = 0;
    for (let i = 0; i < identity.length; i++) {
      hash = (hash * 31 + identity.charCodeAt(i)) % 100;
    }

    let cumulative = 0;
    for (const opt of flag.multivariateOptions) {
      cumulative += opt.trafficAllocation;
      if (hash < cumulative) {
        return { enabled: true, value: opt.value, variantKey: opt.key };
      }
    }

    return { enabled: true, value: flag.multivariateOptions[0].value, variantKey: flag.multivariateOptions[0].key };
  }

  public rolloutWinner(flagName: string, winningVariantKey: string) {
    const flag = this.flags.get(flagName);
    if (!flag) return;

    const winnerOpt = flag.multivariateOptions.find((o) => o.key === winningVariantKey);
    if (winnerOpt) {
      flag.value = winnerOpt.value;
      flag.multivariateOptions = flag.multivariateOptions.map((o) => ({
        ...o,
        trafficAllocation: o.key === winningVariantKey ? 100 : 0,
      }));
      this.flags.set(flagName, flag);
    }
  }

  public updateGradualRollout(flagName: string, winningVariantKey: string, percentage: number) {
    const flag = this.flags.get(flagName);
    if (!flag) return;

    const winnerOpt = flag.multivariateOptions.find((o) => o.key === winningVariantKey);
    const controlOpt = flag.multivariateOptions.find((o) => o.key !== winningVariantKey) || flag.multivariateOptions[0];

    if (winnerOpt) {
      const clampedPct = Math.max(0, Math.min(100, percentage));
      flag.multivariateOptions = flag.multivariateOptions.map((o) => {
        if (o.key === winningVariantKey) {
          return { ...o, trafficAllocation: clampedPct };
        }
        if (controlOpt && o.key === controlOpt.key) {
          return { ...o, trafficAllocation: 100 - clampedPct };
        }
        return { ...o, trafficAllocation: 0 };
      });
      flag.enabled = true;
      this.flags.set(flagName, flag);
    }
  }

  public rollbackToControl(flagName: string) {
    const flag = this.flags.get(flagName);
    if (!flag) return;

    const controlOpt = flag.multivariateOptions.find((o) => o.key === "control" || o.key.includes("control")) || flag.multivariateOptions[0];
    if (controlOpt) {
      flag.value = controlOpt.value;
      flag.multivariateOptions = flag.multivariateOptions.map((o) => ({
        ...o,
        trafficAllocation: o.key === controlOpt.key ? 100 : 0,
      }));
      this.flags.set(flagName, flag);
    }
  }

  public toggleKillSwitch(flagName: string, enabled: boolean) {
    const flag = this.flags.get(flagName);
    if (flag) {
      flag.enabled = enabled;
      this.flags.set(flagName, flag);
    }
  }
}

export const flagsmithMockStore = new FlagsmithMockStore();

