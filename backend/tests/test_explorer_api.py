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


class _FakeStore:
    """Minimal CodeGraph.store stand-in for deterministic aggregation tests."""

    def __init__(self, nodes, edges):
        self._nodes = nodes
        self._edges = edges
        self._succ = {}
        for (s, _t) in edges:
            self._succ.setdefault(s, [])
        for (s, t) in edges:
            self._succ[s].append(t)

    def get_all_nodes(self):
        return list(self._nodes.keys())

    def successors(self, n):
        return self._succ.get(n, [])

    def get_node_data(self, n):
        return self._nodes.get(n, {})

    def get_edge_data(self, s, t):
        return self._edges.get((s, t), {})


class _FakeGraph:
    def __init__(self, store):
        self.store = store


class ExplorerAggregationTestCase(unittest.TestCase):
    """Aggregation/groups need a multi-file graph the loaded fixture lacks."""

    def _build(self):
        from backend.api.explorer import build_explorer_response

        nodes = {
            "src/a.py:funcA": {"type": "function", "name": "funcA", "file": "src/a.py", "language": "python"},
            "src/b.py:funcB": {"type": "function", "name": "funcB", "file": "src/b.py", "language": "python"},
            "lib/c.py:funcC": {"type": "function", "name": "funcC", "file": "lib/c.py", "language": "python"},
        }
        edges = {
            ("src/a.py:funcA", "src/b.py:funcB"): {"type": "CALLS"},
            ("src/a.py:funcA", "lib/c.py:funcC"): {"type": "CALLS"},
            ("src/b.py:funcB", "lib/c.py:funcC"): {"type": "IMPORTS"},
        }
        raw = [{"unique_id": k, **v} for k, v in nodes.items()]
        graph = _FakeGraph(_FakeStore(nodes, edges))
        return build_explorer_response(raw, graph)

    def test_groups_populated(self):
        resp = self._build()
        self.assertGreater(len(resp.groups), 0)
        by_id = {g.id: g for g in resp.groups}
        self.assertIn("dir:src", by_id)
        self.assertEqual(sorted(by_id["dir:src"].child_ids), ["file:src/a.py", "file:src/b.py"])

    def test_entity_parent_ids_reference_file_nodes(self):
        resp = self._build()
        funcA = next(n for n in resp.nodes if n.id == "src/a.py:funcA")
        self.assertEqual(funcA.parent_id, "file:src/a.py")

    def test_aggregate_edges_present(self):
        resp = self._build()
        agg = [e for e in resp.edges if e.aggregated]
        levels = {e.level for e in agg}
        self.assertIn("file", levels)
        self.assertIn("directory", levels)

        # The src -> lib directory edge combines one CALLS and one IMPORTS.
        dir_edge = next(
            e for e in agg
            if e.level == "directory" and e.source == "dir:src" and e.target == "dir:lib"
        )
        self.assertEqual(dir_edge.weight, 2.0)
        self.assertEqual(dir_edge.relation_counts, {"calls": 1, "imports": 1})

    def test_no_dangling_edges(self):
        resp = self._build()
        node_ids = {n.id for n in resp.nodes}
        for e in resp.edges:
            self.assertIn(e.source, node_ids, f"dangling source {e.id}")
            self.assertIn(e.target, node_ids, f"dangling target {e.id}")


if __name__ == "__main__":
    unittest.main()
