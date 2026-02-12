"use client";

import { STEPS, useReelStore } from "@/lib/store";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function StepWizard() {
  const currentStep = useReelStore((s) => s.currentStep);
  const setStep = useReelStore((s) => s.setStep);
  const canProceedTo = useReelStore((s) => s.canProceedTo);

  return (
    <nav className="w-full px-4 py-6">
      <div className="mx-auto flex max-w-4xl items-center justify-between">
        {STEPS.map((step, index) => {
          const isCompleted = currentStep > index;
          const isCurrent = currentStep === index;
          const isClickable = index <= currentStep || canProceedTo(index);
          return (
            <div key={step.id} className="flex items-center flex-1 last:flex-none">
              <button onClick={() => isClickable && setStep(index)} disabled={!isClickable} className="flex flex-col items-center gap-2 group cursor-pointer disabled:cursor-not-allowed">
                <div className={cn("flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-semibold transition-all duration-300", isCompleted && "border-primary bg-primary text-primary-foreground", isCurrent && "border-primary bg-primary/20 text-primary shadow-[0_0_12px_rgba(245,158,11,0.4)]", !isCompleted && !isCurrent && "border-muted-foreground/30 text-muted-foreground/50")}>
                  {isCompleted ? <Check className="h-5 w-5" /> : step.number}
                </div>
                <span className={cn("text-xs font-medium transition-colors", isCurrent && "text-primary", isCompleted && "text-foreground", !isCurrent && !isCompleted && "text-muted-foreground/50")}>{step.label}</span>
              </button>
              {index < STEPS.length - 1 && <div className={cn("mx-2 h-0.5 flex-1 rounded-full transition-colors duration-300", currentStep > index ? "bg-primary" : "bg-muted")} />}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
