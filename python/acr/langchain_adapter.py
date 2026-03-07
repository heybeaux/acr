"""ACR LangChain Adapter — integrate ACR with LangChain agents.

Usage:
    from acr.langchain_adapter import ACRToolManager

    manager = ACRToolManager(capabilities_dir="./capabilities")

    # For chat agents: dynamic per-turn context
    context = manager.get_context_for_message("Create a NestJS endpoint")

    # For worker agents: one-shot resolution
    context = manager.resolve_for_task("Implement auth with Prisma")

    # Inject into system prompt
    system_prompt = f"{base_prompt}\\n\\n{context}"

LangChain Integration Points:
    1. SystemMessage injection — add ACR context to the system prompt
    2. Tool filtering — only expose tools for mounted capabilities
    3. Callback-based — trigger on each agent step
"""

from __future__ import annotations
from pathlib import Path
from typing import Optional, Callable

from .loader import LODLoader
from .resolver import TaskResolver, TaskResolution
from .manifest import CapabilityManifest


class ACRToolManager:
    """Manages ACR capabilities for LangChain agents.

    This is the primary integration point. It wraps the LODLoader and
    TaskResolver to provide LangChain-friendly APIs.
    """

    def __init__(
        self,
        capabilities_dir: str | Path,
        max_budget: int = 15000,
        max_capabilities: int = 8,
    ):
        self.loader = LODLoader()
        self.capabilities_dir = Path(capabilities_dir)

        # Register all capabilities
        for d in sorted(self.capabilities_dir.iterdir()):
            if d.is_dir() and (d / "capability.yaml").exists():
                self.loader.register(d)

        self.resolver = TaskResolver(
            self.loader,
            max_budget=max_budget,
            max_capabilities=max_capabilities,
        )

        self._mounted: dict[str, str] = {}  # name -> resolution
        self._on_mount: list[Callable] = []
        self._on_unmount: list[Callable] = []

    @property
    def registered_count(self) -> int:
        return len(self.loader.names)

    @property
    def mounted_capabilities(self) -> dict[str, str]:
        return dict(self._mounted)

    def resolve_for_task(self, task_description: str) -> str:
        """One-shot capability resolution for worker agents.

        Use this when spawning a worker agent with a specific task.
        Returns the context string ready for injection.
        """
        resolution = self.resolver.resolve(task_description)
        self._update_mounted(resolution)
        return resolution.context

    def resolve_for_task_detailed(self, task_description: str) -> TaskResolution:
        """Like resolve_for_task but returns full resolution details."""
        resolution = self.resolver.resolve(task_description)
        self._update_mounted(resolution)
        return resolution

    def get_context_for_message(self, message: str) -> str:
        """Dynamic per-message capability resolution.

        Use this for chat agents where context needs change per turn.
        Returns the context string ready for injection.
        """
        resolution = self.resolver.resolve(message)
        self._update_mounted(resolution)
        return resolution.context

    def get_cold_start_context(self) -> str:
        """Get minimal context with all capabilities at index level.

        Use this as the initial system prompt section.
        Returns all capabilities as one-liners.
        """
        lines = ["## Available Capabilities\n"]
        for manifest in self.loader.get_all_manifests():
            index_content = self.loader.load(manifest.name, "index")
            lines.append(f"- {index_content.strip()}")
        return "\n".join(lines)

    def get_system_prompt_section(
        self,
        task_description: Optional[str] = None,
    ) -> str:
        """Generate the capability section for a LangChain system prompt.

        If task_description is provided, resolves capabilities for the task.
        Otherwise, returns cold-start context (all at index).
        """
        if task_description:
            return self.resolve_for_task(task_description)
        return self.get_cold_start_context()

    def get_relevant_tools(self, task_description: str) -> list[str]:
        """Get list of tool names that should be active for a task.

        Use this to filter LangChain tools to only those relevant
        for the current task.
        """
        resolution = self.resolver.resolve(task_description)
        tools: list[str] = []
        for cap in resolution.capabilities:
            manifest = self.loader.get_manifest(cap.name)
            if manifest and manifest.requires.tools:
                tools.extend(manifest.requires.tools)
        return tools

    def on_mount(self, callback: Callable) -> None:
        """Register a callback for when capabilities are mounted."""
        self._on_mount.append(callback)

    def on_unmount(self, callback: Callable) -> None:
        """Register a callback for when capabilities are unmounted."""
        self._on_unmount.append(callback)

    def _update_mounted(self, resolution: TaskResolution) -> None:
        new_mounted = {c.name: c.resolution for c in resolution.capabilities}

        # Unmount removed capabilities
        for name in list(self._mounted):
            if name not in new_mounted:
                for cb in self._on_unmount:
                    cb(name, self._mounted[name])
                del self._mounted[name]

        # Mount new capabilities
        for name, res in new_mounted.items():
            if name not in self._mounted:
                for cb in self._on_mount:
                    cb(name, res)
            self._mounted[name] = res

    def budget_report(self) -> str:
        """Generate a human-readable budget report."""
        manifests = self.loader.get_all_manifests()
        lines = [f"📊 Budget Report ({len(manifests)} capabilities)\n"]

        cold_start = sum(m.budget.index for m in manifests)
        flat_load = sum(m.budget.standard for m in manifests)

        lines.append(f"  Cold start (all at index):   {cold_start:>6} tokens")
        lines.append(f"  Flat load (all at standard): {flat_load:>6} tokens")
        lines.append(f"  Savings at cold start:       {(1 - cold_start / flat_load) * 100:.0f}%")

        return "\n".join(lines)
