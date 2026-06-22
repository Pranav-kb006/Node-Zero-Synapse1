import os
import unittest
from fastapi.testclient import TestClient

os.environ.setdefault("SYNAPSE_DISABLE_AI", "1")

from backend.api.main import app

class ExplorerApiTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.client_context = TestClient(app)
        cls.client = cls.client_context.__enter__()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.client_context.__exit__(None, None, None)

    def test_explorer_schema(self) -> None:
        response = self.client.get("/graph/explorer")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        
        self.assertIn("schema_version", payload)
        self.assertEqual(payload["schema_version"], 1)
        self.assertIn("repository", payload)
        self.assertIn("nodes", payload)
        self.assertIn("edges", payload)
        self.assertIn("capabilities", payload)
        
        # Test capabilities structure
        caps = payload["capabilities"]
        self.assertIn("languages", caps)
        self.assertIn("has_git", caps)
        self.assertIn("has_governance", caps)
        self.assertIn("has_summaries", caps)
        
        # Test node fields
        nodes = payload["nodes"]
        if len(nodes) > 0:
            node = nodes[0]
            self.assertIn("id", node)
            self.assertIn("kind", node)
            self.assertIn("language", node)
            self.assertIn("name", node)
            self.assertIn("qualified_name", node)
            self.assertIn("file_path", node)
            
        # Test edge fields
        edges = payload["edges"]
        if len(edges) > 0:
            edge = edges[0]
            self.assertIn("id", edge)
            self.assertIn("source", edge)
            self.assertIn("target", edge)
            self.assertIn("relation", edge)
            self.assertIn("weight", edge)

    def test_explorer_filtering_language(self) -> None:
        response = self.client.get("/graph/explorer?language=python")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        for node in payload["nodes"]:
            if node["kind"] not in ("directory", "file"):
                self.assertEqual(node["language"], "python")

if __name__ == "__main__":
    unittest.main()
