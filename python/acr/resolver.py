"""ACR Task Resolver — resolve capabilities from task descriptions."""

from __future__ import annotations
import re
import math
from dataclasses import dataclass, field
from typing import Optional

from .manifest import CapabilityManifest
from .loader import LODLoader


@dataclass
class ResolvedCapability:
    name: str
    resolution: str
    reason: str
    tokens: int


@dataclass
class TaskResolution:
    capabilities: list[ResolvedCapability]
    context: str
    token_cost: int
    reasoning: list[str]
    excluded: list[str]


# High-specificity tech keywords (won't match on generic terms)
TECH_KEYWORDS = [
    "nestjs", "nest", "nextjs", "next.js", "react", "angular", "vue", "svelte", "astro",
    "express", "fastify", "django", "flask", "rails",
    "prisma", "supabase", "postgres", "postgresql", "mongodb", "redis", "sqlite",
    "drizzle", "typeorm", "pinecone",
    "stripe", "salesforce", "linear", "github", "gitlab", "slack", "discord",
    "linkedin", "twitter", "figma", "firebase",
    "docker", "kubernetes", "terraform", "nginx",
    "typescript", "python", "rust", "golang",
    "database", "introspect", "introspection", "erd",
    "engram", "embedding", "vector", "recall",
]

GENERIC_TERMS = {
    "test", "testing", "api", "deploy", "schema", "migration",
    "auth", "authentication", "security", "review", "ci", "cd",
    "pipeline", "endpoint", "audit", "webhook", "cron", "memory",
}


class TaskResolver:
    """Resolve capabilities from task/ticket descriptions at spawn time."""

    def __init__(
        self,
        loader: LODLoader,
        max_budget: int = 15000,
        max_capabilities: int = 8,
        default_resolution: str = "standard",
        primary_resolution: str = "deep",
    ):
        self.loader = loader
        self.max_budget = max_budget
        self.max_capabilities = max_capabilities
        self.default_resolution = default_resolution
        self.primary_resolution = primary_resolution

    def resolve(self, task_description: str) -> TaskResolution:
        """Resolve capabilities for a task description."""
        manifests = self.loader.get_all_manifests()
        task_lower = task_description.lower()
        tech_keywords = [kw for kw in TECH_KEYWORDS if kw in task_lower]

        # Score each capability
        scored: list[tuple[CapabilityManifest, float, list[str], bool]] = []

        for manifest in manifests:
            score = 0.0
            reasons: list[str] = []
            is_primary = False

            # Signal 1: Trigger pattern match
            if manifest.activation:
                for trigger in manifest.activation.triggers:
                    if trigger.type == "pattern" and trigger.condition:
                        try:
                            if re.search(trigger.condition, task_description, re.IGNORECASE):
                                score += 50
                                reasons.append(f'pattern match')
                                is_primary = True
                        except re.error:
                            pass

            # Signal 2: Name keyword match
            name_tokens = manifest.name.lower().split("-")
            for token in name_tokens:
                if len(token) > 2 and token in task_lower:
                    score += 20
                    reasons.append(f'name: "{token}"')
                    if score >= 40:
                        is_primary = True

            # Signal 3: Provides match
            for provides in manifest.provides:
                for token in provides.lower().split("-"):
                    if len(token) > 2 and token in task_lower:
                        score += 15
                        reasons.append(f'provides: "{provides}"')

            # Signal 4: Tech keyword matching
            for keyword in tech_keywords:
                is_specific = keyword not in GENERIC_TERMS
                name_match = keyword in manifest.name.lower()
                provides_match = any(keyword in p.lower() for p in manifest.provides)
                desc_match = is_specific and keyword in manifest.description.lower()

                if name_match:
                    score += 25
                    reasons.append(f'tech in name: "{keyword}"')
                    if score >= 40:
                        is_primary = True
                elif provides_match:
                    score += 15
                    reasons.append(f'tech in provides: "{keyword}"')
                elif desc_match:
                    score += 15
                    reasons.append(f'tech in desc: "{keyword}"')
                    if score >= 40:
                        is_primary = True

            if score > 0:
                scored.append((manifest, score, reasons, is_primary))

        # Sort by score descending
        scored.sort(key=lambda x: -x[1])

        # Select within budget
        selected: list[ResolvedCapability] = []
        excluded: list[str] = []
        reasoning: list[str] = []
        budget_used = 0

        for manifest, score, reasons, is_primary in scored:
            if len(selected) >= self.max_capabilities:
                excluded.append(manifest.name)
                continue

            resolution = self.primary_resolution if is_primary else self.default_resolution
            budget = self._get_budget(manifest, resolution)

            if budget_used + budget > self.max_budget:
                # Try lower resolution
                fallback = self._fallback(resolution)
                fb_budget = self._get_budget(manifest, fallback)
                if budget_used + fb_budget <= self.max_budget:
                    selected.append(ResolvedCapability(
                        name=manifest.name,
                        resolution=fallback,
                        reason="; ".join(reasons),
                        tokens=fb_budget,
                    ))
                    budget_used += fb_budget
                    reasoning.append(f"{manifest.name}: {fallback} (demoted) — {'; '.join(reasons)}")
                else:
                    excluded.append(manifest.name)
                continue

            selected.append(ResolvedCapability(
                name=manifest.name,
                resolution=resolution,
                reason="; ".join(reasons),
                tokens=budget,
            ))
            budget_used += budget
            reasoning.append(f"{manifest.name}: {resolution} — {'; '.join(reasons)}")

        # Generate context
        context = self._generate_context(selected)
        token_cost = len(context.split()) * 4 // 3  # rough estimate

        return TaskResolution(
            capabilities=selected,
            context=context,
            token_cost=token_cost,
            reasoning=reasoning,
            excluded=excluded,
        )

    def _generate_context(self, capabilities: list[ResolvedCapability]) -> str:
        sections = ["## Capability Context\n"]
        for cap in capabilities:
            try:
                content = self.loader.load(cap.name, cap.resolution)
                sections.append(f"### {cap.name} [{cap.resolution}]\n\n{content}\n")
            except Exception:
                manifest = self.loader.get_manifest(cap.name)
                if manifest:
                    sections.append(f"### {cap.name} [{cap.resolution}]\n\n{manifest.description}\n")
        return "\n".join(sections)

    def _get_budget(self, manifest: CapabilityManifest, resolution: str) -> int:
        b = manifest.budget
        return {"deep": b.deep or b.standard, "standard": b.standard,
                "summary": b.summary, "index": b.index}.get(resolution, b.standard)

    def _fallback(self, resolution: str) -> str:
        return {"deep": "standard", "standard": "summary",
                "summary": "index", "index": "index"}[resolution]
