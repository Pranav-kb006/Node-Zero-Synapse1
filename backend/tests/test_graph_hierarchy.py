import os
import unittest
from typing import Dict, List

from fastapi.testclient import TestClient

os.environ.setdefault("SYNAPSE_DISABLE_AI", "1")

from backend.api.main import app, _directory_key


class GraphHierarchyApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.client_context = TestClient(app)
        cls.client = cls.client_context.__enter__()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.client_context.__exit__(None, None, None)

    def test_directory_key_normalization(self) -> None:
        self.assertEqual(_directory_key(r".\backend\ai\file.py"), "backend/ai")
        self.assertEqual(_directory_key("debug_file.py"), "root")
        self.assertEqual(_directory_key("scripts/index_codebase.py"), "scripts")

    def test_full_graph_includes_file_metadata(self) -> None:
        response = self.client.get("/graph")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIn("nodes", payload)
        self.assertIn("edges", payload)

        nodes: List[Dict] = payload["nodes"]
        nodes_by_id = {node["id"]: node for node in nodes}

        target_suffix = "backend/api/main.py:load_data"
        matched_id = next((k for k in nodes_by_id if k.replace("\\", "/").endswith(target_suffix)), None)
        self.assertIsNotNone(matched_id, f"Could not find node for '{target_suffix}' in full graph")
        self.assertTrue(nodes_by_id[matched_id].get("file"))

    def test_condensed_graph_has_real_hierarchy(self) -> None:
        full_response = self.client.get("/graph")
        self.assertEqual(full_response.status_code, 200)
        full_nodes = full_response.json()["nodes"]
        unknown_file_ids = {node["id"] for node in full_nodes if not node.get("file")}

        response = self.client.get("/graph/condensed")
        self.assertEqual(response.status_code, 200)
        payload = response.json()

        directory_nodes = payload["directory_nodes"]
        files_by_directory = payload["files_by_directory"]
        entities_by_file = payload["entities_by_file"]
        entity_edges = payload["entity_edges"]

        self.assertGreater(len(directory_nodes), 1)
        self.assertGreater(len(files_by_directory), 1)
        self.assertNotIn("", entities_by_file)

        total_files = 0
        condensed_entity_ids = set()
        for directory_files in files_by_directory.values():
            for file_node in directory_files:
                total_files += 1
                file_id = file_node["id"]
                self.assertTrue(file_id)
                entities = entities_by_file.get(file_id, [])
                self.assertEqual(file_node["entity_count"], len(entities))
                for entity in entities:
                    condensed_entity_ids.add(entity["id"])

        self.assertGreater(total_files, 1)
        self.assertTrue(unknown_file_ids.isdisjoint(condensed_entity_ids))

        for edge in entity_edges:
            self.assertIn(edge["source"], condensed_entity_ids)
            self.assertIn(edge["target"], condensed_entity_ids)


if __name__ == "__main__":
    unittest.main()
