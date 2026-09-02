import { Card, CardContent, Badge, Button } from '@databricks/appkit-ui/react';
import { ArrowRight, ChevronDown, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { ZONES, GOVERNANCE_RIBBON, CHIP_BY_ID } from './archConfig';
import type { ProductChip } from './archConfig';

function ProductChipButton({
  chip, accent, selected, onSelect,
}: { chip: ProductChip; accent: string; selected: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left rounded-lg border bg-card p-2.5 shadow-sm transition-all hover:shadow-md ${
        selected ? 'ring-2 border-transparent' : 'hover:border-primary/40'
      }`}
      style={selected ? { boxShadow: `0 0 0 2px ${accent}` } : undefined}
    >
      <div className="flex items-center gap-2">
        <span className="text-base leading-none">{chip.icon}</span>
        <span className="font-semibold text-[13px] leading-tight text-foreground">{chip.product}</span>
      </div>
      <div className="mt-1 font-mono text-[10px] leading-tight text-muted-foreground break-words">{chip.caption}</div>
    </button>
  );
}

export function ArchitecturePage() {
  const [selected, setSelected] = useState<string | null>('uc');
  const [showGov, setShowGov] = useState(true);
  const sel = selected ? CHIP_BY_ID[selected] : null;

  return (
    <div className="space-y-6 w-full max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Solution Architecture</h2>
          <p className="text-sm text-muted-foreground">
            One governed Lakehouse, left to right: sources → Lakeflow → Unity Catalog → serving → this app. Click any product to inspect it.
          </p>
        </div>
        <Button variant={showGov ? 'secondary' : 'ghost'} size="sm" onClick={() => setShowGov((v) => !v)} className="gap-1">
          <ShieldCheck className="h-3.5 w-3.5" /> {showGov ? 'Hide' : 'Show'} governance
        </Button>
      </div>

      {/* zoned flow */}
      <Card className="shadow-sm">
        <CardContent className="pt-5 overflow-x-auto">
          <div className="flex flex-col lg:flex-row lg:items-stretch gap-2 lg:gap-1 min-w-full lg:min-w-[1040px]">
            {ZONES.map((z, i) => (
              <div key={z.id} className="flex flex-col lg:flex-row lg:items-stretch lg:flex-1 gap-2 lg:gap-1">
                {/* zone panel */}
                <div
                  className="flex-1 rounded-xl border p-3 flex flex-col"
                  style={{ backgroundColor: `${z.accent}0D`, borderColor: `${z.accent}44`, borderTop: `3px solid ${z.accent}` }}
                >
                  <div className="mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded text-white" style={{ backgroundColor: z.accent }}>
                        {z.step}
                      </span>
                      <span className="font-semibold text-[13px] text-foreground leading-tight">{z.title}</span>
                    </div>
                    <div className="text-[10px] uppercase tracking-wide mt-0.5" style={{ color: z.accent }}>{z.subtitle}</div>
                  </div>

                  <div className="flex flex-col gap-2 flex-1">
                    {z.chips.map((c) => (
                      <ProductChipButton key={c.id} chip={c} accent={z.accent} selected={selected === c.id} onSelect={() => setSelected(c.id)} />
                    ))}

                    {/* medallion sub-flow (Lakeflow zone) */}
                    {z.medallion && (
                      <div className="rounded-lg border border-dashed bg-background/60 p-2" style={{ borderColor: `${z.accent}55` }}>
                        <div className="flex items-center gap-1">
                          {z.medallion.map((m, mi) => (
                            <div key={m.label} className="flex items-center gap-1 min-w-0">
                              <div className="rounded-md px-1.5 py-1 text-center min-w-0" style={{ backgroundColor: `${z.accent}1A` }}>
                                <div className="text-[10px] font-semibold" style={{ color: z.accent }}>{m.label}</div>
                                <div className="font-mono text-[8px] leading-tight text-muted-foreground truncate">{m.caption}</div>
                              </div>
                              {mi < z.medallion!.length - 1 && <ArrowRight className="h-3 w-3 shrink-0" style={{ color: z.accent }} />}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* inter-zone flow arrow */}
                {i < ZONES.length - 1 && (
                  <div className="flex items-center justify-center text-muted-foreground/60 lg:px-0.5">
                    <ArrowRight className="hidden lg:block h-5 w-5" />
                    <ChevronDown className="lg:hidden h-5 w-5" />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* governance ribbon — spans the whole flow */}
          {showGov && (
            <div
              className="mt-4 rounded-lg border border-dashed p-3 flex flex-wrap items-center gap-x-4 gap-y-1"
              style={{ borderColor: '#4C2A8666', backgroundColor: '#4C2A8610' }}
            >
              <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: '#4C2A86' }}>
                <ShieldCheck className="h-3.5 w-3.5" /> {GOVERNANCE_RIBBON.title}
              </span>
              {GOVERNANCE_RIBBON.points.map((p) => (
                <span key={p} className="text-xs text-foreground/80">• {p}</span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* inspector */}
      {sel && (
        <Card className="shadow-sm">
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{sel.icon}</span>
              <div>
                <div className="font-semibold text-foreground">{sel.product}</div>
                <div className="text-xs" style={{ color: sel.accent }}>{sel.zoneTitle} · <span className="font-mono">{sel.caption}</span></div>
              </div>
              <Badge variant="secondary" className="ml-auto">Unity Catalog governed</Badge>
            </div>
            <p className="text-sm text-foreground/80 mt-3">{sel.detail}</p>
          </CardContent>
        </Card>
      )}

      {/* competitive framing — before → after */}
      <Card className="shadow-sm">
        <CardContent className="pt-5">
          <div className="text-sm font-semibold text-foreground mb-4">One governed platform replaces a fragmented stack</div>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-stretch">
            <div className="rounded-lg border border-dashed border-muted-foreground/40 bg-muted/30 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                Before · siloed data + fraud tooling
              </div>
              <div className="flex flex-wrap gap-2">
                {['Legacy DW', 'Standalone fraud engine', 'Separate BI tool', 'OSS pipelines', 'OSS MLflow', 'OSS monitoring', 'OSS governance'].map((t) => (
                  <span key={t} className="text-[11px] rounded-md border border-muted-foreground/30 bg-card px-2 py-1 text-muted-foreground line-through decoration-red-400/70">
                    {t}
                  </span>
                ))}
              </div>
              <div className="text-[11px] text-red-500/80 mt-3">Fraud signals arrive after the money moves · governance rebuilt per tool</div>
            </div>

            <div className="flex md:flex-col items-center justify-center gap-1 text-primary">
              <ArrowRight className="h-7 w-7 rotate-90 md:rotate-0" />
              <span className="text-[11px] font-semibold">Databricks</span>
            </div>

            <div className="rounded-lg border-2 p-4" style={{ borderColor: '#0D9488', backgroundColor: '#0D94880F' }}>
              <div className="text-[11px] font-semibold uppercase tracking-wide mb-3" style={{ color: '#0D9488' }}>
                After · one governed Lakehouse
              </div>
              <div className="flex flex-wrap gap-2">
                {['Lakeflow Declarative Pipelines', 'Unity Catalog', 'Metric Views', 'AI/BI Genie', 'Mosaic AI Serving', 'Lakebase', 'Databricks Apps'].map((t) => (
                  <span key={t} className="text-[11px] rounded-md px-2 py-1 font-medium" style={{ backgroundColor: '#0D94881A', color: '#0D9488' }}>
                    ✓ {t}
                  </span>
                ))}
              </div>
              <div className="text-[11px] mt-3" style={{ color: '#0D9488' }}>Real-time fraud scoring + governed C360 on one platform — no rip-and-replace</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
