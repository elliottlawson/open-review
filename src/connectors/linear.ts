/**
 * Linear Connector
 * 
 * Handles Linear API interactions:
 * - Fetching issue context for PR reviews
 * - Extracting Linear references from PR text
 * - Searching for related issues
 */

import { LinearClient } from '@linear/sdk';
import type { LinearContext, LinearIssue } from '../core/types.js';

// ============================================================================
// Linear Connector Class
// ============================================================================

export class LinearConnector {
  private client: LinearClient;
  
  constructor(apiKey: string) {
    this.client = new LinearClient({ apiKey });
  }
  
  // ==========================================================================
  // Issue Fetching
  // ==========================================================================
  
  async getIssueContext(issueId: string): Promise<LinearIssue> {
    const issue = await this.client.issue(issueId);
    const state = await issue.state;
    const labels = await issue.labels();
    
    return {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description || null,
      state: state?.name || 'Unknown',
      priority: issue.priority,
      labels: labels.nodes.map(l => l.name),
      url: issue.url,
    };
  }
  
  async searchIssues(query: string, limit: number = 10): Promise<LinearIssue[]> {
    const result = await this.client.searchIssues(query);
    const issues: LinearIssue[] = [];
    
    for (const issue of result.nodes.slice(0, limit)) {
      // Fetch full issue to get labels
      try {
        const fullIssue = await this.getIssueContext(issue.id);
        issues.push(fullIssue);
      } catch {
        // Fallback if full fetch fails
        issues.push({
          id: issue.id,
          identifier: issue.identifier,
          title: issue.title,
          description: issue.description || null,
          state: 'Unknown',
          priority: issue.priority,
          labels: [],
          url: issue.url,
        });
      }
    }
    
    return issues;
  }
  
  // ==========================================================================
  // PR-Issue Linking
  // ==========================================================================
  
  /**
   * Extract Linear issue identifiers from text (e.g., "ENG-123", "UNO-456")
   */
  extractReferences(text: string): string[] {
    const pattern = /\b([A-Z]{2,10})-(\d+)\b/g;
    const matches = text.matchAll(pattern);
    return [...new Set([...matches].map(m => m[0]))];
  }
  
  /**
   * Find Linear issues related to a PR based on its title and body
   */
  async findRelatedIssues(prTitle: string, prBody: string): Promise<LinearContext> {
    const issues: LinearIssue[] = [];
    
    // Extract explicit references (e.g., "UNO-123")
    const references = [
      ...this.extractReferences(prTitle),
      ...this.extractReferences(prBody),
    ];
    
    // Fetch each referenced issue
    for (const ref of references) {
      try {
        const searchResults = await this.client.searchIssues(ref);
        const matchingIssue = searchResults.nodes.find(i => i.identifier === ref);
        
        if (matchingIssue) {
          const context = await this.getIssueContext(matchingIssue.id);
          issues.push(context);
        }
      } catch (error) {
        console.warn(`Could not fetch Linear issue ${ref}: ${(error as Error).message}`);
      }
    }
    
    // If no explicit refs, try keyword search from PR title
    if (issues.length === 0 && prTitle) {
      // Use first part of title (before colon if present)
      const searchTerm = prTitle.split(':')[0].trim();
      if (searchTerm.length > 3) {
        try {
          const searchResults = await this.searchIssues(searchTerm, 3);
          // Only include if highly relevant (title contains search term)
          for (const issue of searchResults) {
            if (issue.title.toLowerCase().includes(searchTerm.toLowerCase())) {
              issues.push(issue);
            }
          }
        } catch (error) {
          console.warn(`Linear search failed: ${(error as Error).message}`);
        }
      }
    }
    
    return { issues };
  }
  
  // ==========================================================================
  // Formatting for Review Context
  // ==========================================================================
  
  formatForReview(context: LinearContext): string {
    if (context.issues.length === 0) {
      return '';
    }
    
    const lines: string[] = ['## Related Linear Issues\n'];
    
    for (const issue of context.issues) {
      lines.push(`### ${issue.identifier}: ${issue.title}`);
      lines.push(`**State:** ${issue.state} | **Priority:** ${this.formatPriority(issue.priority)}`);
      
      if (issue.labels.length > 0) {
        lines.push(`**Labels:** ${issue.labels.join(', ')}`);
      }
      
      if (issue.description) {
        lines.push('\n**Description:**');
        // Truncate long descriptions
        const desc = issue.description.length > 500 
          ? issue.description.substring(0, 500) + '...' 
          : issue.description;
        lines.push(desc);
      }
      
      lines.push(`\n[View in Linear](${issue.url})\n`);
    }
    
    return lines.join('\n');
  }
  
  private formatPriority(priority: number): string {
    const priorities = ['None', 'Urgent', 'High', 'Medium', 'Low'];
    return priorities[priority] || 'Unknown';
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createLinearConnector(apiKey: string): LinearConnector {
  return new LinearConnector(apiKey);
}
