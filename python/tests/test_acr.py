"""ACR Python reference implementation tests."""

import os
import sys
from pathlib import Path

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
from acr.manifest import CapabilityManifest
from acr.loader import LODLoader
from acr.resolver import TaskResolver
from acr.langchain_adapter import ACRToolManager

MIGRATION_DIR = Path(__file__).parent.parent.parent / "migration-output"


class TestManifest:
    def test_load_from_yaml(self):
        if not MIGRATION_DIR.exists():
            pytest.skip("migration-output not available")
        manifest = CapabilityManifest.from_yaml(MIGRATION_DIR / "nestjs" / "capability.yaml")
        assert manifest.name == "nestjs"
        assert manifest.type == "capability"
        assert manifest.budget.standard > 0
        assert len(manifest.provides) > 0

    def test_budget_fields(self):
        if not MIGRATION_DIR.exists():
            pytest.skip("migration-output not available")
        manifest = CapabilityManifest.from_yaml(MIGRATION_DIR / "nestjs" / "capability.yaml")
        assert manifest.budget.index > 0
        assert manifest.budget.summary >= manifest.budget.index
        assert manifest.budget.standard >= manifest.budget.summary


class TestLoader:
    def test_register_and_load(self):
        if not MIGRATION_DIR.exists():
            pytest.skip("migration-output not available")
        loader = LODLoader()
        loader.register(MIGRATION_DIR / "nestjs")
        content = loader.load("nestjs", "index")
        assert "nestjs" in content.lower() or "nest" in content.lower()

    def test_register_all(self):
        if not MIGRATION_DIR.exists():
            pytest.skip("migration-output not available")
        loader = LODLoader()
        dirs = [MIGRATION_DIR / d for d in os.listdir(MIGRATION_DIR)
                if (MIGRATION_DIR / d / "capability.yaml").exists()]
        loader.register_all(dirs)
        assert len(loader.names) >= 25

    def test_resolution_levels(self):
        if not MIGRATION_DIR.exists():
            pytest.skip("migration-output not available")
        loader = LODLoader()
        loader.register(MIGRATION_DIR / "nestjs")
        index = loader.load("nestjs", "index")
        standard = loader.load("nestjs", "standard")
        assert len(standard) > len(index)

    def test_missing_capability_raises(self):
        loader = LODLoader()
        with pytest.raises(KeyError):
            loader.load("nonexistent")


class TestResolver:
    @pytest.fixture
    def resolver(self):
        if not MIGRATION_DIR.exists():
            pytest.skip("migration-output not available")
        loader = LODLoader()
        for d in sorted(os.listdir(MIGRATION_DIR)):
            p = MIGRATION_DIR / d
            if (p / "capability.yaml").exists():
                loader.register(p)
        return TaskResolver(loader)

    def test_resolves_nestjs_ticket(self, resolver):
        result = resolver.resolve(
            "Implement a new NestJS service for user authentication with Prisma"
        )
        names = [c.name for c in result.capabilities]
        assert "nestjs" in names
        assert "prisma-gen" in names

    def test_resolves_stripe_ticket(self, resolver):
        result = resolver.resolve(
            "Add Stripe webhook handler for subscription events"
        )
        names = [c.name for c in result.capabilities]
        assert "stripe" in names

    def test_respects_budget(self, resolver):
        resolver.max_budget = 2000
        result = resolver.resolve(
            "Build a full-stack app with NestJS, Prisma, Supabase, Stripe"
        )
        total = sum(c.tokens for c in result.capabilities)
        assert total <= 2000

    def test_generates_context(self, resolver):
        result = resolver.resolve("Write a NestJS service")
        assert "## Capability Context" in result.context
        assert "nestjs" in result.context.lower()

    def test_empty_task(self, resolver):
        result = resolver.resolve("fix the thing")
        assert result.capabilities is not None


class TestLangChainAdapter:
    @pytest.fixture
    def manager(self):
        if not MIGRATION_DIR.exists():
            pytest.skip("migration-output not available")
        return ACRToolManager(MIGRATION_DIR)

    def test_registered_count(self, manager):
        assert manager.registered_count >= 25

    def test_resolve_for_task(self, manager):
        context = manager.resolve_for_task("Implement NestJS auth with Prisma")
        assert "nestjs" in context.lower()
        assert len(manager.mounted_capabilities) > 0

    def test_cold_start_context(self, manager):
        context = manager.get_cold_start_context()
        assert "Available Capabilities" in context
        # Should have all capabilities listed
        assert context.count("-") >= 20

    def test_get_relevant_tools(self, manager):
        # Tools depend on manifest content, but should return a list
        tools = manager.get_relevant_tools("Create a NestJS endpoint")
        assert isinstance(tools, list)

    def test_budget_report(self, manager):
        report = manager.budget_report()
        assert "Budget Report" in report
        assert "Cold start" in report
        assert "Savings" in report

    def test_mount_callbacks(self, manager):
        mounted = []
        manager.on_mount(lambda name, res: mounted.append(name))
        manager.resolve_for_task("NestJS service")
        assert len(mounted) > 0

    def test_system_prompt_section(self, manager):
        # With task
        section = manager.get_system_prompt_section("Build a Stripe integration")
        assert "stripe" in section.lower()

        # Without task (cold start)
        section = manager.get_system_prompt_section()
        assert "Available Capabilities" in section
