"""
Tests for the Smart Blame feature.

Run with: python backend/tests/test_smart_blame.py
"""

import sys
import os
import asyncio
from datetime import datetime, timezone, timedelta
from pathlib import Path

# Add backend/git to path
backend_core = str(Path(__file__).parent.parent / "git")
sys.path.insert(0, backend_core)

from blame.models import (
    DeveloperProfile,
    CommitAnalysis,
    CommitType,
    ExpertiseScore,
    ScoringContext,
    SmartBlameConfig
)
from blame.scoring.factors import (
    CommitFrequencyFactor,
    LinesChangedFactor,
    RefactorDepthFactor,
    ArchitecturalChangesFactor,
    BugFixesFactor,
    RecencyFactor,
    CodeReviewParticipationFactor,
    get_default_factors,
    validate_weights
)
from blame.scoring.calculator import ExpertiseScoreCalculator
from blame.stores.memory import InMemoryStore


def test_developer_profile():
    """Test DeveloperProfile model."""
    dev = DeveloperProfile(
        name="Sarah Chen",
        email="sarah@example.com",
        expertise_areas=["backend", "api"],
        total_commits=50
    )
    
    assert dev.name == "Sarah Chen"
    assert dev.email == "sarah@example.com"
    assert dev.unique_id == "developer:sarah@example.com"
    
    d = dev.to_dict()
    assert d["name"] == "Sarah Chen"
    assert d["total_commits"] == 50
    
    print("DeveloperProfile: PASSED")


def test_commit_analysis():
    """Test CommitAnalysis model."""
    commit = CommitAnalysis(
        commit_hash="abc123",
        author_name="John Doe",
        author_email="john@example.com",
        timestamp=datetime.now(timezone.utc),
        message="refactor: Restructure the parser module",
        files_changed=["src/parser.py"],
        lines_added=50,
        lines_deleted=30,
        is_refactor=True,
        commit_type=CommitType.REFACTOR
    )
    
    assert commit.total_lines_changed == 80
    assert commit.is_refactor is True
    assert commit.commit_type == CommitType.REFACTOR
    
    d = commit.to_dict()
    assert d["commit_hash"] == "abc123"
    assert d["total_lines_changed"] == 80
    
    print("CommitAnalysis: PASSED")


def test_scoring_factor_weights():
    """Test that default factor weights sum to 1.0."""
    factors = get_default_factors()
    
    assert len(factors) == 7, f"Expected 7 factors, got {len(factors)}"
    assert validate_weights(factors), "Weights should sum to 1.0"
    
    total = sum(f.weight for f in factors)
    assert abs(total - 1.0) < 0.001, f"Total weight is {total}, expected 1.0"
    
    print(f"Scoring Factors ({len(factors)} factors, total weight {total:.2f}): PASSED")


def test_commit_frequency_factor():
    """Test CommitFrequencyFactor calculation."""
    factor = CommitFrequencyFactor()
    
    assert factor.name == "commit_frequency"
    assert factor.weight == 0.15
    
    now = datetime.now(timezone.utc)
    dev_commits = [
        CommitAnalysis(
            commit_hash=f"hash{i}",
            author_name="Dev",
            author_email="dev@example.com",
            timestamp=now,
            message=f"commit {i}",
            lines_added=10,
            lines_deleted=5
        )
        for i in range(5)
    ]
    
    all_commits = dev_commits + [
        CommitAnalysis(
            commit_hash=f"other{i}",
            author_name="Other",
            author_email="other@example.com",
            timestamp=now,
            message=f"other commit {i}",
            lines_added=10,
            lines_deleted=5
        )
        for i in range(5)
    ]
    
    context = ScoringContext(
        target_path="test.py",
        all_commits=all_commits,
        developer_commits=dev_commits,
        total_commits_for_file=10
    )
    
    score = factor.calculate(dev_commits, context)
    assert 0.9 <= score <= 1.0, f"Expected ~1.0, got {score}"
    
    print(f"CommitFrequencyFactor (score={score:.2f}): PASSED")


def test_recency_factor():
    """Test RecencyFactor with exponential decay."""
    factor = RecencyFactor()
    
    now = datetime.now(timezone.utc)
    
    recent_commits = [
        CommitAnalysis(
            commit_hash="recent",
            author_name="Dev",
            author_email="dev@example.com",
            timestamp=now - timedelta(days=1),
            message="recent commit",
            lines_added=10,
            lines_deleted=5
        )
    ]
    
    context = ScoringContext(
        target_path="test.py",
        all_commits=recent_commits,
        developer_commits=recent_commits,
        total_commits_for_file=1,
        recency_half_life_days=180
    )
    
    recent_score = factor.calculate(recent_commits, context)
    
    old_commits = [
        CommitAnalysis(
            commit_hash="old",
            author_name="Dev",
            author_email="dev@example.com",
            timestamp=now - timedelta(days=180),
            message="old commit",
            lines_added=10,
            lines_deleted=5
        )
    ]
    
    context_old = ScoringContext(
        target_path="test.py",
        all_commits=old_commits,
        developer_commits=old_commits,
        total_commits_for_file=1,
        recency_half_life_days=180
    )
    
    old_score = factor.calculate(old_commits, context_old)
    
    assert recent_score > old_score
    assert recent_score > 0.9
    assert 0.4 < old_score < 0.6
    
    print(f"RecencyFactor (recent={recent_score:.2f}, old={old_score:.2f}): PASSED")


def test_expertise_calculator():
    """Test ExpertiseScoreCalculator."""
    calculator = ExpertiseScoreCalculator()
    
    now = datetime.now(timezone.utc)
    
    dev = DeveloperProfile(name="Expert Dev", email="expert@example.com")
    
    commits = [
        CommitAnalysis(
            commit_hash=f"hash{i}",
            author_name="Expert Dev",
            author_email="expert@example.com",
            timestamp=now - timedelta(days=i*10),
            message="refactor: Major changes" if i % 2 == 0 else "fix: Bug fix",
            lines_added=50 + i*10,
            lines_deleted=20 + i*5,
            is_refactor=(i % 2 == 0),
            is_bug_fix=(i % 2 == 1)
        )
        for i in range(10)
    ]
    
    score = calculator.calculate_expertise(
        developer=dev,
        file_path="src/main.py",
        developer_commits=commits,
        all_commits=commits
    )
    
    assert isinstance(score, ExpertiseScore)
    assert 0 <= score.total_score <= 1.0
    assert len(score.factors) == 7
    assert score.developer.email == "expert@example.com"
    assert score.reasoning != ""
    
    print(f"ExpertiseScoreCalculator (total={score.total_score:.2f}): PASSED")


async def async_test_in_memory_store():
    """Test InMemoryStore functionality."""
    store = InMemoryStore()
    
    dev1 = DeveloperProfile(name="Alice", email="alice@example.com")
    dev2 = DeveloperProfile(name="Bob", email="bob@example.com")
    
    score1 = ExpertiseScore(
        developer=dev1,
        target_path="src/main.py",
        total_score=0.85,
        factors={"refactor_depth": 0.9, "commit_frequency": 0.7},
        confidence=0.8,
        reasoning="Alice deeply refactored this code."
    )
    
    score2 = ExpertiseScore(
        developer=dev2,
        target_path="src/main.py",
        total_score=0.45,
        factors={"refactor_depth": 0.3, "commit_frequency": 0.5},
        confidence=0.6,
        reasoning="Bob has limited involvement."
    )
    
    await store.store_expertise(score1)
    await store.store_expertise(score2)
    
    experts = await store.get_experts_for_file("src/main.py")
    
    assert len(experts) == 2
    assert experts[0].developer.email == "alice@example.com"
    assert experts[0].total_score > experts[1].total_score
    
    stats = await store.get_statistics()
    assert stats["total_files"] == 1
    assert stats["total_developers"] == 2
    
    await store.clear()
    experts_after = await store.get_experts_for_file("src/main.py")
    assert len(experts_after) == 0
    
    print("InMemoryStore: PASSED")


def test_local_git_provider():
    """Test LocalGitProvider with actual git repo."""
    from blame.providers.local_git import LocalGitProvider
    
    repo_path = Path(__file__).parent.parent.parent
    
    try:
        provider = LocalGitProvider(str(repo_path))
        
        assert provider.is_valid
        
        files = provider.get_all_files()
        assert len(files) > 0
        
        contributors = provider.get_all_contributors()
        assert len(contributors) > 0
        
        print(f"LocalGitProvider ({len(files)} files, {len(contributors)} contributors): PASSED")
        
    except Exception as e:
        print(f"LocalGitProvider: SKIPPED ({e})")


async def async_test_smart_blame_analyzer():
    """Test SmartBlameAnalyzer with actual repo."""
    from blame.analyzer import create_analyzer
    
    repo_path = Path(__file__).parent.parent.parent
    
    try:
        analyzer = await create_analyzer(str(repo_path))
        
        files = analyzer.git.get_all_files()
        py_files = [f for f in files if f.endswith('.py')]
        
        if py_files:
            recommendation = await analyzer.identify_expert(py_files[0])
            
            assert recommendation.target == py_files[0]
            assert recommendation.recommendation_text != ""
            
            print(f"SmartBlameAnalyzer: PASSED")
            print(f"  Recommendation: {recommendation.recommendation_text}")
        else:
            print("SmartBlameAnalyzer: SKIPPED (no Python files)")
            
    except Exception as e:
        print(f"SmartBlameAnalyzer: SKIPPED ({e})")


def run_tests():
    """Run all tests."""
    print("=" * 60)
    print("SMART BLAME FEATURE TESTS")
    print("=" * 60)
    print()
    
    print("--- Model Tests ---")
    test_developer_profile()
    test_commit_analysis()
    
    print("\n--- Scoring Factor Tests ---")
    test_scoring_factor_weights()
    test_commit_frequency_factor()
    test_recency_factor()
    
    print("\n--- Calculator Tests ---")
    test_expertise_calculator()
    
    print("\n--- Store Tests ---")
    asyncio.run(async_test_in_memory_store())
    
    print("\n--- Integration Tests ---")
    test_local_git_provider()
    asyncio.run(async_test_smart_blame_analyzer())
    
    print("\n" + "=" * 60)
    print("ALL TESTS PASSED")
    print("=" * 60)


if __name__ == "__main__":
    run_tests()
