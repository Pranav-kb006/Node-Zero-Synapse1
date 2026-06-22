"""
Git integration module for Smart Blame feature.

This module provides the main entry point for git analysis
and expertise identification functionality.

For detailed documentation, see the blame submodule.
"""

from typing import Dict, List, Optional, Any
import os
import asyncio

# Re-export from blame module for backward compatibility
from .blame import (
    # Main classes
    SmartBlameAnalyzer,
    create_analyzer,
    
    # Models
    DeveloperProfile,
    CommitAnalysis,
    ExpertiseScore,
    ExpertRecommendation,
    ExpertiseHeatmap,
    SmartBlameConfig,
    
    # Providers
    GitProvider,
    LocalGitProvider,
    
    # Stores
    ExpertStore,
    InMemoryStore,
    
    # Calculator
    ExpertiseScoreCalculator
)


# Global analyzer instance (lazy initialized)
_analyzer: Optional[SmartBlameAnalyzer] = None
_analyzer_repo_path: Optional[str] = None


async def get_analyzer(repo_path: Optional[str] = None) -> SmartBlameAnalyzer:
    """
    Get or create the global SmartBlameAnalyzer instance.
    
    Args:
        repo_path: Optional path to the git repository.
                   If not provided, uses current directory.
    
    Returns:
        SmartBlameAnalyzer instance
    """
    global _analyzer, _analyzer_repo_path
    requested_path = os.path.abspath(repo_path or os.getcwd())

    # Rebuild analyzer when repo changes; otherwise Smart Blame keeps using stale repo context.
    if _analyzer is None or _analyzer_repo_path != requested_path:
        _analyzer = await create_analyzer(requested_path)
        _analyzer_repo_path = requested_path
    
    return _analyzer


async def get_git_blame(file_path: str, repo_path: Optional[str] = None) -> Dict[str, Any]:
    """
    Get smart blame information for a file.
    
    This is the main entry point for the Smart Blame feature,
    providing expert recommendations for a given file.
    
    Args:
        file_path: Path to the file to analyze
        repo_path: Optional path to the git repository
        
    Returns:
        Dict containing:
            - primary_expert: The recommended expert
            - secondary_experts: Alternative experts
            - recommendation: Human-readable recommendation
            - scores: Detailed expertise scores
            - bus_factor: Number of critical experts
    """
    analyzer = await get_analyzer(repo_path)
    
    recommendation = await asyncio.to_thread(analyzer.identify_expert_sync, file_path)
    
    return {
        "target": recommendation.target,
        "primary_expert": recommendation.primary_expert.to_dict() if recommendation.primary_expert else None,
        "recommendation": recommendation.recommendation_text,
        "bus_factor": recommendation.bus_factor,
        "score": recommendation.score.to_dict() if recommendation.score else None,
        "secondary_experts": [
            {
                "developer": dev.to_dict(),
                "score": score.to_dict()
            }
            for dev, score in recommendation.secondary_experts
        ]
    }


async def get_expertise_heatmap(
    root_path: Optional[str] = None,
    repo_path: Optional[str] = None
) -> Dict[str, Any]:
    """
    Generate expertise heatmap for the codebase.
    
    Args:
        root_path: Optional filter path for specific modules
        repo_path: Optional path to the git repository
        
    Returns:
        ExpertiseHeatmap as dict
    """
    analyzer = await get_analyzer(repo_path)
    heatmap = await asyncio.to_thread(analyzer.generate_heatmap_sync, root_path)
    return heatmap.to_dict()


async def get_bus_factor_analysis(repo_path: Optional[str] = None) -> Dict[str, int]:
    """
    Get bus factor analysis for all modules.
    
    Args:
        repo_path: Optional path to the git repository
        
    Returns:
        Dict mapping module paths to bus factor values
    """
    analyzer = await get_analyzer(repo_path)
    return await asyncio.to_thread(analyzer.get_bus_factor_analysis_sync)


async def get_knowledge_gaps(repo_path: Optional[str] = None) -> List[str]:
    """
    Identify areas with insufficient expertise coverage.
    
    Args:
        repo_path: Optional path to the git repository
        
    Returns:
        List of file paths with knowledge gaps
    """
    analyzer = await get_analyzer(repo_path)
    return await analyzer.get_knowledge_gaps()


async def get_developer_expertise(
    developer_email: str,
    repo_path: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Get all expertise areas for a specific developer.
    
    Args:
        developer_email: The developer's email
        repo_path: Optional path to the git repository
        
    Returns:
        List of expertise scores for files they've contributed to
    """
    analyzer = await get_analyzer(repo_path)
    scores = await analyzer.get_developer_expertise(developer_email)
    return [s.to_dict() for s in scores]


def reset_analyzer() -> None:
    """Reset the global analyzer instance."""
    global _analyzer, _analyzer_repo_path
    _analyzer = None
    _analyzer_repo_path = None


__all__ = [
    # Main functions
    'get_git_blame',
    'get_expertise_heatmap',
    'get_bus_factor_analysis',
    'get_knowledge_gaps',
    'get_developer_expertise',
    'get_analyzer',
    'reset_analyzer',
    
    # Classes
    'SmartBlameAnalyzer',
    'create_analyzer',
    'DeveloperProfile',
    'CommitAnalysis',
    'ExpertiseScore',
    'ExpertRecommendation',
    'ExpertiseHeatmap',
    'SmartBlameConfig',
    'GitProvider',
    'LocalGitProvider',
    'ExpertStore',
    'InMemoryStore',
    'ExpertiseScoreCalculator'
]
