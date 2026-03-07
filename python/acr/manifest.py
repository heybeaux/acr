"""ACR Capability Manifest types and parsing."""

from __future__ import annotations
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

import yaml


@dataclass
class Budget:
    index: int
    summary: int
    standard: int
    deep: Optional[int] = None


@dataclass
class TriggerDef:
    type: str  # "pattern" | "semantic" | "runtime_event"
    condition: str
    logic: str = "OR"


@dataclass
class ActivationConfig:
    triggers: list[TriggerDef] = field(default_factory=list)
    co_activates: list[str] = field(default_factory=list)


@dataclass
class DependencyRef:
    name: str
    resolution: str = "summary"


@dataclass
class Requirements:
    tools: list[str] = field(default_factory=list)
    capabilities: list[DependencyRef] = field(default_factory=list)
    context: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class StateField:
    name: str
    type: str
    description: str = ""


@dataclass
class StateSchema:
    version: int = 1
    max_size_tokens: int = 200
    fields: list[StateField] = field(default_factory=list)


@dataclass
class CapabilityManifest:
    name: str
    type: str  # "capability" | "capability-set"
    version: str
    description: str
    provides: list[str] = field(default_factory=list)
    requires: Requirements = field(default_factory=Requirements)
    budget: Budget = field(default_factory=lambda: Budget(10, 50, 200))
    activation: Optional[ActivationConfig] = None
    priority: str = "medium"
    state_schema: Optional[StateSchema] = None
    path: Optional[str] = None  # directory path

    @classmethod
    def from_yaml(cls, yaml_path: str | Path) -> "CapabilityManifest":
        """Load a manifest from a capability.yaml file."""
        path = Path(yaml_path)
        with open(path) as f:
            raw = yaml.safe_load(f)

        budget = Budget(
            index=raw.get("budget", {}).get("index", 10),
            summary=raw.get("budget", {}).get("summary", 50),
            standard=raw.get("budget", {}).get("standard", 200),
            deep=raw.get("budget", {}).get("deep"),
        )

        triggers = []
        activation = None
        if "activation" in raw:
            act = raw["activation"]
            for t in act.get("triggers", []):
                triggers.append(TriggerDef(
                    type=t.get("type", "pattern"),
                    condition=t.get("condition", ""),
                    logic=t.get("logic", "OR"),
                ))
            activation = ActivationConfig(
                triggers=triggers,
                co_activates=act.get("co_activates", []),
            )

        deps = []
        req = raw.get("requires", {})
        for d in req.get("capabilities", []):
            if isinstance(d, dict):
                deps.append(DependencyRef(name=d["name"], resolution=d.get("resolution", "summary")))

        requirements = Requirements(
            tools=req.get("tools", []) or [],
            capabilities=deps,
            context=req.get("context", []) or [],
        )

        state_schema = None
        if "state_schema" in raw:
            ss = raw["state_schema"]
            fields = [StateField(**f) for f in ss.get("fields", [])]
            state_schema = StateSchema(
                version=ss.get("version", 1),
                max_size_tokens=ss.get("max_size_tokens", 200),
                fields=fields,
            )

        return cls(
            name=raw["name"],
            type=raw.get("type", "capability"),
            version=raw.get("version", "0.1.0"),
            description=raw.get("description", ""),
            provides=raw.get("provides", []) or [],
            requires=requirements,
            budget=budget,
            activation=activation,
            priority=raw.get("priority", "medium"),
            state_schema=state_schema,
            path=str(path.parent),
        )
