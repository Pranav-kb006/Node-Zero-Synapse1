"""
Local Git provider implementation using GitPython.

This module provides git operations for local repositories
using the GitPython library.
"""

import os
import re
from datetime import datetime, timezone
from typing import List, Optional, Dict, Iterator, Set
from functools import lru_cache

try:
    import git
    from git import Repo, Commit, InvalidGitRepositoryError, NoSuchPathError
    GitCommandError = git.exc.GitCommandError
    HAS_GITPYTHON = True
except (ImportError, AttributeError):
    HAS_GITPYTHON = False
    Repo = None
    Commit = None
    InvalidGitRepositoryError = Exception
    NoSuchPathError = Exception
    GitCommandError = Exception

from .base import GitProvider
from ..models import (
    CommitAnalysis, 
    DeveloperProfile, 
    CommitType,
    SmartBlameConfig
)


class LocalGitProvider(GitProvider):
    """
    Git provider implementation using GitPython for local repositories.
    
    Features:
    - Commit history analysis
    - Line-by-line blame
    - Commit classification (refactor, bug fix, architectural)
    - Caching for performance
    """
    
    def __init__(self, repo_path: str, config: Optional[SmartBlameConfig] = None):
        """
        Initialize the local git provider.
        
        Args:
            repo_path: Path to the git repository
            config: Optional configuration for commit classification
        """
        if not HAS_GITPYTHON:
            raise ImportError("GitPython is required. Install with: pip install gitpython")
        
        self._repo_path = os.path.abspath(repo_path)
        self._config = config or SmartBlameConfig()
        self._repo: Optional[Repo] = None
        self._commit_cache: Dict[str, CommitAnalysis] = {}
        self._developer_cache: Dict[str, DeveloperProfile] = {}
        
        self._initialize_repo()
    
    def _initialize_repo(self) -> None:
        """Initialize the git repository."""
        try:
            self._repo = Repo(self._repo_path, search_parent_directories=True)
        except (InvalidGitRepositoryError, NoSuchPathError) as e:
            self._repo = None
            raise ValueError(f"Invalid git repository: {self._repo_path}") from e
    
    @property
    def repo_path(self) -> str:
        return self._repo_path
    
    @property
    def is_valid(self) -> bool:
        return self._repo is not None and not self._repo.bare
    
    def get_commits_for_file(
        self, 
        file_path: str, 
        author: Optional[str] = None,
        since: Optional[datetime] = None,
        until: Optional[datetime] = None
    ) -> List[CommitAnalysis]:
        """Get all commits that touched a specific file."""
        if not self.is_valid or not self._repo:
            return []
        
        commits = []
        
        try:
            # Build git log arguments
            kwargs = {'paths': file_path}
            
            if since:
                kwargs['since'] = since.isoformat()
            if until:
                kwargs['until'] = until.isoformat()
            
            for commit in self._repo.iter_commits(**kwargs):
                # Filter by author if specified
                if author and commit.author.email != author:
                    continue
                
                analysis = self._analyze_commit(commit, file_path)
                commits.append(analysis)
        
        except GitCommandError:
            # File might not exist in history
            pass
        
        return commits
    
    def get_blame_for_file(self, file_path: str) -> Dict[int, DeveloperProfile]:
        """Get line-by-line blame information."""
        if not self.is_valid or not self._repo:
            return {}
        
        blame_map: Dict[int, DeveloperProfile] = {}
        
        try:
            blame = self._repo.blame('HEAD', file_path)
            
            line_num = 1
            for commit, lines in blame:
                developer = self._get_or_create_developer(
                    commit.author.name,
                    commit.author.email
                )
                
                for _ in lines:
                    blame_map[line_num] = developer
                    line_num += 1
        
        except GitCommandError:
            pass
        
        return blame_map
    
    def get_all_contributors(self, file_path: Optional[str] = None) -> List[DeveloperProfile]:
        """Get all contributors to the repository or a specific file."""
        if not self.is_valid or not self._repo:
            return []
        
        contributors: Dict[str, DeveloperProfile] = {}
        
        try:
            kwargs = {}
            if file_path:
                kwargs['paths'] = file_path
            
            for commit in self._repo.iter_commits(**kwargs):
                email = commit.author.email
                
                if email not in contributors:
                    contributors[email] = self._get_or_create_developer(
                        commit.author.name,
                        email
                    )
                
                # Update commit counts
                contributors[email].total_commits += 1
                
                commit_date = datetime.fromtimestamp(commit.committed_date, tz=timezone.utc)
                
                if (contributors[email].first_commit_date is None or 
                    commit_date < contributors[email].first_commit_date):
                    contributors[email].first_commit_date = commit_date
                
                if (contributors[email].last_commit_date is None or 
                    commit_date > contributors[email].last_commit_date):
                    contributors[email].last_commit_date = commit_date
        
        except GitCommandError:
            pass
        
        return list(contributors.values())
    
    def get_file_history(
        self, 
        file_path: str,
        max_commits: Optional[int] = None
    ) -> Iterator[CommitAnalysis]:
        """Stream file history for large repositories."""
        if not self.is_valid or not self._repo:
            return
        
        count = 0
        
        try:
            for commit in self._repo.iter_commits(paths=file_path):
                if max_commits and count >= max_commits:
                    break
                
                yield self._analyze_commit(commit, file_path)
                count += 1
        
        except GitCommandError:
            pass
    
    def get_all_files(self) -> List[str]:
        """Get all tracked files in the repository."""
        if not self.is_valid or not self._repo:
            return []
        
        files = []
        
        try:
            tree = self._repo.head.commit.tree
            files = [item.path for item in tree.traverse() if item.type == 'blob']
        except Exception:
            pass
        
        return files
    
    def get_file_content(self, file_path: str, commit_hash: Optional[str] = None) -> Optional[str]:
        """Get file content at a specific commit or HEAD."""
        if not self.is_valid or not self._repo:
            return None
        
        try:
            if commit_hash:
                commit = self._repo.commit(commit_hash)
            else:
                commit = self._repo.head.commit
            
            blob = commit.tree / file_path
            return blob.data_stream.read().decode('utf-8', errors='replace')
        
        except (KeyError, GitCommandError):
            return None
    
    def get_commit_diff(self, commit_hash: str) -> Dict[str, Dict[str, int]]:
        """Get diff statistics for a commit."""
        if not self.is_valid or not self._repo:
            return {}
        
        diff_stats: Dict[str, Dict[str, int]] = {}
        
        try:
            commit = self._repo.commit(commit_hash)
            
            if commit.parents:
                parent = commit.parents[0]
                diffs = parent.diff(commit)
            else:
                # Initial commit
                diffs = commit.diff(None)
            
            for diff in diffs:
                file_path = diff.b_path or diff.a_path
                if file_path:
                    # Get insertions and deletions
                    try:
                        stats = commit.stats.files.get(file_path, {})
                        diff_stats[file_path] = {
                            'additions': stats.get('insertions', 0),
                            'deletions': stats.get('deletions', 0)
                        }
                    except Exception:
                        diff_stats[file_path] = {'additions': 0, 'deletions': 0}
        
        except GitCommandError:
            pass
        
        return diff_stats
    
    def _analyze_commit(self, commit: 'Commit', file_path: Optional[str] = None) -> CommitAnalysis:
        """Analyze a single commit and classify it."""
        # Check cache first
        cache_key = f"{commit.hexsha}:{file_path or ''}"
        if cache_key in self._commit_cache:
            return self._commit_cache[cache_key]
        
        # Shallow or partial histories can be missing parent stats; keep the
        # analysis usable by falling back to minimal metadata.
        try:
            stats = commit.stats.total
            lines_added = stats.get('insertions', 0)
            lines_deleted = stats.get('deletions', 0)
            files_changed = list(commit.stats.files.keys()) if commit.stats.files else []
        except Exception:
            lines_added = 0
            lines_deleted = 0
            files_changed = [file_path] if file_path else []
        
        # Classify the commit
        commit_type, is_refactor, is_architectural, is_bug_fix = self._classify_commit(commit)
        
        # Check if it's a test commit
        is_test = any(self._is_test_file(f) for f in files_changed)
        
        analysis = CommitAnalysis(
            commit_hash=commit.hexsha,
            author_name=commit.author.name,
            author_email=commit.author.email,
            timestamp=datetime.fromtimestamp(commit.committed_date, tz=timezone.utc),
            message=commit.message.strip(),
            files_changed=files_changed,
            lines_added=lines_added,
            lines_deleted=lines_deleted,
            commit_type=commit_type,
            is_refactor=is_refactor,
            is_architectural=is_architectural,
            is_bug_fix=is_bug_fix,
            is_test=is_test
        )
        
        # Cache the result
        self._commit_cache[cache_key] = analysis
        
        return analysis
    
    def _classify_commit(self, commit: 'Commit') -> tuple:
        """
        Classify a commit based on its message and changes.
        
        Returns:
            Tuple of (CommitType, is_refactor, is_architectural, is_bug_fix)
        """
        message = commit.message.lower()
        
        # Check for each type
        is_refactor = any(kw in message for kw in self._config.refactor_keywords)
        is_architectural = any(kw in message for kw in self._config.architectural_keywords)
        is_bug_fix = any(kw in message for kw in self._config.bug_fix_keywords)
        is_test = any(kw in message for kw in self._config.test_keywords)
        is_docs = any(kw in message for kw in self._config.documentation_keywords)
        
        # Determine primary commit type
        if is_architectural:
            commit_type = CommitType.ARCHITECTURAL
        elif is_refactor:
            commit_type = CommitType.REFACTOR
        elif is_bug_fix:
            commit_type = CommitType.BUG_FIX
        elif is_test:
            commit_type = CommitType.TEST
        elif is_docs:
            commit_type = CommitType.DOCUMENTATION
        elif self._is_feature_commit(message):
            commit_type = CommitType.FEATURE
        else:
            commit_type = CommitType.UNKNOWN
        
        return commit_type, is_refactor, is_architectural, is_bug_fix
    
    def _is_feature_commit(self, message: str) -> bool:
        """Check if commit message indicates a feature."""
        feature_keywords = ['add', 'implement', 'create', 'new', 'feature', 'support']
        return any(kw in message for kw in feature_keywords)
    
    def _is_test_file(self, file_path: str) -> bool:
        """Check if a file is a test file."""
        test_patterns = ['test_', '_test.', 'spec_', '_spec.', 'tests/', '__tests__/']
        return any(pattern in file_path.lower() for pattern in test_patterns)
    
    def _get_or_create_developer(self, name: str, email: str) -> DeveloperProfile:
        """Get or create a developer profile."""
        if email in self._developer_cache:
            return self._developer_cache[email]
        
        developer = DeveloperProfile(name=name, email=email)
        self._developer_cache[email] = developer
        
        return developer
    
    def get_commits_by_type(
        self, 
        commit_type: CommitType,
        file_path: Optional[str] = None,
        limit: int = 100
    ) -> List[CommitAnalysis]:
        """Get commits filtered by type."""
        if not self.is_valid or not self._repo:
            return []
        
        commits = []
        count = 0
        
        try:
            kwargs = {}
            if file_path:
                kwargs['paths'] = file_path
            
            for commit in self._repo.iter_commits(**kwargs):
                if count >= limit:
                    break
                
                analysis = self._analyze_commit(commit, file_path)
                
                if analysis.commit_type == commit_type:
                    commits.append(analysis)
                    count += 1
        
        except GitCommandError:
            pass
        
        return commits
    
    def get_developer_stats(self, email: str) -> Dict:
        """Get comprehensive statistics for a developer."""
        if not self.is_valid or not self._repo:
            return {}
        
        stats = {
            'total_commits': 0,
            'files_touched': set(),
            'lines_added': 0,
            'lines_deleted': 0,
            'refactor_commits': 0,
            'bug_fix_commits': 0,
            'architectural_commits': 0,
            'first_commit': None,
            'last_commit': None
        }
        
        try:
            for commit in self._repo.iter_commits():
                if commit.author.email != email:
                    continue
                
                stats['total_commits'] += 1
                stats['files_touched'].update(commit.stats.files.keys())
                
                try:
                    total = commit.stats.total
                    stats['lines_added'] += total.get('insertions', 0)
                    stats['lines_deleted'] += total.get('deletions', 0)
                except Exception:
                    pass
                
                analysis = self._analyze_commit(commit)
                
                if analysis.is_refactor:
                    stats['refactor_commits'] += 1
                if analysis.is_bug_fix:
                    stats['bug_fix_commits'] += 1
                if analysis.is_architectural:
                    stats['architectural_commits'] += 1
                
                commit_date = datetime.fromtimestamp(commit.committed_date, tz=timezone.utc)
                
                if stats['first_commit'] is None or commit_date < stats['first_commit']:
                    stats['first_commit'] = commit_date
                if stats['last_commit'] is None or commit_date > stats['last_commit']:
                    stats['last_commit'] = commit_date
        
        except GitCommandError:
            pass
        
        # Convert set to list for JSON serialization
        stats['files_touched'] = list(stats['files_touched'])
        
        return stats
