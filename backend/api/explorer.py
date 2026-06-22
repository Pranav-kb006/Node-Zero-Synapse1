from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional, Set, Tuple

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Shared enums
# ---------------------------------------------------------------------------

class NodeKind(str, Enum):
    DIRECTORY = "directory"
    FILE = "file"
    MODULE = "module"
    CLASS = "class"
    INTERFACE = "interface"
    ENUM = "enum"
    STRUCT = "struct"
    FUNCTION = "function"
    METHOD = "method"
    VARIABLE = "variable"
    IMPORT = "import"
    EXTERNAL = "external"


class Relation(str, Enum):
    CONTAINS = "contains"
    IMPORTS = "imports"
    IMPORTS_FROM = "imports_from"
    INCLUDES = "includes"
    CALLS = "calls"
    INHERITS = "inherits"
    IMPLEMENTS = "implements"
    DECORATES = "decorates"
    READS_GLOBAL = "reads_global"
    WRITES_GLOBAL = "writes_global"


class RiskLevel(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class Language(str, Enum):
    PYTHON = "python"
    JAVA = "java"
    CPP = "cpp"
    UNKNOWN = "unknown"


# ---------------------------------------------------------------------------
# Pydantic response models (schema_version: 1)
# ---------------------------------------------------------------------------

class ExplorerComplexity(BaseModel):
    cyclomatic: int = 0
    cognitive: int = 0
    lines_of_code: int = 0


class ExplorerRisk(BaseModel):
    level: RiskLevel = RiskLevel.LOW
    score: Optional[float] = None


class ExplorerRange(BaseModel):
    start: int = 0
    end: int = 0


class ExplorerNode(BaseModel):
    id: str
    kind: NodeKind
    language: Language = Language.UNKNOWN
    name: str
    qualified_name: str
    file_path: str
    range: Optional[ExplorerRange] = None
    parent_id: Optional[str] = None
    complexity: Optional[ExplorerComplexity] = None
    risk: Optional[ExplorerRisk] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ExplorerEdge(BaseModel):
    id: str
    source: str
    target: str
    relation: Relation
    weight: float = 1.0
    members: Optional[List[str]] = None
    # Aggregate-edge metadata. When `aggregated` is true the edge represents
    # many underlying entity-level edges projected onto a visible ancestor
    # container (`level` = "file" or "directory"). `relation_counts` carries
    # the per-relation breakdown so the UI can label and filter aggregates.
    aggregated: bool = False
    level: Optional[str] = None
    relation_counts: Optional[Dict[str, int]] = None


class ExplorerGroup(BaseModel):
    id: str
    label: str
    kind: str = "directory"
    child_ids: List[str] = Field(default_factory=list)
    language: Optional[Language] = None
    risk: Optional[ExplorerRisk] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ExplorerCapabilities(BaseModel):
    languages: List[Language] = Field(default_factory=list)
    has_git: bool = False
    has_governance: bool = False
    has_summaries: bool = False


class ExplorerRepository(BaseModel):
    id: str
    name: str
    root_label: str


class ExplorerGraphResponse(BaseModel):
    schema_version: int = 1
    repository: ExplorerRepository
    nodes: List[ExplorerNode] = Field(default_factory=list)
    edges: List[ExplorerEdge] = Field(default_factory=list)
    groups: List[ExplorerGroup] = Field(default_factory=list)
    capabilities: ExplorerCapabilities = Field(default_factory=ExplorerCapabilities)


# ---------------------------------------------------------------------------
# Map internal relation strings to ExplorerEdge.relation values
# ---------------------------------------------------------------------------

_EDGE_RELATION_MAP: Dict[str, Relation] = {
    "CALLS": Relation.CALLS,
    "INHERITS": Relation.INHERITS,
    "IMPLEMENTS": Relation.IMPLEMENTS,
    "IMPORTS": Relation.IMPORTS,
    "IMPORTS_FROM": Relation.IMPORTS_FROM,
    "CONTAINS": Relation.CONTAINS,
    "DECORATES": Relation.DECORATES,
    "READS_GLOBAL": Relation.READS_GLOBAL,
    "WRITES_GLOBAL": Relation.WRITES_GLOBAL,
    "INCLUDES": Relation.INCLUDES,
}

_KIND_MAP: Dict[str, NodeKind] = {
    "directory": NodeKind.DIRECTORY,
    "file": NodeKind.FILE,
    "module": NodeKind.MODULE,
    "class": NodeKind.CLASS,
    "interface": NodeKind.INTERFACE,
    "enum": NodeKind.ENUM,
    "struct": NodeKind.STRUCT,
    "function": NodeKind.FUNCTION,
    "method": NodeKind.METHOD,
    "variable": NodeKind.VARIABLE,
    "import": NodeKind.IMPORT,
    "external": NodeKind.EXTERNAL,
}

_LANG_MAP: Dict[str, Language] = {
    "python": Language.PYTHON,
    "java": Language.JAVA,
    "cpp": Language.CPP,
    "c++": Language.CPP,
}

_RISK_DEGREE_THRESHOLD = {
    RiskLevel.CRITICAL: 15,
    RiskLevel.HIGH: 8,
    RiskLevel.MEDIUM: 4,
}


def _risk_from_degree(degree: int) -> ExplorerRisk:
    for level, threshold in _RISK_DEGREE_THRESHOLD.items():
        if degree >= threshold:
            return ExplorerRisk(level=level, score=float(degree))
    return ExplorerRisk(level=RiskLevel.LOW, score=float(degree))


def _extract_complexity(node: Dict[str, Any]) -> Optional[ExplorerComplexity]:
    raw = node.get("complexity")
    if raw is None:
        return None
    if isinstance(raw, dict):
        cyclomatic = raw.get("cyclomatic", 0) or 0
        cognitive = raw.get("cognitive", 0) or 0
        loc = raw.get("lines_of_code", 0) or 0
    elif isinstance(raw, (int, float)):
        cyclomatic = int(raw)
        cognitive = 0
        loc = 0
    else:
        return None
    if cyclomatic == 0 and cognitive == 0 and loc == 0:
        return None
    return ExplorerComplexity(cyclomatic=cyclomatic, cognitive=cognitive, lines_of_code=loc)


def _extract_range(node: Dict[str, Any]) -> Optional[ExplorerRange]:
    raw = node.get("range")
    if isinstance(raw, list) and len(raw) >= 2:
        return ExplorerRange(start=int(raw[0]), end=int(raw[1]))
    if isinstance(raw, dict):
        return ExplorerRange(start=int(raw.get("start", 0)), end=int(raw.get("end", 0)))
    return None


def _make_node_id(raw_id: str) -> str:
    return raw_id


def _infer_parent_id(node_id: str, node: Dict[str, Any]) -> Optional[str]:
    file_path = node.get("file", "")
    if node.get("type") in ("function", "method", "variable", "class",
                            "interface", "enum", "struct", "module", "import"):
        if file_path:
            # Point at the synthesized file node id so the parent chain is
            # consistent: entity -> file:<path> -> dir:<path>.
            return f"file:{file_path}"
    return None


# ---------------------------------------------------------------------------
# Build ExplorerGraphResponse from loaded graph data
# ---------------------------------------------------------------------------

def build_explorer_response(
    raw_data: List[Dict[str, Any]],
    code_graph: Any,
    *,
    root: Optional[str] = None,
    depth: Optional[int] = None,
    language_filter: Optional[str] = None,
    kind_filter: Optional[str] = None,
) -> ExplorerGraphResponse:
    store = code_graph.store

    # --- Build node ID set for degree counting ---
    in_degree: Dict[str, int] = {}
    out_degree: Dict[str, int] = {}
    all_store_nodes = store.get_all_nodes()

    for node_id in all_store_nodes:
        for succ in store.successors(node_id):
            out_degree[node_id] = out_degree.get(node_id, 0) + 1
            in_degree[succ] = in_degree.get(succ, 0) + 1

    # --- Build raw entity map ---
    raw_entity_map: Dict[str, Dict[str, Any]] = {}
    for entity in raw_data:
        eid = entity.get("unique_id") or entity.get("name")
        if eid:
            raw_entity_map[eid] = entity

    # --- Collect languages present ---
    detected_languages: Set[str] = set()

    # --- Build ExplorerNodes (entity-level from graph store) ---
    explorer_nodes: List[ExplorerNode] = []
    for node_id in all_store_nodes:
        store_data = store.get_node_data(node_id) or {}
        raw = raw_entity_map.get(node_id, {})
        merged = {**raw, **store_data}

        raw_type = merged.get("type", "external")
        kind = _KIND_MAP.get(raw_type, NodeKind.EXTERNAL)

        lang_str = merged.get("language", "unknown")
        language = _LANG_MAP.get(lang_str, Language.UNKNOWN)
        if language != Language.UNKNOWN:
            detected_languages.add(language.value)

        name = merged.get("name") or node_id.split(":")[-1].split("/")[-1]
        file_path = merged.get("file", "")
        qualified_name = node_id

        degree = in_degree.get(node_id, 0) + out_degree.get(node_id, 0)
        risk = _risk_from_degree(degree) if degree > 0 else None
        complexity = _extract_complexity(merged)
        node_range = _extract_range(merged)
        parent_id = _infer_parent_id(node_id, merged)

        meta_keys = {"bases", "decorators", "is_abstract", "is_dataclass",
                     "is_interface", "is_protocol", "visibility", "docstring",
                     "imported_names", "module", "import_type", "is_star",
                     "is_relative", "scope", "parent", "is_constant"}
        metadata: Dict[str, Any] = {}
        for k in meta_keys:
            if k in merged and merged[k] is not None:
                metadata[k] = merged[k]

        explorer_nodes.append(ExplorerNode(
            id=node_id,
            kind=kind,
            language=language,
            name=name,
            qualified_name=qualified_name,
            file_path=file_path,
            range=node_range,
            parent_id=parent_id,
            complexity=complexity,
            risk=risk,
            metadata=metadata,
        ))

    # --- Build ExplorerEdges (entity-level from graph store, skip CONTAINS) ---
    explorer_edges: List[ExplorerEdge] = []
    seen_edges: Set[str] = set()
    for node_id in all_store_nodes:
        for succ in store.successors(node_id):
            edge_data = store.get_edge_data(node_id, succ) or {}
            raw_type = edge_data.get("type", "CALLS")

            if raw_type == "CONTAINS":
                continue

            relation = _EDGE_RELATION_MAP.get(raw_type, Relation.CALLS)
            weight = float(edge_data.get("weight", 1.0))
            context = edge_data.get("context")

            edge_id = f"{node_id}--{raw_type}--{succ}"
            if edge_id in seen_edges:
                continue
            seen_edges.add(edge_id)

            members = [context] if context else None

            explorer_edges.append(ExplorerEdge(
                id=edge_id,
                source=node_id,
                target=succ,
                relation=relation,
                weight=weight,
                members=members,
            ))

    # --- Synthesize file and directory nodes ---
    files_by_path: Dict[str, Dict[str, Any]] = {}
    dirs_by_path: Dict[str, Dict[str, Any]] = {}
    for node in explorer_nodes:
        fp = node.file_path
        if not fp:
            continue
        # Register file
        if fp not in files_by_path:
            files_by_path[fp] = {"id": fp, "langs": set(), "entity_count": 0, "complexity_sum": 0}
        files_by_path[fp]["entity_count"] += 1
        files_by_path[fp]["complexity_sum"] += (node.complexity.cyclomatic if node.complexity else 0)
        if node.language != Language.UNKNOWN:
            files_by_path[fp]["langs"].add(node.language.value)
        # Register directory
        dir_path = "/".join(fp.rstrip("/").split("/")[:-1]) or fp
        if dir_path not in dirs_by_path:
            dirs_by_path[dir_path] = {"id": dir_path, "langs": set(), "file_count": 0, "complexity_sum": 0}
        dirs_by_path[dir_path]["file_count"] += 1
        dirs_by_path[dir_path]["complexity_sum"] += files_by_path[fp]["complexity_sum"]
        dirs_by_path[dir_path]["langs"].update(files_by_path[fp]["langs"])

    # Build file nodes (prefixed to avoid collision with module entity IDs)
    for fp, info in files_by_path.items():
        file_label = fp.split("/")[-1]
        flangs = info["langs"]
        file_node_id = f"file:{fp}"
        explorer_nodes.append(ExplorerNode(
            id=file_node_id,
            kind=NodeKind.FILE,
            language=Language(list(flangs)[0]) if len(flangs) == 1 else Language.UNKNOWN,
            name=file_label,
            qualified_name=fp,
            file_path=fp,
            parent_id=f"dir:{'/'.join(fp.rstrip('/').split('/')[:-1]) or fp}",
            metadata={"entity_count": info["entity_count"], "complexity_sum": info["complexity_sum"]},
        ))

    # Build directory nodes
    for dp, info in dirs_by_path.items():
        dir_label = dp.split("/")[-1] or dp
        dlangs = info["langs"]
        explorer_nodes.append(ExplorerNode(
            id=f"dir:{dp}",
            kind=NodeKind.DIRECTORY,
            language=Language(list(dlangs)[0]) if len(dlangs) == 1 else Language.UNKNOWN,
            name=dir_label,
            qualified_name=dp,
            file_path=dp,
            metadata={"file_count": info["file_count"], "complexity_sum": info["complexity_sum"]},
        ))

    # --- Build CONTAINS edges from files to their entities ---
    for node in list(explorer_nodes):
        if node.kind in (NodeKind.DIRECTORY, NodeKind.FILE):
            continue
        fp = node.file_path
        if not fp:
            continue
        file_node_id = f"file:{fp}"
        edge_id = f"{file_node_id}--CONTAINS--{node.id}"
        if edge_id in seen_edges:
            continue
        seen_edges.add(edge_id)
        explorer_edges.append(ExplorerEdge(
            id=edge_id,
            source=file_node_id,
            target=node.id,
            relation=Relation.CONTAINS,
            weight=1.0,
        ))

    # --- Build CONTAINS edges from directories to their files ---
    for fp, info in files_by_path.items():
        dir_path = "/".join(fp.rstrip("/").split("/")[:-1]) or fp
        dir_id = f"dir:{dir_path}"
        file_node_id = f"file:{fp}"
        edge_id = f"{dir_id}--CONTAINS--{file_node_id}"
        if edge_id in seen_edges:
            continue
        seen_edges.add(edge_id)
        explorer_edges.append(ExplorerEdge(
            id=edge_id,
            source=dir_id,
            target=file_node_id,
            relation=Relation.CONTAINS,
            weight=1.0,
        ))

    # --- Aggregate entity-level dependency edges onto file & directory
    #     containers so collapsed views still convey dependency structure.
    #     This mirrors /graph/condensed's pre-aggregation (plan section 3.3)
    #     and lets the frontend show weighted container edges without
    #     recomputing every aggregate in React. ---
    entity_file_path: Dict[str, str] = {}
    for node in explorer_nodes:
        if node.kind not in (NodeKind.DIRECTORY, NodeKind.FILE) and node.file_path:
            entity_file_path[node.id] = node.file_path

    def _dir_of(fp: str) -> str:
        return "/".join(fp.rstrip("/").split("/")[:-1]) or fp

    # (level, src_container, tgt_container, relation) -> count
    file_agg: Dict[Tuple[str, str, str], int] = {}
    dir_agg: Dict[Tuple[str, str, str], int] = {}
    for edge in explorer_edges:
        if edge.relation == Relation.CONTAINS:
            continue
        src_fp = entity_file_path.get(edge.source)
        tgt_fp = entity_file_path.get(edge.target)
        if not src_fp or not tgt_fp:
            continue
        rel = edge.relation.value
        if src_fp != tgt_fp:
            key = (f"file:{src_fp}", f"file:{tgt_fp}", rel)
            file_agg[key] = file_agg.get(key, 0) + 1
        src_dir, tgt_dir = _dir_of(src_fp), _dir_of(tgt_fp)
        if src_dir != tgt_dir:
            key = (f"dir:{src_dir}", f"dir:{tgt_dir}", rel)
            dir_agg[key] = dir_agg.get(key, 0) + 1

    def _emit_aggregates(agg: Dict[Tuple[str, str, str], int], level: str) -> None:
        # Combine per-relation counts into one weighted edge per container pair.
        pair_counts: Dict[Tuple[str, str], Dict[str, int]] = {}
        for (src, tgt, rel), count in agg.items():
            pair_counts.setdefault((src, tgt), {})[rel] = count
        for (src, tgt), rel_counts in pair_counts.items():
            total = sum(rel_counts.values())
            dominant = max(rel_counts.items(), key=lambda kv: kv[1])[0]
            edge_id = f"agg:{level}:{src}--{tgt}"
            if edge_id in seen_edges:
                continue
            seen_edges.add(edge_id)
            explorer_edges.append(ExplorerEdge(
                id=edge_id,
                source=src,
                target=tgt,
                relation=_EDGE_RELATION_MAP.get(dominant.upper(), Relation.CALLS),
                weight=float(total),
                aggregated=True,
                level=level,
                relation_counts=rel_counts,
                members=[f"{rel}:{cnt}" for rel, cnt in sorted(rel_counts.items())],
            ))

    _emit_aggregates(file_agg, "file")
    _emit_aggregates(dir_agg, "directory")

    # --- Build directory groups (one per directory, child file ids) ---
    explorer_groups: List[ExplorerGroup] = []
    files_by_dir: Dict[str, List[str]] = {}
    for fp in files_by_path:
        files_by_dir.setdefault(_dir_of(fp), []).append(f"file:{fp}")
    for dp, info in dirs_by_path.items():
        dlangs = info["langs"]
        explorer_groups.append(ExplorerGroup(
            id=f"dir:{dp}",
            label=dp.split("/")[-1] or dp,
            kind="directory",
            child_ids=sorted(files_by_dir.get(dp, [])),
            language=Language(list(dlangs)[0]) if len(dlangs) == 1 else None,
            metadata={"file_count": info["file_count"], "complexity_sum": info["complexity_sum"]},
        ))

    # --- Determine repo name ---
    repo_name = "repository"
    if raw_data:
        sample_file = raw_data[0].get("file", "")
        parts = sample_file.split("/")
        if len(parts) >= 2:
            repo_name = parts[1] if parts[0] == "uploads" else parts[0]

    # --- Apply root/depth filtering ---
    if root:
        explorer_nodes, explorer_edges = _filter_by_root(root, depth, explorer_nodes, explorer_edges)
    if language_filter:
        keep_langs = {l.strip().lower() for l in language_filter.split(",")}
        explorer_nodes = [n for n in explorer_nodes if n.language.value in keep_langs or n.kind in (NodeKind.DIRECTORY, NodeKind.FILE)]
        node_ids = {n.id for n in explorer_nodes}
        explorer_edges = [e for e in explorer_edges if e.source in node_ids and e.target in node_ids]
    if kind_filter:
        keep_kinds = {k.strip().lower() for k in kind_filter.split(",")}
        explorer_nodes = [n for n in explorer_nodes if n.kind.value in keep_kinds or n.kind in (NodeKind.DIRECTORY, NodeKind.FILE)]
        node_ids = {n.id for n in explorer_nodes}
        explorer_edges = [e for e in explorer_edges if e.source in node_ids and e.target in node_ids]

    return ExplorerGraphResponse(
        schema_version=1,
        repository=ExplorerRepository(
            id=repo_name,
            name=repo_name,
            root_label=repo_name,
        ),
        nodes=explorer_nodes,
        edges=explorer_edges,
        groups=explorer_groups,
        capabilities=ExplorerCapabilities(
            languages=[Language(l) for l in sorted(detected_languages)],
            has_git=True,
            has_governance=False,
            has_summaries=False,
        ),
    )


def _filter_by_root(
    root: str,
    depth: Optional[int],
    nodes: List[ExplorerNode],
    edges: List[ExplorerEdge],
) -> tuple:
    node_map = {n.id: n for n in nodes}
    edge_map: Dict[str, List[ExplorerEdge]] = {}
    for e in edges:
        edge_map.setdefault(e.source, []).append(e)

    # BFS from root within depth
    visited: Set[str] = set()
    queue: List[tuple] = [(root, 0)]
    while queue:
        nid, d = queue.pop(0)
        if nid in visited:
            continue
        if depth is not None and d > depth:
            continue
        visited.add(nid)
        for e in edge_map.get(nid, []):
            if e.target not in visited:
                queue.append((e.target, d + 1))

    if root not in node_map:
        return nodes, edges

    filtered_nodes = [n for n in nodes if n.id in visited]
    filtered_node_ids = {n.id for n in filtered_nodes}
    filtered_edges = [e for e in edges if e.source in filtered_node_ids and e.target in filtered_node_ids]
    return filtered_nodes, filtered_edges
