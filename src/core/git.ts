/**
 * Git helpers for resolving the commit a review was run against.
 */

import { execSync } from 'child_process';

export interface ReviewCommitRef {
  sha: string;
  shortSha: string;
  url?: string;
}

function runGit(command: string, cwd: string): string | null {
  try {
    return execSync(command, { cwd, encoding: 'utf-8' }).trim();
  } catch {
    return null;
  }
}

function parseGitHubRemote(remoteUrl: string): { owner: string; repo: string } | null {
  const sshMatch = remoteUrl.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }

  const httpsMatch = remoteUrl.match(/^https?:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/);
  if (httpsMatch) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] };
  }

  return null;
}

export function buildGitHubCommitUrl(owner: string, repo: string, sha: string): string {
  return `https://github.com/${owner}/${repo}/commit/${sha}`;
}

export function resolveCommitRef(cwd: string): ReviewCommitRef | null {
  const sha = runGit('git rev-parse HEAD', cwd);
  if (!sha) {
    return null;
  }

  const shortSha = runGit('git rev-parse --short HEAD', cwd) || sha.slice(0, 7);
  const remoteUrl = runGit('git remote get-url origin', cwd);
  const github = remoteUrl ? parseGitHubRemote(remoteUrl) : null;

  return {
    sha,
    shortSha,
    url: github ? buildGitHubCommitUrl(github.owner, github.repo, sha) : undefined,
  };
}
