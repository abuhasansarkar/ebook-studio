"use client";

import type { Plan } from "@ebook/shared";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/misc";
import { formatNumber } from "@/lib/utils";

/** The grid of one-time credit packs (non-recurring plans). */
export function OneTimeCreditPacks({ packs, pendingPlanId, onBuy }: { packs: Plan[]; pendingPlanId: string | null; onBuy: (planId: string) => void }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {packs.map((pack) => (
        <Card key={pack.id} className="p-5 flex flex-col justify-between hover:border-primary/40 transition-colors">
          <div>
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-bold text-base text-foreground">{pack.name}</h4>
              <Badge tone="neutral">One-Time</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{pack.description}</p>
            <div className="mt-4">
              <span className="text-3xl font-black text-foreground">
                ${(pack.priceMinor / 100).toFixed(2)}
              </span>
            </div>
            <p className="mt-1 text-xs font-semibold text-primary">
              +{formatNumber(pack.credits)} generation credits
            </p>
          </div>
          <Button
            variant="secondary"
            className="mt-5 w-full text-xs font-bold"
            loading={pendingPlanId === pack.id}
            disabled={pendingPlanId !== null}
            onClick={() => onBuy(pack.id)}
          >
            Buy {formatNumber(pack.credits)} credits
          </Button>
        </Card>
      ))}
    </div>
  );
}
