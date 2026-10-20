import {
  ChevronDown,
  FlaskConical,
  Loader2,
  RotateCcw,
  Sparkles,
  Wand2,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "./ui";

const EXAMPLES = [
  "buy 2 reams of printer paper under $40",
  "we need coffee beans",
  "order a monitor for the new hire",
  "buy a gift card bundle",
];

const SCENARIOS: { id: string; label: string; hint: string }[] = [
  {
    id: "routine",
    label: "Routine purchases",
    hint: "Two in-policy items auto-approved",
  },
  {
    id: "needs_approval",
    label: "Needs approval",
    hint: "$129.99 monitor above the auto limit",
  },
  {
    id: "poisoned_listing",
    label: "Poisoned listing",
    hint: "Injected instructions + an oversize quantity",
  },
  {
    id: "blocked_category",
    label: "Out-of-mandate category",
    hint: "Gift cards denied before any order exists",
  },
];

export function AgentComposer({
  busy,
  simulated,
  onGoal,
  onScenario,
  onResetRequest,
}: {
  busy: boolean;
  simulated: boolean;
  onGoal: (goal: string) => void;
  onScenario: (id: string) => void;
  onResetRequest: () => void;
}) {
  const [goal, setGoal] = useState("");

  function submit() {
    const clean = goal.trim();
    if (clean.length < 3) return;
    onGoal(clean);
    setGoal("");
  }

  return (
    <section className="panel composer" aria-labelledby="composer-title">
      <div className="panel-head">
        <div>
          <p className="kicker">Agent console</p>
          <h2 id="composer-title">Give the agent a goal</h2>
        </div>
        <Badge tone="info" dot>
          Agent proposes · you decide
        </Badge>
      </div>

      <form
        className="composer-form"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label className="sr-only" htmlFor="goal">
          What should the agent buy?
        </label>
        <div className="composer-field">
          <Wand2 size={17} className="composer-icon" aria-hidden />
          <input
            id="goal"
            className="composer-input"
            value={goal}
            maxLength={500}
            onChange={(event) => setGoal(event.target.value)}
            placeholder="e.g. buy 2 reams of printer paper under $40"
            autoComplete="off"
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || goal.trim().length < 3}
          >
            {busy ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />}
            {busy ? "Planning…" : "Send to agent"}
          </button>
        </div>
      </form>

      <div className="example-row" aria-label="Example goals">
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            className="example-chip"
            disabled={busy}
            onClick={() => onGoal(example)}
          >
            {example}
          </button>
        ))}
      </div>

      {simulated && (
        <details className="scenarios">
          <summary>
            <span>
              <FlaskConical size={14} aria-hidden /> Demo scenarios
            </span>
            <ChevronDown size={14} className="chev" aria-hidden />
          </summary>
          <div className="scenario-grid">
            {SCENARIOS.map((scenario) => (
              <button
                key={scenario.id}
                type="button"
                className="scenario"
                disabled={busy}
                onClick={() => onScenario(scenario.id)}
              >
                <span>{scenario.label}</span>
                <small>{scenario.hint}</small>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm reset-btn"
            onClick={onResetRequest}
            disabled={busy}
          >
            <RotateCcw size={13} aria-hidden /> Reset demo data
          </button>
        </details>
      )}
    </section>
  );
}
