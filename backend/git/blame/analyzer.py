"""
Smart Blame Analyzer - Main orchestrator for expertise identification.

This module provides the main entry point for the Smart Blame feature,
coordinating git analysis, scoring, and storage operations.
"""

from typing import List, Optional, Dict, Tuple
from collections import defaultdict
import asyncio

from .models import (
    DeveloperProfile,
    CommitAnalysis,
    ExpertiseScore,
    ExpertRecommendation,
    ExpertiseHeatmap,
    ModuleExpertise,
    SmartBlameConfig
)
from .providers.base import GitProvider
from .stores.base import ExpertStore
from .scoring.calculator import ExpertiseScoreCalculator


class SmartBlameAnalyzer:
    """
    Main orchestrator for Smart Blame functionality.
    
    Coordinates between:
    - Git provider (for commit history)
    - Scoring calculator (for expertise calculation)
    - Expert store (for persistence and querying)
    
    Usage:
        provider = LocalGitProvider("/path/to/repo")
        store = InMemoryStore()
        analyzer = SmartBlameAnalyzer(provider, store)
        
        # Get expert for a file
        expert = await analyzer.identify_expert("src/main.py")
        print(expert.recommendation_text)
    """
    
    def __init__(
        self,
        git_provider: GitProvider,
        store: ExpertStore,
        calculator: Optional[ExpertiseScoreCalculator] = None,
        config: Optional[SmartBlameConfig] = None
    ):
        """
        Initialize the Smart Blame analyzer.
        
        Args:
            git_provider: Git provider for accessing commit history
            store: Expert store for persistence
            calculator: Optional custom score calculator
            config: Optional configuration
        """
        self.git = git_provider
        self.store = store
        self.config = config or SmartBlameConfig()
        self.calculator = calculator or ExpertiseScoreCalculator(config=self.config)
        
        # Cache for analyzed files
        self._analyzed_files: set = set()
    
    async def identify_expert(
        self, 
        target: str,
        refresh: bool = False
    ) -> ExpertRecommendation:
        """
        Identify the true expert for a code entity.
        
        Args:
            target: File path, function name, or module path
            refresh: If True, recalculate scores even if cached
            
        Returns:
            ExpertRecommendation with primary expert and alternates
        """
        # Check if we have cached results
        if not refresh:
            cached_experts = await self.store.get_experts_for_file(target, limit=5)
            if cached_experts:
                return self._build_recommendation(target, cached_experts)
        
        # Analyze the file
        scores = await self.analyze_file(target)
        
        return self._build_recommendation(target, scores)
    
    async def analyze_file(self, file_path: str) -> List[ExpertiseScore]:
        """
        Analyze a single file and calculate expertise scores for all contributors.
        
        Args:
            file_path: Path to the file
            
        Returns:
            List of ExpertiseScore objects, sorted by total_score descending
        """
        # Get all commits for this file
        all_commits = self.git.get_commits_for_file(file_path)
        
        if not all_commits:
            return []
        
        # Get unique contributors
        contributors = self.git.get_all_contributors(file_path)
        
        # Group commits by developer
        commits_by_dev: Dict[str, List[CommitAnalysis]] = defaultdict(list)
        for commit in all_commits:
            commits_by_dev[commit.author_email].append(commit)
        
        # Calculate expertise for each contributor
        scores = self.calculator.calculate_multiple(
            contributors,
            file_path,
            commits_by_dev,
            all_commits
        )
        
        # Store the scores
        if scores:
            await self.store.store_expertise_batch(scores)
        
        self._analyzed_files.add(file_path)
        
        return scores
    
    async def analyze_repository(
        self, 
        file_patterns: Optional[List[str]] = None,
        max_files: Optional[int] = None
    ) -> Dict[str, List[ExpertiseScore]]:
        """
        Analyze the entire repository or specific file patterns.
        
        Args:
            file_patterns: Optional list of file extensions to include (e.g., ['.py', '.js'])
            max_files: Optional limit on number of files to analyze
            
        Returns:
            Dict mapping file paths to expertise scores
        """
        all_files = self.git.get_all_files()
        
        # Filter by patterns if specified
        if file_patterns:
            all_files = [
                f for f in all_files 
                if any(f.endswith(pat) for pat in file_patterns)
            ]
        
        # Limit number of files
        if max_files:
            all_files = all_files[:max_files]
        
        results: Dict[str, List[ExpertiseScore]] = {}
        
        for file_path in all_files:
            try:
                scores = await self.analyze_file(file_path)
                if scores:
                    results[file_path] = scores
            except Exception as e:
                # Log error but continue with other files
                print(f"Warning: Failed to analyze {file_path}: {e}")
        
        return results
    
    async def get_expertise_ranking(
        self, 
        file_path: str, 
        limit: int = 10
    ) -> List[ExpertiseScore]:
        """
        Get ranked expertise scores for a file.
        
        Args:
            file_path: Path to the file
            limit: Maximum number of experts to return
            
        Returns:
            List of ExpertiseScore objects, sorted by total_score
        """
        # Check cache first
        cached = await self.store.get_experts_for_file(file_path, limit)
        
        if cached:
            return cached
        
        # Analyze if not cached
        scores = await self.analyze_file(file_path)
        return scores[:limit]
    
    async def generate_heatmap(
        self, 
        root_path: Optional[str] = None,
        analyze_missing: bool = True
    ) -> ExpertiseHeatmap:
        """
        Generate expertise heatmap for the codebase.
        
        Args:
            root_path: Optional root path to filter by
            analyze_missing: If True, analyze files that haven't been processed
            
        Returns:
            ExpertiseHeatmap with expertise distribution
        """
        if analyze_missing:
            # Get all files in the repo
            all_files = self.git.get_all_files()
            
            if root_path:
                all_files = [f for f in all_files if f.startswith(root_path)]
            
            # Analyze files that haven't been processed
            for file_path in all_files:
                if file_path not in self._analyzed_files:
                    try:
                        await self.analyze_file(file_path)
                    except Exception:
                        pass
        
        return await self.store.get_expertise_heatmap(root_path)
    
    async def get_bus_factor_analysis(self) -> Dict[str, int]:
        """
        Get bus factor analysis for all modules.
        
        Returns:
            Dict mapping module paths to bus factor values
        """
        heatmap = await self.generate_heatmap()
        
        return {
            module_path: module.bus_factor
            for module_path, module in heatmap.modules.items()
        }
    
    async def get_knowledge_gaps(self) -> List[str]:
        """
        Identify areas with insufficient expertise coverage.
        
        Returns:
            List of file paths with knowledge gaps
        """
        return await self.store.get_knowledge_gaps(
            threshold=self.config.knowledge_gap_threshold
        )
    
    async def get_developer_expertise(
        self, 
        developer_email: str
    ) -> List[ExpertiseScore]:
        """
        Get all expertise areas for a specific developer.
        
        Args:
            developer_email: The developer's email
            
        Returns:
            List of ExpertiseScore objects for files they've contributed to
        """
        return await self.store.get_developer_expertise(developer_email)
    
    def _build_recommendation(
        self, 
        target: str, 
        scores: List[ExpertiseScore]
    ) -> ExpertRecommendation:
        """
        Build an ExpertRecommendation from expertise scores.
        
        Args:
            target: The target file/module
            scores: List of expertise scores, sorted by total_score
            
        Returns:
            ExpertRecommendation with primary expert and reasoning
        """
        if not scores:
            return ExpertRecommendation(
                target=target,
                primary_expert=None,
                score=None,
                secondary_experts=[],
                recommendation_text=f"No experts found for {target}",
                bus_factor=0
            )
        
        primary_score = scores[0]
        secondary = [(s.developer, s) for s in scores[1:4]]
        
        # Generate recommendation text
        recommendation_text = self._generate_recommendation_text(primary_score, target)
        
        # Calculate bus factor
        bus_factor = self._calculate_bus_factor(scores)
        
        return ExpertRecommendation(
            target=target,
            primary_expert=primary_score.developer,
            score=primary_score,
            secondary_experts=secondary,
            recommendation_text=recommendation_text,
            bus_factor=bus_factor
        )
    
    def _generate_recommendation_text(
        self, 
        score: ExpertiseScore, 
        target: str
    ) -> str:
        """Generate human-friendly recommendation text."""
        dev_name = score.developer.name.split()[0] if score.developer.name else "Unknown"
        
        # Check top factors
        factors = score.factors
        
        if factors.get('architectural_changes', 0) > 0.5:
            return f"Ask {dev_name}, they architected this module"
        elif factors.get('refactor_depth', 0) > 0.5:
            return f"Ask {dev_name}, they deeply refactored this code"
        elif factors.get('bug_fixes', 0) > 0.5:
            return f"Ask {dev_name}, they've fixed many bugs here"
        elif factors.get('recency', 0) > 0.7:
            return f"Ask {dev_name}, they recently worked on this"
        elif score.total_score > 0.6:
            return f"Ask {dev_name}, they're the primary expert on this code"
        else:
            return f"Ask {dev_name}, they're the most knowledgeable about this code"
    
    def _calculate_bus_factor(self, scores: List[ExpertiseScore]) -> int:
        """
        Calculate bus factor from expertise scores.
        
        Bus factor = number of developers with significant expertise.
        """
        threshold = self.config.expert_confidence_threshold
        significant_experts = [s for s in scores if s.total_score >= threshold]
        return len(significant_experts)
    
    async def get_blame_for_lines(
        self, 
        file_path: str, 
        start_line: int, 
        end_line: int
    ) -> Dict[int, Tuple[DeveloperProfile, ExpertiseScore]]:
        """
        Get smart blame for specific lines of a file.
        
        Combines git blame with expertise scores.
        
        Args:
            file_path: Path to the file
            start_line: Start line number
            end_line: End line number
            
        Returns:
            Dict mapping line numbers to (developer, expertise_score)
        """
        # Get raw blame
        blame = self.git.get_blame_for_file(file_path)
        
        # Get expertise scores for this file
        expertise = await self.get_expertise_ranking(file_path)
        expertise_by_email = {s.developer.email: s for s in expertise}
        
        result = {}
        for line_num in range(start_line, end_line + 1):
            if line_num in blame:
                developer = blame[line_num]
                score = expertise_by_email.get(developer.email)
                result[line_num] = (developer, score)
        
        return result
    
    async def refresh_all(self) -> None:
        """
        Clear cache and re-analyze all files.
        """
        await self.store.clear()
        self._analyzed_files.clear()

    def identify_expert_sync(self, target: str, refresh: bool = False) -> ExpertRecommendation:
        """Synchronous version of identify_expert for use with asyncio.to_thread."""
        if not refresh:
            cached_experts = self._get_experts_for_file_sync(target, limit=5)
            if cached_experts:
                return self._build_recommendation(target, cached_experts)
        scores = self._analyze_file_sync(target)
        return self._build_recommendation(target, scores)

    def _get_experts_for_file_sync(self, file_path: str, limit: int = 5) -> List[ExpertiseScore]:
        return self.store._by_file.get(file_path, [])[:limit]

    def _analyze_file_sync(self, file_path: str) -> List[ExpertiseScore]:
        all_commits = self.git.get_commits_for_file(file_path)
        if not all_commits:
            return []
        contributors = self.git.get_all_contributors(file_path)
        commits_by_dev: Dict[str, List[CommitAnalysis]] = defaultdict(list)
        for commit in all_commits:
            commits_by_dev[commit.author_email].append(commit)
        scores = self.calculator.calculate_multiple(
            contributors, file_path, commits_by_dev, all_commits
        )
        for score in scores:
            file_path_key = score.target_path
            email = score.developer.email
            self.store._by_file.setdefault(file_path_key, []).append(score)
            self.store._by_developer.setdefault(email, []).append(score)
        self._analyzed_files.add(file_path)
        return scores

    def generate_heatmap_sync(self, root_path: Optional[str] = None, max_files: int = 100) -> ExpertiseHeatmap:
        """Synchronous version of generate_heatmap for use with asyncio.to_thread."""
        all_files = self.git.get_all_files()
        if root_path:
            all_files = [f for f in all_files if f.startswith(root_path)]
        unanalyzed = [f for f in all_files if f not in self._analyzed_files]
        for file_path in unanalyzed[:max_files]:
            try:
                self._analyze_file_sync(file_path)
            except Exception:
                pass
        module_scores: Dict[str, List[ExpertiseScore]] = defaultdict(list)
        for file_path_key, scores in self.store._by_file.items():
            if root_path and not file_path_key.startswith(root_path):
                continue
            module = "/".join(file_path_key.split("/")[:-1]) if "/" in file_path_key else "."
            module_scores[module].extend(scores)
        result = ExpertiseHeatmap()
        risk_areas = []
        knowledge_gaps = []
        for path, scores in module_scores.items():
            unique_devs = set()
            for s in scores:
                unique_devs.add(s.developer.email)
            bus_factor = len(unique_devs)
            top_score = scores[0].total_score if scores else 0.0
            has_gap = bus_factor <= 1
            result.modules[path] = ModuleExpertise(
                module_path=path,
                experts=scores[:5],
                bus_factor=bus_factor,
                top_expert_score=top_score,
                has_knowledge_gap=has_gap,
            )
            if bus_factor <= 2:
                risk_areas.append(path)
            if has_gap:
                knowledge_gaps.append(path)
        result.risk_areas = risk_areas
        result.knowledge_gaps = knowledge_gaps
        result.total_files_analyzed = sum(1 for _ in self._analyzed_files if not root_path or _.startswith(root_path))
        result.total_developers = len(self.store._developers)
        if result.modules:
            result.average_bus_factor = sum(m.bus_factor for m in result.modules.values()) / len(result.modules)
        return result

    def get_bus_factor_analysis_sync(self) -> Dict[str, int]:
        """Synchronous version of get_bus_factor_analysis for use with asyncio.to_thread."""
        heatmap = self.generate_heatmap_sync(max_files=200)
        return {
            module_path: module.bus_factor
            for module_path, module in heatmap.modules.items()
        }
    
    async def get_statistics(self) -> Dict:
        """
        Get analyzer statistics.
        
        Returns:
            Dict with statistics about analyzed files and experts
        """
        store_stats = await self.store.get_statistics()
        
        return {
            **store_stats,
            "analyzed_files_count": len(self._analyzed_files),
            "git_provider_valid": self.git.is_valid,
            "repo_path": self.git.repo_path
        }


async def create_analyzer(
    repo_path: str,
    config: Optional[SmartBlameConfig] = None
) -> SmartBlameAnalyzer:
    """
    Factory function to create a SmartBlameAnalyzer with default components.
    
    Args:
        repo_path: Path to the git repository
        config: Optional configuration
        
    Returns:
        Configured SmartBlameAnalyzer instance
    """
    from .providers import LocalGitProvider
    from .stores import InMemoryStore
    
    config = config or SmartBlameConfig()
    
    provider = LocalGitProvider(repo_path, config)
    store = InMemoryStore(config)
    calculator = ExpertiseScoreCalculator(config=config)
    
    return SmartBlameAnalyzer(
        git_provider=provider,
        store=store,
        calculator=calculator,
        config=config
    )
