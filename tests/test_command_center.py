import json
import sqlite3
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from server import WorkforceEngine, make_server


class WorkforceEngineTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        root = Path(__file__).resolve().parents[1]
        self.engine = WorkforceEngine(
            config_path=root / "config" / "workforce.json",
            runtime_path=Path(self.temp_dir.name) / "atlantisx.db",
        )

    def test_routes_security_directive_to_sentinel(self):
        result = self.engine.create_command("افحص الأسرار والثغرات الأمنية في المستودع")
        self.assertEqual(result["task"]["owner"], "sentinel")
        self.assertEqual(result["task"]["status"], "in_progress")
        self.assertFalse(result["requires_approval"])

    def test_sensitive_directive_requires_explicit_approval(self):
        result = self.engine.create_command("احذف قاعدة البيانات وانشر مباشرة إلى الإنتاج")
        self.assertTrue(result["requires_approval"])
        self.assertEqual(result["task"]["status"], "approval")
        self.assertEqual(result["task"]["owner"], "orion")

    def test_command_is_persisted_and_visible_in_state(self):
        created = self.engine.create_command("جهّز تقرير سوق موريتانيا للأسبوع القادم")
        state = self.engine.get_state()
        self.assertEqual(state["tasks"][0]["id"], created["task"]["id"])
        self.assertTrue(self.engine.runtime_path.exists())
        with sqlite3.connect(self.engine.runtime_path) as connection:
            saved_count = connection.execute("SELECT COUNT(*) FROM runtime_tasks").fetchone()[0]
            journal_mode = connection.execute("PRAGMA journal_mode").fetchone()[0]
        self.assertEqual(saved_count, 1)
        self.assertEqual(journal_mode, "wal")

    def test_legacy_json_runtime_is_imported_into_sqlite_once(self):
        migration_dir = Path(self.temp_dir.name) / "migration"
        migration_dir.mkdir()
        legacy = migration_dir / "runtime.json"
        legacy.write_text(json.dumps({
            "tasks": [{
                "id": "AX-999", "title": "مهمة قديمة", "owner": "atlas",
                "status": "queued", "priority": "low", "progress": 0,
            }],
            "activities": [], "overrides": {}, "workflows": {},
        }, ensure_ascii=False), encoding="utf-8")
        migrated = WorkforceEngine(
            config_path=self.engine.config_path,
            runtime_path=migration_dir / "atlantisx.db",
        )
        state = migrated.get_state()
        self.assertEqual(state["tasks"][0]["id"], "AX-999")
        with sqlite3.connect(migrated.runtime_path) as connection:
            marker = connection.execute(
                "SELECT value FROM runtime_metadata WHERE key='legacy_json_imported'"
            ).fetchone()
        self.assertIsNotNone(marker)
        self.assertTrue(legacy.exists())

    def test_dispatch_autonomously_completes_safe_local_work(self):
        result = self.engine.dispatch_command("جهّز تقرير سوق أسبوعي")
        self.assertTrue(result["autorun"])
        self.assertEqual(result["workflow"]["state"], "completed")
        self.assertEqual(result["task"]["status"], "completed")
        self.assertIn("security", result["executed"])

    def test_dispatch_prepares_sovereign_work_then_waits_for_ceo(self):
        result = self.engine.dispatch_command("انشر مباشرة إلى الإنتاج")
        self.assertFalse(result["accepted"])
        self.assertEqual(result["workflow"]["state"], "waiting_approval")
        self.assertEqual(result["task"]["status"], "approval")
        self.assertNotIn("release", result["executed"])

    def test_dashboard_decisions_are_backed_by_waiting_workflows(self):
        state = self.engine.get_state()
        decision_task_ids = {decision["task_id"] for decision in state["decisions"]}
        self.assertEqual(decision_task_ids, {"AX-224", "AX-240"})
        for task in state["tasks"]:
            if task["id"] in decision_task_ids:
                self.assertEqual(task["workflow"]["state"], "waiting_approval")

    def test_every_employee_has_complete_contract_and_live_queue(self):
        state = self.engine.get_state()
        required = {
            "id", "mission", "skills", "memory", "tools", "permissions", "kpis",
            "queue", "communication", "reports_to", "escalation", "performance",
        }
        for agent in state["agents"]:
            self.assertFalse(required.difference(agent), agent["id"])
            self.assertIn("items", agent["queue"])
            self.assertEqual(agent["queue"]["depth"], len(agent["queue"]["items"]))

    def test_external_capabilities_remain_disabled_until_all_gates_pass(self):
        state = self.engine.get_state()
        policy = state["capability_policy"]
        self.assertFalse(policy["policy"]["external_automation_enabled"])
        self.assertEqual(len(policy["policy"]["required_gates"]), 3)
        for capability in policy["capabilities"]:
            self.assertEqual(capability["state"], "disabled")
            self.assertFalse(capability["permission"]["granted"])
            self.assertEqual(capability["health"]["status"], "unverified")
            self.assertEqual(capability["rollback"]["status"], "missing")
        self.assertEqual(state["runtime"]["automation"]["enabled_capabilities"], 0)

    def test_native_vault_is_wired_without_external_permissions(self):
        root = Path(__file__).resolve().parents[1]
        capability = json.loads((root / "src-tauri" / "capabilities" / "default.json").read_text())
        self.assertEqual(capability["permissions"], ["core:default"])
        self.assertEqual(capability["windows"], ["main"])

        native_source = (root / "src-tauri" / "src" / "vault.rs").read_text()
        runtime_source = (root / "src-tauri" / "src" / "runtime.rs").read_text()
        frontend = (root / "web" / "app.js").read_text()
        self.assertIn("bundled-sqlcipher-vendored-openssl", (root / "src-tauri" / "Cargo.toml").read_text())
        self.assertIn("permission_granted = 1 AND health_verified = 1 AND rollback_ready = 1", native_source)
        self.assertIn('nativeInvoke("unlock_vault"', frontend)
        self.assertIn('nativeInvoke("native_state"', frontend)
        self.assertIn('nativeInvoke("dispatch_command"', frontend)
        self.assertIn('nativeInvoke("lock_vault"', frontend)
        self.assertIn("atlantis-local-a2a-v1", runtime_source)
        self.assertIn("sanitize_import_payload", runtime_source)
        self.assertIn("normalized_import_assets", runtime_source)
        self.assertIn('"authenticated_pairing": false', runtime_source)
        self.assertIn("sanitizeMigrationPayload", frontend)
        self.assertIn("CREATE TABLE IF NOT EXISTS imported_assets", native_source)
        self.assertIn("pub initialized: bool", native_source)
        self.assertIn("schema_version: 2", native_source)
        self.assertIn("vault-passphrase-confirm", (root / "web" / "index.html").read_text())

    def test_native_management_catalog_is_default_deny_and_honest(self):
        root = Path(__file__).resolve().parents[1]
        catalog = json.loads((root / "config" / "providers.json").read_text())
        self.assertGreaterEqual(len(catalog["providers"]), 15)
        self.assertEqual(catalog["policy"]["default"], "disabled")
        self.assertEqual(catalog["policy"]["credential_store"], "native_sqlcipher_only")
        self.assertTrue(all(provider["status"] != "enabled" for provider in catalog["providers"]))
        bedrock = next(provider for provider in catalog["providers"] if provider["id"] == "aws-bedrock")
        self.assertFalse(bedrock["operational"])
        self.assertEqual(bedrock["status"], "adapter_required")

        html = (root / "web" / "index.html").read_text()
        frontend = (root / "web" / "app.js").read_text()
        for element_id in (
            "provider-grid", "skill-form", "migration-file", "organization-form",
            "schedule-form", "provider-dialog", "member-dialog",
        ):
            self.assertIn('id="{}"'.format(element_id), html)
        for command in (
            "configure_provider", "install_skill", "apply_migration", "create_team",
            "add_team_member", "create_schedule",
        ):
            self.assertIn('nativeInvoke("{}"'.format(command), frontend)

    def test_task_status_update_is_auditable(self):
        created = self.engine.create_command("جهّز حملة تسويق جديدة")
        updated = self.engine.update_task_status(created["task"]["id"], "review")
        self.assertEqual(updated["status"], "review")
        state = self.engine.get_state()
        self.assertEqual(state["tasks"][0]["status"], "review")
        self.assertEqual(state["tasks"][0]["workflow"]["cursor"], 2)
        self.assertEqual(state["tasks"][0]["workflow"]["stages"][2]["status"], "ready")
        self.assertEqual(state["runtime"]["audit_events"][0]["outcome"], "override")
        self.assertEqual(state["activities"][0]["type"], "task")

    def test_unknown_status_is_rejected(self):
        created = self.engine.create_command("اختبر واجهة النظام")
        with self.assertRaises(ValueError):
            self.engine.update_task_status(created["task"]["id"], "destroyed")

    def test_safe_task_runs_through_full_local_cycle(self):
        created = self.engine.create_command("جهّز تقرير سوق أسبوعي")
        result = self.engine.run_task(created["task"]["id"], "until_gate")
        self.assertEqual(result["workflow"]["state"], "completed")
        self.assertEqual(result["task"]["status"], "completed")
        self.assertIn("security", result["executed"])
        self.assertIn("release", result["executed"])
        self.assertEqual(result["workflow"]["stages"][4]["status"], "skipped")
        self.assertFalse(result["workflow"]["policy"]["external_effects_enabled"])

    def test_critical_task_stops_at_sovereign_gate(self):
        created = self.engine.create_command("راجع بشكل عاجل وحرج خطة المشروع")
        result = self.engine.run_task(created["task"]["id"], "until_gate")
        self.assertEqual(result["workflow"]["state"], "waiting_approval")
        self.assertEqual(result["task"]["status"], "approval")
        release_stage = next(stage for stage in result["workflow"]["stages"] if stage["id"] == "release")
        self.assertEqual(release_stage["status"], "pending")

    def test_ceo_can_approve_then_complete_a_gated_cycle(self):
        created = self.engine.create_command("انشر مباشرة إلى الإنتاج")
        task_id = created["task"]["id"]
        waiting = self.engine.run_task(task_id, "until_gate")
        self.assertEqual(waiting["workflow"]["state"], "waiting_approval")
        decision = self.engine.decide_task(task_id, "approve", "النطاق معتمد")
        self.assertEqual(decision["workflow"]["state"], "ready")
        completed = self.engine.run_task(task_id, "until_gate")
        self.assertEqual(completed["workflow"]["state"], "completed")
        self.assertEqual(completed["task"]["progress"], 100)

    def test_ceo_rejection_blocks_release(self):
        created = self.engine.create_command("انشر مباشرة إلى الإنتاج")
        task_id = created["task"]["id"]
        self.engine.run_task(task_id, "until_gate")
        rejected = self.engine.decide_task(task_id, "reject")
        self.assertEqual(rejected["workflow"]["state"], "rejected")
        self.assertEqual(rejected["task"]["status"], "blocked")
        with self.assertRaises(ValueError):
            self.engine.run_task(task_id, "until_gate")

    def test_weak_commander_key_is_rejected(self):
        with self.assertRaises(ValueError):
            make_server("127.0.0.1", 0, commander_key="too-short")

    def test_http_commander_key_protects_control_plane(self):
        server = make_server("127.0.0.1", 0, commander_key="test-commander-key")
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base_url = "http://127.0.0.1:{}".format(server.server_address[1])
        try:
            with urlopen(base_url + "/api/health", timeout=3) as response:
                health = json.load(response)
            self.assertTrue(health["commander_auth_required"])

            with urlopen(base_url + "/manifest.webmanifest", timeout=3) as response:
                manifest = json.load(response)
                manifest_type = response.headers.get_content_type()
            self.assertEqual(manifest["short_name"], "Atlantis-X")
            self.assertEqual(manifest_type, "application/manifest+json")
            self.assertTrue(any(icon["sizes"] == "512x512" for icon in manifest["icons"]))

            with self.assertRaises(HTTPError) as context:
                urlopen(base_url + "/api/state", timeout=3)
            self.assertEqual(context.exception.code, 401)

            request = Request(
                base_url + "/api/state",
                headers={"Authorization": "Bearer test-commander-key"},
            )
            with urlopen(request, timeout=3) as response:
                state = json.load(response)
            self.assertTrue(state["runtime"]["authority"]["verified"])
            self.assertEqual(state["runtime"]["authority"]["mode"], "commander_key")
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=3)


if __name__ == "__main__":
    unittest.main()
