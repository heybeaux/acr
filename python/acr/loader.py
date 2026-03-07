"""ACR LOD Loader — reads capability content at different resolution levels."""

from __future__ import annotations
from pathlib import Path
from typing import Optional

from .manifest import CapabilityManifest


RESOLUTION_ORDER = ["index", "summary", "standard", "deep"]


class LODLoader:
    """Loads capability content at different resolution levels."""

    def __init__(self):
        self._manifests: dict[str, CapabilityManifest] = {}
        self._dirs: dict[str, Path] = {}

    def register(self, capability_dir: str | Path) -> None:
        """Register a capability directory."""
        path = Path(capability_dir)
        manifest_path = path / "capability.yaml"
        if not manifest_path.exists():
            raise FileNotFoundError(f"No capability.yaml in {path}")

        manifest = CapabilityManifest.from_yaml(manifest_path)
        self._manifests[manifest.name] = manifest
        self._dirs[manifest.name] = path

    def register_all(self, dirs: list[str | Path]) -> None:
        """Register multiple capability directories."""
        for d in dirs:
            self.register(d)

    def load(self, name: str, resolution: str = "standard") -> str:
        """Load capability content at the specified resolution."""
        if name not in self._dirs:
            raise KeyError(f"Capability '{name}' not registered")

        path = self._dirs[name]

        # Resolution file mapping
        file_map = {
            "index": "index.txt",
            "summary": "summary.md",
            "standard": "standard.md",
            "deep": "deep.md",
        }

        # Try requested resolution, fall back through chain
        idx = RESOLUTION_ORDER.index(resolution)
        for level in reversed(RESOLUTION_ORDER[:idx + 1]):
            file_path = path / file_map[level]
            if file_path.exists():
                return file_path.read_text()

        return f"{name}: {self._manifests[name].description}"

    def get_manifest(self, name: str) -> Optional[CapabilityManifest]:
        return self._manifests.get(name)

    def get_all_manifests(self) -> list[CapabilityManifest]:
        return list(self._manifests.values())

    @property
    def names(self) -> list[str]:
        return list(self._manifests.keys())
