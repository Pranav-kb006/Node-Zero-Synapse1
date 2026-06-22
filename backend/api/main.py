from fastapi import FastAPI, HTTPException, Query, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import json
import os
import sys
import shutil
import zipfile
import subprocess
import threading
import stat
from typing import Any, Dict, List, Optional, Tuple

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from backend.graph.code_graph import build_dependency_graph, CodeGraph
from backend.api.explorer import build_explorer_response, ExplorerGraphResponse
from backend.git.smart_git import (
    get_git_blame,
    get_expertise_heatmap,
    get_bus_factor_analysis,
    get_knowledge_gaps,
    get_developer_expertise,
    reset_analyzer
)
from backend.governance import (
    ArchitectureValidator,
    DriftDetector,
    print_validation_report,
)
# Import AI components (may fail on some Python versions due to pyo3 panics)
_ai_available = False
rag_pipeline = None

if os.environ.get("SYNAPSE_DISABLE_AI", "").lower() not in ("1", "true", "yes"):
    try:
        from backend.ai.rag import RAGPipeline
        _ai_available = True
    except Exception as e:
        print(f"Warning: AI module failed to load: {e}")
        print("Non-AI endpoints will still work.")
else:
    print("AI module disabled via SYNAPSE_DISABLE_AI env var.")
    RAGPipeline = None  # type: ignore

# --- CONFIGURATION ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
INPUT_FILE = os.path.join(BASE_DIR, "..", "..", "repo_graph.json")
REPO_PATH = os.environ.get("SYNAPSE_REPO_PATH") or os.path.join(BASE_DIR, "..", "..", "dummy_repo")


def _get_cors_origins() -> List[str]:
    raw = os.environ.get("CORS_ALLOW_ORIGINS", "*")
    origins = [origin.strip().strip('"').strip("'") for origin in raw.split(",") if origin.strip()]
    return origins or ["*"]


def _get_cors_origin_regex(origins: List[str]) -> Optional[str]:
    explicit_regex = os.environ.get("CORS_ALLOW_ORIGIN_REGEX", "").strip()
    if explicit_regex:
        return explicit_regex

    wildcard_origins = [origin for origin in origins if "*" in origin and origin != "*"]
    if not wildcard_origins:
        return None

    patterns = []
    for origin in wildcard_origins:
        escaped = origin.replace(".", r"\.").replace("*", ".*")
        patterns.append(f"^{escaped}$")
    return "|".join(patterns)


cors_origins = _get_cors_origins()
cors_origin_regex = _get_cors_origin_regex(cors_origins)
exact_cors_origins = [origin for origin in cors_origins if "*" not in origin or origin == "*"]

app = FastAPI(
    title="Synapse Backend Engine",
    description="GraphRAG platform for code intelligence with Smart Blame expertise identification",
    version="1.0.0"
)

# Enable CORS (so your future VS Code extension can talk to this)
app.add_middleware(
    CORSMiddleware,
    allow_origins=exact_cors_origins,
    allow_origin_regex=cors_origin_regex,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

# --- GLOBAL STATE ---
# We keep the graph in memory for speed
graph_db = {
    "code_graph": None,  # CodeGraph instance (uses pluggable store backend)
    "raw_data": [],
    "git_risk": None     # GitRiskAnalyzer instance (lazy, cached)
}
startup_error = None

# AI Pipeline - initialized lazily on first /ai/* request
# This avoids loading the embedding model at startup
_rag_pipeline = None

def get_rag_pipeline() -> RAGPipeline:
    """Lazy initialization of RAG pipeline on first AI request."""
    global _rag_pipeline, _ai_available
    if not _ai_available or RAGPipeline is None:
        raise HTTPException(status_code=503, detail="AI module is disabled or unavailable")
    if _rag_pipeline is None:
        print("Initializing RAG Pipeline (first AI request)...")
        try:
            _rag_pipeline = RAGPipeline()
        except BaseException as e:
            # pyo3 panics from native bindings may bypass Exception.
            _ai_available = False
            detail = (
                "AI initialization failed (vector store). "
                f"Reason: {e}. "
                "Try deleting/rebuilding local Chroma data or restart with SYNAPSE_DISABLE_AI=1."
            )
            raise HTTPException(status_code=503, detail=detail)
        # Wire in graph context and repo path if graph is already loaded
        if graph_db["raw_data"] and graph_db["code_graph"]:
            _rag_pipeline.set_graph_context(
                graph_db["code_graph"].store, graph_db["raw_data"], REPO_PATH
            )
            _rag_pipeline.ensure_indexed(graph_db["raw_data"])
    return _rag_pipeline


RISK_ORDER = {"LOW": 0, "MEDIUM": 1, "HIGH": 2, "CRITICAL": 3}


def _normalise_file_path(file_path: str) -> str:
    if not file_path:
        return ""

    normalized = file_path.replace("\\", "/")
    active_repo = os.path.abspath(_active_repo_path()).replace("\\", "/")

    if os.path.isabs(file_path):
        absolute = os.path.abspath(file_path).replace("\\", "/")
        if absolute == active_repo:
            return ""
        if absolute.startswith(active_repo + "/"):
            return absolute[len(active_repo) + 1:]
        return absolute.lstrip("./")

    return normalized.lstrip("./")


def _normalise_violation_dict(violation: Dict[str, Any]) -> Dict[str, Any]:
    normalized = dict(violation)
    normalized["file_path"] = _normalise_file_path(str(violation.get("file_path") or ""))
    normalized["from_module"] = _normalise_file_path(str(violation.get("from_module") or ""))
    normalized["to_module"] = _normalise_file_path(str(violation.get("to_module") or ""))
    return normalized


def _directory_key(file_path: str) -> str:
    path = _normalise_file_path(file_path)
    parts = [part for part in path.split("/") if part]
    if len(parts) == 0:
        return ""
    if len(parts) == 1:
        return "root"
    if len(parts) == 2:
        return parts[0]
    return "/".join(parts[:2])


def _risk_level_from_degree(total_degree: int) -> str:
    if total_degree >= 8:
        return "CRITICAL"
    if total_degree >= 5:
        return "HIGH"
    if total_degree >= 2:
        return "MEDIUM"
    return "LOW"


def _highest_risk_level(levels: List[str]) -> str:
    if not levels:
        return "LOW"
    return max(levels, key=lambda risk: RISK_ORDER.get(risk, 0))


def _active_repo_path(repo_path: Optional[str] = None) -> str:
    return repo_path or upload_state.get("repo_path") or REPO_PATH


def _build_raw_entity_map() -> Dict[str, Dict[str, Any]]:
    raw_entity_map: Dict[str, Dict[str, Any]] = {}
    for entity in graph_db["raw_data"]:
        entity_id = entity.get("unique_id") or entity.get("name")
        if entity_id:
            raw_entity_map[entity_id] = entity
    return raw_entity_map


def _collapse_escaped_backslashes(value: str) -> str:
    """Normalize ids pasted from encoded URLs that contain doubled backslashes."""
    while "\\\\" in value:
        value = value.replace("\\\\", "\\")
    return value


def _resolve_graph_entity_id(identifier: str) -> Tuple[str, Dict[str, Any]]:
    """
    Resolve a user/API supplied entity identifier to the exact graph node id.

    Accepts exact graph ids, ids with slash/backslash differences, plain entity
    names, and qualified names like ClassName.method_name when the match is
    unambiguous.
    """
    cg = graph_db["code_graph"]
    if not cg:
        raise HTTPException(status_code=503, detail="Code graph is not loaded")

    requested = identifier.strip()
    normalized = _collapse_escaped_backslashes(requested)
    variants = list(dict.fromkeys([requested, normalized]))

    raw_entity_map = _build_raw_entity_map()

    for candidate in variants:
        if cg.store.has_node(candidate):
            return candidate, raw_entity_map.get(candidate, {})

    slash_variants = {candidate.replace("\\", "/") for candidate in variants}
    matches: Dict[str, Dict[str, Any]] = {}

    for entity in graph_db["raw_data"]:
        entity_id = entity.get("unique_id") or entity.get("name")
        entity_name = entity.get("name")
        if not entity_id:
            continue

        normalized_entity_id = str(entity_id).replace("\\", "/")
        qualified_name = str(entity_id).split(":")[-1]

        if (
            normalized_entity_id in slash_variants
            or entity_name in variants
            or qualified_name in variants
        ):
            matches[str(entity_id)] = entity

    if not matches:
        raise HTTPException(
            status_code=404,
            detail=f"Function or entity '{identifier}' not found"
        )

    if len(matches) > 1:
        sample_matches = list(matches.keys())[:5]
        raise HTTPException(
            status_code=409,
            detail={
                "message": f"Entity name '{identifier}' is ambiguous. Use a qualified name or full id.",
                "matches": sample_matches,
                "total_matches": len(matches),
            },
        )

    resolved_id, entity = next(iter(matches.items()))
    return resolved_id, entity


def _infer_repo_path_from_raw_data(data: List[Dict[str, Any]]) -> Optional[str]:
    absolute_files: List[str] = []
    project_root = os.path.abspath(os.path.join(BASE_DIR, "..", ".."))
    for entity in data:
        file_path = entity.get("file")
        if isinstance(file_path, str) and file_path:
            # Normalize Windows paths for cross-platform compatibility
            normalized = file_path.replace("\\", "/")
            if os.path.isabs(normalized):
                absolute_files.append(os.path.abspath(normalized))
            else:
                # Resolve relative paths against project root
                resolved = os.path.normpath(os.path.join(project_root, normalized))
                if os.path.isabs(resolved):
                    absolute_files.append(resolved)

    if not absolute_files:
        return None

    try:
        common = os.path.commonpath(absolute_files)
        # Walk up from the common path to find the nearest git repository
        import git as _git
        check = common
        while True:
            try:
                _git.Repo(check, search_parent_directories=True)
                return check
            except (_git.InvalidGitRepositoryError, _git.NoSuchPathError, Exception):
                parent = os.path.dirname(check)
                if parent == check:
                    break
                check = parent
        return common
    except (ValueError, OSError, Exception):
        return None


def _collect_graph_nodes_and_edges() -> Tuple[List[Dict[str, Any]], List[Dict[str, str]]]:
    cg = graph_db["code_graph"]
    store = cg.store
    raw_entity_map = _build_raw_entity_map()

    nodes: List[Dict[str, Any]] = []
    all_node_ids = store.get_all_nodes()
    for node_id in all_node_ids:
        store_data = store.get_node_data(node_id) or {}
        raw_data = raw_entity_map.get(node_id, {})
        merged = {**raw_data, **store_data}
        if not merged.get("type"):
            merged["type"] = "external"
        nodes.append({"id": node_id, **merged})

    edges: List[Dict[str, str]] = []
    for node_id in all_node_ids:
        for succ in store.successors(node_id):
            edge_data = store.get_edge_data(node_id, succ) or {}
            edges.append({
                "source": node_id,
                "target": succ,
                "type": edge_data.get("type", "CALLS"),
                "weight": edge_data.get("weight", 1.0),
                "context": edge_data.get("context"),
            })

    return nodes, edges


# build_graph replaced by build_dependency_graph from CodeGraph module

@app.on_event("startup")
async def load_data():
    """Load the graph into memory on startup (AI pipeline loaded lazily on first request)"""
    global startup_error, REPO_PATH
    try:
        with open(INPUT_FILE, "r") as f:
            data = json.load(f)
            graph_db["raw_data"] = data
            graph_db["code_graph"] = build_dependency_graph(data)
            inferred_repo_path = _infer_repo_path_from_raw_data(data)
            if inferred_repo_path:
                REPO_PATH = inferred_repo_path
                upload_state["repo_path"] = inferred_repo_path
                upload_state["repo_name"] = os.path.basename(inferred_repo_path.rstrip("/"))
            print(f"Loaded Graph: {graph_db['code_graph'].store.number_of_nodes()} nodes")
    except Exception as e:
        import traceback
        traceback.print_exc()
        startup_error = str(e)
        print(f"Error loading graph: {e}")
    
    # Initialize git risk analyzer (non-blocking, lightweight)
    try:
        from backend.git.git_risk_analyzer import get_git_risk_analyzer
        graph_db["git_risk"] = get_git_risk_analyzer(REPO_PATH)
        print(f"[Startup] Git risk analyzer ready")
    except Exception as e:
        print(f"[Startup] Git risk analysis unavailable: {e}")
        graph_db["git_risk"] = None

# --- CORE ENDPOINTS ---

@app.get("/")
def health_check():
    return {
        "status": "active", 
        "system": "Node Zero Synapse",
        "startup_error": startup_error
    }

@app.get("/graph")
def get_full_graph():
    """Returns the raw nodes and edges for visualization"""
    nodes, edges = _collect_graph_nodes_and_edges()
    return {"nodes": nodes, "edges": edges}


@app.get("/graph/condensed")
def get_condensed_graph():
    """
    Returns a 3-level hierarchical graph for cleaner visualization.
    
    Level 1: Directory/module nodes (~8-12)
    Level 2: File nodes (expand from directory)
    Level 3: Entity nodes (expand from file)
    """
    all_nodes, all_edges = _collect_graph_nodes_and_edges()

    in_degree: Dict[str, int] = {}
    out_degree: Dict[str, int] = {}
    for edge in all_edges:
        out_degree[edge["source"]] = out_degree.get(edge["source"], 0) + 1
        in_degree[edge["target"]] = in_degree.get(edge["target"], 0) + 1

    node_file_map: Dict[str, str] = {}
    node_dir_map: Dict[str, str] = {}
    hierarchy_node_ids = set()
    for node in all_nodes:
        node_id = node["id"]
        file_path = _normalise_file_path(str(node.get("file") or ""))
        if not file_path:
            continue
        node_file_map[node_id] = file_path
        node_dir_map[node_id] = _directory_key(file_path)
        hierarchy_node_ids.add(node_id)

    filtered_entity_edges = [
        edge for edge in all_edges
        if edge["source"] in hierarchy_node_ids and edge["target"] in hierarchy_node_ids
    ]

    entities_by_file: Dict[str, List[Dict[str, Any]]] = {}
    for node in all_nodes:
        node_id = node["id"]
        file_key = node_file_map.get(node_id)
        if not file_key:
            continue

        complexity = 0
        raw_complexity = node.get("complexity")
        if isinstance(raw_complexity, dict):
            complexity = raw_complexity.get("cyclomatic", 0) or 0
        elif isinstance(raw_complexity, (int, float)):
            complexity = raw_complexity

        line = 0
        line_range = node.get("range")
        if isinstance(line_range, list) and line_range:
            line = line_range[0]

        degree = out_degree.get(node_id, 0) + in_degree.get(node_id, 0)
        entities_by_file.setdefault(file_key, []).append({
            "id": node_id,
            "name": node.get("name") or node_id,
            "type": node.get("type", "function"),
            "language": node.get("language", "python"),
            "risk_level": _risk_level_from_degree(degree),
            "complexity": complexity,
            "degree": degree,
            "line": line,
        })

    for entities in entities_by_file.values():
        entities.sort(key=lambda entity: entity["name"] or entity["id"])

    file_nodes: Dict[str, Dict[str, Any]] = {}
    for file_key, entities in entities_by_file.items():
        languages = set(e.get("language", "python") for e in entities)
        file_nodes[file_key] = {
            "id": file_key,
            "type": "file",
            "label": file_key.split("/")[-1],
            "full_path": file_key,
            "directory": _directory_key(file_key),
            "entity_count": len(entities),
            "risk_level": _highest_risk_level([entity["risk_level"] for entity in entities]),
            "total_complexity": sum(entity["complexity"] for entity in entities),
            "languages": sorted(languages),
        }

    files_by_directory: Dict[str, List[Dict[str, Any]]] = {}
    for _, file_node in file_nodes.items():
        directory = file_node["directory"]
        files_by_directory.setdefault(directory, []).append(file_node)

    for directory_files in files_by_directory.values():
        directory_files.sort(key=lambda file_node: file_node["label"])

    file_edge_counts: Dict[Tuple[str, str], int] = {}
    dir_edge_counts: Dict[Tuple[str, str], int] = {}
    file_edge_types: Dict[Tuple[str, str], Dict[str, int]] = {}
    dir_edge_types: Dict[Tuple[str, str], Dict[str, int]] = {}
    for edge in filtered_entity_edges:
        source_file = node_file_map[edge["source"]]
        target_file = node_file_map[edge["target"]]
        source_dir = node_dir_map[edge["source"]]
        target_dir = node_dir_map[edge["target"]]
        edge_type = edge.get("type", "CALLS")

        if source_file != target_file:
            file_pair = (source_file, target_file)
            file_edge_counts[file_pair] = file_edge_counts.get(file_pair, 0) + 1
            file_edge_types.setdefault(file_pair, {})[edge_type] = file_edge_types.get(file_pair, {}).get(edge_type, 0) + 1

        if source_dir != target_dir:
            dir_pair = (source_dir, target_dir)
            dir_edge_counts[dir_pair] = dir_edge_counts.get(dir_pair, 0) + 1
            dir_edge_types.setdefault(dir_pair, {})[edge_type] = dir_edge_types.get(dir_pair, {}).get(edge_type, 0) + 1

    file_edges = [
        {"source": source, "target": target, "weight": weight, "types": file_edge_types.get((source, target), {})}
        for (source, target), weight in sorted(file_edge_counts.items())
    ]

    directory_edges = [
        {"source": source, "target": target, "weight": weight, "types": dir_edge_types.get((source, target), {})}
        for (source, target), weight in sorted(dir_edge_counts.items())
    ]

    directory_nodes = []
    for directory, directory_files in sorted(files_by_directory.items()):
        all_langs = set()
        for fn in directory_files:
            all_langs.update(fn.get("languages", []))
        directory_nodes.append({
            "id": directory,
            "type": "directory",
            "label": directory,
            "file_count": len(directory_files),
            "entity_count": sum(file_node["entity_count"] for file_node in directory_files),
            "risk_level": _highest_risk_level([file_node["risk_level"] for file_node in directory_files]),
            "total_complexity": sum(file_node["total_complexity"] for file_node in directory_files),
            "languages": sorted(all_langs),
        })

    return {
        "directory_nodes": directory_nodes,
        "directory_edges": directory_edges,
        "files_by_directory": files_by_directory,
        "file_edges": file_edges,
        "entities_by_file": entities_by_file,
        "entity_edges": filtered_entity_edges,
    }


@app.get("/graph/explorer", response_model=ExplorerGraphResponse)
def get_explorer_graph(
    root: Optional[str] = Query(None, description="Root node ID to start from"),
    depth: Optional[int] = Query(None, ge=0, le=20, description="Max traversal depth from root"),
    language: Optional[str] = Query(None, description="Comma-separated languages: python,java,cpp"),
    kind: Optional[str] = Query(None, description="Comma-separated kinds: class,function,method,..."),
):
    """Versioned explorer graph (schema_version: 1).

    Returns nodes, edges, and directory groups with risk, complexity,
    language, and relationship metadata for the structural explorer.
    """
    raw_data = graph_db.get("raw_data", [])
    code_graph = graph_db.get("code_graph")
    if not code_graph:
        raise HTTPException(status_code=503, detail="Graph not loaded yet")

    return build_explorer_response(
        raw_data,
        code_graph,
        root=root,
        depth=depth,
        language_filter=language,
        kind_filter=kind,
    )


@app.get("/blast-radius/{function_name:path}/explain")
async def explain_blast_radius(function_name: str):
    """
    AI-Powered Blast Radius Explanation.
    
    Uses the preloaded CodeGraph for rich impact assessment and
    generates a natural language explanation.
    """
    cg = graph_db["code_graph"]
    raw_data = graph_db["raw_data"]
    resolved_id, entity_node = _resolve_graph_entity_id(function_name)
    
    # Build complexity data for risk calculation
    complexity_data = {}
    for node in raw_data:
        entity_id = node.get("unique_id") or node.get("name")
        if entity_id and node.get("complexity"):
            complexity_data[entity_id] = node["complexity"]
    
    # Calculate full impact assessment using preloaded CodeGraph + git risk
    git_risk = graph_db.get("git_risk")
    impact = cg.calculate_blast_radius(resolved_id, complexity_data, git_risk_analyzer=git_risk)
    impact_dict = impact.to_dict()

    # Generate AI explanation
    from backend.ai.blast_radius_explainer import BlastRadiusExplainer
    explainer = BlastRadiusExplainer()
    result = explainer.explain(
        impact_dict=impact_dict,
        entity_node=entity_node,
        graph_nodes=raw_data,
    )
    
    # Merge structured data with AI explanation
    result["impact_assessment"] = impact_dict
    result["requested_entity"] = function_name
    result["resolved_entity"] = resolved_id
    return result


@app.get("/blast-radius/{function_name:path}")
def get_blast_radius(function_name: str):
    """Calculates dependencies for a specific function or entity."""
    cg = graph_db["code_graph"]
    resolved_id, _ = _resolve_graph_entity_id(function_name)

    # Logic: Who depends on me? (Ancestors)
    affected_nodes = list(cg.store.ancestors(resolved_id))

    return {
        "target": resolved_id,
        "requested_entity": function_name,
        "blast_radius_score": len(affected_nodes),
        "affected_functions": affected_nodes
    }


@app.get("/git/diff")
def get_git_diff(
    repo_path: Optional[str] = Query(None, description="Path to repository"),
):
    """
    Returns list of modified and untracked files in the active git repository.
    """
    path = _active_repo_path(repo_path)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Repository path not found")
        
    try:
        import git
        repo = git.Repo(path)
        if repo.bare:
            return {"changed_files": []}
            
        changed = set()
        
        # Diff index against working tree (modified files)
        for item in repo.index.diff(None):
            if item.a_path:
                changed.add(item.a_path)
            if item.b_path:
                changed.add(item.b_path)
                
        # Diff HEAD against index (staged files)
        if repo.head.is_valid():
            for item in repo.index.diff("HEAD"):
                if item.a_path:
                    changed.add(item.a_path)
                if item.b_path:
                    changed.add(item.b_path)
                    
        # Untracked files
        for ut in repo.untracked_files:
            changed.add(ut)
            
        return {"changed_files": list(changed)}
    except Exception:
        return {"changed_files": []}


@app.get("/git-risk/{file_path:path}")
def get_git_risk(file_path: str):
    """
    Get git-backed risk metrics for a file.
    
    Returns change frequency, bus factor, unique authors,
    and commit history analysis.
    """
    git_risk = graph_db.get("git_risk")
    if not git_risk:
        raise HTTPException(
            status_code=503,
            detail="Git risk analysis not available (no git repo found)"
        )
    
    summary = git_risk.get_file_summary(file_path)
    if not summary:
        raise HTTPException(
            status_code=404,
            detail=f"No git history found for '{file_path}'"
        )
    
    return {
        "file": file_path,
        **summary
    }


# --- SMART BLAME ENDPOINTS ---

@app.get("/blame/expert/{file_path:path}")
async def get_expert_for_file(
    file_path: str,
    repo_path: Optional[str] = Query(None, description="Path to the git repository")
):
    """
    Get the recommended expert for a file.
    
    Returns expert recommendation with confidence score and reasoning.
    Output format example: "Ask Sarah, she architected this"
    
    **Acceptance Criteria (from requirements):**
    - System analyzes commit history beyond simple git blame
    - Algorithm considers refactor depth, architectural decisions, and code ownership patterns
    - System identifies primary expert with confidence score
    - System distinguishes between code authors and domain experts
    """
    try:
        result = await get_git_blame(file_path, _active_repo_path(repo_path))
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to analyze file: {str(e)}")


@app.get("/blame/heatmap")
async def get_heatmap(
    module: Optional[str] = Query(None, description="Filter to specific module/directory"),
    repo_path: Optional[str] = Query(None, description="Path to the git repository")
):
    """
    Get expertise heatmap for the codebase or a specific module.
    
    **Acceptance Criteria (from requirements):**
    - System generates expertise heatmaps for different modules
    - Identifies single points of failure ("Bus Factor" analysis)
    - Shows expertise gaps and recommends knowledge transfer
    """
    try:
        result = await get_expertise_heatmap(module, _active_repo_path(repo_path))
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate heatmap: {str(e)}")


@app.get("/blame/bus-factor")
async def get_bus_factor(
    repo_path: Optional[str] = Query(None, description="Path to the git repository")
):
    """
    Get bus factor analysis across the codebase.
    
    Bus factor = the number of developers who would need to leave
    before a module becomes orphaned (no one understands it).
    
    Returns dict mapping module paths to bus factor values.
    Low bus factor (1-2) indicates high risk areas.
    """
    try:
        result = await get_bus_factor_analysis(_active_repo_path(repo_path))
        return {
            "analysis": result,
            "warning_threshold": 2,
            "risk_areas": [k for k, v in result.items() if v <= 2]
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to analyze bus factor: {str(e)}")


@app.get("/blame/gaps")
async def get_gaps(
    repo_path: Optional[str] = Query(None, description="Path to the git repository")
):
    """
    Identify areas of the codebase with insufficient expertise coverage.
    
    Knowledge gaps are files/modules where no developer has a strong
    expertise score, indicating potential maintenance risks.
    """
    try:
        gaps = await get_knowledge_gaps(_active_repo_path(repo_path))
        return {
            "knowledge_gaps": gaps,
            "total_gaps": len(gaps),
            "recommendation": "Consider pairing junior developers with experts on these areas"
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to identify gaps: {str(e)}")


@app.get("/blame/developer/{email}")
async def get_developer_areas(
    email: str,
    repo_path: Optional[str] = Query(None, description="Path to the git repository")
):
    """
    Get all expertise areas for a specific developer.
    
    Returns a list of files/modules the developer has expertise in,
    sorted by expertise score.
    """
    try:
        expertise = await get_developer_expertise(email, _active_repo_path(repo_path))
        return {
            "developer_email": email,
            "expertise_areas": expertise,
            "total_areas": len(expertise)
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get developer expertise: {str(e)}")


# --- GOVERNANCE ENDPOINTS ---

@app.get("/governance/validate")
async def validate_architecture(
    repo_path: Optional[str] = Query(None, description="Path to the repository to validate")
):
    """
    Validate repository architecture against defined rules.
    
    Returns all violations and warnings found.
    """
    try:
        path = _active_repo_path(repo_path)
        validator = ArchitectureValidator()
        result = validator.validate_repository(path)
        return result.to_dict()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Validation failed: {str(e)}")


@app.get("/governance/violations")
async def get_violations(
    repo_path: Optional[str] = Query(None, description="Path to the repository")
):
    """
    Get list of current architectural violations.
    
    Violations are imports that cross layer boundaries in prohibited ways.
    """
    try:
        path = _active_repo_path(repo_path)
        validator = ArchitectureValidator()
        result = validator.validate_repository(path)
        return {
            "total_violations": result.total_violations,
            "total_warnings": result.total_warnings,
            "violations": [_normalise_violation_dict(v.to_dict()) for v in result.all_violations],
            "warnings": [_normalise_violation_dict(w.to_dict()) for w in result.all_warnings]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get violations: {str(e)}")


@app.get("/governance/drift")
async def get_drift(
    repo_path: Optional[str] = Query(None, description="Path to the repository"),
    baseline_path: Optional[str] = Query(None, description="Path to baseline metrics JSON")
):
    """
    Get architectural drift report.
    
    Compares current metrics to baseline to detect architectural drift.
    """
    try:
        path = _active_repo_path(repo_path)
        detector = DriftDetector(baseline_path=baseline_path)
        report = detector.detect_drift(path)
        return report.to_dict()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Drift detection failed: {str(e)}")


@app.get("/governance/layers")
async def get_layers():
    """
    Get configured architectural layers.
    
    Returns the layer definitions used for validation.
    """
    try:
        validator = ArchitectureValidator()
        return {
            "layers": validator.rule_engine.get_layer_summary(),
            "rules": validator.rule_engine.get_rules_summary()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get layers: {str(e)}")


# --- API DOCUMENTATION ---

@app.get("/api/info")
def api_info():
    """Get information about available Smart Blame endpoints"""
    return {
        "smart_blame_endpoints": [
            {
                "path": "/blame/expert/{file_path}",
                "method": "GET",
                "description": "Get recommended expert for a file"
            },
            {
                "path": "/blame/heatmap",
                "method": "GET",
                "description": "Get expertise heatmap for codebase"
            },
            {
                "path": "/blame/bus-factor",
                "method": "GET",
                "description": "Get bus factor analysis"
            },
            {
                "path": "/blame/gaps",
                "method": "GET",
                "description": "Identify knowledge gaps"
            },
            {
                "path": "/blame/developer/{email}",
                "method": "GET",
                "description": "Get developer expertise areas"
            }
        ],
        "scoring_factors": [
            {"name": "commit_frequency", "weight": 0.15},
            {"name": "lines_changed", "weight": 0.10},
            {"name": "refactor_depth", "weight": 0.25},
            {"name": "architectural_changes", "weight": 0.20},
            {"name": "bug_fixes", "weight": 0.15},
            {"name": "recency", "weight": 0.10},
            {"name": "code_review_participation", "weight": 0.05}
        ]
    }

# --- AI ENDPOINTS ---

class QueryRequest(BaseModel):
    query: str

@app.post("/ai/index")
async def index_graph():
    """Triggers the embeddings generation for the current graph"""
    if not _ai_available or RAGPipeline is None:
        raise HTTPException(status_code=503, detail="AI module not available (embedding library failed to load)")
    if not graph_db["raw_data"]:
        raise HTTPException(status_code=400, detail="Graph not loaded yet")
    
    pipeline = get_rag_pipeline()
    count = pipeline.index_codebase(graph_db["raw_data"])
    return {"status": "success", "indexed_nodes": count}

@app.get("/ai/ask")
async def ask_ai(query: str):
    """Asks the RAG pipeline a question"""
    pipeline = get_rag_pipeline()
    pipeline.ensure_indexed(graph_db["raw_data"])
    result = await pipeline.ask(query)
    # Structured log without raw query text to preserve private mentor privacy.
    try:
        metrics = result.get("metrics", {})
        print(
            "[GraphRAG] ask "
            f"query_len={len(query)} "
            f"mode={result.get('mode', '')} "
            f"intent={result.get('intent', '')} "
            f"latency_ms={metrics.get('total_latency_ms', 0)} "
            f"failure_reason={metrics.get('failure_reason', '')}"
        )
    except Exception:
        pass
    return result


# --- UPLOAD / ANALYZE ENDPOINTS ---

UPLOADS_DIR = os.path.join(BASE_DIR, "..", "..", "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)


def robust_rmtree(path: str):
    """
    Windows-safe recursive directory removal.
    .git pack files are read-only on Windows, which causes shutil.rmtree to
    raise WinError 5 (Access Denied). This helper clears the read-only bit
    before retrying.
    """
    def _handle_readonly(func, fpath, exc_info):
        try:
            os.chmod(fpath, stat.S_IWRITE)
            func(fpath)
        except Exception:
            pass
    shutil.rmtree(path, onerror=_handle_readonly)


upload_state = {
    "status": "idle",     # idle | cloning | parsing | building | ready | error
    "repo_name": None,
    "error": None,
    "stats": None,
    "repo_path": None,
    "step_times": {},     # {"cloning": {"start": ts, "end": ts}, "parsing": {...}, "building": {...}}
    "progress": 0,        # 0-100
}

import time as _time


def reparse_and_reload(repo_path: str, repo_name: str):
    """Parse a repository and reload the in-memory graph. Runs in background thread."""
    global REPO_PATH, startup_error, _rag_pipeline
    try:
        upload_state["status"] = "parsing"
        upload_state["repo_name"] = repo_name
        upload_state["error"] = None
        upload_state["progress"] = 35
        upload_state["step_times"]["parsing"] = {"start": _time.time(), "end": None}

        from backend.parsing.parser import scan_repository, get_all_entities

        parsed_files = scan_repository(repo_path)
        all_entities = get_all_entities(parsed_files)

        upload_state["step_times"]["parsing"]["end"] = _time.time()
        upload_state["progress"] = 65

        # --- Building phase ---
        upload_state["status"] = "building"
        upload_state["step_times"]["building"] = {"start": _time.time(), "end": None}

        # Save repo_graph.json (compact, no indent for speed)
        with open(INPUT_FILE, "w") as f:
            json.dump(all_entities, f, separators=(",", ":"))

        # Rebuild in-memory graph
        graph_db["raw_data"] = all_entities
        graph_db["code_graph"] = build_dependency_graph(all_entities)

        upload_state["progress"] = 85

        # Update repo path for blame/governance endpoints
        REPO_PATH = repo_path
        upload_state["repo_path"] = repo_path
        startup_error = None

        if _rag_pipeline is not None:
            try:
                _rag_pipeline.set_graph_context(
                    graph_db["code_graph"].store, graph_db["raw_data"], REPO_PATH
                )
                _rag_pipeline.ensure_indexed(graph_db["raw_data"], force_reindex=True)
            except Exception as e:
                print(f"Warning: Failed to refresh RAG context: {e}")

        # Reset the cached git analyzer so it picks up the new repo
        try:
            reset_analyzer()
        except Exception as e:
            print(f"Warning: Failed to reset analyzer: {e}")

        try:
            from backend.git.git_risk_analyzer import get_git_risk_analyzer
            graph_db["git_risk"] = get_git_risk_analyzer(REPO_PATH)
        except Exception as e:
            print(f"Warning: Failed to refresh git risk analyzer: {e}")
            graph_db["git_risk"] = None

        upload_state["step_times"]["building"]["end"] = _time.time()
        upload_state["progress"] = 100

        graph_stats = graph_db["code_graph"].get_statistics()
        upload_state["stats"] = {
            "files": len(parsed_files),
            "entities": len(all_entities),
            "nodes": graph_stats["nodes"],
            "edges": graph_stats["edges"],
        }
        upload_state["status"] = "ready"
        print(f"[OK] Parsed {repo_name}: {len(all_entities)} entities, "
              f"{graph_stats['nodes']} nodes")
    except Exception as e:
        import traceback
        traceback.print_exc()
        upload_state["status"] = "error"
        upload_state["error"] = str(e)
        print(f"[ERROR] Parse failed: {e}")


class GithubUploadRequest(BaseModel):
    url: str


@app.post("/upload/folder")
async def upload_folder(file: UploadFile = File(...)):
    """
    Upload a ZIP of a codebase for analysis.
    Extracts, parses with tree-sitter, and rebuilds the in-memory graph.
    """
    if upload_state["status"] in ("cloning", "parsing"):
        raise HTTPException(status_code=409, detail="An analysis is already in progress")

    if not file.filename or not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="Please upload a .zip file")

    upload_state["status"] = "parsing"
    upload_state["repo_name"] = file.filename.replace(".zip", "")
    upload_state["error"] = None
    upload_state["stats"] = None
    upload_state["step_times"] = {}
    upload_state["progress"] = 20

    try:
        repo_name = file.filename.replace(".zip", "")
        zip_path = os.path.join(UPLOADS_DIR, file.filename)
        extract_dir = os.path.join(UPLOADS_DIR, repo_name)

        if os.path.exists(extract_dir):
            robust_rmtree(extract_dir)

        with open(zip_path, "wb") as f:
            content = await file.read()
            f.write(content)

        with zipfile.ZipFile(zip_path, "r") as z:
            z.extractall(extract_dir)

        os.remove(zip_path)

        entries = os.listdir(extract_dir)
        if len(entries) == 1 and os.path.isdir(os.path.join(extract_dir, entries[0])):
            actual_path = os.path.join(extract_dir, entries[0])
        else:
            actual_path = extract_dir

        thread = threading.Thread(
            target=reparse_and_reload,
            args=(actual_path, repo_name)
        )
        thread.start()

        return {"status": "parsing", "repo_name": repo_name}

    except Exception as e:
        upload_state["status"] = "error"
        upload_state["error"] = str(e)
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@app.post("/upload/github")
async def upload_github(req: GithubUploadRequest):
    """
    Clone a GitHub repository and analyze it.
    Accepts { "url": "https://github.com/user/repo" }
    """
    if upload_state["status"] in ("cloning", "parsing"):
        raise HTTPException(status_code=409, detail="An analysis is already in progress")

    url = req.url.strip()
    if not url.startswith("https://github.com/"):
        raise HTTPException(status_code=400, detail="Please provide a valid GitHub URL (https://github.com/...)")

    parts = url.rstrip("/").split("/")
    repo_name = parts[-1].replace(".git", "") if len(parts) >= 2 else "repo"

    upload_state["status"] = "cloning"
    upload_state["repo_name"] = repo_name
    upload_state["error"] = None
    upload_state["stats"] = None
    upload_state["step_times"] = {}
    upload_state["progress"] = 0

    def clone_and_parse():
        try:
            upload_state["step_times"]["cloning"] = {"start": _time.time(), "end": None}
            upload_state["progress"] = 10

            clone_dir = os.path.join(UPLOADS_DIR, repo_name)
            if os.path.exists(clone_dir):
                robust_rmtree(clone_dir)

            result = subprocess.run(
                ["git", "clone", url, clone_dir],
                capture_output=True, text=True, timeout=120
            )

            upload_state["step_times"]["cloning"]["end"] = _time.time()

            if result.returncode != 0:
                upload_state["status"] = "error"
                upload_state["error"] = f"Git clone failed: {result.stderr}"
                return

            upload_state["progress"] = 30
            reparse_and_reload(clone_dir, repo_name)
        except subprocess.TimeoutExpired:
            upload_state["status"] = "error"
            upload_state["error"] = "Git clone timed out (120s limit)"
        except Exception as e:
            upload_state["status"] = "error"
            upload_state["error"] = str(e)

    thread = threading.Thread(target=clone_and_parse)
    thread.start()

    return {"status": "cloning", "repo_name": repo_name}


@app.get("/upload/status")
def get_upload_status():
    """Get the current upload/analysis status."""
    return upload_state
